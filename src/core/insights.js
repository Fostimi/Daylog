/**
 * Phrases de bilan.
 *
 * Separe de l'affichage pour etre testable : une phrase mal accordee est un
 * defaut visible, et une phrase qui affirme trop est un probleme de fond.
 *
 * Trois regles :
 *
 * 1. ON N'AFFIRME PAS SUR DU VIDE. Quatorze jours minimum ou les DEUX valeurs
 *    existent, et un lien trop faible n'est simplement pas mentionne. Mieux
 *    vaut se taire que meubler.
 *
 * 2. ON DECRIT, ON NE PRESCRIT PAS. « Tes nuits courtes s'accompagnent d'un
 *    stress plus eleve » est une observation. « Dors plus » serait un conseil,
 *    et Daylog n'est pas un dispositif medical.
 *
 * 3. ON N'EXPLIQUE PAS. Une correlation n'est pas une cause, et chaque phrase
 *    le rappelle. Quelqu'un qui suit son humeur merite qu'on ne lui raconte pas
 *    d'histoires sur lui-meme.
 *
 * Les phrases sont ecrites en toutes lettres plutot que composees a partir de
 * morceaux : une composition generique produit « ton nuits va a l'inverse de
 * ton stress », c'est-a-dire du charabia. Le francais s'accorde, on l'ecrit.
 */

import { meanOf, round, correlate } from './summary.js';

const MIN_PAIRS = 14;
const MIN_STRENGTH = 0.4;

/**
 * Rapprochements possibles.
 *
 * `positif` et `negatif` sont rediges separement : selon le sens du lien, la
 * phrase juste n'est pas la meme, et une seule tournure retournee mecaniquement
 * sonnerait faux.
 */
const LIENS = [
  {
    a: 'sleepH',
    b: 'stress',
    negatif: (n) =>
      `Sur ${n} jours où tu as noté les deux, tes nuits les plus longues ` +
      "s'accompagnent d'un stress plus bas.",
    positif: (n) =>
      `Sur ${n} jours où tu as noté les deux, tes nuits les plus longues ` +
      "s'accompagnent d'un stress plus élevé.",
  },
  {
    a: 'sleepH',
    b: 'mood',
    positif: (n) =>
      `Sur ${n} jours où tu as noté les deux, tes nuits les plus longues ` +
      "s'accompagnent d'une meilleure humeur.",
    negatif: (n) =>
      `Sur ${n} jours où tu as noté les deux, tes nuits les plus longues ` +
      "s'accompagnent d'une humeur plus basse.",
  },
  {
    a: 'recovery',
    b: 'mood',
    positif: (n) =>
      `Sur ${n} jours où tu as noté les deux, ton humeur suit ton score de ` +
      'récupération.',
    negatif: (n) =>
      `Sur ${n} jours où tu as noté les deux, ton humeur va à l'inverse de ton ` +
      'score de récupération.',
  },
  {
    a: 'waterMl',
    b: 'energy',
    positif: (n) =>
      `Sur ${n} jours où tu as noté les deux, les journées où tu bois le plus ` +
      "sont aussi celles où tu as le plus d'énergie.",
    negatif: (n) =>
      `Sur ${n} jours où tu as noté les deux, les journées où tu bois le plus ` +
      "sont celles où tu as le moins d'énergie.",
  },
];

/**
 * Rappel affiche UNE SEULE FOIS sous l'ensemble des phrases.
 *
 * Repete a la fin de chacune, il doublait la longueur du bloc et se mettait a
 * ressembler a une clause juridique qu'on cesse de lire -- donc il ne
 * remplissait plus son role.
 */
export const RAPPEL_CORRELATION =
  "Ce sont des rapprochements entre séries de chiffres, pas des explications : " +
  "beaucoup d'autres choses entrent en jeu.";

/**
 * Comparaison nuits courtes / nuits longues.
 *
 * Souvent plus parlante qu'un coefficient : « 6,8 contre 4,1 » se comprend
 * immediatement, « r = 0,62 » non.
 */
function comparaisonSommeil(rows) {
  const withBoth = rows.filter(
    (r) => typeof r.sleepH === 'number' && typeof r.stress === 'number'
  );
  if (withBoth.length < MIN_PAIRS) return null;

  const courtes = withBoth.filter((r) => r.sleepH < 6.5);
  const autres = withBoth.filter((r) => r.sleepH >= 6.5);
  if (courtes.length < 4 || autres.length < 4) return null;

  const s1 = meanOf(courtes, 'stress');
  const s2 = meanOf(autres, 'stress');
  if (s1 === null || s2 === null || Math.abs(s1 - s2) < 1) return null;

  const plural = courtes.length > 1 ? 's' : '';
  return (
    `Tes nuit${plural} de moins de 6 h 30 (${courtes.length} jour${plural}) ` +
    `s'accompagnent d'un stress moyen de ${round(s1, 1)}, contre ` +
    `${round(s2, 1)} les ${autres.length} autres jours.`
  );
}

/**
 * Construit les phrases de bilan pour une periode.
 * Renvoie un tableau, vide s'il n'y a rien d'honnête à dire.
 */
export function buildInsights(rows, { minPairs = MIN_PAIRS, max = 2 } = {}) {
  // On classe par force du lien et on ne garde que les plus nets. Empiler cinq
  // observations dilue les deux qui comptent, et donne l'impression d'un
  // horoscope : plus il y a d'affirmations, moins chacune pese.
  const trouves = [];

  for (const lien of LIENS) {
    const r = correlate(rows, lien.a, lien.b, minPairs);
    if (!r) continue;
    const force = Math.abs(r.r);
    if (force < MIN_STRENGTH) continue;
    trouves.push({ force, texte: r.r > 0 ? lien.positif(r.n) : lien.negatif(r.n) });
  }

  trouves.sort((x, y) => y.force - x.force);
  const out = trouves.slice(0, max).map((t) => t.texte);

  const comparaison = comparaisonSommeil(rows);
  if (comparaison) out.push(comparaison);

  // Rien de solide a dire : on l'annonce plutot que de laisser un vide, et on
  // explique ce qui manque.
  if (!out.length && rows.length >= 5) {
    out.push(
      `${rows.length} journées notées sur cette période. Les rapprochements ` +
        "demandent au moins deux semaines où les deux informations sont notées — " +
        'ils apparaîtront ici tout seuls.'
    );
  }

  return out;
}
