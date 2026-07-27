import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLOW_LEVELS,
  SYMPTOMS,
  MAX_GAP,
  MIN_CYCLE,
  MAX_CYCLE,
  RECENT_CYCLES,
  PREMENSTRUAL_DAYS,
  flowOf,
  periodStarts,
  consolidateStarts,
  cycleLengths,
  cycleStats,
  periodEpisodes,
  periodStats,
  usableDeclared,
  usableDeclaredPeriod,
  cycleDay,
  cyclePhase,
  predictNextPeriod,
  daysLate,
} from '../src/core/cycle.js';
import { addDays } from '../src/core/date.js';

/** Journees d'un episode de regles : `days` jours consecutifs a partir de `start`. */
function periode(start, days = 5, flow = 3) {
  return Array.from({ length: days }, (_, i) => ({ date: addDays(start, i), flow }));
}

/** Serie de cycles de longueurs donnees, a partir d'une premiere date. */
function cycles(first, lengths) {
  const rows = [...periode(first)];
  let date = first;
  for (const len of lengths) {
    date = addDays(date, len);
    rows.push(...periode(date));
  }
  return rows;
}

// ------------------------------------------------------------------ constantes

test('les niveaux de flux ont des valeurs stables et distinctes', () => {
  const values = FLOW_LEVELS.map((f) => f.value);
  assert.deepEqual(values, [0, 1, 2, 3, 4]);
  assert.equal(new Set(FLOW_LEVELS.map((f) => f.id)).size, FLOW_LEVELS.length);
  assert.equal(new Set(SYMPTOMS.map((s) => s.id)).size, SYMPTOMS.length);
});

test('flowOf distingue « rien » de « non renseigne »', () => {
  // Le coeur de la regle n°1 de l'application, applique au flux : zero est une
  // reponse, l'absence de reponse n'en est pas une.
  assert.equal(flowOf({ flow: 0 }), 0);
  assert.equal(flowOf({ flow: 3 }), 3);
  assert.equal(flowOf({}), null);
  assert.equal(flowOf({ flow: null }), null);
  assert.equal(flowOf(null), null);
});

// --------------------------------------------------------------- detection

test('un episode de plusieurs jours ne produit qu un seul debut', () => {
  assert.deepEqual(periodStarts(periode('2026-03-02', 6)), ['2026-03-02']);
});

test('les journees « rien » n ouvrent aucun cycle', () => {
  const rows = [
    { date: '2026-03-01', flow: 0 },
    { date: '2026-03-02', flow: 0 },
  ];
  assert.deepEqual(periodStarts(rows), []);
});

test('un jour non note au milieu des regles ne coupe pas l episode en deux', () => {
  // Le cas courant : on oublie de saisir un jour. Sans tolerance, l'episode se
  // scindait et fabriquait un cycle de trois jours qui faussait la moyenne.
  const rows = [
    { date: '2026-03-02', flow: 3 },
    // 03 et 04 non notes
    { date: '2026-03-05', flow: 2 },
    { date: '2026-03-06', flow: 1 },
  ];
  assert.deepEqual(periodStarts(rows), ['2026-03-02']);
});

test('au-dela de la tolerance, un nouveau saignement ouvre un cycle', () => {
  const rows = [
    { date: '2026-03-02', flow: 3 },
    { date: '2026-03-02', flow: 3 },
    { date: addDays('2026-03-02', MAX_GAP + 1), flow: 2 },
  ];
  assert.equal(periodStarts(rows).length, 2);
});

test('les journees arrivent dans le desordre sans fausser la detection', () => {
  const rows = [...periode('2026-03-02', 4)].reverse();
  assert.deepEqual(periodStarts(rows), ['2026-03-02']);
});

test('une correction manuelle impose ou annule un debut', () => {
  const force = [{ date: '2026-03-10', cycleStart: true }];
  assert.deepEqual(periodStarts(force), ['2026-03-10'], 'un debut sans flux reste un debut');

  const bloque = [
    { date: '2026-03-02', flow: 3, cycleStart: false },
    { date: '2026-03-03', flow: 2 },
  ];
  assert.deepEqual(periodStarts(bloque), [], 'la correction l emporte sur la deduction');
});

test('un saignement isole trop proche est fusionne avec le cycle en cours', () => {
  // Saignement intermenstruel : compte comme un cycle, il diviserait la moyenne
  // par deux.
  const starts = ['2026-03-02', addDays('2026-03-02', MIN_CYCLE - 4), '2026-04-01'];
  assert.deepEqual(consolidateStarts(starts), ['2026-03-02', '2026-04-01']);
});

