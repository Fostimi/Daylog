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

    // Filet de securite : meme si la presentation est interrompue, l'app reste
    // utilisable avec les modules du noyau.
    if (!Object.keys(store.getModuleState()).length) {
      await store.setModuleState(defaultModuleState());
    }

    await store.loadToday();

    // Les filets de sauvegarde du navigateur : arriere-plan, fermeture, sortie
    // de champ. C'est ce qui rend l'absence de bouton "enregistrer" sans risque.
    store.attachLifecycle(window);

    /**
     * Routeur.
     *
     * Chaque ecran est telecharge a sa premiere ouverture, jamais avant. La
     * plupart des lancements de l'application n'en chargent qu'un seul.
     *
     * L'alerte de sauvegarde est calculee ici et passee a tous les ecrans : la
     * pastille doit dire la meme chose partout, sinon elle n'est plus un
     * reperage mais un bruit.
     */
    let alert = null;

    async function refreshAlert() {
      try {
        const { backupUrgency } = await import('./core/backup.js');
        const { countDays } = await import('./core/db.js');
        alert = backupUrgency(store.getSettings(), { totalDays: await countDays() });
      } catch {
        alert = null;
      }
    }

    const screens = {
      today: async () => {
        const view = createExpressView({ store, root, go });
        await view.refreshBackupNeed();
        view.render();
      },
      bilan: async () => {
        const { createBilanView } = await import('./ui/bilan.js');
        createBilanView({ store, root, go, alert }).render();
      },
      data: async () => {
        const { createSettingsView } = await import('./ui/settings.js');
        createSettingsView({ store, root, go, alert }).render();
      },
      help: async () => {
        const { createAideView } = await import('./ui/aide.js');
        createAideView({ store, root, go, alert }).render();
      },
      profile: async () => {
        const { createProfileView } = await import('./ui/profile.js');
        createProfileView({
          store,
          root,
          go,
          alert,
          // Apres une remise a zero ou une nouvelle presentation, on repart du
          // demarrage complet plutot que de rafistoler l'etat en place.
          onReset: () => globalThis.location.reload(),
        }).render();
      },
    };

    async function go(screen) {
      // On enregistre avant de quitter l'ecran : changer de vue ne doit jamais
      // faire perdre une saisie en cours.
      await store.flush().catch(() => {});
      await refreshAlert();
      await (screens[screen] || screens.today)();
      globalThis.scrollTo(0, 0);
    }

    const showApp = () => go('today');

    // La presentation n'est telechargee qu'a la premiere ouverture. Les
    // personnes deja installees n'en paient jamais le poids : c'est tout
    // l'interet du decoupage par module.
    if (!store.getSettings().onboardedAt) {
      const { createOnboarding } = await import('./ui/onboarding.js');
      createOnboarding({ store, root, onDone: showApp }).render();
    } else {
      showApp();
    }

    // Expose le store en developpement, pour inspecter l'etat depuis la console.
    if (import.meta.env.DEV) globalThis.daylog = { store };
  } catch (error) {
    console.error('[daylog] demarrage', error);
    mount(root, [
      el('main', { class: 'app' }, [
        el('div', { class: 'card' }, [
          el('h2', { class: 'card-title' }, "Daylog n'a pas pu démarrer"),
          el('p', { class: 'card-hint' }, [
            "Le stockage local est inaccessible. C'est souvent le cas en navigation privée, ",
            'ou si le navigateur bloque les données de site.',
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
