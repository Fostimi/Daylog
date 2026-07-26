/**
 * Etat courant et sauvegarde automatique.
 *
 * Le v5 lisait le formulaire au moment de cliquer "Save entry" : le DOM etait la
 * source de verite. Changer de jour sans cliquer perdait tout, silencieusement.
 * Ici c'est l'inverse : l'etat en memoire fait foi, l'ecran n'en est qu'une vue.
 *
 * Quatre filets superposes, du plus frequent au plus critique :
 *
 *   1. 2 s apres la derniere frappe        (debounce)
 *   2. a la sortie d'un champ              (blur)
 *   3. quand l'app passe en arriere-plan   (visibilitychange) <- le plus important
 *   4. a la fermeture de la page           (pagehide)
 *
 * Le filet n°3 est celui qui compte vraiment : appel entrant, changement d'app,
 * verrouillage de l'ecran. C'est la que les apps mal faites perdent des donnees,
 * et c'est un evenement que le systeme nous donne de facon fiable.
 *
 * En cas de coupure de batterie brutale on perd au pire les deux dernieres
 * secondes de frappe. En pratique, rien.
 *
 * Une sauvegarde ecrit une seule fiche (~200 octets a 2 Ko) quelle que soit la
 * taille de l'historique : on peut donc se permettre d'etre genereux.
 */

import * as defaultStorage from './db.js';
import { createDay, isEmptyDay, prune, SCHEMA_VERSION } from './schema.js';
import { summarize } from './summary.js';
import { today as todayKey } from './date.js';

export const DEBOUNCE_MS = 2000;

function nowISO() {
  return new Date().toISOString();
}

/**
 * `storage` est injectable : le store ne connait que quatre operations
 * (getDay, putDay, deleteDay, getMeta/setMeta) et se moque de savoir qui les
 * implemente. Cela permet de tester les chemins d'erreur -- notamment le quota
 * depasse, qu'on ne peut pas provoquer autrement -- et laissera la place a une
 * couche chiffree le jour ou on ajoutera le verrouillage de l'app.
 */
