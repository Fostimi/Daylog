/**
 * Stockage local (IndexedDB).
 *
 * Pourquoi pas localStorage : il est synchrone (il bloque l'affichage pendant
 * l'ecriture), plafonne autour de 5 Mo, et surtout le prototype v5 y
 * re-serialisait TOUT l'historique a chaque sauvegarde. Trois ans de donnees
 * reecrites parce qu'on a bouge un curseur.
 *
 * Ici : une fiche par jour. Sauvegarder une journee ecrit ~200 octets a 2 Ko,
 * quelle que soit la taille de l'historique. C'est ce qui permet de sauvegarder
 * toutes les deux secondes sans que ca coute quoi que ce soit.
 *
 * Quatre magasins :
 *   days      - la fiche complete d'une journee, cle = 'YYYY-MM-DD'
 *   summaries - un resume compact par jour (~30 octets), cle = 'YYYY-MM-DD'
 *   meta      - profil, reglages, listes (habitudes...), cle = nom
 *   lists     - elements a identifiant stable (habitudes, traitements...)
 *
 * Le magasin `summaries` existe pour que le tableau de bord n'ait jamais a lire
 * 365 fiches completes pour tracer une courbe. Un an d'historique represente
 * une dizaine de kilo-octets a lire.
 */

const DB_NAME = 'daylog';
const DB_VERSION = 1;

export const STORE_DAYS = 'days';
export const STORE_SUMMARIES = 'summaries';
export const STORE_META = 'meta';
export const STORE_LISTS = 'lists';

let dbPromise = null;

function getIDB() {
  const idb = globalThis.indexedDB;
  if (!idb) throw new Error("IndexedDB n'est pas disponible dans cet environnement.");
  return idb;
}

/** Ouvre la base (une seule fois par session) et cree les magasins au besoin. */
export function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = getIDB().open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;
      const from = event.oldVersion;

      if (from < 1) {
        db.createObjectStore(STORE_DAYS, { keyPath: 'date' });
        db.createObjectStore(STORE_SUMMARIES, { keyPath: 'date' });
        db.createObjectStore(STORE_META, { keyPath: 'key' });
        const lists = db.createObjectStore(STORE_LISTS, { keyPath: 'id' });
        lists.createIndex('byKind', 'kind', { unique: false });
      }
      // Les versions suivantes ajoutent leurs magasins ici, sans jamais en
      // supprimer un qui contient des donnees utilisateur.
    };

    req.onsuccess = () => {
      const db = req.result;
      // Si un autre onglet demande une montee de version, on se retire pour ne
      // pas la bloquer indefiniment.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    req.onerror = () => reject(req.error);
    req.onblocked = () =>
      reject(new Error('Base bloquee par un autre onglet Daylog. Ferme les autres onglets.'));
  });
  return dbPromise;
}

/** Ferme la base. Utile pour les tests et pour le verrouillage de l'app. */
export async function close() {
  if (!dbPromise) return;
  const db = await dbPromise;
  db.close();
  dbPromise = null;
}

/** Enveloppe une IDBRequest dans une promesse. */
function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Execute `fn` dans une transaction et ne resout QUE lorsque la transaction est
 * effectivement validee (`oncomplete`).
 *
 * Le piege classique : resoudre sur le succes de la requete. La requete peut
 * reussir et la transaction echouer juste apres (quota depasse, page fermee) --
 * on croirait avoir sauvegarde sans que rien ne soit ecrit sur le disque.
 */
async function tx(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(stores, mode);
    let result;
    let failed = false;

    transaction.oncomplete = () => {
      if (!failed) resolve(result);
    };
    transaction.onerror = () => {
      failed = true;
      reject(transaction.error);
    };
    transaction.onabort = () => {
      failed = true;
      reject(transaction.error || new Error('Transaction annulee'));
    };

    let ret;
    try {
      ret = fn(transaction);
    } catch (err) {
      failed = true;
      try {
        transaction.abort();
      } catch {
        /* deja terminee */
      }
      reject(err);
      return;
    }

    Promise.resolve(ret).then(
      (value) => {
        result = value;
      },
      (err) => {
        failed = true;
        try {
          transaction.abort();
        } catch {
          /* deja terminee */
        }
        reject(err);
      }
    );
  });
}

// ---------------------------------------------------------------- journees

export function getDay(date) {
  return tx([STORE_DAYS], 'readonly', (t) => wrap(t.objectStore(STORE_DAYS).get(date)));
}

/** Ecrit la fiche du jour et son resume dans UNE SEULE transaction. */
export function putDay(day, summary) {
  return tx([STORE_DAYS, STORE_SUMMARIES], 'readwrite', (t) => {
    t.objectStore(STORE_DAYS).put(day);
    if (summary) t.objectStore(STORE_SUMMARIES).put(summary);
    return day;
  });
}

/** Supprime une journee et son resume. Sert aussi a effacer une fiche devenue vide. */
export function deleteDay(date) {
  return tx([STORE_DAYS, STORE_SUMMARIES], 'readwrite', (t) => {
    t.objectStore(STORE_DAYS).delete(date);
    t.objectStore(STORE_SUMMARIES).delete(date);
  });
}

