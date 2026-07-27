/**
 * Cycle menstruel : detection, moyennes et repere de prochaines regles.
 *
 * Ce fichier ne contient que du calcul, sans affichage, pour une raison
 * precise : c'est le module ou une erreur se paie le plus cher. Annoncer une
 * date fausse a quelqu'un qui compte dessus n'est pas un defaut cosmetique.
 *
 * Quatre regles tenues ici :
 *
 * 1. ON NE DEVINE PAS LES DEBUTS DE CYCLE, ON LES DEDUIT DE CE QUI EST NOTE.
 *    Rien n'est ecrit dans la fiche du jour que la personne n'ait saisi. Un
 *    debut de regles est *calcule* a la lecture, a partir des flux enregistres,
 *    et reste corrigeable a la main (`cycleStart` : true force, false annule).
 *    Le v5 demandait de cocher « premier jour » : oublie une fois, toutes les
 *    previsions suivantes etaient decalees, sans que rien ne le signale.
 *
 * 2. ON N'AFFIRME PAS SUR DU VIDE. Il faut deux cycles complets avant qu'un
 *    repere s'affiche, et si les cycles varient beaucoup on donne une
 *    fourchette -- jamais une date qui ferait croire a une precision qu'on n'a
 *    pas. Au-dela d'une certaine dispersion, on dit qu'on ne sait pas.
 *
 * 3. AUCUNE FENETRE DE FERTILITE, AUCUNE PHASE. Ce serait deduire de
 *    l'ovulation a partir de la seule date des regles, c'est-a-dire fabriquer
 *    une information medicale a partir de rien. Daylog affiche ce qui a ete
 *    note et la moyenne de ce qui a ete note. Ni contraception, ni conception.
 *
 * 4. UN CYCLE SUSPENDU N'A PAS DE MOYENNE. Sous contraception continue ou
 *    traitement, la moyenne des cycles precedents ne predit rien du tout : on
 *    n'affiche aucun repere, et le suivi des symptomes reste disponible.
 */

import { addDays, diffDays, isValidKey } from './date.js';

/**
 * Intensite du flux.
 *
 * Enregistree en nombre (0 a 4) et non en libelle : le resume quotidien doit
 * rester chiffre pour que le bilan puisse en tracer une courbe, et un libelle
 * renomme un jour casserait tout l'historique.
 *
 * `0` (« rien aujourd'hui ») et `null` (« pas note ») sont deux informations
 * differentes, comme partout ailleurs dans l'application.
 */
export const FLOW_LEVELS = [
  { id: 'none', value: 0, label: 'Rien' },
  { id: 'spotting', value: 1, label: 'Traces' },
  { id: 'light', value: 2, label: 'Léger' },
  { id: 'medium', value: 3, label: 'Moyen' },
  { id: 'heavy', value: 4, label: 'Abondant' },
];

/**
 * Symptomes proposes.
 *
 * Liste volontairement courte : une grille de trente cases ne se remplit pas
 * tous les jours, et un suivi qu'on ne tient pas ne vaut rien. Elle est
 * descriptive, jamais evaluative -- on note ce qu'on ressent, l'application
 * n'en tire aucune conclusion.
 */
export const SYMPTOMS = [
  { id: 'cramps', label: 'Crampes' },
  { id: 'headache', label: 'Maux de tête' },
  { id: 'fatigue', label: 'Fatigue' },
  { id: 'bloating', label: 'Ballonnements' },
  { id: 'breast', label: 'Seins sensibles' },
  { id: 'back', label: 'Douleurs lombaires' },
  { id: 'nausea', label: 'Nausées' },
  { id: 'skin', label: 'Peau' },
  { id: 'cravings', label: 'Fringales' },
  { id: 'mood', label: 'Émotions à vif' },
  { id: 'insomnia', label: 'Sommeil agité' },
];

/**
 * Jours sans saignement toleres a l'interieur d'un meme episode.
 *
 * Des regles s'interrompent une journee puis reprennent, et surtout on oublie
 * de noter. Sans cette tolerance, un jour manque coupait l'episode en deux et
 * fabriquait un cycle de trois jours qui ruinait la moyenne.
 */
