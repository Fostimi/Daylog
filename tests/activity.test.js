import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVITIES,
  DISTANCE_UNITS,
  LIMITS,
  STRIDE_RATIO,
  getActivity,
  catalogue,
  moveTerms,
  toMeters,
  fromMeters,
  strideMeters,
  stepsFromDistance,
  distanceFromSteps,
  activeCalories,
  sessionCalories,
  dayTotals,
  sanitize,
} from '../src/core/activity.js';
import { registerCoreModules } from '../src/modules/index.js';
import { getModule, clearRegistry } from '../src/core/modules.js';
import { MOBILITY } from '../src/modules/profile-options.js';

// ------------------------------------------------------------------ catalogue

test('chaque activite a un identifiant unique et un MET plausible', () => {
  assert.equal(new Set(ACTIVITIES.map((a) => a.id)).size, ACTIVITIES.length);
  for (const a of ACTIVITIES) {
    assert.ok(a.met >= 1 && a.met <= 20, `${a.id} : MET ${a.met}`);
    assert.ok(a.tracks.length > 0, `${a.id} sans champ a saisir`);
    assert.ok(a.label && a.group, `${a.id} sans libelle ou groupe`);
  }
});

test('les mobilites citees par le catalogue existent toutes', () => {
  const connues = new Set(MOBILITY.map((m) => m.id));
  for (const a of ACTIVITIES) {
    for (const s of a.suits) {
      assert.ok(connues.has(s), `${a.id} vise une mobilite inconnue : ${s}`);
    }
  }
});

test('la mobilite trie le catalogue, elle ne le rogne jamais', () => {
  // Masquer l'escalade a une personne en fauteuil serait decider a sa place de
  // ce qu'elle peut faire, et se tromper.
  for (const mode of MOBILITY.map((m) => m.id)) {
    const liste = catalogue(mode);
    assert.equal(liste.length, ACTIVITIES.length, `${mode} perd des activites`);
    assert.ok(
      liste.some((a) => a.id === 'climb'),
      `${mode} n a plus acces a l escalade`
    );
  }
});

test('ce qui a des chances de servir passe devant', () => {
  const fauteuil = catalogue('wheelchair');
  const rangEnFauteuil = fauteuil.findIndex((a) => a.id === 'wheel');
  const rangCourse = fauteuil.findIndex((a) => a.id === 'run');
  assert.ok(rangEnFauteuil < rangCourse, 'le fauteuil doit passer avant la course a pied');

  const marche = catalogue('walking');
  assert.ok(
    marche.findIndex((a) => a.id === 'run') < marche.findIndex((a) => a.id === 'wheel'),
    'et inversement quand on marche'
  );
});

test('chaque activite reste atteignable quelle que soit la mobilite', () => {
  const tous = new Set(ACTIVITIES.map((a) => a.id));
  for (const mode of [null, ...MOBILITY.map((m) => m.id)]) {
    assert.deepEqual(new Set(catalogue(mode).map((a) => a.id)), tous);
  }
});

test('le vocabulaire du deplacement suit la mobilite declaree', () => {
  assert.equal(moveTerms('wheelchair').unit, 'poussées');
  assert.equal(moveTerms('walking').unit, 'pas');
  assert.equal(moveTerms('aids').unit, 'pas');
  assert.equal(moveTerms(null).unit, 'pas');
});

// ------------------------------------------------------------------- unites

test('les conversions de distance font l aller-retour', () => {
  for (const u of DISTANCE_UNITS) {
    const metres = toMeters(5, u.id);
    assert.ok(Math.abs(fromMeters(metres, u.id) - 5) < 1e-9, u.id);
  }
  assert.equal(toMeters(1, 'km'), 1000);
  assert.equal(Math.round(toMeters(1, 'mi')), 1609);
  assert.equal(toMeters(5, 'lieues'), null);
  assert.equal(toMeters(null, 'km'), null);
});

// -------------------------------------------------------------------- pas

test('la foulee se deduit de la taille, et de rien d autre', () => {
  // Le genre n'entre dans qu'un seul calcul de l'application, et il est
  // ailleurs : l'ecart entre les deux coefficients publies vaut 0,5 %, la
  // variabilite individuelle plus de 10 %.
  assert.equal(strideMeters(175), (175 * STRIDE_RATIO) / 100);
  assert.equal(strideMeters(null), null);
});

test('pas et distance se convertissent dans les deux sens', () => {
  const pas = stepsFromDistance(5000, 175);
  assert.equal(pas, Math.round(5000 / ((175 * STRIDE_RATIO) / 100)));
  // L'aller-retour retombe a quelques metres pres, l'arrondi des pas en etant
  // la seule cause.
  assert.ok(Math.abs(distanceFromSteps(pas, 175) - 5000) < 1);
});

test('sans taille connue, aucun nombre de pas n est invente', () => {
  // Un compteur de pas faux est pire qu'un compteur absent : on le croit.
  assert.equal(stepsFromDistance(5000, null), null);
  assert.equal(distanceFromSteps(6000, null), null);
});

// -------------------------------------------------------- calories actives

test('les calories actives retranchent la depense au repos', () => {
  // Une heure de yoga a 2,5 METs n'ajoute que 1,5 fois le repos : le reste, le
  // corps l'aurait depense assis, et il est deja dans le metabolisme de base.
  assert.equal(activeCalories({ met: 2.5, minutes: 60, weightKg: 70 }), Math.round(1.5 * 70));
  assert.equal(activeCalories({ met: 8, minutes: 30, weightKg: 80 }), Math.round(7 * 80 * 0.5));
});

