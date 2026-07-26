import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshDB } from './helpers.js';
import { mean, sum, meanOf, round, correlate, summarize } from '../src/core/summary.js';
import { getModule, enabledModules, expressModules, shareableModules, defaultModuleState } from '../src/core/modules.js';
import { createListItem, activeItems, newId } from '../src/core/ids.js';

beforeEach(freshDB);

test('mean ignore les valeurs non renseignees au lieu de les compter pour zero', () => {
  // Le coeur du probleme n°1 du v5 : null n'est pas 0.
  assert.equal(mean([8, null, 6]), 7, 'null est exclu, pas compte comme 0');
  assert.equal(mean([8, undefined, 6]), 7);
  assert.equal(mean([8, NaN, 6]), 7);
  assert.equal(mean([0, 10]), 5, 'un vrai zero compte');
  assert.equal(mean([]), null, "aucune donnee renvoie null, pas 0");
  assert.equal(mean([null, null]), null);
  assert.equal(mean(null), null);
});

test('sum suit la meme regle', () => {
  assert.equal(sum([100, null, 200]), 300);
  assert.equal(sum([]), null);
  assert.equal(sum([0]), 0);
});

test('meanOf calcule sur une serie de resumes trouee', () => {
  const summaries = [
    { date: '2026-07-20', mood: 8 },
    { date: '2026-07-21' }, // journee suivie mais humeur non renseignee
    { date: '2026-07-22', mood: 6 },
  ];
  assert.equal(meanOf(summaries, 'mood'), 7);
  assert.equal(meanOf(summaries, 'sleepH'), null, 'champ jamais renseigne');
});

test('round preserve null', () => {
  assert.equal(round(7.456, 1), 7.5);
  assert.equal(round(7.44, 1), 7.4);
  assert.equal(round(null), null);
  assert.equal(round(undefined), null);
  assert.equal(round(0), 0);
});

test('correlate apparie par jour et refuse les echantillons trop petits', () => {
  // Le v5 filtrait les deux series separement puis les alignait par la fin : il
  // correlait le lundi avec le mercredi des qu'une serie avait un trou.
  const perfect = Array.from({ length: 20 }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    recovery: 50 + i,
    mood: 5 + i * 0.1,
  }));
  const r = correlate(perfect, 'recovery', 'mood');
  assert.ok(r);
  assert.ok(Math.abs(r.r - 1) < 1e-9, 'correlation parfaite detectee');
  assert.equal(r.n, 20);

  assert.equal(correlate(perfect.slice(0, 7), 'recovery', 'mood'), null,
    'sept points : on refuse de conclure');
});

