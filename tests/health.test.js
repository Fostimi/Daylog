import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MEASURES,
  BP_RANGE,
  PAIN_SITES,
  DIGESTION,
  SYMPTOMS,
  DOSE_UNITS,
  MOMENTS,
  getMeasure,
  suggestedMeasures,
  sanitizeMeasure,
  sanitizeBloodPressure,
  weightSeries,
  weightTrend,
  shouldAdoptWeight,
  doseAt,
  recentDoseChange,
  sortTreatments,
  takeDose,
  formatDose,
} from '../src/core/health.js';
import { addDays } from '../src/core/date.js';
import { registerCoreModules } from '../src/modules/index.js';
import { getModule, clearRegistry } from '../src/core/modules.js';

/** Serie de pesees quotidiennes, a partir d'une date. */
function pesees(start, kgs) {
  return kgs.map((kg, i) => ({ date: addDays(start, i), weightKg: kg }));
}

// ------------------------------------------------------------------ constantes

test('chaque mesure a un identifiant et une cle de resume uniques', () => {
  assert.equal(new Set(MEASURES.map((m) => m.id)).size, MEASURES.length);
  assert.equal(new Set(MEASURES.map((m) => m.summaryKey)).size, MEASURES.length);
  assert.equal(new Set(PAIN_SITES.map((s) => s.id)).size, PAIN_SITES.length);
  assert.equal(new Set(DIGESTION.map((d) => d.id)).size, DIGESTION.length);
  assert.equal(new Set(SYMPTOMS.map((s) => s.id)).size, SYMPTOMS.length);
  assert.equal(new Set(MOMENTS.map((m) => m.id)).size, MOMENTS.length);
  assert.equal(new Set(DOSE_UNITS).size, DOSE_UNITS.length);
});

test('toute mesure simple porte des bornes coherentes', () => {
  for (const m of MEASURES) {
    if (m.pair) continue;
    assert.ok(Array.isArray(m.range), `${m.id} sans bornes`);
    assert.ok(m.range[0] < m.range[1], `${m.id} : bornes inversees`);
    assert.equal(typeof m.digits, 'number', `${m.id} sans precision`);
  }
});

test('les bornes acceptent ce qui existe vraiment', () => {
  // Une application qui refuserait de noter une hypothermie ou une forte fievre
  // serait inutile precisement le jour ou elle servirait.
  assert.equal(sanitizeMeasure('temp', 31).value, 31);
  assert.equal(sanitizeMeasure('temp', 42).value, 42);
  assert.equal(sanitizeMeasure('bpmRest', 32).value, 32); // coeur d'athlete
  assert.equal(sanitizeMeasure('spo2', 88).value, 88);
});

test('les mesures cardiaques ne sont proposees que si quelque chose les mesure', () => {
  assert.deepEqual(suggestedMeasures(), ['weight']);
  const withWatch = suggestedMeasures({ wearable: 'garmin' });
  assert.ok(withWatch.includes('bpmRest'));
  assert.ok(withWatch.includes('spo2'));
  // Toutes les suggestions doivent exister.
  for (const id of withWatch) assert.ok(getMeasure(id), `mesure inconnue : ${id}`);
});

// --------------------------------------------------------------- saisie

test('une saisie vide revient a « non renseigne », sans erreur', () => {
  for (const empty of [null, undefined, '']) {
    const out = sanitizeMeasure('weight', empty);
    assert.equal(out.value, null);
    assert.equal(out.reason, undefined);
  }
});

test('une virgule oubliee est refusee, pas arrondie', () => {
  // 370 °C est une faute de frappe. La ramener a 43 enregistrerait une fievre
  // que personne n'a eue, et empoisonnerait toutes les moyennes.
  const out = sanitizeMeasure('temp', 370);
  assert.equal(out.value, null);
  assert.equal(out.reason, 'range');
  assert.equal(out.min, 30);
  assert.equal(out.max, 43);
});

test('la mesure est arrondie a sa propre precision', () => {
  assert.equal(sanitizeMeasure('temp', 37.0333).value, 37);
  assert.equal(sanitizeMeasure('weight', 72.349).value, 72.3);
  assert.equal(sanitizeMeasure('spo2', 97.4).value, 97);
});

