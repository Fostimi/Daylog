import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekReview, dayGlance, compareWeeks, COMPARED } from '../src/core/week.js';
import { weekDays, weekStart } from '../src/core/date.js';

const SEMAINE = weekDays('2026-03-04'); // mercredi -> semaine du 2 au 8 mars

test('la semaine ISO commence un lundi', () => {
  assert.equal(weekStart('2026-03-04'), '2026-03-02');
  assert.equal(SEMAINE.length, 7);
  assert.equal(SEMAINE[0], '2026-03-02');
  assert.equal(SEMAINE[6], '2026-03-08');
  // Un dimanche appartient a la semaine qui l'a precede, pas a la suivante.
  assert.equal(weekStart('2026-03-08'), '2026-03-02');
});

test('les journees non notees sont des trous, jamais des zeros', () => {
  const rows = [
    { date: '2026-03-02', mood: 8, sleepH: 8 },
    { date: '2026-03-05', mood: 6, sleepH: 6 },
  ];
  const out = weekReview(rows, SEMAINE);

  assert.equal(out.tracked, 2);
  assert.equal(out.days.length, 7, 'la bande garde ses sept jours');
  assert.equal(out.days[0].mood, 8);
  assert.equal(out.days[1], null, 'un jour non note reste un trou');
  // La moyenne porte sur 2 jours, pas sur 7 : sinon elle vaudrait 2 au lieu de 7.
  assert.equal(out.mood, 7);
  assert.equal(out.sleepMean, 7);
  assert.equal(out.sleepTotal, 14);
  assert.equal(out.sleepNights, 2);
});

test('une semaine vide ne raconte rien, sans planter', () => {
  const out = weekReview([], SEMAINE);
  assert.equal(out.tracked, 0);
  assert.equal(out.mood, null);
  assert.equal(out.sleepTotal, null);
  assert.equal(out.moveMin, null);
  assert.equal(out.restDays, null);
  assert.equal(out.weight, null);
  assert.equal(out.days.filter(Boolean).length, 0);
});

test('le sommeil se cumule et se moyenne, l humeur seulement se moyenne', () => {
  const rows = SEMAINE.map((date, i) => ({ date, sleepH: 7 + (i % 2), mood: 5 }));
  const out = weekReview(rows, SEMAINE);
  assert.equal(out.sleepTotal, 7 * 7 + 3);
  assert.equal(out.sleepMean, 7.4);
  assert.equal(out.mood, 5, 'une humeur ne se cumule pas');
  assert.equal(out.sleepNights, 7);
});

test('seuls les jours de repos reellement coches sont comptes', () => {
  // L'absence de note n'est pas un jour de repos, et le compter comme tel
  // inventerait une donnee.
  const rows = [
    { date: '2026-03-02', restDay: 1 },
    { date: '2026-03-03', moveMin: 45 },
    { date: '2026-03-04', mood: 6 },
  ];
  const out = weekReview(rows, SEMAINE);
  assert.equal(out.restDays, 1);
  assert.equal(out.moveMin, 45);
});

test('le poids retenu est la derniere pesee de la semaine', () => {
  const rows = [
    { date: '2026-03-02', weightKg: 72 },
    { date: '2026-03-06', weightKg: 71.4 },
    { date: '2026-03-07', mood: 7 },
  ];
  assert.equal(weekReview(rows, SEMAINE).weight, 71.4);
});

test('les totaux d activite additionnent la semaine entiere', () => {
  const rows = [
    { date: '2026-03-02', moveMin: 45, moveM: 5000, workouts: 1 },
    { date: '2026-03-04', moveMin: 30, moveM: 3000, workouts: 1 },
  ];
  const out = weekReview(rows, SEMAINE);
  assert.equal(out.moveMin, 75);
  assert.equal(out.moveM, 8000);
  assert.equal(out.workouts, 2);
});

// ----------------------------------------------------------- bande des jours

test('la bande dit une chose par jour, et se tait sur les jours vides', () => {
  assert.equal(dayGlance(null), null);
  assert.equal(dayGlance({ mood: 7.2, sleepH: 6.5, moveMin: 40 }), 'humeur 7.2 · 6.5 h · 40 min');
  assert.equal(dayGlance({ restDay: 1 }), 'repos');
  assert.equal(dayGlance({ kcal: 2100 }), '2100 kcal');
  assert.equal(dayGlance({ hasNote: 1 }), 'note');
  // Une journee qui existe mais dont rien ne se resume reste signalee comme
  // notee : elle contient bien quelque chose.
  assert.equal(dayGlance({ waterMl: 1000 }), 'noté');
});

test('la bande ne depasse jamais trois informations', () => {
  const texte = dayGlance({ mood: 7, sleepH: 8, moveMin: 60, kcal: 2000, hasNote: 1 });
  assert.equal(texte.split(' · ').length, 3);
});

// -------------------------------------------------------------- comparaison

test('on ne compare que ce qui existe des deux cotes', () => {
  const cette = weekReview([{ date: '2026-03-02', mood: 7, sleepH: 8 }], SEMAINE);
  const avant = weekReview([{ date: '2026-02-23', mood: 6 }], weekDays('2026-02-23'));

  const out = compareWeeks(cette, avant);
  const cles = out.map((c) => c.key);
  assert.ok(cles.includes('mood'));
  assert.ok(!cles.includes('sleepMean'), 'le sommeil manque d un cote');
  assert.equal(out.find((c) => c.key === 'mood').now, 7);
  assert.equal(out.find((c) => c.key === 'mood').before, 6);
});

test('sans semaine precedente, il n y a rien a comparer', () => {
  const cette = weekReview([{ date: '2026-03-02', mood: 7 }], SEMAINE);
  assert.deepEqual(compareWeeks(cette, null), []);
  assert.deepEqual(compareWeeks(null, cette), []);
  assert.deepEqual(compareWeeks(cette, weekReview([], weekDays('2026-02-23'))), []);
});

test('la comparaison ne porte aucun jugement', () => {
  // Ni « mieux », ni « moins bien », ni couleur : Daylog ne sait pas ce qu'un
  // stress en hausse signifie pour la personne qui le lit.
  const juge = /mieux|pire|bravo|attention|objectif|réussi|raté/i;
  for (const c of COMPARED) {
    assert.equal(juge.test(c.label), false, c.label);
    assert.equal('direction' in c, false, `${c.key} annonce un sens de variation`);
  }
});