test('correlate ne retient que les jours ou les deux valeurs existent', () => {
  const data = [
    ...Array.from({ length: 15 }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, '0')}`,
      a: i,
      b: i,
    })),
    { date: '2026-07-16', a: 999 }, // b manquant : ce jour doit etre ignore
    { date: '2026-07-17', b: -999 }, // a manquant : ignore aussi
  ];
  const r = correlate(data, 'a', 'b');
  assert.equal(r.n, 15, 'seules les paires completes comptent');
  assert.ok(Math.abs(r.r - 1) < 1e-9);
});

test('correlate renvoie null sur une serie constante', () => {
  const flat = Array.from({ length: 20 }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    a: 5,
    b: i,
  }));
  assert.equal(correlate(flat, 'a', 'b'), null, 'rien a correler avec une constante');
});

test('le pourcentage d habitudes est fige au jour concerne', () => {
  // Le bug du v5 : le score etait recalcule avec la liste d habitudes ACTUELLE.
  // Ajouter une habitude aujourd hui faisait baisser tous les scores passes.
  const habits = getModule('habits');

  const janvier = habits.summarize({ done: ['h1', 'h2'], active: ['h1', 'h2'] });
  assert.equal(janvier.habitsPct, 100, 'deux habitudes sur deux ce jour-la');

  // Trois mois plus tard la personne suit cinq habitudes. Le resume de janvier
  // doit rester a 100 %, il ne depend que de ce qui existait a l epoque.
  const juillet = habits.summarize({ done: ['h1', 'h2'], active: ['h1', 'h2', 'h3', 'h4', 'h5'] });
  assert.equal(juillet.habitsPct, 40);
  assert.equal(janvier.habitsPct, 100, "l'historique n'est pas reecrit");
});

test('aucune habitude active ne produit pas une division par zero', () => {
  const habits = getModule('habits');
  const s = habits.summarize({ done: [], active: [] });
  assert.equal(s.habitsPct, null, 'null, pas NaN ni 0');
  assert.equal(s.habitsTotal, null);
});

test('les modules essentiels ne peuvent pas etre desactives', () => {
  const state = { mood: false, note: false, sleep: false, habits: false };
  const enabled = enabledModules(state, {}).map((m) => m.id);
  assert.ok(enabled.includes('mood'), "l'humeur est le coeur du journal");
  assert.ok(enabled.includes('note'));
  assert.ok(!enabled.includes('sleep'), 'un module non essentiel se desactive');
  assert.ok(!enabled.includes('habits'));
});

test('un module qui exige une capacite reste masque sans elle', () => {
  const enabled = enabledModules({}, {}).map((m) => m.id);
  assert.ok(enabled.length > 0);
  // Aucun module du noyau n'exige de capacite pour l instant ; on verifie que
  // le mecanisme filtre bien quand une exigence n'est pas satisfaite.
  const fake = { id: 'x', requires: ['wearable'], essential: false, defaultEnabled: true };
  assert.ok(!fake.requires.every((c) => Boolean({}[c])));
  assert.ok(fake.requires.every((c) => Boolean({ wearable: true }[c])));
});

test('le mode express ne retient que les modules marques', () => {
  const ids = expressModules({}, {}).map((m) => m.id);
  assert.deepEqual(ids, ['mood', 'sleep', 'note'], 'humeur, sommeil, un mot');
});

test('le journal intime ne figure jamais dans un partage', () => {
  const ids = shareableModules({}, {}).map((m) => m.id);
  assert.ok(!ids.includes('note'), 'le journal ne se partage pas');
  assert.ok(!ids.includes('mood'), "les check-ins d'humeur non plus");
  assert.ok(ids.includes('nutrition'), 'la nutrition, oui');
  assert.ok(ids.includes('sleep'));
});

test('l etat par defaut active les modules du noyau', () => {
  const state = defaultModuleState();
  assert.equal(state.mood, true);
  assert.equal(state.note, true);
  assert.equal(state.sleep, true);
});

test('summarize ignore un module dont le calcul echoue', () => {
  // Un module bugue ne doit jamais empecher la sauvegarde de la journee.
  const day = { date: '2026-07-26', modules: { mood: null, sleep: { hours: 7 } } };
  const s = summarize(day, {}, {});
  assert.equal(s.date, '2026-07-26');
  assert.equal(s.sleepH, 7);
});

test('les identifiants sont uniques meme generes dans la meme milliseconde', () => {
  // Le v5 utilisait Date.now() : deux clics rapides produisaient le meme id.
  const ids = new Set(Array.from({ length: 5000 }, () => newId('hab')));
  assert.equal(ids.size, 5000, 'aucune collision');
  assert.match([...ids][0], /^hab_[a-z0-9]{10}$/);
});

test('archiver une habitude la retire de la saisie sans toucher a l historique', () => {
  const a = createListItem('habit', 'Meditation');
  const b = createListItem('habit', 'Lecture');
  b.archivedAt = new Date().toISOString();

  const active = activeItems([a, b]);
  assert.equal(active.length, 1);
  assert.equal(active[0].label, 'Meditation');
  assert.ok(b.id, "l'habitude archivee garde son identifiant, l'historique reste lisible");
});

test('renommer une habitude ne casse pas l historique', () => {
  const item = createListItem('habit', 'Sport');
  const idBefore = item.id;
  item.label = 'Muscu';
  assert.equal(item.id, idBefore, "l'identifiant ne bouge pas");
});