export const MAX_GAP = 3;

/**
 * En deca, ce n'est pas un nouveau cycle.
 *
 * Un saignement isole douze jours apres le precedent est un evenement
 * intermenstruel, pas un cycle : le compter comme tel diviserait la moyenne par
 * deux. Le seuil est bas a dessein -- des cycles courts existent, et les
 * effacer serait pire que de laisser passer un episode.
 */
export const MIN_CYCLE = 12;

/**
 * Au-dela, on ecarte la longueur du calcul de la moyenne.
 *
 * Un cycle de six mois n'existe pas : c'est presque toujours une interruption
 * de suivi (l'application n'a pas ete ouverte, ou pas renseignee). La longueur
 * reste visible dans l'historique, elle ne sert simplement pas de reference.
 *
 * Le seuil est haut (90 jours) pour ne pas effacer les cycles reellement longs,
 * qui sont une realite pour beaucoup de gens.
 */
export const MAX_CYCLE = 90;

/** Nombre de cycles recents retenus pour la moyenne. */
export const RECENT_CYCLES = 6;

/** Cycles complets exiges avant d'afficher un repere. */
export const MIN_CYCLES_FOR_PREDICTION = 2;

/** Au-dela de cette dispersion, aucune fourchette n'aurait de sens. */
export const MAX_HALF_WIDTH = 20;

/** Un jour de cycle au-dela de ce compte signale un suivi interrompu. */
export const STALE_CYCLE_DAY = 90;

