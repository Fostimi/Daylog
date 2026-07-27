import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UNITS,
  normalize,
  toGrams,
  unitsFor,
  macrosFor,
  createEntry,
  searchFoods,
  totals,
  createMealTemplate,
  entriesFromTemplate,
} from '../src/core/foods.js';
import { BASE_FOODS } from '../src/modules/foods-base.js';

const RIZ = { id: 'base:riz', label: 'Riz (cru)', kcal: 350, protein: 7, carbs: 78, fat: 0.9 };
const OEUF = {
  id: 'base:oeuf',
  label: 'Œuf',
  kcal: 145,
  protein: 12.5,
  carbs: 0.7,
  fat: 10,
  unitGrams: { unit: 55 },
};

// ------------------------------------------------------------------- base

test('la base livree est coherente', () => {
  assert.equal(BASE_FOODS.length >= 60, true, 'assez pour franchir le premier jour');
  assert.equal(new Set(BASE_FOODS.map((f) => f.id)).size, BASE_FOODS.length, 'aucun doublon');
  for (const food of BASE_FOODS) {
    assert.equal(food.base, true, food.id);
    assert.equal(typeof food.label, 'string');
    for (const key of ['kcal', 'protein', 'carbs', 'fat']) {
      assert.equal(typeof food[key], 'number', `${food.id}.${key}`);
      assert.equal(food[key] >= 0, true, `${food.id}.${key}`);
    }
  }
});

test('les valeurs annoncees collent a peu pres a leurs macros', () => {
  // Garde-fou contre une faute de frappe dans la table : l'energie calculee
  // depuis les macros ne doit pas s'ecarter absurdement de celle annoncee.
  for (const food of BASE_FOODS) {
    const computed = food.protein * 4 + food.carbs * 4 + food.fat * 9;
    if (food.kcal < 20) continue; // cafe, the : les arrondis dominent
    // L'ethanol apporte 7 kcal/g sans etre un macronutriment : l'ecart est
    // attendu, et c'est la table qui a raison.
    if (food.alcohol) continue;
    const ecart = Math.abs(computed - food.kcal) / food.kcal;
    assert.equal(ecart < 0.35, true, `${food.id} : ${food.kcal} annonce, ${Math.round(computed)} calcule`);
  }
});

test('aucune unite incoherente n est proposee', () => {
  for (const food of BASE_FOODS) {
    for (const unit of Object.keys(food.unitGrams || {})) {
      assert.equal(Boolean(UNITS[unit]), true, `${food.id} : unite inconnue ${unit}`);
    }
    // Personne ne compte les epices en kilos, ni l'huile en tranches.
    assert.equal(unitsFor(food).some((u) => u.id === 'g'), true, food.id);
  }
});

// --------------------------------------------------------------- unites

test('les unites proposees dependent de l aliment', () => {
  assert.deepEqual(unitsFor(RIZ).map((u) => u.id), ['g']);
  assert.deepEqual(unitsFor(OEUF).map((u) => u.id), ['g', 'unit']);
  const huile = BASE_FOODS.find((f) => f.id === 'base:huile-olive');
  assert.equal(unitsFor(huile).some((u) => u.id === 'ml'), true, 'un liquide se verse');
});

test('une unite sans poids connu pour cet aliment ne calcule rien', () => {
  // Une cuillere de farine et une cuillere d'huile ne pesent pas la meme chose.
  assert.equal(toGrams(1, 'tbsp', RIZ), null);
  assert.equal(toGrams(1, 'unit', OEUF), 55);
  assert.equal(toGrams(80, 'g', RIZ), 80);
  assert.equal(toGrams(-5, 'g', RIZ), null);
  assert.equal(toGrams(null, 'g', RIZ), null);
});

// --------------------------------------------------------------- macros

test('les macros suivent la quantite', () => {
  const out = macrosFor(RIZ, 80, 'g');
  assert.equal(out.kcal, 280);
  assert.equal(out.protein, 5.6);
  assert.equal(out.carbs, 62.4);
});

test('deux oeufs se comptent en oeufs', () => {
  const out = macrosFor(OEUF, 2, 'unit');
  assert.equal(out.kcal, Math.round(145 * 1.1));
  assert.equal(out.protein, 13.8);
});

test('un macro absent de l aliment reste absent du resultat', () => {
  const out = macrosFor({ label: 'X', kcal: 100 }, 100, 'g');
  assert.equal(out.kcal, 100);
  assert.equal(out.protein, null, 'et non zero, qui affirmerait une absence de proteines');
});

