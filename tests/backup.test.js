import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshDB } from './helpers.js';
import * as db from '../src/core/db.js';
import { createStore } from '../src/core/store.js';
import {
  buildBackup, toJSON, gzip, gunzip, parseBackup, parseBackupFile,
  restoreBackup, backupFilename, daysSinceBackup, shouldRemindBackup, FORMAT,
} from '../src/core/backup.js';
import { SCHEMA_VERSION } from '../src/core/schema.js';
import { registerCoreModules } from '../src/modules/index.js';
import { getModule, clearRegistry } from '../src/core/modules.js';

/** Base vierge, pour les tests de decoupage qui ecrivent leurs propres fiches. */
async function reset() {
  await freshDB();
}

beforeEach(freshDB);

async function seed() {
  const store = createStore({ debounceMs: 10_000 });
  await store.init();

  await store.loadDay('2026-07-24');
  store.update('note', { text: 'journal intime' });
  store.update('nutrition', { meals: [{ id: 'm1', kcal: 600, protein: 40 }] });
  await store.flush();

  await store.loadDay('2026-07-25');
  store.update('sleep', { hours: 7, quality: 8 });
  await store.flush();

  await store.setProfile({ identity: { name: 'Test' } });
  return store;
}

test('une sauvegarde complete emporte tout et se relit', async () => {
  await seed();
  const backup = await buildBackup();

  assert.equal(backup.format, FORMAT);
  assert.equal(backup.schemaVersion, SCHEMA_VERSION);
  assert.equal(backup.partial, false);
  assert.equal(backup.days.length, 2);
  assert.ok(backup.meta.profile, 'le profil est inclus dans une sauvegarde complete');

  const { backup: parsed } = parseBackup(toJSON(backup));
  assert.equal(parsed.days.length, 2);
});

test('la compression gzip fait un aller-retour fidele', async () => {
  await seed();
  const json = toJSON(await buildBackup());
  const compressed = await gzip(json);

  assert.ok(compressed, 'CompressionStream disponible');
  assert.ok(compressed.byteLength < json.length, 'le fichier compresse est plus petit');
  assert.equal(await gunzip(compressed), json, 'aucune perte');
});

test('le format est detecte par le contenu, pas par l extension', async () => {
  await seed();
  const backup = await buildBackup();
  const json = toJSON(backup);

  const fromPlain = await parseBackupFile(new TextEncoder().encode(json).buffer);
  assert.equal(fromPlain.backup.days.length, 2);

  const fromGz = await parseBackupFile(await gzip(json));
  assert.equal(fromGz.backup.days.length, 2, 'renommer un fichier ne casse rien');
});

test('un export partiel ne contient que les modules demandes', async () => {
  // Montrer sa nutrition a une dieteticienne sans montrer son journal intime.
  await seed();
  const backup = await buildBackup({ modules: ['nutrition'] });

  assert.equal(backup.partial, true);
  assert.equal(backup.days.length, 1, 'seules les journees concernees partent');
  assert.ok(backup.days[0].modules.nutrition);
  assert.ok(!backup.days[0].modules.note, 'le journal intime ne part pas');
  assert.deepEqual(backup.meta, {}, "un extrait n emporte ni profil ni reglages");
  assert.deepEqual(backup.lists, []);
});

test('un export peut etre limite a une periode', async () => {
  await seed();
  const backup = await buildBackup({ from: '2026-07-25', to: '2026-07-25' });
  assert.equal(backup.days.length, 1);
  assert.equal(backup.days[0].date, '2026-07-25');
  assert.equal(backup.partial, true);
});

test('la fusion garde la version la plus recente de chaque journee', async () => {
  // Changer de telephone puis reimporter ne doit jamais effacer ce qui a ete
  // saisi entre-temps.
  await seed();
  const backup = await buildBackup();

  const store = createStore({ debounceMs: 10_000 });
  await store.init();
  await store.loadDay('2026-07-25');
  store.update('sleep', { hours: 8.5, quality: 9 }); // saisie plus recente
  await store.flush();

  const result = await restoreBackup(backup, { strategy: 'merge' });

  // Ce qui compte est le resultat sur les donnees, pas le compteur : les deux
  // journees sont conservees en local, l'une parce qu'elle est plus recente,
  // l'autre par egalite d'horodatage (elle vient de la meme sauvegarde).
  const day = await db.getDay('2026-07-25');
  assert.equal(day.modules.sleep.hours, 8.5, "la saisie recente n'a pas ete ecrasee");
  assert.equal(result.keptLocal, 2);
  assert.equal(await db.countDays(), 2, 'aucune journee perdue au passage');

  const other = await db.getDay('2026-07-24');
  assert.equal(other.modules.note.text, 'journal intime', "l'autre journee est intacte");
});

test('la fusion ajoute les journees absentes en local', async () => {
  await seed();
  const backup = await buildBackup();
  await db.clearAll();
  assert.equal(await db.countDays(), 0);

  await restoreBackup(backup, { strategy: 'merge' });
  assert.equal(await db.countDays(), 2, 'tout est revenu');
  const day = await db.getDay('2026-07-24');
  assert.equal(day.modules.note.text, 'journal intime');
});

