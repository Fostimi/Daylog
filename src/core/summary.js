/**
 * Resumes quotidiens compacts.
 *
 * Le tableau de bord ne doit jamais relire 365 fiches completes pour tracer une
 * courbe. A chaque sauvegarde on met a jour, dans la meme transaction, un resume
 * d'une trentaine d'octets. Un an d'historique = ~10 Ko a lire, instantane meme
 * sur un vieux telephone.
 *
 * Un resume ne contient que des nombres deja calcules. Il est entierement
 * reconstructible a partir des fiches (voir `rebuildSummaries`), donc le perdre
 * n'est jamais une perte de donnees.
 */

import { enabledModules } from './modules.js';

/** Construit le resume d'une journee en interrogeant chaque module actif. */
export function summarize(day, moduleState, capabilities) {
  const summary = { date: day.date };
  for (const mod of enabledModules(moduleState, capabilities)) {
    const data = day.modules?.[mod.id];
    if (!data) continue;
    let part;
    try {
      part = mod.summarize(data, day);
    } catch {
      // Un module qui echoue ne doit pas empecher la sauvegarde de la journee.
      part = null;
    }
    if (part && typeof part === 'object') {
      for (const [k, v] of Object.entries(part)) {
        if (v !== null && v !== undefined && !Number.isNaN(v)) summary[k] = v;
      }
    }
  }
  return summary;
}

/**
 * Moyenne en ignorant les valeurs non renseignees.
 *
 * C'est LA fonction qui empeche le probleme n°1 du v5 : `null` n'est pas 0, et
 * une journee sans donnee ne doit pas tirer la moyenne vers le bas. Renvoie
 * `null` -- et non 0 -- si rien n'est renseigne, pour que l'affichage puisse
 * ecrire "—" au lieu d'un chiffre invente.
 */
export function mean(values) {
  const nums = (values || []).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function sum(values) {
  const nums = (values || []).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0);
}

/** Moyenne d'un champ sur une liste de resumes. */
export function meanOf(summaries, key) {
  return mean((summaries || []).map((s) => s?.[key]));
}

/** Arrondi a `digits` decimales, en preservant `null`. */
export function round(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/**
 * Regularite du suivi, sur les `window` derniers jours.
 *
 * Remplace le "streak" du v5, qui repartait a zero au premier jour saute et
 * affichait 0 tant que la journee du jour n'etait pas enregistree -- donc tous
 * les matins. Pour une app qui touche a la sante mentale, un compteur qui punit
 * l'irregularite est contre-productif : il fait abandonner exactement les gens
 * qui en ont le plus besoin.
 *
 * "24 jours suivis sur les 30 derniers" dit la meme chose sans culpabiliser, et
 * ne s'effondre pas parce qu'on a passe un week-end sans son telephone.
 */
export function trackedInWindow(summaries, days) {
  const tracked = new Set((summaries || []).map((s) => s.date));
  return { tracked: tracked.size, window: days };
}

/**
 * Correlation de Pearson entre deux champs, APPARIEE PAR JOUR.
 *
 * Le v5 filtrait les deux series independamment puis les alignait par la fin :
 * il correlait le lundi avec le mercredi des que l'une des deux avait un trou.
 * Ici on ne garde que les jours ou les DEUX valeurs existent.
 *
 * `minPairs` est volontairement eleve : annoncer une correlation sur 7 points
 * n'a aucun sens statistique. Renvoie `null` plutot qu'un chiffre trompeur.
 */
export function correlate(summaries, keyA, keyB, minPairs = 14) {
  const pairs = [];
  for (const s of summaries || []) {
    const a = s?.[keyA];
    const b = s?.[keyB];
    if (typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b)) {
      pairs.push([a, b]);
    }
  }
  if (pairs.length < minPairs) return null;

  const n = pairs.length;
  const ma = pairs.reduce((acc, p) => acc + p[0], 0) / n;
  const mb = pairs.reduce((acc, p) => acc + p[1], 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (const [a, b] of pairs) {
    num += (a - ma) * (b - mb);
    da += (a - ma) ** 2;
    db += (b - mb) ** 2;
  }
  if (da === 0 || db === 0) return null; // une serie constante : rien a correler
  return { r: num / Math.sqrt(da * db), n };
}