test('une activite au repos ne coute rien de plus', () => {
  assert.equal(activeCalories({ met: 1, minutes: 60, weightKg: 70 }), 0);
  // Et jamais de valeur negative, quelle que soit la table employee.
  assert.equal(activeCalories({ met: 0.5, minutes: 60, weightKg: 70 }), 0);
});

test('sans poids connu, aucune calorie n est estimee', () => {
  assert.equal(activeCalories({ met: 8, minutes: 30, weightKg: null }), null);
  assert.equal(sessionCalories({ activityId: 'run', minutes: 30 }, null), null);
});

test('une seance emprunte le MET de son activite, sauf si elle porte le sien', () => {
  const auto = sessionCalories({ activityId: 'run', minutes: 30 }, 70);
  assert.equal(auto, Math.round((9.8 - 1) * 70 * 0.5));
  const corrige = sessionCalories({ activityId: 'run', met: 6, minutes: 30 }, 70);
  assert.equal(corrige, Math.round((6 - 1) * 70 * 0.5));
});

test('une seance dont l activite a disparu ne casse rien', () => {
  assert.equal(sessionCalories({ activityId: 'inconnue', minutes: 30 }, 70), null);
  assert.equal(getActivity('inconnue'), null);
});

// ------------------------------------------------------------------ totaux

test('les totaux additionnent les seances et le deplacement du jour', () => {
  const day = {
    meters: 3000,
    sessions: [
      { activityId: 'run', minutes: 30, meters: 5000 },
      { activityId: 'yoga', minutes: 60 },
    ],
  };
  const out = dayTotals(day, 70);
  assert.equal(out.minutes, 90);
  assert.equal(out.meters, 8000);
  assert.equal(out.sessions, 2);
  assert.equal(out.activeKcal, sessionCalories(day.sessions[0], 70) + sessionCalories(day.sessions[1], 70));
});

test('une seance sans calories calculables est exclue du total, pas comptee zero', () => {
  const day = { sessions: [{ activityId: 'run', minutes: 30 }, { activityId: 'yoga', minutes: 60 }] };
  // Sans poids, aucune des deux n'est calculable : le total reste inconnu.
  assert.equal(dayTotals(day, null).activeKcal, null);
  assert.equal(dayTotals(day, null).minutes, 90, 'la duree, elle, reste un fait');
});

test('une journee vide ne remonte que des trous', () => {
  const out = dayTotals({}, 70);
  assert.equal(out.minutes, null);
  assert.equal(out.activeKcal, null);
  assert.equal(out.meters, null);
  assert.equal(out.sessions, null);
  assert.equal(out.restDay, null);
});

test('un jour de repos est une reponse, pas une absence de reponse', () => {
  assert.equal(dayTotals({ restDay: true }, 70).restDay, 1);
  assert.equal(dayTotals({ restDay: false }, 70).restDay, null);
});

// ------------------------------------------------------------------ saisie

test('une saisie hors bornes est refusee, jamais ramenee au plus proche', () => {
  const out = sanitize('minutes', 5000);
  assert.equal(out.value, null);
  assert.equal(out.reason, 'range');
  assert.equal(out.max, LIMITS.minutes[1]);
  assert.equal(sanitize('minutes', 45).value, 45);
  assert.equal(sanitize('minutes', '').value, null);
  assert.equal(sanitize('minutes', 'longtemps').reason, 'nan');
  assert.equal(sanitize('inconnu', 5).reason, 'unknown');
});

// ------------------------------------------------------- resume quotidien

test('le module publie ses chiffres sans empieter sur les autres', () => {
  clearRegistry();
  registerCoreModules();
  const activity = getModule('activity');
  assert.ok(activity, 'le module activite doit etre enregistre');

  const summary = activity.summarize({
    meters: 3000,
    sessions: [{ activityId: 'run', minutes: 30 }],
  });
  assert.equal(summary.moveM, 3000);
  assert.equal(summary.moveMin, 30);
  assert.equal(summary.workouts, 1);

  // Aucune cle en commun avec les autres modules : deux modules qui ecrivent
  // la meme case du resume s'ecraseraient selon l'ordre d'enregistrement.
  const cles = Object.keys(summary);
  for (const autre of ['health', 'cycle', 'nutrition', 'sleep', 'habits', 'hydration', 'mood']) {
    const mod = getModule(autre);
    const communes = Object.keys(
      mod.summarize({ symptoms: ['x'], sessions: [], items: [], done: [], active: [] }) || {}
    ).filter((k) => cles.includes(k));
    assert.deepEqual(communes, [], `cles partagees avec ${autre} : ${communes.join(', ')}`);
  }
  clearRegistry();
});

test('les calories actives ne sont pas dans le resume du jour', () => {
  // Volontaire : elles dependent du poids, qui change. Les recalculer a
  // l'affichage evite un resume qui vieillit mal -- et surtout, aucune cible
  // ne doit pouvoir s'en servir.
  clearRegistry();
  registerCoreModules();
  const summary = getModule('activity').summarize({
    sessions: [{ activityId: 'run', minutes: 30 }],
  });
  assert.equal(summary.activeKcal, undefined);
  clearRegistry();
});

test('aucun equivalent en poussees n est calcule pour un fauteuil', () => {
  // Une foulee se deduit honnetement d'une taille. Un nombre de poussees, non :
  // il depend du reglage du fauteuil, du diametre des mains courantes, du
  // terrain et de la technique. Convertir avec la formule de la marche
  // produirait un nombre precis et faux.
  assert.equal(moveTerms('wheelchair').counts, false);
  assert.equal(moveTerms('walking').counts, true);
  assert.equal(moveTerms('aids').counts, true);
  assert.equal(moveTerms(null).counts, true);
});
