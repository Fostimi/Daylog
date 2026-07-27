/**
 * Aliments, quantites et repas enregistres.
 *
 * Trois decisions structurent ce fichier, et elles viennent toutes du meme
 * constat : le suivi alimentaire est la fonction qui fait abandonner les
 * applications de suivi. Voir docs/nutrition.md.
 *
 * 1. LA MEMOIRE FAIT LE TRAVAIL. On saisit un aliment une fois, on le retrouve
 *    d'un geste ensuite. Un repas complet se nomme et se rejoue de la meme
 *    facon. Au bout de deux semaines, une journee se note en quelques gestes --
 *    sans quoi personne ne tient trois mois.
 *
 * 2. L'HISTORIQUE EST IMMUABLE. Une entree enregistre a la fois la REFERENCE a
 *    l'aliment et les valeurs CALCULEES au moment de la saisie. Corriger « mon
 *    riz » six mois plus tard ne doit pas reecrire ce qu'on a mange en mars.
 *    C'est le defaut des habitudes du prototype v5, deja corrige une fois ici.
 *
 * 3. LES UNITES SUIVENT L'ALIMENT. On pese les pates, on compte les oeufs, on
 *    verse l'huile a la cuillere. Proposer partout les memes unites obligerait
 *    a convertir de tete, et personne ne le fait tous les jours.
 */

import { newId } from './ids.js';

/** Valeurs de reference d'un aliment : toujours pour 100 g. */
export const REFERENCE_GRAMS = 100;

/**
 * Unites connues, et leur poids en grammes.
 *
 * `grams: null` signale une unite dont le poids depend de l'aliment (une
 * portion, une tranche) : chaque aliment donne alors le sien.
 */
export const UNITS = {
  g: { id: 'g', label: 'g', grams: 1 },
  ml: { id: 'ml', label: 'ml', grams: 1 }, // approximation assumee pour les liquides courants
  unit: { id: 'unit', label: 'unité', grams: null },
  slice: { id: 'slice', label: 'tranche', grams: null },
  tbsp: { id: 'tbsp', label: 'c. à soupe', grams: null },
  tsp: { id: 'tsp', label: 'c. à café', grams: null },
  bowl: { id: 'bowl', label: 'bol', grams: null },
  glass: { id: 'glass', label: 'verre', grams: null },
};

const MACROS = ['kcal', 'protein', 'carbs', 'fat'];

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Normalise un libelle pour la recherche et les doublons.
 *
 * Sans accents et sans casse : « Pâtes » et « pates » designent le meme
 * aliment, et personne ne tape les accents dans un champ de recherche.
 */