test('une saisie qui n est pas un nombre ne passe pas', () => {
  assert.equal(sanitizeMeasure('weight', 'beaucoup').reason, 'nan');
  assert.equal(sanitizeMeasure('inconnue', 5).reason, 'unknown');
  // La tension a son propre controle : deux nombres lies.
  assert.equal(sanitizeMeasure('bp', 12).reason, 'unknown');
});

test('la tension exige ses deux nombres', () => {
  assert.deepEqual(sanitizeBloodPressure(null, null), { value: null });
  assert.equal(sanitizeBloodPressure(120, null).reason, 'incomplete');
  assert.equal(sanitizeBloodPressure(null, 80).reason, 'incomplete');
});

test('une tension inversee est signalee, jamais remise a l endroit toute seule', () => {
  assert.equal(sanitizeBloodPressure(80, 120).reason, 'inverted');
  // Egales : indiscernable d'une saisie ratee, on ne devine pas.
  assert.equal(sanitizeBloodPressure(100, 100).reason, 'inverted');
  assert.deepEqual(sanitizeBloodPressure(120, 80).value, { systolic: 120, diastolic: 80 });
});

test('la tension reste dans ses bornes de vraisemblance', () => {
  assert.equal(sanitizeBloodPressure(12, 8).reason, 'range'); // saisie en cmHg
  assert.equal(sanitizeBloodPressure(300, 80).reason, 'range');
  assert.equal(sanitizeBloodPressure(BP_RANGE.systolic[1], BP_RANGE.diastolic[1]).value.systolic,
    BP_RANGE.systolic[1]);
});

// ---------------------------------------------------------------- poids

test('la serie de poids ignore les journees sans pesee et se remet en ordre', () => {
  const rows = [
    { date: '2026-03-03', weightKg: 71 },
    { date: '2026-03-01', weightKg: 72 },
    { date: '2026-03-02' },
    { date: '2026-03-04', weightKg: null },
  ];
  assert.deepEqual(weightSeries(rows), [
    { date: '2026-03-01', kg: 72 },
    { date: '2026-03-03', kg: 71 },
  ]);
});

test('la tendance refuse de se prononcer sur trop peu de pesees', () => {
  const out = weightTrend(pesees('2026-03-01', [72, 71.5, 72.1]));
  assert.equal(out.change, null);
  assert.equal(out.n, 3);
  assert.equal(out.missing, 1);
  assert.equal(weightTrend([]).change, null);
});

test('la tendance lisse le bruit du jour le jour', () => {
  // Deux series de meme tendance reelle (-1 kg), mais dont la derniere pesee
  // est haute. Comparer la premiere a la derniere annoncerait une PRISE de
  // poids ; la moyenne mobile voit la baisse.
  const rows = pesees('2026-03-01', [73, 72.8, 72.9, 72.6, 72, 71.9, 72.1, 71.8, 72.4]);
  const brut = rows[rows.length - 1].weightKg - rows[0].weightKg;
  assert.ok(brut > -0.7, 'la comparaison brute sous-estime la baisse');

  const out = weightTrend(rows);
  assert.ok(out.change < brut, 'le lissage doit voir la baisse que le brut manque');
  assert.equal(out.n, 9);
  assert.equal(out.days, 8);
  assert.equal(out.from, '2026-03-01');
  assert.equal(out.to, '2026-03-09');
});

test('les deux fenetres de lissage ne se recouvrent jamais', () => {
  // Cinq pesees et une fenetre de sept : sans garde-fou, les deux moyennes
  // porteraient sur les memes points et la tendance serait toujours nulle.
  const out = weightTrend(pesees('2026-03-01', [80, 79, 78, 77, 76]));
  assert.ok(out.change < 0, `tendance a plat : ${out.change}`);
  assert.equal(out.change, -3); // moyenne(80,79) -> moyenne(77,76)
});

