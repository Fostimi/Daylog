/**
 * Recapitulatif hebdomadaire.
 *
 * Le cahier des charges demande « un recapitulatif des trucs importants de la
 * semaine ». La difficulte n'est pas de calculer des moyennes -- c'est de
 * decider ce qu'on affiche quand il n'y a presque rien, et de ne pas
 * transformer un releve en bulletin de notes.
 *
 * Trois regles :
 *
 * 1. UNE SEMAINE INCOMPLETE RESTE UNE SEMAINE. On n'attend pas sept jours pour
 *    dire quelque chose, et les journees non notees sont des trous, jamais des
 *    zeros. « 3 jours suivis » se lit sans reproche ; « 4 jours manques » serait
 *    la meme information transformee en dette.
 *
 * 2. ON COMPARE, ON NE CLASSE PAS. La semaine precedente est affichee a cote,
 *    et c'est tout : pas de fleche verte, pas de « mieux », pas de « moins
 *    bien ». Daylog ne sait pas si un stress en hausse est une mauvaise
 *    nouvelle pour la personne qui le lit, ni si un sommeil plus court
 *    l'inquiete. Deux nombres cote a cote laissent conclure celui que ça
 *    regarde.
 *
 * 3. AUCUN TOTAL QUI N'A PAS DE SENS. Le sommeil se cumule et se moyenne ; une
 *    humeur ne se cumule pas. Chaque chiffre a ete choisi separement, et un
 *    champ sans donnee ne produit aucune ligne plutot qu'un tiret.
 */

import { mean, meanOf, sum, round } from './summary.js';

/**
 * Ce qu'on retient d'une semaine.
 *
 * `rows` sont les resumes quotidiens, `days` les sept cles de la semaine. On
 * passe les deux : les resumes ne contiennent que les journees notees, et il
 * faut la liste complete pour distinguer un jour vide d'un jour absent.
 */
export function weekReview(rows = [], days = []) {
  const byDate = new Map((rows || []).map((r) => [r.date, r]));
  const series = days.map((d) => byDate.get(d) || null);
  const present = series.filter(Boolean);

  const total = (key) => sum(present.map((r) => r[key]));
  const moyenne = (key, digits = 1) => round(meanOf(present, key), digits);
  const compte = (key) => present.filter((r) => typeof r[key] === 'number').length || null;

  return {
    days: series,
    dates: days,
    tracked: present.length,

    mood: moyenne('mood'),
    energy: moyenne('energy'),
    stress: moyenne('stress'),

    // Le sommeil est le seul suivi ou le cumul ET la moyenne disent quelque
    // chose : « 48 h sur la semaine » et « 6,9 h par nuit » ne repondent pas a
    // la meme question.
    sleepTotal: round(total('sleepH'), 1),
    sleepMean: moyenne('sleepH'),
    sleepNights: compte('sleepH'),

    waterMean: round(meanOf(present, 'waterMl'), 0),
    kcalMean: round(meanOf(present, 'kcal'), 0),
    proteinMean: round(meanOf(present, 'protein'), 0),

    moveMin: total('moveMin'),
    moveM: total('moveM'),
    workouts: total('workouts'),
    // Un jour de repos note est une reponse ; l'absence de note n'en est pas
    // une. On ne compte donc que les cases reellement cochees.
    restDays: present.filter((r) => r.restDay === 1).length || null,

    notes: present.filter((r) => r.hasNote === 1).length || null,
    // La derniere pesee de la semaine, et non une moyenne : c'est le chiffre
    // qu'on cherche quand on regarde une semaine passee.
    weight: [...present].reverse().find((r) => typeof r.weightKg === 'number')?.weightKg ?? null,

    habitsPct: moyenne('habitsPct', 0),
  };
}

/**
 * Ce que dit une journee en une ligne, dans la bande des sept jours.
 *
 * On choisit UN chiffre, celui qui a le plus de chances d'avoir ete note, et on
 * s'arrete la : sept lignes de six nombres ne se lisent pas d'un coup d'oeil,
 * et la bande sert justement a ça.
 */
export function dayGlance(row) {
  if (!row) return null;
  const bits = [];
  if (typeof row.mood === 'number') bits.push(`humeur ${round(row.mood, 1)}`);
  if (typeof row.sleepH === 'number') bits.push(`${round(row.sleepH, 1)} h`);
  if (typeof row.moveMin === 'number') bits.push(`${row.moveMin} min`);
  else if (row.restDay === 1) bits.push('repos');
  if (!bits.length && typeof row.kcal === 'number') bits.push(`${row.kcal} kcal`);
  if (!bits.length && row.hasNote === 1) bits.push('note');
  return bits.slice(0, 3).join(' · ') || 'noté';
}

/**
 * Les chiffres a mettre cote a cote avec la semaine precedente.
 *
 * Seulement ceux qui existent des DEUX cotes : « 6,8 contre — » n'apprend rien
 * et occupe une ligne. Aucun jugement n'est porte sur le sens de l'ecart, ce
 * qui exclut aussi bien une couleur qu'un mot comme « mieux ».
 */
export const COMPARED = [
  { key: 'mood', label: 'Humeur', digits: 1 },
  { key: 'energy', label: 'Énergie', digits: 1 },
  { key: 'stress', label: 'Stress', digits: 1 },
  { key: 'sleepMean', label: 'Sommeil', digits: 1, unit: 'h' },
  { key: 'moveMin', label: 'Temps actif', digits: 0, unit: 'min' },
  { key: 'kcalMean', label: 'Calories', digits: 0, unit: 'kcal' },
];

export function compareWeeks(current, previous) {
  if (!current || !previous) return [];
  return COMPARED.filter(
    (c) => typeof current[c.key] === 'number' && typeof previous[c.key] === 'number'
  ).map((c) => ({ ...c, now: current[c.key], before: previous[c.key] }));
}

/** Moyenne d'une liste de semaines, pour un eventuel usage ulterieur. */
export function meanOfWeeks(weeks, key) {
  return mean((weeks || []).map((w) => w?.[key]));
}