test('la restauration en remplacement vide d abord la base', async () => {
  await seed();
  const backup = await buildBackup();

  const store = createStore({ debounceMs: 10_000 });
  await store.init();
  await store.loadDay('2026-07-30');
  store.update('note', { text: 'journee qui ne doit pas survivre' });
  await store.flush();
  assert.equal(await db.countDays(), 3);

  await restoreBackup(backup, { strategy: 'replace' });
  assert.equal(await db.countDays(), 2);
  assert.equal(await db.getDay('2026-07-30'), undefined);
});

test('un fichier illisible est refuse avec un message clair', () => {
  assert.throws(() => parseBackup('pas du json'), /pas une sauvegarde Daylog lisible/);
  assert.throws(() => parseBackup('{"format":"autre"}'), /ne ressemble pas/);
  assert.throws(() => parseBackup(JSON.stringify({ format: FORMAT })), /aucune journee/);
});

test('une sauvegarde corrompue est refusee avant d ecrire quoi que ce soit', () => {
  const bad = { format: FORMAT, schemaVersion: 1, days: [{ date: '2026-02-31', modules: {} }] };
  assert.throws(() => parseBackup(JSON.stringify(bad)), /date invalide/);
});

test('un export du prototype v5 est reconnu comme tel', () => {
  // On ne perd les donnees de personne au passage : le v5 est identifie pour
  // pouvoir etre converti plutot que rejete.
  const v5 = { entries: { '2026-07-26': { mood: {} } }, habits: [], version: 5 };
  try {
    parseBackup(JSON.stringify(v5));
    assert.fail('aurait du lever');
  } catch (err) {
    assert.equal(err.legacy, true);
    assert.ok(err.data.entries);
  }
});

test('une sauvegarde venue du futur est refusee, pas devinee', () => {
  const future = { format: FORMAT, schemaVersion: SCHEMA_VERSION + 5, days: [] };
  assert.throws(() => parseBackup(JSON.stringify(future)), /version plus recente/);
});

test('le nom de fichier est lisible et triable', () => {
  const d = new Date(2026, 6, 26);
  assert.equal(backupFilename({ date: d }), 'daylog-sauvegarde-2026-07-26.json.gz');
  assert.equal(backupFilename({ date: d, compressed: false }), 'daylog-sauvegarde-2026-07-26.json');
  assert.equal(backupFilename({ date: d, partial: true }), 'daylog-extrait-2026-07-26.json.gz');
});

test('le rappel de sauvegarde ne harcele pas les nouveaux venus', () => {
  const now = new Date(2026, 6, 26);
  assert.equal(daysSinceBackup(null), null);
  assert.equal(daysSinceBackup(new Date(2026, 6, 12).toISOString(), now), 14);

  assert.equal(
    shouldRemindBackup({ backupReminderDays: 21 }, { totalDays: 3, now }),
    false,
    'trois jours de donnees : on ne dit rien'
  );
  assert.equal(
    shouldRemindBackup({ backupReminderDays: 21 }, { totalDays: 20, now }),
    true,
    'jamais sauvegarde et deja 20 jours de donnees : on previent'
  );
  assert.equal(
    shouldRemindBackup(
      { backupReminderDays: 21, lastBackupAt: new Date(2026, 6, 20).toISOString() },
      { totalDays: 100, now }
    ),
    false,
    'sauvegarde il y a 6 jours : rien a signaler'
  );
  assert.equal(
    shouldRemindBackup(
      { backupReminderDays: 21, lastBackupAt: new Date(2026, 5, 1).toISOString() },
      { totalDays: 100, now }
    ),
    true,
    'sauvegarde il y a presque deux mois : on previent'
  );
});

test('a horodatage egal, la version locale est conservee', async () => {
  // Deux ecritures dans la meme milliseconde sont indiscernables. Le depart
  // doit alors profiter a ce qui est deja sur l'appareil : une fusion ne doit
  // jamais faire disparaitre une saisie recente.
  const sameInstant = '2026-07-25T10:00:00.000Z';

  await db.restoreAll({
    days: [
      {
        date: '2026-07-25',
        updatedAt: sameInstant,
        modules: { note: { text: 'version locale' } },
      },
    ],
  });

  const incoming = {
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    days: [
      {
        date: '2026-07-25',
        updatedAt: sameInstant,
        modules: { note: { text: 'version importee' } },
      },
    ],
    summaries: [],
  };

  const result = await restoreBackup(incoming, { strategy: 'merge' });
  assert.equal(result.keptLocal, 1);
  const day = await db.getDay('2026-07-25');
  assert.equal(day.modules.note.text, 'version locale');
});