test('une pesee ancienne ne remplace pas une reference plus recente', () => {
  // Completer une journee oubliee ne doit pas faire reculer d'une semaine le
  // poids sur lequel reposent les calculs.
  assert.equal(shouldAdoptWeight('2026-03-10', '2026-03-12T08:00:00.000Z'), false);
  assert.equal(shouldAdoptWeight('2026-03-12', '2026-03-12T08:00:00.000Z'), true);
  assert.equal(shouldAdoptWeight('2026-03-13', '2026-03-12T08:00:00.000Z'), true);
  assert.equal(shouldAdoptWeight('2026-03-01', null), true);
  assert.equal(shouldAdoptWeight(null, null), false);
});

// ---------------------------------------------------------- traitements

/** Traitement avec un historique de doses. */
function traitement(dose, history = []) {
  return {
    id: 'trt_a',
    kind: 'treatment',
    label: 'Methylphenidate',
    dose,
    unit: 'mg',
    moments: ['morning'],
    order: 1,
    doseHistory: history,
  };
}

test('un traitement sans historique garde sa dose sur toute la periode', () => {
  const t = traitement(20);
  assert.deepEqual(doseAt(t, '2026-01-01'), { dose: 20, unit: 'mg' });
  assert.deepEqual(doseAt(t, '2026-12-31'), { dose: 20, unit: 'mg' });
});

test('la dose d une journee passee est celle qui s appliquait ce jour-la', () => {
  // Le cas du cahier des charges : un dosage qui evolue. Augmenter en mars ne
  // doit pas reecrire ce qui a ete pris en janvier.
  const t = traitement(30, [
    { at: '2026-01-05T08:00:00.000Z', dose: 10, unit: 'mg' },
    { at: '2026-02-10T08:00:00.000Z', dose: 20, unit: 'mg' },
    { at: '2026-03-15T08:00:00.000Z', dose: 30, unit: 'mg' },
  ]);
  assert.equal(doseAt(t, '2026-01-20').dose, 10);
  assert.equal(doseAt(t, '2026-02-10').dose, 20); // le jour meme du changement
  assert.equal(doseAt(t, '2026-02-28').dose, 20);
  assert.equal(doseAt(t, '2026-06-01').dose, 30);
});

test('avant le premier enregistrement, c est la dose la plus ancienne qui vaut', () => {
  const t = traitement(30, [
    { at: '2026-02-10T08:00:00.000Z', dose: 20, unit: 'mg' },
    { at: '2026-03-15T08:00:00.000Z', dose: 30, unit: 'mg' },
  ]);
  assert.equal(doseAt(t, '2026-01-01').dose, 20);
});

test('un changement de dose recent est signale, une creation ne l est pas', () => {
  const t = traitement(20, [
    { at: '2026-01-05T08:00:00.000Z', dose: 10, unit: 'mg' },
    { at: '2026-03-10T08:00:00.000Z', dose: 20, unit: 'mg' },
  ]);
  const recent = recentDoseChange(t, '2026-03-20');
  assert.equal(recent.dose, 20);
  assert.equal(recent.days, 10);

  // Passe le delai, on cesse de le rappeler.
  assert.equal(recentDoseChange(t, '2026-04-20'), null);
  // Un traitement qui n'a jamais bouge n'a rien a signaler.
  assert.equal(recentDoseChange(traitement(20), '2026-03-20'), null);
  assert.equal(
    recentDoseChange(traitement(10, [{ at: '2026-01-05T08:00:00.000Z', dose: 10 }]), '2026-01-10'),
    null
  );
});

test('un changement posterieur a la date consultee est ignore', () => {
  const t = traitement(20, [
    { at: '2026-01-05T08:00:00.000Z', dose: 10, unit: 'mg' },
    { at: '2026-03-10T08:00:00.000Z', dose: 20, unit: 'mg' },
  ]);
  assert.equal(recentDoseChange(t, '2026-03-01'), null);
  assert.equal(doseAt(t, '2026-03-01').dose, 10);
});

