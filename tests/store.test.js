import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshDB, wait, fakeWindow } from './helpers.js';
import * as db from '../src/core/db.js';
import { createStore } from '../src/core/store.js';
import { isEmptyDay, prune, createDay } from '../src/core/schema.js';

beforeEach(freshDB);

/** Store aux delais courts, pour ne pas allonger la suite de tests. */
async function makeStore(debounceMs = 30) {
  const store = createStore({ debounceMs });
  await store.init();
  return store;
}

test('la sauvegarde automatique se declenche apres le debounce', async () => {
  const store = await makeStore(30);
  await store.loadDay('2026-07-26');

  store.update('mood', { checkins: { morning: { mood: 7, loggedAt: new Date().toISOString() } } });
  assert.equal(store.status().dirty, true, 'marque comme non enregistre immediatement');
  assert.equal(await db.getDay('2026-07-26'), undefined, 'rien sur le disque avant le delai');

  await wait(60);
  const saved = await db.getDay('2026-07-26');
  assert.ok(saved, 'ecrit apres le delai');
  assert.equal(saved.modules.mood.checkins.morning.mood, 7);
  assert.equal(store.status().dirty, false);
});

test('le debounce repart a zero a chaque frappe', async () => {
  const store = await makeStore(60);
  await store.loadDay('2026-07-26');

  store.update('note', { text: 'a' });
  await wait(30);
  store.update('note', { text: 'ab' });
  await wait(30);
  store.update('note', { text: 'abc' });
  assert.equal(await db.getDay('2026-07-26'), undefined, 'pas encore ecrit : on tapait encore');

  await wait(90);
  const saved = await db.getDay('2026-07-26');
  assert.equal(saved.modules.note.text, 'abc', 'une seule ecriture, avec la derniere valeur');
});

test('flush() ecrit immediatement, sans attendre', async () => {
  const store = await makeStore(10_000); // delai volontairement enorme
  await store.loadDay('2026-07-26');
  store.update('note', { text: 'urgent' });

  await store.flush();
  const saved = await db.getDay('2026-07-26');
  assert.equal(saved.modules.note.text, 'urgent');
});

test('passer en arriere-plan sauvegarde tout de suite', async () => {
  // Le filet le plus important : appel entrant, changement d app, ecran
  // verrouille. C est la que les apps mal faites perdent les donnees.
  const store = await makeStore(10_000);
  await store.loadDay('2026-07-26');
  const win = fakeWindow();
  const detach = store.attachLifecycle(win);

  store.update('note', { text: 'ecrit juste avant un appel' });
  win.hide();
  await wait(20);

  const saved = await db.getDay('2026-07-26');
  assert.ok(saved, 'sauvegarde declenchee par le passage en arriere-plan');
  assert.equal(saved.modules.note.text, 'ecrit juste avant un appel');

  detach();
  assert.equal(win.listenerCount('visibilitychange'), 0, 'les ecouteurs sont retires');
});

test('changer de jour sauvegarde le precedent', async () => {
  // Le scenario exact qui perdait des donnees dans le v5 : saisir puis naviguer
  // sans cliquer sur "Save entry".
  const store = await makeStore(10_000);
  await store.loadDay('2026-07-26');
  store.update('note', { text: 'ma journee' });

  await store.loadDay('2026-07-27'); // navigation sans sauvegarde explicite

  const saved = await db.getDay('2026-07-26');
  assert.ok(saved, 'la journee quittee a bien ete ecrite');
  assert.equal(saved.modules.note.text, 'ma journee');
  assert.equal(store.getDate(), '2026-07-27');
  assert.deepEqual(store.getDay().modules, {}, 'la nouvelle journee part vierge');
});

test('une journee vide n est jamais ecrite', async () => {
  const store = await makeStore(20);
  await store.loadDay('2026-07-26');

  store.update('mood', {}); // on ouvre une section sans rien saisir
  await wait(50);

  assert.equal(await db.getDay('2026-07-26'), undefined, 'pas de fiche fantome');
  assert.equal(await db.countDays(), 0);
});

test('vider une journee deja enregistree la supprime', async () => {
  const store = await makeStore(20);
  await store.loadDay('2026-07-26');
  store.update('note', { text: 'oups' });
  await store.flush();
  assert.equal(await db.countDays(), 1);

  store.update('note', { text: null }); // la personne efface son texte
  await store.flush();

  assert.equal(await db.countDays(), 0, 'la fiche disparait au lieu de rester vide');
  assert.equal(await db.getDay('2026-07-26'), undefined);
});

test('les valeurs non renseignees ne sont pas stockees', async () => {
  const store = await makeStore(20);
  await store.loadDay('2026-07-26');

  store.update('sleep', { hours: 7.5, quality: null, awakenings: null, notes: '' });
  await store.flush();

  const saved = await db.getDay('2026-07-26');
  assert.equal(saved.modules.sleep.hours, 7.5);
  assert.ok(!('quality' in saved.modules.sleep), 'null n est pas stocke');
  assert.ok(!('awakenings' in saved.modules.sleep));
  assert.ok(!('notes' in saved.modules.sleep), 'chaine vide non plus');
});

test('le resume est ecrit en meme temps que la journee', async () => {
  const store = await makeStore(20);
  await store.setModuleState({ mood: true, sleep: true });
  await store.loadDay('2026-07-26');

  const now = new Date().toISOString();
  store.update('mood', {
    checkins: {
      morning: { mood: 8, energy: 6, stress: 3, loggedAt: now },
      evening: { mood: 6, energy: 4, stress: 5, loggedAt: now },
    },
  });
  store.update('sleep', { hours: 7.5, quality: 8 });
  await store.flush();

  const [summary] = await db.getSummaries('2026-07-26', '2026-07-26');
  assert.equal(summary.date, '2026-07-26');
  assert.equal(summary.mood, 7, 'moyenne des deux check-ins enregistres');
  assert.equal(summary.energy, 5);
  assert.equal(summary.checkins, 2);
  assert.equal(summary.sleepH, 7.5);
  assert.equal(summary.sleepQ, 8);
});

