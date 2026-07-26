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

    // Navigation entre les deux ecrans. L'ecran des reglages n'est telecharge
    // qu'au moment ou on l'ouvre : la plupart des ouvertures de l'application ne
    // le chargent jamais.
    const showApp = async () => {
      const view = createExpressView({
        store,
        root,
        onOpenSettings: showSettings,
        onOpenBilan: showBilan,
      });
      await view.refreshBackupNeed();
      view.render();
    };

    // Le bilan et ses graphiques ne sont telecharges qu'a leur ouverture.
    const showBilan = async () => {
      const { createBilanView } = await import('./ui/bilan.js');
      createBilanView({ store, root, onBack: showApp }).render();
    };

    const showSettings = async () => {
      const { createSettingsView } = await import('./ui/settings.js');
      createSettingsView({
        store,
        root,
        onBack: showApp,
        onOpenProfile: showProfile,
      }).render();
    };

    const showProfile = async () => {
      const { createProfileView } = await import('./ui/profile.js');
      createProfileView({
        store,
        root,
        onBack: showSettings,
        // Apres une remise a zero ou une demande de nouvelle presentation, on
        // repart du demarrage complet plutot que de rafistoler l'etat en place.
        onReset: () => globalThis.location.reload(),
      }).render();
    };

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