export function createStore({ debounceMs = DEBOUNCE_MS, storage = defaultStorage } = {}) {
  const db = storage;
  let currentDate = null;
  let day = null;
  let moduleState = {};
  let capabilities = {};
  let settings = {};
  let profile = {};

  let dirty = false;
  let timer = null;
  let inFlight = null; // sauvegarde en cours
  let pending = false; // une autre sauvegarde a ete demandee pendant celle-ci
  let lastSavedAt = null;
  let lastError = null;

  const listeners = new Set();

  function emit(event, detail) {
    for (const fn of listeners) {
      try {
        fn(event, detail);
      } catch (err) {
        console.error('[store] listener', err);
      }
    }
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // ------------------------------------------------------------- chargement

  async function init() {
    const [storedModules, storedCaps, storedSettings, storedProfile] = await Promise.all([
      db.getMeta('modules', null),
      db.getMeta('capabilities', {}),
      db.getMeta('settings', {}),
      db.getMeta('profile', {}),
    ]);
    moduleState = storedModules || {};
    capabilities = storedCaps || {};
    settings = storedSettings || {};
    profile = storedProfile || {};
    emit('ready');
    return { moduleState, capabilities, settings, profile };
  }

  /**
   * Charge une journee. Sauvegarde d'abord la precedente si elle a change --
   * c'est precisement le scenario qui faisait perdre des donnees dans le v5.
   */
  async function loadDay(date) {
    if (dirty) await flush();
    const stored = await db.getDay(date);
    currentDate = date;
    day = stored ? structuredClone(stored) : createDay(date);
    if (!day.modules) day.modules = {};
    dirty = false;
    emit('day-loaded', { date, day });
    return day;
  }

  function getDay() {
    return day;
  }

  function getDate() {
    return currentDate;
  }

  // ---------------------------------------------------------------- ecriture

  /**
   * Met a jour les donnees d'un module pour la journee courante.
   *
   * `patch` est fusionne dans l'existant. Passer explicitement `null` pour un
   * champ l'efface : c'est ainsi qu'on remet un champ a "non renseigne", ce qui
   * n'est PAS la meme chose que zero.
   */
  function update(moduleId, patch) {
    if (!day) throw new Error('Aucune journee chargee.');
    const previous = day.modules[moduleId] || {};
    const next = { ...previous, ...patch, updatedAt: nowISO() };
    day.modules[moduleId] = next;
    markDirty();
    emit('changed', { moduleId, data: next });
    return next;
  }

  /** Remplace entierement les donnees d'un module (listes, sessions...). */
  function replace(moduleId, data) {
    if (!day) throw new Error('Aucune journee chargee.');
    day.modules[moduleId] = data ? { ...data, updatedAt: nowISO() } : undefined;
    if (!data) delete day.modules[moduleId];
    markDirty();
    emit('changed', { moduleId, data: day.modules[moduleId] || null });
    return day.modules[moduleId] || null;
  }

  function get(moduleId) {
    return day?.modules?.[moduleId] || null;
  }

  function markDirty() {
    dirty = true;
    emit('dirty');
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      flush().catch((err) => console.error('[store] autosave', err));
    }, debounceMs);
  }

  /**
   * Ecrit maintenant. Sans effet si rien n'a change.
   *
   * Si une sauvegarde est deja en cours, on n'en lance pas une seconde en
   * parallele : on note qu'il faudra recommencer apres. Deux ecritures
   * concurrentes sur la meme fiche pourraient sinon se marcher dessus.
   */
  async function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!dirty || !day) return { saved: false };
    if (inFlight) {
      pending = true;
      return inFlight;
    }

    inFlight = (async () => {
      try {
        const snapshot = structuredClone(day);
        dirty = false;

        const pruned = prune({ ...snapshot, modules: snapshot.modules });
        const cleanedModules = pruned?.modules || {};
        const record = {
          ...snapshot,
          modules: cleanedModules,
          schemaVersion: SCHEMA_VERSION,
          createdAt: snapshot.createdAt || nowISO(),
          updatedAt: nowISO(),
        };

        // Une journee videe de son contenu est supprimee plutot qu'enregistree :
        // ouvrir l'app sans rien saisir ne doit pas creer de fiche fantome qui
        // fausserait les moyennes et les compteurs de suivi.
        if (isEmptyDay(record)) {
          await db.deleteDay(record.date);
          lastSavedAt = nowISO();
          lastError = null;
          emit('saved', { date: record.date, deleted: true });
          return { saved: true, deleted: true };
        }

        const summary = summarize(record, moduleState, capabilities);
        await db.putDay(record, summary);

        day.createdAt = record.createdAt;
        lastSavedAt = record.updatedAt;
        lastError = null;
        emit('saved', { date: record.date, at: lastSavedAt });
        return { saved: true, at: lastSavedAt };
      } catch (err) {
        // L'ecriture a echoue : on remet le drapeau pour reessayer plus tard
        // plutot que de faire croire que c'est enregistre.
        dirty = true;
        lastError = err;
        emit('save-error', err);
        throw err;
      } finally {
        inFlight = null;
        if (pending) {
          pending = false;
          flush().catch(() => {});
        }
      }
    })();

    return inFlight;
  }

  // ------------------------------------------------------- reglages & profil

  async function setModuleState(next) {
    moduleState = { ...moduleState, ...next };
    await db.setMeta('modules', moduleState);
    emit('modules-changed', moduleState);
    return moduleState;
  }

  async function setCapabilities(next) {
    capabilities = { ...capabilities, ...next };
    await db.setMeta('capabilities', capabilities);
    emit('capabilities-changed', capabilities);
    return capabilities;
  }

  async function setSettings(next) {
    settings = { ...settings, ...next };
    await db.setMeta('settings', settings);
    emit('settings-changed', settings);
    return settings;
  }

  async function setProfile(next) {
    profile = { ...profile, ...next };
    await db.setMeta('profile', profile);
    emit('profile-changed', profile);
    return profile;
  }

  const getModuleState = () => moduleState;
  const getCapabilities = () => capabilities;
  const getSettings = () => settings;
  const getProfile = () => profile;

  function status() {
    return {
      date: currentDate,
      dirty,
      saving: Boolean(inFlight),
      lastSavedAt,
      lastError,
    };
  }

  /**
   * Branche les filets de securite du navigateur.
   *
   * `visibilitychange` est le seul evenement fiable sur mobile : `beforeunload`
   * ne se declenche pas quand le systeme tue l'onglet en arriere-plan, ce qui
   * est justement le cas dangereux. On garde `pagehide` en complement pour le
   * bureau.
   */
  function attachLifecycle(target = globalThis) {
    if (!target?.addEventListener) return () => {};
    const onHide = () => {
      if (dirty) flush().catch(() => {});
    };
    const onVisibility = () => {
      if (target.document?.visibilityState === 'hidden') onHide();
    };
    target.addEventListener('visibilitychange', onVisibility);
    target.addEventListener('pagehide', onHide);
    target.addEventListener('blur', onHide, true);
    return () => {
      target.removeEventListener('visibilitychange', onVisibility);
      target.removeEventListener('pagehide', onHide);
      target.removeEventListener('blur', onHide, true);
    };
  }

  return {
    init,
    loadDay,
    loadToday: () => loadDay(todayKey(settings.dayStartHour || 0)),
    getDay,
    getDate,
    get,
    update,
    replace,
    flush,
    markDirty,
    status,
    subscribe,
    attachLifecycle,
    setModuleState,
    setCapabilities,
    setSettings,
    setProfile,
    getModuleState,
    getCapabilities,
    getSettings,
    getProfile,
  };
}