test("l'urgence de sauvegarde monte en deux paliers, jamais plus", async () => {
  const { backupUrgency } = await import('../src/core/backup.js');
  const now = new Date(2026, 6, 26);
  const days = (n) => new Date(2026, 6, 26 - n).toISOString();

  // Personne qui vient d'arriver : rien a perdre, donc rien a signaler.
  assert.equal(backupUrgency({ lastBackupAt: null }, { totalDays: 3, now }), null);

  // Sauvegarde recente : rien non plus.
  assert.equal(
    backupUrgency({ backupReminderDays: 21, lastBackupAt: days(5) }, { totalDays: 100, now }),
    null
  );

  // Passe le seuil : palier ambre.
  assert.equal(
    backupUrgency({ backupReminderDays: 21, lastBackupAt: days(25) }, { totalDays: 100, now }),
    'due'
  );

  // Bien au-dela : palier rouge.
  assert.equal(
    backupUrgency({ backupReminderDays: 21, lastBackupAt: days(60) }, { totalDays: 100, now }),
    'overdue'
  );

  // Un rappel regle tres court ne doit pas faire virer au rouge en deux
  // semaines : le palier critique a un plancher a 45 jours.
  assert.equal(
    backupUrgency({ backupReminderDays: 3, lastBackupAt: days(20) }, { totalDays: 100, now }),
    'due',
    'ambre, pas rouge'
  );
  assert.equal(
    backupUrgency({ backupReminderDays: 3, lastBackupAt: days(50) }, { totalDays: 100, now }),
    'overdue'
  );

  // Jamais sauvegarde, avec un historique consequent.
  assert.equal(backupUrgency({ lastBackupAt: null }, { totalDays: 20, now }), 'due');
  assert.equal(backupUrgency({ lastBackupAt: null }, { totalDays: 90, now }), 'overdue');
});

// ------------------------------------------------- partage par parts

/**
 * Le decoupage d'un extrait.
 *
 * « Santé » en un seul bloc emporte poids, douleur, symptomes ET traitements.
 * Un medecin du sport n'a pas besoin de la liste des antidepresseurs, et devoir
 * la montrer pour parler d'une douleur au genou est exactement la contrainte
 * que l'application refuse partout ailleurs.
 */
test('un extrait peut ne porter qu une part d un module', async () => {
  clearRegistry();
  registerCoreModules();
  await reset();
  await db.putDay(
    {
      date: '2026-03-01',
      schemaVersion: 1,
      updatedAt: '2026-03-01T20:00:00.000Z',
      modules: {
        health: {
          weight: 72.4,
          pain: { level: 3 },
          doses: [{ id: 'trt_a', label: 'Methylphenidate', dose: 20, unit: 'mg' }],
          updatedAt: '2026-03-01T20:00:00.000Z',
        },
        note: { text: 'journee difficile' },
      },
    },
    { date: '2026-03-01', weightKg: 72.4 }
  );

  const doses = await buildBackup({ modules: ['health:doses'] });
  const jour = doses.days[0].modules.health;
  assert.deepEqual(Object.keys(jour).sort(), ['doses', 'updatedAt']);
  assert.equal(jour.doses[0].label, 'Methylphenidate');
  assert.equal(doses.days[0].modules.note, undefined, 'le journal ne suit pas');

  const mesures = await buildBackup({ modules: ['health:measures'] });
  assert.equal(mesures.days[0].modules.health.weight, 72.4);
  assert.equal(mesures.days[0].modules.health.doses, undefined);
  assert.equal(mesures.days[0].modules.health.pain, undefined);

  clearRegistry();
});

test('demander deux parts les reunit, demander le module entier l emporte', async () => {
  clearRegistry();
  registerCoreModules();
  await reset();
  await db.putDay(
    {
      date: '2026-03-01',
      schemaVersion: 1,
      modules: { health: { weight: 72.4, pain: { level: 3 }, doses: [{ id: 'a' }] } },
    },
    { date: '2026-03-01' }
  );

  const deux = await buildBackup({ modules: ['health:measures', 'health:symptoms'] });
  const cles = Object.keys(deux.days[0].modules.health).sort();
  assert.deepEqual(cles, ['pain', 'weight']);

  const tout = await buildBackup({ modules: ['health'] });
  assert.ok(Object.keys(tout.days[0].modules.health).includes('doses'));
  clearRegistry();
});

test('une journee videe par le decoupage ne part pas', async () => {
  clearRegistry();
  registerCoreModules();
  await reset();
  await db.putDay(
    { date: '2026-03-01', schemaVersion: 1, modules: { health: { weight: 72 } } },
    { date: '2026-03-01' }
  );
  const out = await buildBackup({ modules: ['health:doses'] });
  assert.equal(out.days.length, 0, 'un fichier de journees vides n apprend rien');
  clearRegistry();
});

test('plus aucune section n est interdite de partage', async () => {
  // C'est a la personne de choisir ce qu'elle montre. Interdire n'ajoutait
  // aucune securite -- un extrait ne part jamais tout seul -- et retirait un
  // usage legitime, comme montrer son suivi d'humeur a un psy.
  clearRegistry();
  registerCoreModules();
  for (const id of ['mood', 'note']) {
    assert.equal(getModule(id).shareable, true, `${id} reste verrouille`);
  }
  clearRegistry();
});
