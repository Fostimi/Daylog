import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENCIES,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  KINDS,
  TRANSFER_DIRECTIONS,
  MAX_CENTS,
  currencyOf,
  categoriesFor,
  categoryLabel,
  toCents,
  fromCents,
  formatMoney,
  dayTotals,
  byCategory,
  periodTotals,
} from '../src/core/money.js';
import { registerCoreModules } from '../src/modules/index.js';
import { getModule, clearRegistry } from '../src/core/modules.js';

// ------------------------------------------------------------------ tables

test('les tables ont des identifiants uniques', () => {
  for (const [nom, table] of [
    ['monnaies', CURRENCIES],
    ['dépenses', EXPENSE_CATEGORIES],
    ['revenus', INCOME_CATEGORIES],
    ['natures', KINDS],
    ['sens', TRANSFER_DIRECTIONS],
  ]) {
    assert.equal(new Set(table.map((t) => t.id)).size, table.length, nom);
  }
  assert.equal(currencyOf('EUR').symbol, '€');
  assert.equal(currencyOf('inconnue').id, 'EUR', 'on retombe sur une monnaie valide');
});

test('un virement n a pas de categorie a lui', () => {
  assert.deepEqual(categoriesFor('transfer'), []);
  assert.equal(categoriesFor('income'), INCOME_CATEGORIES);
  assert.equal(categoriesFor('expense'), EXPENSE_CATEGORIES);
  assert.equal(categoryLabel('expense', 'pets'), 'Animaux');
  assert.equal(categoryLabel('expense', 'inexistante'), null);
});

// ------------------------------------------------------------- conversion

test('la virgule decimale est acceptee comme le point', () => {
  // Sur un clavier francais, le pave numerique produit une virgule. Refuser
  // « 12,50 » reviendrait a refuser la facon dont la moitie des gens ecrivent
  // un prix.
  assert.equal(toCents('12,50').value, 1250);
  assert.equal(toCents('12.50').value, 1250);
  assert.equal(toCents(12.5).value, 1250);
  assert.equal(toCents('1 250').value, 125000, 'les espaces de saisie sont ignores');
});

test('une saisie vide n est pas une erreur, un zero si', () => {
  assert.deepEqual(toCents(''), { value: null });
  assert.deepEqual(toCents(null), { value: null });
  // Une ligne a zero euro n'apprend rien et fausse le compte des saisies.
  assert.equal(toCents('0').reason, 'zero');
  assert.equal(toCents('0,00').reason, 'zero');
});

test('les saisies impossibles sont refusees, pas corrigees', () => {
  assert.equal(toCents('beaucoup').reason, 'nan');
  assert.equal(toCents('12,5,5').reason, 'nan');
  assert.equal(toCents('-5').reason, 'negative');
  assert.equal(toCents(String(MAX_CENTS)).reason, 'range');
});

test('l arrondi au centime se fait une seule fois, a la saisie', () => {
  assert.equal(toCents('0.005').value, 1);
  assert.equal(toCents('12.994').value, 1299);
  assert.equal(toCents('12.995').value, 1300);
  assert.equal(fromCents(1250), 12.5);
  assert.equal(fromCents(null), null);
});

/**
 * Le defaut que le stockage en centimes existe pour empecher.
 *
 * En virgule flottante, 0,1 + 0,2 vaut 0,30000000000000004. Sur trente saisies,
 * la balance affiche des chiffres qui ne tombent jamais juste, et aucun arrondi
 * a l'affichage ne repare ça.
 */
test('trente saisies de 0,10 font exactement 3,00', () => {
  const entries = Array.from({ length: 30 }, () => ({
    kind: 'expense',
    amount: toCents('0,10').value,
  }));
  const out = dayTotals({ entries });
  assert.equal(out.spent, 300);
  assert.equal(formatMoney(out.spent), '3,00\u00a0€');

  // La meme somme en flottants ne tombe pas juste : c'est le defaut evite.
  const flottant = Array.from({ length: 30 }, () => 0.1).reduce((a, b) => a + b, 0);
  assert.notEqual(flottant, 3);
});

// ------------------------------------------------------------- affichage

/*
 * Les espaces sont ecrites en toutes lettres (\u00a0, \u202f) plutot que
 * tapees : l'insecable avant le symbole et la fine insecable des milliers sont
 * un choix typographique, pas un accident de frappe. Ecrites telles quelles,
 * elles seraient indiscernables d'une espace ordinaire dans ce fichier, et la
 * premiere personne qui « corrigerait » le test casserait la regle.
 */
test('un montant s ecrit a la francaise', () => {
  assert.equal(formatMoney(1250), '12,50\u00a0€');
  assert.equal(formatMoney(5), '0,05\u00a0€');
  assert.equal(formatMoney(0), '0,00\u00a0€');
  assert.equal(formatMoney(-3499), '−34,99\u00a0€');
  assert.equal(formatMoney(1250, 'GBP'), '12,50\u00a0£');
  assert.equal(formatMoney(null), '—');
  // Separateur de milliers : espace fine insecable.
  assert.equal(formatMoney(1234567), '12\u202f345,67\u00a0€');
});

test('le signe positif ne s affiche que si on le demande', () => {
  assert.equal(formatMoney(1250, 'EUR', { sign: true }), '+12,50\u00a0€');
  assert.equal(formatMoney(1250, 'EUR'), '12,50\u00a0€');
  assert.equal(formatMoney(0, 'EUR', { sign: true }), '0,00\u00a0€', 'zero n a pas de signe');
});

// ------------------------------------------------------------------ totaux