/** Le flux enregistre pour une journee, ou `null` si rien n'a ete note. */
export function flowOf(row) {
  const value = row?.flow;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Une journee avec saignement (les traces comptent). */
function bleeds(row) {
  const flow = flowOf(row);
  return flow !== null && flow > 0;
}

/**
 * Dates de debut de regles, deduites d'une serie de journees.
 *
 * `rows` accepte aussi bien des resumes quotidiens que des fiches completes :
 * on n'y lit que `date`, `flow` et `cycleStart`. Les journees non notees
 * peuvent tout simplement manquer de la liste.
 *
 * Un jour ouvre un cycle s'il y a du saignement et qu'aucun jour saignant ne le
 * precede de moins de `MAX_GAP` jours. Une correction manuelle l'emporte
 * toujours : `cycleStart: true` impose un debut, `cycleStart: false` l'interdit.
 */
export function periodStarts(rows = []) {
  const sorted = [...(rows || [])]
    .filter((r) => r && isValidKey(r.date))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const starts = [];
  let lastBleed = null;

  for (const row of sorted) {
    const forced = row.cycleStart === true;
    const blocked = row.cycleStart === false;

    if (forced) {
      // Une correction manuelle vaut debut, meme sans flux enregistre : on
      // n'oblige personne a saisir une intensite pour dire « c'est parti ».
      starts.push(row.date);
      lastBleed = row.date;
      continue;
    }

    if (!bleeds(row)) continue;

    const gap = lastBleed === null ? null : diffDays(lastBleed, row.date);
    if (!blocked && (gap === null || gap > MAX_GAP)) starts.push(row.date);
    lastBleed = row.date;
  }

  return starts;
}

/**
 * Fusionne les debuts trop rapproches.
 *
 * Deux debuts separes de moins de `MIN_CYCLE` jours decrivent le meme episode
 * (des regles qui reprennent apres quatre jours de pause, un saignement
 * intermenstruel). On garde le premier : c'est lui qui date le cycle.
 */
export function consolidateStarts(starts = []) {
  const out = [];
  for (const date of starts) {
    if (!out.length || diffDays(out[out.length - 1], date) >= MIN_CYCLE) out.push(date);
  }
  return out;
}

/** Longueurs des cycles complets, du plus ancien au plus recent. */
export function cycleLengths(starts = []) {
  const out = [];
  for (let i = 1; i < starts.length; i++) {
    out.push({ from: starts[i - 1], to: starts[i], days: diffDays(starts[i - 1], starts[i]) });
  }
  return out;
}

/**
 * Tout ce qu'on sait des cycles d'une personne, a partir de ses journees.
 *
 * `average` ne porte que sur les longueurs retenues : les cycles aberrants
 * (au-dela de `MAX_CYCLE`, donc presque toujours un trou de suivi) restent
 * listes mais ne servent pas de reference.
 */
export function cycleStats(rows = []) {
  const starts = consolidateStarts(periodStarts(rows));
  const lengths = cycleLengths(starts);

  const kept = lengths.filter((l) => l.days <= MAX_CYCLE).slice(-RECENT_CYCLES);
  const days = kept.map((l) => l.days);

  const average = days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null;
  const min = days.length ? Math.min(...days) : null;
  const max = days.length ? Math.max(...days) : null;

  return {
    starts,
    lengths,
    used: kept,
    count: days.length,
    average,
    min,
    max,
    spread: days.length ? max - min : null,
    lastStart: starts.length ? starts[starts.length - 1] : null,
    ignored: lengths.length - lengths.filter((l) => l.days <= MAX_CYCLE).length,
  };
}

/**
 * Jour du cycle en cours (le premier jour des regles est le jour 1).
 *
 * Renvoie `null` au-dela de `STALE_CYCLE_DAY` : afficher « jour 214 » ne dit
 * rien de personne, cela dit seulement que le suivi s'est interrompu.
 */
export function cycleDay(lastStart, date) {
  if (!lastStart || !isValidKey(lastStart) || !isValidKey(date)) return null;
  const n = diffDays(lastStart, date);
  if (n < 0 || n >= STALE_CYCLE_DAY) return null;
  return n + 1;
}

/**
 * Repere de prochaines regles.
 *
 * Renvoie toujours un objet, avec un `reason` quand il n'y a rien a afficher :
 * l'ecran doit pouvoir expliquer *pourquoi* il ne dit rien, plutot que de
 * laisser un vide que chacun interprete comme il veut.
 *
 *   suppressed    cycle declare suspendu : une moyenne ne predirait rien
 *   not-enough    moins de deux cycles complets
 *   too-variable  cycles trop disperses pour qu'une fourchette ait du sens
 *
 * `exact` distingue les deux facons d'annoncer : une date quand les cycles sont
 * reguliers, une fourchette sinon. Un cycle declare irregulier n'annonce jamais
 * de date, meme si la moyenne parait stable -- la personne sait mieux que
 * l'application ce que valent ses trois derniers cycles.
 */
export function predictNextPeriod(stats, { mode = null } = {}) {
  if (mode === 'suppressed') return { reason: 'suppressed' };
  if (!stats || stats.count < MIN_CYCLES_FOR_PREDICTION || !stats.lastStart) {
    return { reason: 'not-enough', missing: MIN_CYCLES_FOR_PREDICTION - (stats?.count || 0) };
  }

  // La demi-largeur part de la dispersion observee, avec un plancher de deux
  // jours : meme trois cycles identiques ne justifient pas d'annoncer une date
  // au jour pres. Un cycle declare irregulier elargit le plancher.
  const floor = mode === 'irregular' ? 3 : 2;
  const halfWidth = Math.max(floor, Math.ceil(stats.spread / 2));
  if (halfWidth > MAX_HALF_WIDTH) return { reason: 'too-variable', spread: stats.spread };

  const date = addDays(stats.lastStart, stats.average);
  return {
    date,
    from: addDays(date, -halfWidth),
    to: addDays(date, halfWidth),
    average: stats.average,
    halfWidth,
    n: stats.count,
    exact: halfWidth <= 2 && mode !== 'irregular',
  };
}

/**
 * Retard sur le repere, en jours.
 *
 * Compte a partir du haut de la fourchette et non de la date centrale : tant
 * qu'on est dans la fourchette annoncee, il n'y a rien a signaler. Renvoie
 * `null` s'il n'y a pas de repere ou si l'echeance n'est pas passee -- l'ecran
 * n'a alors rien de particulier a dire.
 */
export function daysLate(prediction, date) {
  if (!prediction?.to || !isValidKey(date)) return null;
  const late = diffDays(prediction.to, date);
  return late > 0 ? late : null;
}