/** Toutes les fiches completes d'un intervalle (bornes incluses). */
export function getDays(fromDate, toDate) {
  return tx([STORE_DAYS], 'readonly', (t) =>
    wrap(t.objectStore(STORE_DAYS).getAll(IDBKeyRange.bound(fromDate, toDate)))
  );
}

/** Toutes les cles de jour presentes, triees. */
export function getAllDayKeys() {
  return tx([STORE_DAYS], 'readonly', (t) => wrap(t.objectStore(STORE_DAYS).getAllKeys()));
}

export function countDays() {
  return tx([STORE_DAYS], 'readonly', (t) => wrap(t.objectStore(STORE_DAYS).count()));
}

// ---------------------------------------------------------------- resumes

/** Resumes d'un intervalle. C'est la source du tableau de bord. */
export function getSummaries(fromDate, toDate) {
  return tx([STORE_SUMMARIES], 'readonly', (t) =>
    wrap(t.objectStore(STORE_SUMMARIES).getAll(IDBKeyRange.bound(fromDate, toDate)))
  );
}

export function getAllSummaries() {
  return tx([STORE_SUMMARIES], 'readonly', (t) => wrap(t.objectStore(STORE_SUMMARIES).getAll()));
}

// ---------------------------------------------------------------- meta

export async function getMeta(key, fallback = null) {
  const row = await tx([STORE_META], 'readonly', (t) => wrap(t.objectStore(STORE_META).get(key)));
  return row ? row.value : fallback;
}

export function setMeta(key, value) {
  return tx([STORE_META], 'readwrite', (t) => {
    t.objectStore(STORE_META).put({ key, value });
    return value;
  });
}

// ---------------------------------------------------------------- listes

/**
 * Elements a identifiant stable : habitudes, traitements, repas frequents,
 * exercices personnels.
 *
 * Les identifiants sont stables et les elements ne sont jamais supprimes, juste
 * archives (`archivedAt`). Le v5 stockait les habitudes par libelle : renommer
 * "Sport" en "Muscu" cassait tout l'historique, et supprimer une habitude
 * modifiait retroactivement les scores des mois passes. Un identifiant qui ne
 * bouge jamais rend l'historique immuable.
 */
export function getList(kind) {
  return tx([STORE_LISTS], 'readonly', (t) =>
    wrap(t.objectStore(STORE_LISTS).index('byKind').getAll(kind))
  );
}

export function putListItem(item) {
  return tx([STORE_LISTS], 'readwrite', (t) => {
    t.objectStore(STORE_LISTS).put(item);
    return item;
  });
}

export function getListItem(id) {
  return tx([STORE_LISTS], 'readonly', (t) => wrap(t.objectStore(STORE_LISTS).get(id)));
}

export function getAllListItems() {
  return tx([STORE_LISTS], 'readonly', (t) => wrap(t.objectStore(STORE_LISTS).getAll()));
}

// ---------------------------------------------------------------- global

/** Lit toute la base. Utilise par l'export. */
export async function dumpAll() {
  const [days, summaries, lists] = await Promise.all([
    tx([STORE_DAYS], 'readonly', (t) => wrap(t.objectStore(STORE_DAYS).getAll())),
    tx([STORE_SUMMARIES], 'readonly', (t) => wrap(t.objectStore(STORE_SUMMARIES).getAll())),
    tx([STORE_LISTS], 'readonly', (t) => wrap(t.objectStore(STORE_LISTS).getAll())),
  ]);
  const metaRows = await tx([STORE_META], 'readonly', (t) =>
    wrap(t.objectStore(STORE_META).getAll())
  );
  const meta = {};
  for (const row of metaRows) meta[row.key] = row.value;
  return { days, summaries, lists, meta };
}

/** Ecrit un lot complet. Utilise par l'import. `replace` vide d'abord la base. */
export function restoreAll({ days = [], summaries = [], lists = [], meta = {} }, { replace = false } = {}) {
  const stores = [STORE_DAYS, STORE_SUMMARIES, STORE_META, STORE_LISTS];
  return tx(stores, 'readwrite', (t) => {
    if (replace) {
      for (const s of stores) t.objectStore(s).clear();
    }
    for (const d of days) t.objectStore(STORE_DAYS).put(d);
    for (const s of summaries) t.objectStore(STORE_SUMMARIES).put(s);
    for (const l of lists) t.objectStore(STORE_LISTS).put(l);
    for (const [key, value] of Object.entries(meta)) t.objectStore(STORE_META).put({ key, value });
  });
}

/** Efface tout. Reserve au bouton "supprimer mes donnees" des reglages. */
export function clearAll() {
  const stores = [STORE_DAYS, STORE_SUMMARIES, STORE_META, STORE_LISTS];
  return tx(stores, 'readwrite', (t) => {
    for (const s of stores) t.objectStore(s).clear();
  });
}

/**
 * Place occupee et disponible, si le navigateur veut bien le dire.
 * Sert au bandeau de rappel de sauvegarde et a l'ecran "mes donnees".
 */
export async function estimateStorage() {
  if (!navigator?.storage?.estimate) return null;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
}
