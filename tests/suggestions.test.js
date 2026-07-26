import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalize, editDistance, suggest, categoryOf, SUGGESTIONS, CATEGORIES,
} from '../src/modules/suggestions.js';

test('normalize efface accents, casse et apostrophes', () => {
  assert.equal(normalize('Méditation'), 'meditation');
  assert.equal(normalize('ÉTIREMENTS'), 'etirements');
  assert.equal(normalize('Boire assez d’eau'), "boire assez d'eau");
  assert.equal(normalize("Boire assez d'eau"), "boire assez d'eau");
  assert.equal(normalize('  Marche   rapide '), 'marche rapide');
  assert.equal(normalize(null), '');
});

test('normalize rend deux ecritures d une meme activite identiques', () => {
  // C'est ce qui empeche « Meditation » et « Méditation » de coexister comme
  // deux activites distinctes dans l'historique.
  assert.equal(normalize('Meditation'), normalize('Méditation'));
  assert.equal(normalize('YOGA'), normalize('yoga'));
});

test('editDistance mesure les fautes de frappe et plafonne', () => {
  assert.equal(editDistance('marche', 'marche'), 0);
  assert.equal(editDistance('marche', 'march'), 1);
  assert.equal(editDistance('meditaton', 'meditation'), 1);
  assert.equal(editDistance('yoga', 'natation', 2), 3, 'au-dela du plafond');
  assert.equal(editDistance('a', 'abcdefgh', 2), 3, 'ecart de longueur trop grand');
});

test('les suggestions retrouvent un mot mal orthographie', () => {
  const labels = (q) => suggest(q).map((s) => s.label);
  assert.ok(labels('meditaton').includes('Méditation'), 'faute de frappe');
  assert.ok(labels('meditation').includes('Méditation'), 'sans accent');
  assert.ok(labels('MARCHE').includes('Marche'), 'en majuscules');
  assert.ok(labels('etirement').includes('Étirements'), 'accent et pluriel');
});

test('les suggestions donnent la priorite au debut du mot', () => {
  const first = suggest('lec')[0];
  assert.equal(first.label, 'Lecture');
});

test('sans rien taper, les suggestions couvrent plusieurs categories', () => {
  // Sinon on ne verrait jamais que le debut de la liste, donc une seule famille
  // d'activites.
  const initial = suggest('');
  const categories = new Set(initial.map((s) => s.category));
  assert.ok(initial.length > 0);
  assert.equal(categories.size, initial.length, 'une categorie differente par suggestion');
});

test('ce qui est deja suivi n est plus propose', () => {
  const labels = suggest('', { exclude: ['Méditation'] }).map((s) => s.label);
  assert.ok(!labels.includes('Méditation'));

  // L'exclusion doit ignorer les accents, sinon on reproposerait une activite
  // deja presente sous une autre orthographe.
  const labels2 = suggest('medit', { exclude: ['meditation'] }).map((s) => s.label);
  assert.ok(!labels2.includes('Méditation'));
});

test('une saisie sans correspondance ne propose rien plutot que n importe quoi', () => {
  assert.deepEqual(suggest('xyzqwerty'), []);
});

test('la categorie n est attribuee que sur correspondance exacte', () => {
  assert.equal(categoryOf('Méditation'), 'calme');
  assert.equal(categoryOf('meditation'), 'calme', 'accents ignores');
  assert.equal(categoryOf('Mon truc à moi'), null, 'une activite libre reste sans categorie');
});

test('chaque suggestion a une categorie connue', () => {
  for (const s of SUGGESTIONS) {
    assert.ok(CATEGORIES[s.category], `categorie inconnue : ${s.category} (${s.label})`);
  }
});

test('aucun doublon dans les suggestions', () => {
  const seen = new Set(SUGGESTIONS.map((s) => normalize(s.label)));
  assert.equal(seen.size, SUGGESTIONS.length);
});