test('un check-in non enregistre ne compte pas dans la moyenne', async () => {
  // Bouger un curseur sans valider ne doit pas creer de donnee.
  const store = await makeStore(20);
  await store.loadDay('2026-07-26');
  store.update('mood', {
    checkins: {
      morning: { mood: 8, energy: 8, stress: 2, loggedAt: new Date().toISOString() },
      afternoon: { mood: 2, energy: 2, stress: 9, loggedAt: null }, // pas valide
    },
  });
  await store.flush();

  const [summary] = await db.getSummaries('2026-07-26', '2026-07-26');
  assert.equal(summary.mood, 8, 'seul le check-in enregistre compte');
  assert.equal(summary.checkins, 1);
});

test('deux sauvegardes simultanees ne se marchent pas dessus', async () => {
  const store = await makeStore(10_000);
  await store.loadDay('2026-07-26');

  store.update('note', { text: 'premier' });
  const a = store.flush();
  store.update('note', { text: 'second' });
  const b = store.flush();
  await Promise.all([a, b]);
  await wait(30);

  const saved = await db.getDay('2026-07-26');
  assert.equal(saved.modules.note.text, 'second', 'la derniere valeur gagne');
});

test('un echec d ecriture ne fait pas croire que c est enregistre', async () => {
  // Quota depasse, disque plein : le pire scenario est celui ou l'app affiche
  // "Enregistre" alors que rien n'a ete ecrit. On verifie que le drapeau reste
  // leve pour que la sauvegarde soit retentee et que l'ecran puisse alerter.
  let failing = true;
  const store = createStore({
    debounceMs: 10_000,
    storage: {
      ...db,
      putDay: (...args) =>
        failing ? Promise.reject(new Error('quota depasse')) : db.putDay(...args),
    },
  });
  await store.init();
  await store.loadDay('2026-07-26');

  const events = [];
  store.subscribe((event) => events.push(event));
  store.update('note', { text: 'important' });

  await assert.rejects(() => store.flush(), /quota depasse/);
  assert.equal(store.status().dirty, true, 'toujours marque comme non enregistre');
  assert.ok(store.status().lastError, "l erreur est conservee pour l'affichage");
  assert.ok(events.includes('save-error'));

  // Le disque se libere : la tentative suivante doit reussir sans rien perdre.
  failing = false;
  await store.flush();
  const saved = await db.getDay('2026-07-26');
  assert.equal(saved.modules.note.text, 'important', 'la donnee a survecu a la panne');
  assert.equal(store.status().dirty, false);
});

test('createdAt est fixe a la premiere ecriture et ne bouge plus', async () => {
  const store = await makeStore(20);
  await store.loadDay('2026-07-26');
  store.update('note', { text: 'un' });
  await store.flush();
  const first = (await db.getDay('2026-07-26')).createdAt;

  await wait(15);
  store.update('note', { text: 'deux' });
  await store.flush();
  const second = await db.getDay('2026-07-26');

  assert.equal(second.createdAt, first, 'date de creation preservee');
  assert.ok(second.updatedAt >= first, 'date de modification mise a jour');
});

test('recharger une journee retrouve exactement ce qui a ete ecrit', async () => {
  const store = await makeStore(20);
  await store.loadDay('2026-07-26');
  store.update('sleep', { hours: 6.25, quality: 4 });
  store.update('hydration', { ml: 1500 });
  await store.flush();

  const store2 = await makeStore(20);
  await store2.loadDay('2026-07-26');
  assert.equal(store2.get('sleep').hours, 6.25);
  assert.equal(store2.get('hydration').ml, 1500);
});

test('modifier la journee chargee ne touche pas la copie sur disque', async () => {
  // La copie en memoire doit etre independante : sans cela, une modification
  // non sauvegardee "contaminerait" ce qui est deja ecrit.
  const store = await makeStore(10_000);
  await store.loadDay('2026-07-26');
  store.update('note', { text: 'ecrit' });
  await store.flush();

  store.update('note', { text: 'modifie mais pas sauvegarde' });
  const onDisk = await db.getDay('2026-07-26');
  assert.equal(onDisk.modules.note.text, 'ecrit');
});

test('isEmptyDay ignore les horodatages techniques', () => {
  assert.ok(isEmptyDay(createDay('2026-07-26')));
  assert.ok(isEmptyDay({ modules: { mood: { updatedAt: '2026-07-26T10:00:00Z' } } }));
  assert.ok(isEmptyDay({ modules: { mood: { mood: null, note: '' } } }));
  assert.ok(isEmptyDay({ modules: { habits: { done: [] } } }));
  assert.ok(!isEmptyDay({ modules: { mood: { mood: 5 } } }));
  assert.ok(!isEmptyDay({ modules: { habits: { done: ['hab_x'] } } }));
  assert.ok(!isEmptyDay({ modules: { sleep: { hours: 0 } } }), 'zero est une vraie valeur');
});

test('prune conserve zero et false, qui sont des reponses', () => {
  const out = prune({ a: 0, b: false, c: null, d: '', e: 'x' });
  assert.equal(out.a, 0, 'zero verre d eau est une information');
  assert.equal(out.b, false);
  assert.ok(!('c' in out));
  assert.ok(!('d' in out));
  assert.equal(out.e, 'x');
});