test('une prise fige le libelle et la dose du moment', () => {
  // L'extrait « Santé » remis a un medecin n'emporte pas les listes de
  // l'application : une ligne qui ne porterait qu'un identifiant serait
  // illisible.
  const t = traitement(30, [
    { at: '2026-01-05T08:00:00.000Z', dose: 10, unit: 'mg' },
    { at: '2026-03-15T08:00:00.000Z', dose: 30, unit: 'mg' },
  ]);
  const prise = takeDose(t, '2026-02-01', new Date('2026-02-01T07:30:00.000Z'));
  assert.equal(prise.id, 'trt_a');
  assert.equal(prise.label, 'Methylphenidate');
  assert.equal(prise.dose, 10);
  assert.equal(prise.unit, 'mg');
  assert.equal(prise.at, '2026-02-01T07:30:00.000Z');
});

test('les traitements se rangent par moment de prise', () => {
  const items = [
    { id: 'c', moments: ['evening'], order: 1 },
    { id: 'a', moments: ['morning'], order: 3 },
    { id: 'd', moments: [], order: 2 },
    { id: 'b', moments: ['morning'], order: 4 },
  ];
  assert.deepEqual(sortTreatments(items).map((i) => i.id), ['a', 'b', 'c', 'd']);
  // Le tri ne modifie pas la liste d'origine.
  assert.equal(items[0].id, 'c');
});

test('une dose s ecrit comme on la dit', () => {
  assert.equal(formatDose(20, 'mg'), '20 mg');
  assert.equal(formatDose(1, 'comprimé'), '1 comprimé');
  assert.equal(formatDose(2, 'comprimé'), '2 comprimés');
  assert.equal(formatDose(0.5, 'comprimé'), '0.5 comprimé');
  // Les abreviations ne prennent pas la marque du pluriel.
  assert.equal(formatDose(500, 'mg'), '500 mg');
  assert.equal(formatDose(2, 'ml'), '2 ml');
  assert.equal(formatDose(3, 'UI'), '3 UI');
  assert.equal(formatDose(null, 'mg'), 'mg');
});

// ------------------------------------------------------- resume quotidien

/**
 * Le module declare ses cles de resume sans importer `core/health.js` : le
 * registre de modules est charge par tout le monde, y compris par qui n'a
 * jamais active la sante, et lui faire porter ce fichier reviendrait a faire
 * payer un module desactive. La contrepartie est que deux listes decrivent la
 * meme chose -- ce test est ce qui les empeche de diverger.
 */
test('chaque mesure declaree produit bien sa cle dans le resume', () => {
  clearRegistry();
  registerCoreModules();
  const health = getModule('health');
  assert.ok(health, 'le module sante doit etre enregistre');

  const day = {
    weight: 72.4,
    bodyFat: 21,
    temp: 37.1,
    bp: { systolic: 118, diastolic: 76 },
    spo2: 97,
    bpmRest: 54,
    bpmMin: 48,
    bpmMax: 152,
    pain: { level: 3, sites: ['back'] },
    symptoms: ['cough'],
    doses: [{ id: 'trt_a' }, { id: 'trt_b' }],
  };
  const summary = health.summarize(day);

  for (const m of MEASURES) {
    assert.ok(
      summary[m.summaryKey] !== null && summary[m.summaryKey] !== undefined,
      `la mesure « ${m.id} » annonce la cle « ${m.summaryKey} », absente du resume`
    );
  }
  assert.equal(summary.weightKg, 72.4);
  assert.equal(summary.bpSys, 118);
  assert.equal(summary.bpDia, 76);
  assert.equal(summary.pain, 3);
  assert.equal(summary.doses, 2);
  clearRegistry();
});

test('le resume de sante n ecrase aucune cle d un autre module', () => {
  clearRegistry();
  registerCoreModules();
  const health = getModule('health');
  const cycle = getModule('cycle');

  const healthKeys = Object.keys(health.summarize({ symptoms: ['cough'], pain: { level: 2 } }));
  const cycleKeys = Object.keys(cycle.summarize({ symptoms: ['cramps'], flow: 2 }));
  const shared = healthKeys.filter((k) => cycleKeys.includes(k));
  assert.deepEqual(shared, [], `cles partagees avec le cycle : ${shared.join(', ')}`);
  clearRegistry();
});

test('une journee de sante vide ne remonte aucun chiffre', () => {
  clearRegistry();
  registerCoreModules();
  const summary = getModule('health').summarize({});
  for (const value of Object.values(summary)) assert.equal(value, null);
  clearRegistry();
});
