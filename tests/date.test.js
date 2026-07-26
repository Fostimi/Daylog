import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayKey, today, isValidKey, toDate, addDays, diffDays,
  range, lastNDays, weekStart, weekDays, monthStart, isFuture,
} from '../src/core/date.js';

test('dayKey utilise l heure locale, pas UTC', () => {
  // Le bug du v5 : a 23h30 heure locale, toISOString() renvoyait deja le
  // lendemain. On verifie que la cle suit bien le calendrier local.
  const late = new Date(2026, 6, 26, 23, 30, 0); // 26 juillet 2026, 23h30 local
  assert.equal(dayKey(late), '2026-07-26');

  const earlyMorning = new Date(2026, 6, 27, 0, 15, 0);
  assert.equal(dayKey(earlyMorning), '2026-07-27');
});

test('dayKey respecte le decalage de debut de journee', () => {
  const oneAM = new Date(2026, 6, 27, 1, 0, 0); // 27 juillet a 1h du matin
  assert.equal(dayKey(oneAM, 0), '2026-07-27', 'sans decalage : nouvelle journee');
  assert.equal(dayKey(oneAM, 4), '2026-07-26', 'avec bascule a 4h : compte pour la veille');

  const fiveAM = new Date(2026, 6, 27, 5, 0, 0);
  assert.equal(dayKey(fiveAM, 4), '2026-07-27', 'apres 4h : nouvelle journee');
});

test('dayKey gere le passage de fin d annee', () => {
  assert.equal(dayKey(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
  assert.equal(dayKey(new Date(2027, 0, 1, 0, 1)), '2027-01-01');
});

test('isValidKey rejette les dates impossibles', () => {
  assert.ok(isValidKey('2026-07-26'));
  assert.ok(isValidKey('2024-02-29'), 'annee bissextile');
  assert.ok(!isValidKey('2026-02-31'), '31 fevrier');
  assert.ok(!isValidKey('2025-02-29'), 'annee non bissextile');
  assert.ok(!isValidKey('2026-13-01'));
  assert.ok(!isValidKey('2026-00-10'));
  assert.ok(!isValidKey('26-07-2026'));
  assert.ok(!isValidKey(''));
  assert.ok(!isValidKey(null));
  assert.ok(!isValidKey(20260726));
});

test('toDate renvoie midi local et refuse les cles invalides', () => {
  const d = toDate('2026-07-26');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 6);
  assert.equal(d.getDate(), 26);
  assert.equal(d.getHours(), 12, 'midi, pour survivre aux changements d heure');
  assert.throws(() => toDate('2026-02-31'), RangeError);
});

test('addDays traverse mois, annees et fevrier', () => {
  assert.equal(addDays('2026-07-26', 1), '2026-07-27');
  assert.equal(addDays('2026-07-31', 1), '2026-08-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2027-01-01', -1), '2026-12-31');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29', 'bissextile');
  assert.equal(addDays('2025-02-28', 1), '2025-03-01', 'non bissextile');
  assert.equal(addDays('2026-07-26', 0), '2026-07-26');
});

test('addDays survit au changement d heure', () => {
  // En Europe, l heure d ete 2026 commence le 29 mars. Un calcul naif en
  // millisecondes saute ou repete un jour a cette date.
  assert.equal(addDays('2026-03-28', 1), '2026-03-29');
  assert.equal(addDays('2026-03-29', 1), '2026-03-30');
  assert.equal(addDays('2026-10-24', 1), '2026-10-25');
  assert.equal(addDays('2026-10-25', 1), '2026-10-26');
});

test('diffDays compte des jours entiers', () => {
  assert.equal(diffDays('2026-07-26', '2026-07-29'), 3);
  assert.equal(diffDays('2026-07-29', '2026-07-26'), -3);
  assert.equal(diffDays('2026-07-26', '2026-07-26'), 0);
  assert.equal(diffDays('2026-03-28', '2026-03-30'), 2, 'a travers le changement d heure');
  assert.equal(diffDays('2026-01-01', '2027-01-01'), 365);
});

test('range et lastNDays produisent des suites continues', () => {
  assert.deepEqual(range('2026-07-26', '2026-07-28'), ['2026-07-26', '2026-07-27', '2026-07-28']);
  assert.deepEqual(range('2026-07-28', '2026-07-26'), [], 'intervalle inverse : vide');
  assert.deepEqual(range('2026-07-26', '2026-07-26'), ['2026-07-26']);

  const last7 = lastNDays(7, '2026-07-26');
  assert.equal(last7.length, 7);
  assert.equal(last7[6], '2026-07-26', 'se termine par le jour demande');
  assert.equal(last7[0], '2026-07-20');
});

test('weekStart trouve le lundi, quel que soit le jour', () => {
  assert.equal(weekStart('2026-07-26'), '2026-07-20', 'un dimanche appartient a la semaine ecoulee');
  assert.equal(weekStart('2026-07-20'), '2026-07-20', 'un lundi est son propre debut');
  assert.equal(weekStart('2026-07-21'), '2026-07-20');
  assert.equal(weekStart('2026-07-27'), '2026-07-27');
  const days = weekDays('2026-07-26');
  assert.equal(days.length, 7);
  assert.equal(days[0], '2026-07-20');
  assert.equal(days[6], '2026-07-26');
});

test('monthStart et isFuture', () => {
  assert.equal(monthStart('2026-07-26'), '2026-07-01');
  const t = today();
  assert.ok(!isFuture(t), "aujourd hui n est pas dans le futur");
  assert.ok(isFuture(addDays(t, 1)));
  assert.ok(!isFuture(addDays(t, -1)));
});
