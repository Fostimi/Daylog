/**
 * Point d'entree.
 *
 * L'ecran du jour se charge en premier et rien d'autre : on doit pouvoir noter
 * quelque chose dans la seconde. Le bilan, l'historique et les modules
 * additionnels ne sont telecharges qu'au moment ou on les ouvre -- et un module
 * desactive n'est jamais telecharge du tout.
 */

import './ui/styles.css';
import { createStore } from './core/store.js';
import { registerCoreModules } from './modules/index.js';
import { defaultModuleState } from './core/modules.js';
import { createExpressView } from './ui/express.js';
import { el, mount } from './ui/dom.js';

registerCoreModules();

async function boot() {
  const root = document.getElementById('app');
  const store = createStore();

  try {
    await store.init();

    // Premiere ouverture : on active les modules du noyau. L'onboarding
    // affinera ce choix, mais l'app doit etre utilisable avant meme cela.
    if (!Object.keys(store.getModuleState()).length) {
      await store.setModuleState(defaultModuleState());
    }

    await store.loadToday();

    // Les filets de sauvegarde du navigateur : arriere-plan, fermeture, sortie
    // de champ. C'est ce qui rend l'absence de bouton "enregistrer" sans risque.
    store.attachLifecycle(window);

    const view = createExpressView({ store, root });
    view.render();

    // Expose le store en developpement, pour inspecter l'etat depuis la console.
    if (import.meta.env.DEV) globalThis.daylog = { store };
  } catch (error) {
    console.error('[daylog] demarrage', error);
    mount(root, [
      el('main', { class: 'app' }, [
        el('div', { class: 'card' }, [
          el('h2', { class: 'card-title' }, "Daylog n'a pas pu demarrer"),
          el('p', { class: 'card-hint' }, [
            "Le stockage local est inaccessible. C'est souvent le cas en navigation privee, ",
            'ou si le navigateur bloque les donnees de site.',
          ]),
          el('p', { class: 'card-hint' }, String(error?.message || error)),
        ]),
      ]),
    ]);
  }
}

// Le service worker rend l'app utilisable hors connexion. Il ne sert qu'a
// mettre en cache l'app elle-meme : aucune donnee personnelle n'y transite.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Sans service worker l'app fonctionne quand meme, simplement pas hors ligne.
    });
  });
}

boot();
