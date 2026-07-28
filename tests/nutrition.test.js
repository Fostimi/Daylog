import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVITY_LEVELS,
  WEIGHT_GOALS,
  CALC_BASES,
  TRANSITION_DIRECTIONS,
  DEFAULT_SPLIT,
  MIN_DAYS_FOR_SPLIT,
  KCAL_PER_KG,
  basisForGender,
  mealSplit,
  splitTarget,
  activityFactor,
  goalDelta,
  basalRate,
  energyNeeds,
  macroTargets,
  dayTotals,
  kcalFromMacros,
  calibrate,
  CALIBRATION,
  weightSlope,
  observedExpenditure,
  trimmedMean,
} from '../src/core/nutrition.js';

const CORPS = { weightKg: 70, heightCm: 175, ageYears: 30 };

/** Ajoute `n` jours a une cle 'YYYY-MM-DD'. */
function jour(base, n) {
  const d = new Date(`${base}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Serie de resumes quotidiens.
 * `kgPerDay` fait deriver le poids, `kcal` fixe les apports notes.
 */
function serie({ days, start = 70, kgPerDay = 0, kcal = null, weighEvery = 1, from = '2026-01-01' }) {
  const rows = [];
  for (let i = 0; i < days; i++) {
    const row = { date: jour(from, i) };
    if (i % weighEvery === 0) row.weightKg = Math.round((start + kgPerDay * i) * 100) / 100;
    if (kcal !== null) row.kcal = kcal;
    rows.push(row);
  }
  return rows;
}

// ------------------------------------------------------------------ tables

test('les niveaux d activite et les objectifs ont des identifiants stables', () => {
  assert.equal(new Set(ACTIVITY_LEVELS.map((a) => a.id)).size, ACTIVITY_LEVELS.length);
  assert.equal(activityFactor('moderate'), 1.55);
  assert.equal(activityFactor('inconnu'), null);
  assert.equal(goalDelta('maintain'), 0);
  assert.equal(goalDelta(null), null);
});

test('aucun objectif ne depasse 500 kcal d ecart', () => {
  // Au-dela on ne perd pas plus vite : on perd du muscle, et on tient moins
  // longtemps. Le plafond fait partie du produit, pas du reglage.
  for (const goal of WEIGHT_GOALS) {
    assert.equal(Math.abs(goal.delta) <= 500, true, goal.id);
  }
});

test('aucun libelle d objectif ne classe la personne', () => {
  const juge = /agressi|seche|sèche|extrême|extreme|choc/i;
  for (const goal of WEIGHT_GOALS) {
    assert.equal(juge.test(`${goal.label} ${goal.hint}`), false, goal.label);
  }
});

// ------------------------------------------------------------------ genre

test('la reference se deduit du genre, sauf pour les personnes trans', () => {
  // Les formules publiees ont ete calibrees separement : la difference est
  // reelle, et faire porter ce choix technique a chacun etait maladroit autant
  // qu'inutile.
  assert.equal(basisForGender('woman'), 'b');
  assert.equal(basisForGender('man'), 'a');
  assert.equal(basisForGender('nonbinary'), 'median');
  assert.equal(basisForGender('trans'), null, 'la personne choisit elle-meme');
  assert.equal(basisForGender(null), null);
});

test('la reference non binaire tombe entre les deux', () => {
  const a = basalRate({ ...CORPS, body: { calcBasis: 'a' } }).value;
  const b = basalRate({ ...CORPS, body: { calcBasis: 'b' } }).value;
  const median = basalRate({ ...CORPS, body: { calcBasis: 'median' } }).value;
  assert.equal(median, (a + b) / 2);
  assert.equal(median < a && median > b, true);
});

test('le choix explicite ne propose que ce qui a du sens a une personne trans', () => {
  assert.deepEqual(CALC_BASES.map((c) => c.id), ['b', 'a', 'interpolated']);
  assert.deepEqual(TRANSITION_DIRECTIONS.map((d) => d.id), ['mtf', 'ftm']);
  // Chaque sens part d'une reference et va vers l'autre, sans quoi
  // l'interpolation n'aurait rien a interpoler.
  for (const dir of TRANSITION_DIRECTIONS) {
    assert.notEqual(dir.from, dir.to);
  }
});

// ------------------------------------------------------------ metabolisme

test('Mifflin-St Jeor, les deux variantes', () => {
  // base commune = 10x70 + 6,25x175 - 5x30 = 1643,75
  const a = basalRate({ ...CORPS, body: { calcBasis: 'a' } });
  const b = basalRate({ ...CORPS, body: { calcBasis: 'b' } });
  assert.equal(Math.round(a.value), 1649);
  assert.equal(Math.round(b.value), 1483);
  assert.equal(a.basis, 'a');
});

test('Katch-McArdle ne demande ni taille, ni age, ni variante', () => {
  // La seule voie ou la question du groupe de calibration ne se pose pas.
  const out = basalRate({
    weightKg: 70,
    body: { calcBasis: 'lean-mass', bodyFatPct: 20 },
  });
  // masse maigre = 56 kg -> 370 + 21,6 x 56
  assert.equal(Math.round(out.value), 1580);
  assert.equal(out.basis, 'lean-mass');
});

test('une masse grasse non mesuree ne s invente pas', () => {
  const out = basalRate({ weightKg: 70, body: { calcBasis: 'lean-mass' } });
  assert.equal(out.value, null);
  assert.deepEqual(out.missing, ['bodyFat']);
});

test('ce qui manque est nomme, pour que l ecran puisse le dire', () => {
  const out = basalRate({ weightKg: null, body: {} });
  assert.equal(out.value, null);
  assert.deepEqual(out.missing.sort(), ['age', 'calcBasis', 'height', 'weight']);
});

test('l interpolation glisse d une variante a l autre sur trois ans', () => {
  const body = {
    calcBasis: 'interpolated',
    basisFrom: 'a',
    basisTo: 'b',
    basisStartDate: '2024-01-01',
  };
  const debut = basalRate({ ...CORPS, body, at: new Date('2024-01-01') });
  const moitie = basalRate({ ...CORPS, body, at: new Date('2025-07-02') });
  const fin = basalRate({ ...CORPS, body, at: new Date('2027-01-01') });

  assert.equal(Math.round(debut.value), 1649, 'au depart, la variante de depart');
  assert.equal(Math.round(fin.value), 1483, "a l'arrivee, celle d'arrivee");
  assert.equal(moitie.value > fin.value && moitie.value < debut.value, true);
  assert.equal(fin.progress, 1, 'la progression se plafonne, elle ne depasse pas');
});

test('une interpolation incomplete ne produit aucun chiffre', () => {
  const out = basalRate({ ...CORPS, body: { calcBasis: 'interpolated', basisFrom: 'a' } });
  assert.equal(out.value, null);
});

// -------------------------------------------------------------- besoins

test('depense et cible sont deux chiffres distincts', () => {
  const out = energyNeeds({
    ...CORPS,
    body: { calcBasis: 'a' },
    activity: 'moderate',
    goal: 'lose-slow',
  });
  assert.equal(out.maintenance, Math.round(1648.75 * 1.55));
  assert.equal(out.target, out.maintenance - 250);
  assert.equal(out.floored, false);
});

test('la cible ne descend JAMAIS sous le metabolisme de base', () => {
  // Le garde-fou central : proposer moins que ce que le corps depense au repos
  // n'est pas un objectif de suivi.
  const out = energyNeeds({
    weightKg: 45,
    heightCm: 155,
    ageYears: 25,
    body: { calcBasis: 'b' },
    activity: 'sedentary',
    goal: 'lose',
  });
  assert.equal(out.target, out.basal);
  assert.equal(out.floored, true, "et l'ecran doit pouvoir le dire");
  assert.equal(out.target > out.maintenance - 500, true);
});

test('sans niveau d activite, pas de depense estimee', () => {
  const out = energyNeeds({ ...CORPS, body: { calcBasis: 'a' }, activity: null });
  assert.equal(out.maintenance, null);
  assert.equal(out.target, null);
  assert.deepEqual(out.missing, ['activity']);
  assert.equal(typeof out.basal, 'number', 'le metabolisme de base reste connu');
});

test('sans objectif, la cible vaut la depense', () => {
  const out = energyNeeds({ ...CORPS, body: { calcBasis: 'a' }, activity: 'light' });
  assert.equal(out.target, out.maintenance);
});

// --------------------------------------------------------------- macros

test('les proteines ne se calculent que si on a demande une valeur', () => {
  const sans = macroTargets({ kcal: 2000, weightKg: 70 });
  assert.equal(sans.protein, null, "« 1,6 g/kg » n'est pas une verite universelle");
  assert.equal(sans.carbs, null, 'le reste ne veut rien dire sans les proteines');
  assert.equal(typeof sans.fat, 'number');

  const avec = macroTargets({ kcal: 2000, weightKg: 70, proteinPerKg: 1.6 });
  assert.equal(avec.protein, 112);
  assert.equal(avec.fat, 67);
  assert.equal(avec.carbs, Math.round((2000 - 112 * 4 - 67 * 9) / 4));
});

test('un reste negatif ne devient pas un objectif absurde', () => {
  const out = macroTargets({ kcal: 900, weightKg: 90, proteinPerKg: 2.5 });
  assert.equal(out.carbs, null);
});

test('sans energie, aucune cible', () => {
  assert.deepEqual(macroTargets({ kcal: null, weightKg: 70, proteinPerKg: 2 }), {
    protein: null,
    fat: null,
    carbs: null,
  });
});

// --------------------------------------------------------------- journee

test('un champ non renseigne est exclu du total, jamais compte pour zero', () => {
  const meals = [
    { kcal: 600, protein: 30 },
    { kcal: 500 }, // proteines non notees
    { kcal: 400, protein: 25 },
  ];
  const out = dayTotals(meals);
  assert.equal(out.kcal, 1500);
  assert.equal(out.protein, 55, 'et non 55 sur trois repas, ce qui suggererait une carence');
  assert.equal(out.carbs, null);
  assert.equal(out.meals, 3);
});

test('une journee sans repas ne vaut pas zero calorie', () => {
  const out = dayTotals([]);
  assert.equal(out.kcal, null);
  assert.equal(out.meals, null);
});

test('les calories se deduisent des macros quand elles manquent', () => {
  assert.equal(kcalFromMacros({ protein: 30, carbs: 50, fat: 10 }), 30 * 4 + 50 * 4 + 10 * 9);
  assert.equal(kcalFromMacros({ protein: 30 }), 120, 'un seul macro suffit');
  assert.equal(kcalFromMacros({}), null);
});

// ------------------------------------------------- repartition sur la journee

/** `n` journees notees, avec une repartition volontairement deseequilibree. */
function journees(n) {
  return Array.from({ length: n }, (_, i) => ({
    date: `2026-06-${String(i + 1).padStart(2, '0')}`,
    modules: {
      nutrition: {
        items: [
          { slot: 'lunch', kcal: 800 },
          { slot: 'dinner', kcal: 1200 },
        ],
      },
    },
  }));
}

test('sans assez de journees, on annonce une repartition courante', () => {
  const out = mealSplit(journees(MIN_DAYS_FOR_SPLIT - 1));
  assert.equal(out.source, 'default');
  assert.deepEqual(out.split, DEFAULT_SPLIT);
});

test('avec assez de journees, c est la repartition reelle qui parle', () => {
  // Quelqu'un qui ne dejeune jamais n'a que faire d'un modele qui lui attribue
  // un tiers de ses calories le matin.
  const out = mealSplit(journees(MIN_DAYS_FOR_SPLIT));
  assert.equal(out.source, 'observed');
  assert.equal(out.days, MIN_DAYS_FOR_SPLIT);
  assert.equal(out.split.breakfast, 0);
  assert.equal(Math.round(out.split.lunch * 100), 40);
  assert.equal(Math.round(out.split.dinner * 100), 60);
});

test('les journees sans repas ne comptent pas comme des journees notees', () => {
  const vides = Array.from({ length: 20 }, (_, i) => ({ date: `2026-05-${i + 1}`, modules: {} }));
  const out = mealSplit([...vides, ...journees(2)]);
  assert.equal(out.source, 'default');
  assert.equal(out.days, 2);
});

test('la repartition s applique a une cible sans rien inventer', () => {
  const out = splitTarget(2000, DEFAULT_SPLIT);
  assert.equal(out.breakfast, 500);
  assert.equal(out.lunch, 700);
  assert.equal(Object.values(out).reduce((a, b) => a + b, 0), 2000);
  assert.equal(splitTarget(null, DEFAULT_SPLIT), null);
});

// ------------------------------------------------------------- recalage

test('les faits l emportent sur la formule', () => {
  // 2000 kcal mangees par jour, et 1 kg pris en 60 jours : la depense reelle
  // est inferieure aux apports d'environ 7700/60 kcal par jour.
  const out = calibrate({ intake: 2000, weightChangeKg: 1, days: 60 });
  assert.equal(out.calibrated, true);
  assert.equal(out.gap, Math.round(KCAL_PER_KG / 60));
  assert.equal(out.value, 2000 - out.gap);
});

test('le recalage fonctionne dans les deux sens', () => {
  const out = calibrate({ intake: 2000, weightChangeKg: -1, days: 60 });
  assert.equal(out.value > 2000, true, 'du poids perdu en mangeant autant : on depense plus');
});

test('pas de recalage sur une periode trop courte', () => {
  // Sur deux semaines, la variation de poids est surtout de l'eau : recaler
  // la-dessus ferait sauter l'estimation dans tous les sens.
  const out = calibrate({ intake: 2000, weightChangeKg: 1, days: 14 });
  assert.equal(out.calibrated, false);
  assert.equal(out.value, 2000, 'les apports sont conserves tels quels');
  assert.equal(out.missingDays, 28);
});

/**
 * Le piege que le premier parametre evite.
 *
 * Quelqu'un qui vise volontairement 500 kcal sous son entretien et perd le
 * poids attendu CONFIRME son estimation. Comparer sa perte a une variation
 * nulle conclurait qu'il depense 500 kcal de moins qu'en realite -- et la
 * cible s'effondrerait un peu plus a chaque recalage.
 */
test('manger sous son entretien et maigrir confirme l estimation', () => {
  const entretien = 2500;
  const apports = entretien - 500;
  // 500 kcal de deficit quotidien pendant 60 jours = 30 000 kcal ~ 3,9 kg.
  const perte = -(500 * 60) / KCAL_PER_KG;

  const out = calibrate({ intake: apports, weightChangeKg: perte, days: 60 });
  assert.equal(out.value, entretien, `recale a ${out.value} au lieu de ${entretien}`);
});

// ------------------------------------------------- pente et depense reelle

test('la pente encaisse des pesees irregulieres', () => {
  // Une pesee tous les trois jours pendant deux mois, -0,1 kg par jour.
  const out = weightSlope(serie({ days: 60, kgPerDay: -0.1, weighEvery: 3 }));
  assert.ok(Math.abs(out.kgPerDay - -0.1) < 0.001, `pente ${out.kgPerDay}`);
  assert.equal(out.n, 20);
  assert.equal(out.days, 57);
});

test('une seule pesee, ou toutes le meme jour, ne donne aucune pente', () => {
  assert.equal(weightSlope([{ date: '2026-01-01', weightKg: 70 }]).kgPerDay, null);
  assert.equal(weightSlope([]).kgPerDay, null);
  // Deux pesees le meme jour : la division par zero est evitee.
  assert.equal(
    weightSlope([
      { date: '2026-01-01', weightKg: 70 },
      { date: '2026-01-01', weightKg: 71 },
    ]).kgPerDay,
    null
  );
});

test('la depense reelle se deduit des pesees et des repas notes', () => {
  // 2000 kcal par jour, et 0,5 kg pris en 70 jours : le corps depense donc
  // moins que ce qui a ete mange.
  const rows = serie({ days: 70, kgPerDay: 0.5 / 70, kcal: 2000 });
  const out = observedExpenditure(rows);
  assert.ok(out.value < 2000, `depense ${out.value}`);
  // L'ecart quotidien vaut la pente en kilos multipliee par 7700, quel que
  // soit le nombre de jours : c'est une vitesse, pas un total.
  assert.equal(out.value, 2000 - Math.round((0.5 / 70) * KCAL_PER_KG));
  assert.equal(out.weighings, 70);
  assert.equal(out.intakeDays, 70);
  assert.equal(out.meanIntake, 2000);
});

test('le recalage se tait tant qu il manque quelque chose, et dit quoi', () => {
  // Trop peu de pesees.
  const peu = observedExpenditure(serie({ days: 60, kcal: 2000, weighEvery: 20 }));
  assert.equal(peu.value, null);
  assert.equal(peu.reason, 'weighings');
  assert.equal(peu.need, CALIBRATION.minWeighings);

  // Assez de pesees, mais sur une periode trop courte.
  const court = observedExpenditure(serie({ days: 20, kcal: 2000 }));
  assert.equal(court.value, null);
  assert.equal(court.reason, 'span');

  // Des pesees, mais aucun repas note : rien a quoi comparer.
  const sansRepas = observedExpenditure(serie({ days: 70 }));
  assert.equal(sansRepas.value, null);
  assert.equal(sansRepas.reason, 'intake');
  assert.equal(sansRepas.have, 0);
});

test('les apports comptes sont ceux de la periode couverte par les pesees', () => {
  // Un mois de repas notes AVANT la premiere pesee ne doit pas entrer dans la
  // moyenne : il decrit une autre periode que celle ou le poids a bouge.
  const avant = Array.from({ length: 30 }, (_, i) => ({
    date: jour('2025-11-01', i),
    kcal: 4000,
  }));
  const rows = [...avant, ...serie({ days: 70, kcal: 2000 })];
  const out = observedExpenditure(rows);
  assert.equal(out.meanIntake, 2000, 'la periode hors pesees a ete comptee');
});

// ------------------------------------------------- recalage de bout en bout

test('les besoins se recalent sur les faits quand il y a de quoi', () => {
  const base = energyNeeds({ ...CORPS, body: { calcBasis: 'a' }, activity: 'moderate' });

  // On mange exactement la depense estimee, et le poids ne bouge pas : la
  // formule est confirmee, le recalage ne la deplace quasiment pas.
  const stable = energyNeeds({
    ...CORPS,
    body: { calcBasis: 'a' },
    activity: 'moderate',
    rows: serie({ days: 70, kgPerDay: 0, kcal: base.maintenance }),
  });
  assert.equal(stable.calibration.applied, true);
  assert.equal(stable.maintenance, base.maintenance);

  // Meme chose, mais le poids monte : la depense reelle est plus basse.
  const grossit = energyNeeds({
    ...CORPS,
    body: { calcBasis: 'a' },
    activity: 'moderate',
    rows: serie({ days: 70, kgPerDay: 0.01, kcal: base.maintenance }),
  });
  assert.equal(grossit.calibration.applied, true);
  assert.ok(grossit.maintenance < base.maintenance, 'la depense doit baisser');
  // Et la cible suit la depense recalee, pas la formule.
  assert.equal(grossit.target, grossit.maintenance);
});

test('sans pesees, l estimation reste celle de la formule', () => {
  const out = energyNeeds({ ...CORPS, body: { calcBasis: 'a' }, activity: 'moderate' });
  assert.equal(out.calibration, null);
  assert.equal(out.maintenance, Math.round(1648.75 * 1.55));
});

test('un journal alimentaire trop incomplet ne recale rien', () => {
  // 900 kcal notees par jour et un poids stable : la personne n'a pas note ce
  // qu'elle a mange. Adopter ce chiffre proposerait une cible batie sur des
  // repas absents.
  const out = energyNeeds({
    ...CORPS,
    body: { calcBasis: 'a' },
    activity: 'moderate',
    rows: serie({ days: 70, kgPerDay: 0, kcal: 900 }),
  });
  assert.equal(out.calibration.applied, false);
  assert.equal(out.calibration.reason, 'implausible');
  assert.equal(out.maintenance, Math.round(1648.75 * 1.55), 'la formule est conservee');
  assert.ok(out.calibration.deviation > 40);
});

test('la cible recalee ne descend jamais sous le metabolisme de base', () => {
  // Le garde-fou doit tenir aussi APRES recalage, pas seulement sur la formule.
  const basal = 1648.75;
  const out = energyNeeds({
    ...CORPS,
    body: { calcBasis: 'a' },
    activity: 'sedentary',
    goal: 'lose',
    rows: serie({ days: 70, kgPerDay: 0.02, kcal: basal * 1.2 }),
  });
  assert.ok(out.target >= out.basal, `${out.target} sous ${out.basal}`);
  assert.equal(out.floored, true);
});

// ------------------------------------------------------------- robustesse

/*
 * Les deux defauts trouves par le stress test, et qu'aucun test ecrit a
 * l'avance n'avait vus : une seule journee aberrante suffisait a piloter la
 * cible calorique de quelqu'un pendant des mois.
 */

test('une journee saisie de travers ne deplace pas la moyenne des apports', () => {
  // 99 999 g d'huile : 900 000 kcal sur une journee. Taper 999 au lieu de 99
  // arrive, et refuser la saisie reviendrait a decider de ce que quelqu'un a
  // le droit de manger.
  const normales = Array.from({ length: 40 }, () => 2600);
  assert.equal(Math.round(trimmedMean(normales)), 2600);
  assert.equal(Math.round(trimmedMean([...normales, 900000])), 2600);
  // Et dans l'autre sens : une journee a peine notee.
  assert.equal(Math.round(trimmedMean([...normales, 12])), 2600);
});

test('la moyenne elaguee ne vide pas un tout petit echantillon', () => {
  assert.equal(trimmedMean([2000]), 2000);
  assert.equal(trimmedMean([]), null);
  assert.equal(trimmedMean([1000, 2000]), 1500);
});

test('une pesee tapee de travers ne fait pas deriver la pente', () => {
  // 724 kg au lieu de 72,4 : c'est dans les bornes de saisie, parce qu'un
  // poids humain de 724 kg ne peut pas etre exclu par principe.
  const propre = serie({ days: 70, kgPerDay: -0.01 });
  const faussee = propre.map((r, i) => (i === 35 ? { ...r, weightKg: 724 } : r));

  const attendue = weightSlope(propre).kgPerDay;
  const obtenue = weightSlope(faussee).kgPerDay;
  assert.ok(
    Math.abs(obtenue - attendue) < 0.002,
    `la pente est passee de ${attendue} a ${obtenue}`
  );
});

test('une pesee aberrante ne deplace pas la depense recalee', () => {
  const rows = serie({ days: 70, kgPerDay: 0, kcal: 2600 });
  const propre = observedExpenditure(rows);
  const faussee = observedExpenditure(
    rows.map((r, i) => (i === 40 ? { ...r, weightKg: 724, kcal: 900000 } : r))
  );
  assert.equal(faussee.value, propre.value, 'une seule journee a emporte le calcul');
});