test('un cycle court reste un cycle', () => {
  const starts = ['2026-03-02', addDays('2026-03-02', MIN_CYCLE)];
  assert.deepEqual(consolidateStarts(starts), starts);
});

// ------------------------------------------------------------------ longueurs

test('cycleLengths mesure d un debut au suivant', () => {
  const out = cycleLengths(['2026-01-01', '2026-01-29', '2026-02-26']);
  assert.deepEqual(out.map((l) => l.days), [28, 28]);
  assert.equal(out[0].from, '2026-01-01');
  assert.equal(out[0].to, '2026-01-29');
});

test('un seul debut ne donne aucune longueur', () => {
  assert.deepEqual(cycleLengths(['2026-01-01']), []);
  assert.deepEqual(cycleLengths([]), []);
});

// -------------------------------------------------------------------- stats

test('la moyenne porte sur les cycles reellement observes', () => {
  const stats = cycleStats(cycles('2026-01-05', [28, 30, 26]));
  assert.equal(stats.count, 3);
  assert.equal(stats.average, 28);
  assert.equal(stats.min, 26);
  assert.equal(stats.max, 30);
  assert.equal(stats.spread, 4);
  assert.equal(stats.lastStart, '2026-03-30');
});

test('un trou de suivi ne devient pas un cycle de reference', () => {
  // Six mois sans rien noter produisent une « longueur » qui n'en est pas une :
  // elle reste visible dans l'historique, mais ne sert pas de reference.
  const stats = cycleStats(cycles('2026-01-05', [28, MAX_CYCLE + 40, 28]));
  assert.equal(stats.lengths.length, 3, 'la longueur aberrante reste listee');
  assert.equal(stats.count, 2, 'elle est ecartee de la moyenne');
  assert.equal(stats.ignored, 1);
  assert.equal(stats.average, 28);
});

test('seuls les cycles recents comptent', () => {
  const anciens = Array(4).fill(40);
  const recents = Array(RECENT_CYCLES).fill(28);
  const stats = cycleStats(cycles('2024-01-05', [...anciens, ...recents]));
  assert.equal(stats.count, RECENT_CYCLES);
  assert.equal(stats.average, 28, 'les cycles d il y a deux ans ne tirent plus la moyenne');
});

test('sans donnees, tout vaut null plutot que zero', () => {
  const stats = cycleStats([]);
  assert.equal(stats.average, null);
  assert.equal(stats.spread, null);
  assert.equal(stats.lastStart, null);
  assert.equal(stats.count, 0);
});

// ----------------------------------------------------------------- jour du cycle

test('le premier jour des regles est le jour 1', () => {
  assert.equal(cycleDay('2026-03-02', '2026-03-02'), 1);
  assert.equal(cycleDay('2026-03-02', '2026-03-16'), 15);
});

test('aucun jour de cycle si le suivi s est interrompu', () => {
  assert.equal(cycleDay('2026-01-01', '2026-07-01'), null);
  assert.equal(cycleDay('2026-03-02', '2026-03-01'), null, 'pas de jour negatif');
  assert.equal(cycleDay(null, '2026-03-02'), null);
});

// -------------------------------------------------------------------- repere

test('aucun repere avant deux cycles complets', () => {
  const stats = cycleStats(cycles('2026-01-05', [28]));
  const p = predictNextPeriod(stats, { mode: 'regular' });
  assert.equal(p.reason, 'not-enough');
  assert.equal(p.missing, 1);
  assert.equal(p.date, undefined, 'rien qui ressemble a une date');
});

test('un cycle suspendu n affiche aucun repere', () => {
  // Sous contraception continue, la moyenne des cycles precedents ne predit
  // rien : on prefere ne rien dire.
  const stats = cycleStats(cycles('2026-01-05', [28, 28, 28]));
  assert.deepEqual(predictNextPeriod(stats, { mode: 'suppressed' }), { reason: 'suppressed' });
});

