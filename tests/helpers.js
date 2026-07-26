/**
 * Outillage de test.
 *
 * fake-indexeddb fournit une vraie implementation d'IndexedDB en memoire : les
 * tests exercent le meme code que le navigateur, transactions comprises.
 */

import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import * as db from '../src/core/db.js';
import { clearRegistry } from '../src/core/modules.js';
import { registerCoreModules } from '../src/modules/index.js';

/** Base vierge avant chaque test, sans etat qui fuit d'un test a l'autre. */
export async function freshDB() {
  await db.close();
  globalThis.indexedDB = new IDBFactory();
  clearRegistry();
  registerCoreModules();
  await db.open();
}

/** Attente reelle, pour verifier le declenchement du debounce. */
export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Faux `window` minimal pour tester les filets de sauvegarde du cycle de vie. */
export function fakeWindow() {
  const listeners = new Map();
  return {
    document: { visibilityState: 'visible' },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    dispatch(type) {
      for (const fn of listeners.get(type) || []) fn();
    },
    hide() {
      this.document.visibilityState = 'hidden';
      this.dispatch('visibilitychange');
    },
    listenerCount(type) {
      return listeners.get(type)?.size || 0;
    },
  };
}