test('une quantite impossible ne produit aucune entree', () => {
  assert.equal(createEntry(RIZ, { quantity: 1, unit: 'tbsp' }), null);
});

// -------------------------------------------------------------- entrees

test('une entree fige ce qui a ete mange, et garde la reference', () => {
  // Le point qui protege l'historique : corriger l'aliment plus tard ne doit
  // pas reecrire les journees passees.
  const entry = createEntry(RIZ, { quantity: 80, unit: 'g', slot: 'lunch' });
  assert.equal(entry.foodId, 'base:riz');
  assert.equal(entry.label, 'Riz (cru)');
  assert.equal(entry.quantity, 80);
  assert.equal(entry.kcal, 280);
  assert.equal(entry.slot, 'lunch');
  assert.equal(typeof entry.id, 'string');
  assert.equal(typeof entry.loggedAt, 'string');
});

test('les totaux excluent ce qui n est pas renseigne', () => {
  const out = totals([
    { kcal: 300, protein: 20 },
    { kcal: 200 },
    { kcal: 150, protein: 10 },
  ]);
  assert.equal(out.kcal, 650);
  assert.equal(out.protein, 30);
  assert.equal(out.carbs, null);
});

test('une journee sans rien ne vaut pas zero', () => {
  assert.deepEqual(totals([]), { kcal: null, protein: null, carbs: null, fat: null });
});

// ------------------------------------------------------------ recherche

test('la recherche ignore la casse, les accents et les ligatures', () => {
  const found = searchFoods(BASE_FOODS, 'oeuf');
  assert.equal(found.some((f) => f.id === 'base:oeuf'), true, '« oeuf » doit trouver « Œuf »');
  assert.equal(searchFoods(BASE_FOODS, 'PATES').length > 0, true);
});

test('ce qui commence par la requete passe devant', () => {
  const found = searchFoods(BASE_FOODS, 'pomme');
  assert.equal(found[0].label.startsWith('Pomme'), true, found[0].label);
});

test('un aliment personnel passe devant celui de la base', () => {
  const perso = { id: 'fod_1', label: 'Riz basmati Repère', kcal: 355, protein: 7, carbs: 79, fat: 1 };
  const found = searchFoods([...BASE_FOODS, perso], 'riz');
  assert.equal(found[0].id, 'fod_1');
});

test('les archives ne remontent jamais', () => {
  const perso = { id: 'fod_2', label: 'Riz test', archivedAt: '2026-01-01' };
  assert.equal(searchFoods([perso], 'riz').length, 0);
});

test('sans requete, on propose ce qui a servi le plus recemment', () => {
  const a = { id: 'a', label: 'A', usedAt: '2026-07-01' };
  const b = { id: 'b', label: 'B', usedAt: '2026-07-20' };
  assert.deepEqual(searchFoods([a, b], '').map((f) => f.id), ['b', 'a']);
});

// ---------------------------------------------------------------- repas

test('un repas enregistre copie ses valeurs, il ne pointe pas vers la journee', () => {
  // Il doit survivre a la suppression de la journee qui lui a donne naissance.
  const entries = [
    createEntry(RIZ, { quantity: 80, unit: 'g' }),
    createEntry(OEUF, { quantity: 2, unit: 'unit' }),
  ];
  const modele = createMealTemplate('  Mon déj  ', entries);
  assert.equal(modele.label, 'Mon déj');
  assert.equal(modele.items.length, 2);
  assert.equal(modele.items[0].kcal, 280);
  assert.equal(modele.items[0].id, undefined, 'aucun lien vers l entree d origine');
});

test('un repas sans nom ou sans contenu n est pas enregistre', () => {
  assert.equal(createMealTemplate('', [{ kcal: 100 }]), null);
  assert.equal(createMealTemplate('Vide', []), null);
});

test('rejouer un repas produit de nouvelles entrees', () => {
  const modele = createMealTemplate('Petit-déj', [
    createEntry(OEUF, { quantity: 2, unit: 'unit' }),
  ]);
  const entries = entriesFromTemplate(modele, { slot: 'breakfast' });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].slot, 'breakfast');
  assert.equal(entries[0].kcal, modele.items[0].kcal);
  assert.notEqual(entries[0].id, undefined);
});

test('normalize gere le vide sans casser', () => {
  assert.equal(normalize(null), '');
  assert.equal(normalize('  Pâtes  '), 'pates');
});