test('des cycles reguliers donnent une date', () => {
  const stats = cycleStats(cycles('2026-01-05', [28, 28, 28]));
  const p = predictNextPeriod(stats, { mode: 'regular' });
  assert.equal(p.exact, true);
  assert.equal(p.average, 28);
  assert.equal(p.n, 3);
  assert.equal(p.date, addDays(stats.lastStart, 28));
  assert.equal(p.halfWidth, 2, 'meme reguliers, on n annonce pas au jour pres');
  assert.equal(p.from, addDays(p.date, -2));
  assert.equal(p.to, addDays(p.date, 2));
});

test('des cycles disperses donnent une fourchette, pas une date', () => {
  const stats = cycleStats(cycles('2026-01-05', [24, 32, 27]));
  const p = predictNextPeriod(stats, { mode: 'regular' });
  assert.equal(p.exact, false);
  assert.equal(p.halfWidth, 4, 'la fourchette suit la dispersion observee');
  assert.equal(p.to > p.from, true);
});

test('un cycle declare irregulier n annonce jamais de date', () => {
  // Meme si les trois derniers cycles tombent juste : la personne sait mieux
  // que l'application ce qu'ils valent.
  const stats = cycleStats(cycles('2026-01-05', [28, 28, 28]));
  const p = predictNextPeriod(stats, { mode: 'irregular' });
  assert.equal(p.exact, false);
  assert.equal(p.halfWidth, 3);
});

test('des cycles trop disperses ne donnent rien du tout', () => {
  const stats = cycleStats(cycles('2026-01-05', [21, 80, 30]));
  const p = predictNextPeriod(stats, { mode: 'regular' });
  assert.equal(p.reason, 'too-variable');
  assert.equal(p.date, undefined);
});

test('le retard ne se compte qu au-dela de la fourchette annoncee', () => {
  const stats = cycleStats(cycles('2026-01-05', [28, 28, 28]));
  const p = predictNextPeriod(stats, { mode: 'regular' });
  assert.equal(daysLate(p, p.date), null, 'le jour prevu n est pas un retard');
  assert.equal(daysLate(p, p.to), null, 'la fin de la fourchette non plus');
  assert.equal(daysLate(p, addDays(p.to, 3)), 3);
  assert.equal(daysLate({ reason: 'not-enough' }, '2026-05-01'), null);
});

// --------------------------------------------------------- duree des regles

test('la duree des regles se mesure sur les episodes termines', () => {
  const rows = [...periode('2026-01-05', 5), ...periode('2026-02-02', 3)];
  const stats = periodStats(rows, { upTo: '2026-03-01' });
  assert.equal(stats.episodes.length, 2);
  assert.equal(stats.average, 4, '(5 + 3) / 2');
  assert.equal(stats.ongoing, null);
});

test('des regles en cours ne tirent pas la moyenne vers le bas', () => {
  // Sans cette precaution, ouvrir l'application le premier jour de ses regles
  // faisait chuter la moyenne a chaque cycle.
  const rows = [...periode('2026-01-05', 5), ...periode('2026-02-02', 1)];
  const stats = periodStats(rows, { upTo: '2026-02-02' });
  assert.equal(stats.average, 5, "l'episode en cours est mis de cote");
  assert.equal(stats.ongoing.start, '2026-02-02');
  assert.equal(stats.ongoing.days, 1);
});

test('un jour saute ne coupe pas l episode en deux', () => {
  const rows = [
    { date: '2026-01-05', flow: 3 },
    { date: '2026-01-08', flow: 2 },
  ];
  const [episode] = periodEpisodes(rows);
  assert.equal(episode.days, 4, 'du 5 au 8 inclus');
});

// ------------------------------------------------------------ duree declaree

test('une duree declaree aberrante est ignoree, jamais rabotee', () => {
  // La rabotter reviendrait a inventer une valeur que personne n'a saisie. Le
  // garde-fou du calcul doit tenir meme sur un fichier importe et modifie a la
  // main, ou l'ecran de saisie n'a filtre personne.
  assert.equal(usableDeclared(28), 28);
  assert.equal(usableDeclared('28'), 28);
  assert.equal(usableDeclared(27.6), 28);
  assert.equal(usableDeclared(3), null);
  assert.equal(usableDeclared(400), null);
  assert.equal(usableDeclared(null), null);
  assert.equal(usableDeclared(''), null);
  assert.equal(usableDeclared('vingt-huit'), null);
});

test('une duree de regles annoncee suit les memes garde-fous', () => {
  assert.equal(usableDeclaredPeriod(5), 5);
  assert.equal(usableDeclaredPeriod(1), 1);
  assert.equal(usableDeclaredPeriod(0), null);
  assert.equal(usableDeclaredPeriod(60), null);
  assert.equal(usableDeclaredPeriod(undefined), null);
});