export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    // Les ligatures d'abord : NFD ne decompose ni « oe » ni « ae », et sans
    // cela taper « oeuf » ne trouvait pas « Œuf ». En francais le cas est
    // frequent -- oeuf, boeuf, coeur, soeur.
    .replace(/\u0153/g, 'oe')
    .replace(/\u00e6/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Poids en grammes d'une quantite exprimee dans une unite donnee.
 *
 * Renvoie `null` si l'unite ne peut pas etre convertie -- on prefere ne rien
 * calculer plutot que de supposer qu'une cuillere pese la meme chose pour
 * l'huile et pour la farine.
 */
export function toGrams(quantity, unitId, food = {}) {
  const qty = num(quantity);
  if (qty === null || qty < 0) return null;
  const unit = UNITS[unitId];
  if (!unit) return null;
  const grams = unit.grams ?? num(food.unitGrams?.[unitId]);
  return grams === null ? null : qty * grams;
}

/** Unites proposees pour un aliment : celles qui ont un sens pour lui. */
export function unitsFor(food = {}) {
  const ids = ['g', ...Object.keys(food.unitGrams || {})];
  if (food.liquid) ids.splice(1, 0, 'ml');
  return [...new Set(ids)].map((id) => UNITS[id]).filter(Boolean);
}

/**
 * Valeurs nutritionnelles d'une quantite.
 *
 * Un macronutriment absent de l'aliment reste absent du resultat : on ne
 * remplit pas les trous par des zeros, ici comme partout ailleurs.
 */
export function macrosFor(food, quantity, unitId) {
  const grams = toGrams(quantity, unitId, food);
  if (grams === null) return null;
  const ratio = grams / REFERENCE_GRAMS;

  const out = {};
  for (const key of MACROS) {
    const value = num(food?.[key]);
    out[key] = value === null ? null : Math.round(value * ratio * 10) / 10;
  }
  // Les calories sont le seul chiffre qu'on arrondit a l'entier : afficher
  // « 412,5 kcal » suggere une precision que l'etiquette n'a pas.
  if (out.kcal !== null) out.kcal = Math.round(out.kcal);
  return out;
}

/**
 * Fabrique l'entree qui sera ecrite dans la journee.
 *
 * Elle porte la reference (`foodId`) ET les valeurs calculees. La reference
 * sert a proposer « encore la meme chose » ; les valeurs, elles, figent ce qui
 * a ete mange ce jour-la. Modifier l'aliment plus tard ne les touchera pas.
 */
export function createEntry(food, { quantity, unit, slot = null, at = new Date() }) {
  const macros = macrosFor(food, quantity, unit);
  if (macros === null) return null;
  return {
    id: newId('itm'),
    foodId: food.id || null,
    label: food.label,
    quantity: num(quantity),
    unit,
    slot,
    ...macros,
    loggedAt: at.toISOString(),
  };
}

/**
 * Recherche dans une liste d'aliments.
 *
 * Les correspondances en debut de libelle passent devant : taper « pa » doit
 * proposer « Pâtes » avant « Compote de pommes ». Sans requete, on renvoie les
 * plus recemment utilises -- c'est ce qu'on cherche neuf fois sur dix.
 */
export function searchFoods(foods = [], query = '', { limit = 12 } = {}) {
  const q = normalize(query);
  const active = foods.filter((f) => f && !f.archivedAt);

  if (!q) {
    return [...active]
      .sort((a, b) => (b.usedAt || '').localeCompare(a.usedAt || ''))
      .slice(0, limit);
  }

  return active
    .map((food) => {
      const label = normalize(food.label);
      const at = label.indexOf(q);
      if (at < 0) return null;
      // Un aliment personnel passe devant un aliment de la base a egalite : il
      // a ete saisi par la personne, il correspond mieux a ce qu'elle mange.
      return { food, rank: at === 0 ? 0 : 1, personal: food.base ? 1 : 0 };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.personal - b.personal ||
        a.food.label.length - b.food.label.length
    )
    .slice(0, limit)
    .map((m) => m.food);
}

/** Totaux d'une liste d'entrees. Un champ non renseigne est exclu, jamais nul. */
export function totals(entries = []) {
  const out = {};
  for (const key of MACROS) {
    const values = (entries || []).map((e) => num(e?.[key])).filter((v) => v !== null);
    out[key] = values.length ? Math.round(values.reduce((a, b) => a + b, 0)) : null;
  }
  return out;
}

/** Regroupe les entrees par moment de la journee, dans l'ordre d'apparition. */
export function bySlot(entries = [], slots = []) {
  const groups = new Map(slots.map((s) => [s.id, []]));
  const loose = [];
  for (const entry of entries || []) {
    if (groups.has(entry?.slot)) groups.get(entry.slot).push(entry);
    else loose.push(entry);
  }
  return { groups, loose };
}

/**
 * Fabrique un repas enregistre a partir des entrees d'un moment.
 *
 * On copie les valeurs plutot que de pointer vers les entrees du jour : le
 * modele doit survivre a la suppression de la journee qui lui a donne
 * naissance.
 */
export function createMealTemplate(label, entries = []) {
  const clean = String(label || '').trim();
  if (!clean || !entries.length) return null;
  return {
    id: newId('mel'),
    kind: 'meal',
    label: clean,
    items: entries.map((e) => ({
      foodId: e.foodId || null,
      label: e.label,
      quantity: e.quantity,
      unit: e.unit,
      kcal: num(e.kcal),
      protein: num(e.protein),
      carbs: num(e.carbs),
      fat: num(e.fat),
    })),
    createdAt: new Date().toISOString(),
    archivedAt: null,
  };
}

/** Transforme un repas enregistre en entrees pretes a etre ajoutees au jour. */
export function entriesFromTemplate(template, { slot = null, at = new Date() } = {}) {
  return (template?.items || []).map((item) => ({
    id: newId('itm'),
    foodId: item.foodId || null,
    label: item.label,
    quantity: item.quantity,
    unit: item.unit,
    slot,
    kcal: num(item.kcal),
    protein: num(item.protein),
    carbs: num(item.carbs),
    fat: num(item.fat),
    loggedAt: at.toISOString(),
  }));
}