/**
 * Le coeur du module.
 *
 * Se faire rembourser 20 € d'un repas n'est pas un revenu : le compter comme
 * tel gonflerait le total des revenus du mois et rendrait la categorie
 * inutilisable. Mais l'argent est bien revenu sur le compte, donc la balance
 * doit en tenir compte.
 */
test('un virement bouge la balance sans toucher aux deux totaux', () => {
  const out = dayTotals({
    entries: [
      { kind: 'expense', amount: 6000, categoryId: 'eatout' },
      { kind: 'transfer', direction: 'in', amount: 3000 },
    ],
  });
  assert.equal(out.spent, 6000, 'la depense reste ce qu elle a ete');
  assert.equal(out.earned, null, 'un remboursement n est pas un revenu');
  assert.equal(out.transferIn, 3000);
  assert.equal(out.balance, -3000, 'la balance, elle, tient compte du remboursement');
});

test('rembourser quelqu un n est pas une depense de plus', () => {
  const out = dayTotals({
    entries: [{ kind: 'transfer', direction: 'out', amount: 2500 }],
  });
  assert.equal(out.spent, null);
  assert.equal(out.transferOut, 2500);
  assert.equal(out.balance, -2500);
});

test('une journee sans saisie n est pas une journee sans depense', () => {
  const out = dayTotals({});
  assert.equal(out.spent, null);
  assert.equal(out.earned, null);
  assert.equal(out.balance, null);
  assert.equal(out.count, null);
});

test('la balance additionne les trois natures', () => {
  const out = dayTotals({
    entries: [
      { kind: 'income', amount: 200000, categoryId: 'salary' },
      { kind: 'expense', amount: 4550, categoryId: 'food' },
      { kind: 'expense', amount: 1200, categoryId: 'transport' },
      { kind: 'transfer', direction: 'in', amount: 1000 },
      { kind: 'transfer', direction: 'out', amount: 500 },
    ],
  });
  assert.equal(out.spent, 5750);
  assert.equal(out.earned, 200000);
  assert.equal(out.balance, 200000 + 1000 - 5750 - 500);
  assert.equal(out.count, 5);
});

test('une ligne abimee est ignoree, elle ne fait pas tomber le total', () => {
  const out = dayTotals({
    entries: [
      { kind: 'expense', amount: 1000, categoryId: 'food' },
      { kind: 'expense', amount: null },
      { kind: 'expense' },
      { kind: 'expense', amount: -50 },
      { kind: 'inconnu', amount: 9999 },
    ],
  });
  assert.equal(out.spent, 1000);
  assert.equal(out.balance, -1000);
});

// ------------------------------------------------------------ categories

test('le classement par categorie ne porte que sur les depenses', () => {
  const entries = [
    { kind: 'expense', amount: 3000, categoryId: 'food' },
    { kind: 'expense', amount: 1500, categoryId: 'pets' },
    { kind: 'expense', amount: 2000, categoryId: 'food' },
    { kind: 'income', amount: 500000, categoryId: 'salary' },
    { kind: 'transfer', direction: 'in', amount: 4000 },
  ];
  const out = byCategory(entries);
  assert.equal(out.length, 2, 'ni le salaire ni le virement n y figurent');
  assert.deepEqual(out[0], { id: 'food', label: 'Courses', total: 5000 });
  assert.equal(out[1].id, 'pets');
});

test('une depense sans categorie tombe dans « Autre »', () => {
  const out = byCategory([{ kind: 'expense', amount: 900 }]);
  assert.deepEqual(out, [{ id: 'other', label: 'Autre', total: 900 }]);
});

// -------------------------------------------------------------- periode

test('les totaux de periode ignorent les journees non notees', () => {
  const rows = [
    { date: '2026-03-01', spent: 3000, earned: 200000, balance: 197000 },
    { date: '2026-03-02' },
    { date: '2026-03-03', spent: 1500, balance: -1500 },
  ];
  const out = periodTotals(rows);
  assert.equal(out.spent, 4500);
  assert.equal(out.earned, 200000);
  assert.equal(out.balance, 195500);
  assert.equal(out.days, 2);
});

test('une periode vide ne raconte rien', () => {
  const out = periodTotals([]);
  assert.equal(out.spent, null);
  assert.equal(out.balance, null);
  assert.equal(out.days, 0);
});

// ------------------------------------------------------- resume quotidien

test('le module publie sa balance sans empieter sur les autres', () => {
  clearRegistry();
  registerCoreModules();
  const money = getModule('money');
  assert.ok(money, 'le module argent doit etre enregistre');

  const summary = money.summarize({
    entries: [
      { kind: 'expense', amount: 4550, categoryId: 'food' },
      { kind: 'transfer', direction: 'in', amount: 1000 },
    ],
  });
  assert.equal(summary.spent, 4550);
  assert.equal(summary.balance, -3550);
  assert.equal(summary.earned, null);

  const cles = Object.keys(summary);
  for (const autre of ['health', 'cycle', 'nutrition', 'sleep', 'habits', 'hydration', 'mood', 'activity']) {
    const communes = Object.keys(
      getModule(autre).summarize({ symptoms: ['x'], sessions: [], items: [], done: [], active: [] }) || {}
    ).filter((k) => cles.includes(k));
    assert.deepEqual(communes, [], `cles partagees avec ${autre} : ${communes.join(', ')}`);
  }
  clearRegistry();
});

test('une journee d argent vide ne remonte aucun chiffre', () => {
  clearRegistry();
  registerCoreModules();
  const summary = getModule('money').summarize({});
  for (const value of Object.values(summary)) assert.equal(value, null);
  clearRegistry();
});