test('une duree declaree sert de repere en attendant deux cycles', () => {
  // Sinon l'application ne sert a rien pendant deux mois.
  const stats = cycleStats(periode('2026-03-02', 5));
  const p = predictNextPeriod(stats, { mode: 'regular', declared: 28 });
  assert.equal(p.source, 'declared');
  assert.equal(p.average, 28);
  assert.equal(p.exact, false, 'une duree annoncee n a jamais la precision d une date');
  assert.equal(p.halfWidth >= 4, true, 'et sa fourchette est plus large');
  assert.equal(p.date, addDays('2026-03-02', 28));
});

test('les cycles observes l emportent sur la duree declaree', () => {
  const stats = cycleStats(cycles('2026-01-05', [30, 30, 30]));
  const p = predictNextPeriod(stats, { mode: 'regular', declared: 21 });
  assert.equal(p.source, 'observed');
  assert.equal(p.average, 30, 'ce qui est vecu prime sur ce qui a ete annonce');
});

test('sans aucun saignement note, une duree declaree ne suffit pas', () => {
  const p = predictNextPeriod(cycleStats([]), { mode: 'regular', declared: 28 });
  assert.equal(p.reason, 'not-enough', 'il faut au moins savoir d ou compter');
});

test('le repere peut etre refuse', () => {
  // Pour qui trouve le compte a rebours anxiogene : parcours de PMA, fausse
  // couche, ou simplement pas envie.
  const stats = cycleStats(cycles('2026-01-05', [28, 28, 28]));
  assert.deepEqual(predictNextPeriod(stats, { forecast: false }), { reason: 'off' });
});

// ------------------------------------------------------------------ phases

test('les regles notees sont un fait, pas une estimation', () => {
  const stats = cycleStats(periode('2026-03-02', 5));
  const phase = cyclePhase({ stats, prediction: null, date: '2026-03-03', flow: 3 });
  assert.equal(phase.id, 'period');
  assert.equal(phase.source, 'observed');
});

test('le reste du cycle est situe en langage courant, sans phase clinique', () => {
  // « Avant les regles » et non « phase luteale » : nommer la phase clinique
  // affirmerait une ovulation qu'on ne mesure pas.
  const stats = cycleStats(cycles('2026-01-05', [28, 28, 28]));
  const prediction = predictNextPeriod(stats, { mode: 'regular' });

  const apres = cyclePhase({ stats, prediction, date: addDays(stats.lastStart, 3) });
  assert.equal(apres.id, 'after');
  assert.equal(apres.day, 4);
  assert.equal(apres.source, 'estimated');

  const avant = cyclePhase({
    stats,
    prediction,
    date: addDays(prediction.date, -(PREMENSTRUAL_DAYS - 1)),
  });
  assert.equal(avant.id, 'before');

  for (const phase of [apres, avant]) {
    assert.equal(/fertil|ovulat|lut|follicul/i.test(phase.label), false, phase.label);
  }
});

test('aucune phase sans point de depart', () => {
  assert.equal(cyclePhase({ stats: cycleStats([]), date: '2026-03-02' }).id, 'unknown');
  assert.equal(cyclePhase({}).id, 'unknown');
});

test('la date attendue depassee se dit sans dramatiser', () => {
  const stats = cycleStats(cycles('2026-01-05', [28, 28, 28]));
  const prediction = predictNextPeriod(stats, { mode: 'regular' });
  const phase = cyclePhase({ stats, prediction, date: addDays(prediction.date, 1) });
  assert.equal(phase.id, 'expected');
  assert.equal(phase.source, 'estimated');
});

// ------------------------------------------------------- de bout en bout

test('un an de suivi realiste produit un repere coherent', () => {
  const longueurs = [29, 27, 28, 30, 26, 29, 28, 27, 31, 28, 28];
  const rows = cycles('2025-08-04', longueurs);
  const stats = cycleStats(rows);

  assert.equal(stats.starts.length, longueurs.length + 1);
  assert.equal(stats.count, RECENT_CYCLES);

  const p = predictNextPeriod(stats, { mode: 'regular' });
  assert.equal(typeof p.date, 'string');
  assert.equal(p.average >= 26 && p.average <= 30, true);
  assert.equal(cycleDay(stats.lastStart, stats.lastStart), 1);
});
