/**
 * Options partagees entre la premiere ouverture et l'ecran de profil.
 *
 * Elles vivent ici et nulle part ailleurs : les memes questions doivent se
 * poser exactement dans les memes termes aux deux endroits. Dupliquees, on
 * finirait par en corriger une et pas l'autre, et quelqu'un qui revient sur son
 * profil ne retrouverait pas la question a laquelle il a repondu.
 */

/** Themes proposes. `modules` liste les modules a activer si le theme est retenu. */
export const THEMES = [
  {
    id: 'sleep',
    label: 'Sommeil',
    hint: 'Heures, qualité, réveils',
    modules: ['sleep'],
  },
  {
    id: 'habits',
    label: 'Habitudes',
    hint: 'Ce que tu as fait dans la journée',
    modules: ['habits'],
  },
  {
    id: 'food',
    label: 'Alimentation',
    hint: 'Repas et hydratation',
    modules: ['nutrition', 'hydration'],
  },
];
/**
 * Marques d'appareils connectes.
 *
 * Chacune nomme differemment la meme mesure. Afficher le bon terme coute deux
 * lignes et donne l'impression que l'app connait le materiel de la personne.
 */
/**
 * Marques d'appareils connectes.
 *
 * Chacune nomme differemment la meme mesure. Afficher le bon terme coute deux
 * lignes et donne l'impression que l'app connait le materiel de la personne.
 */
export const WEARABLES = [
  { id: 'garmin', label: 'Garmin', term: 'Body Battery' },
  { id: 'suunto', label: 'Suunto', term: 'Ressources' },
  { id: 'whoop', label: 'Whoop', term: 'Recovery' },
  { id: 'oura', label: 'Oura', term: 'Readiness' },
  { id: 'polar', label: 'Polar', term: 'Nightly Recharge' },
  { id: 'fitbit', label: 'Fitbit', term: 'Daily Readiness' },
  { id: 'apple', label: 'Apple Watch', term: 'Récupération' },
  { id: 'other', label: 'Une autre marque', term: 'Récupération' },
];
export const MOBILITY = [
  { id: 'walking', label: 'Je marche', hint: 'Pas et distance' },
  { id: 'wheelchair', label: 'En fauteuil roulant', hint: 'Distance et poussées' },
  { id: 'aids', label: 'Avec une aide à la marche', hint: 'Canne, béquilles, déambulateur' },
  { id: 'varies', label: 'Ça dépend des jours', hint: 'Tu ajusteras au quotidien' },
];
export const CYCLE = [
  { id: 'regular', label: 'Oui, plutôt régulier' },
  { id: 'irregular', label: 'Oui, irrégulier' },
  { id: 'suppressed', label: 'Oui, mais suspendu', hint: 'Contraception, traitement' },
  { id: 'none', label: 'Non, pas concerné' },
];

/**
 * Bornes des durees qu'on accepte de se voir saisir.
 *
 * Elles vivent ici, avec les autres questions de profil, et non dans
 * `core/cycle.js` : les deux ecrans qui les utilisent sont telecharges par tout
 * le monde, y compris par qui repondra « non, pas concerne ». Y importer le
 * calcul de cycle ferait payer 2 Ko a ces personnes pour une fonctionnalite
 * qu'elles n'auront jamais -- exactement ce que le decoupage en modules evite
 * partout ailleurs.
 *
 * Le noyau garde ses propres garde-fous, plus larges : ceux-ci disent ce qu'on
 * laisse taper, ceux-la ce qu'un calcul accepte de prendre au serieux.
 */
export const DECLARED_CYCLE_RANGE = [15, 90];
export const DECLARED_PERIOD_RANGE = [1, 15];

/**
 * Nettoie une duree saisie a la main.
 *
 * Une valeur hors bornes est refusee plutot que ramenee au plus proche :
 * corriger silencieusement une saisie reviendrait a inventer une donnee.
 */
export function sanitizeDeclared(value, [min, max]) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded >= min && rounded <= max ? rounded : null;
}
