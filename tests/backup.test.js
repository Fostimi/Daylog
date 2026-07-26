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
