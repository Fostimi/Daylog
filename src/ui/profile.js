/**
 * Profil.
 *
 * Toutes les questions de la premiere ouverture se retrouvent ici, dans les
 * memes termes. Sans cet ecran, changer une reponse -- son prenom, la facon
 * dont on s'adresse a soi, un cycle qui s'arrete ou reprend -- obligeait a
 * desinstaller puis reinstaller l'application, donc a tout perdre. Pour des
 * informations aussi personnelles que celles-ci, c'etait inacceptable.
 *
 * Trois principes repris de la premiere ouverture :
 *
 * - Chaque question peut redevenir sans reponse. « Je préfère ne pas répondre »
 *   existe partout : un choix fait un jour ne doit pas etre une prison.
 * - Modifier le profil ne touche jamais aux journees deja enregistrees.
 * - Rien n'est devine a partir d'autre chose. L'identite ne pilote aucun calcul.
 */

import { el, mount, announce } from './dom.js';
import { topbar } from './menu.js';
import { choice, numberField } from './controls.js';
import {
  WEARABLES, MOBILITY, CYCLE,
  sanitizeDeclared, DECLARED_CYCLE_RANGE, DECLARED_PERIOD_RANGE,
} from '../modules/profile-options.js';
import * as db from '../core/db.js';

export function createProfileView({ store, root, go, onReset, alert = null }) {
  let status = null;

  function setStatus(message) {
    status = message;
    draw();
    if (message) announce(message);
  }

  async function patchProfile(patch) {
    const current = store.getProfile();
    await store.setProfile({ ...current, identity: { ...current.identity, ...patch } });
  }

  async function patchCapability(key, value) {
    await store.setCapabilities({ [key]: value });
    setStatus('Modification enregistrée.');
  }

  /**
   * Enregistre sans reconstruire l'ecran.
   *
   * Pour les champs de saisie libre : redessiner a chaque frappe ferait perdre
   * le focus au bout d'un caractere, et le champ deviendrait inutilisable.
   */
  async function patchCapabilityQuietly(key, value) {
    await store.setCapabilities({ [key]: value });
  }

  /**
   * Efface tout et repart de la premiere ouverture.
   *
   * Double confirmation, et le mot « définitif » est ecrit noir sur blanc :
   * l'application n'ayant aucun serveur, il n'existe aucune copie de secours
   * ailleurs. Ce qui est efface l'est vraiment.
   */
  async function resetEverything() {
    const total = await db.countDays();
    const message =
      total > 0
        ? `Effacer définitivement ${total} journée${total > 1 ? 's' : ''} de suivi, ` +
          'ton profil et tes réglages ?\n\n' +
          "Il n'existe aucune copie ailleurs : cette action est irréversible. " +
          "Si tu n'as pas fait de sauvegarde, annule et fais-en une d'abord."
        : 'Effacer ton profil et tes réglages, et recommencer la présentation ?';

    if (!globalThis.confirm(message)) return;
    if (total > 0 && !globalThis.confirm('Dernière confirmation : tout effacer ?')) return;

    await db.clearAll();
    onReset();
  }

  /** Rejoue la presentation sans rien effacer des journees enregistrees. */
  async function redoOnboarding() {
    await store.setSettings({ onboardedAt: null });
    onReset();
  }

  function draw() {
    const profile = store.getProfile();
    const identity = profile.identity || {};
    const capabilities = store.getCapabilities();

    const nameInput = el('input', {
      id: 'profile-name',
      type: 'text',
      class: 'input',
      autocomplete: 'given-name',
      placeholder: 'Comme tu veux être appelé',
      onInput: (e) => patchProfile({ name: e.target.value.trim() || null }),
    });
    nameInput.value = identity.name || '';

    mount(root, [
      el('a', { class: 'skip-link', href: '#main' }, 'Aller au contenu'),
      topbar({ title: 'Profil', current: 'profile', go, alert }),

      el('main', { class: 'app', id: 'main' }, [
        status && el('div', { class: 'banner', role: 'status' }, el('p', {}, status)),

        el('div', { class: 'card' }, [
          el('h2', { class: 'card-title' }, 'Comment on se parle'),
          el('div', { class: 'field' }, [
            el('label', { class: 'field-label', for: 'profile-name' }, 'Ton prénom'),
            nameInput,
          ]),
          choice({
            legend: "Comment veux-tu qu'on s'adresse à toi ?",
            name: 'p-address',
            options: [
              { id: 'neutral', label: 'De façon neutre', hint: 'Le choix par défaut' },
              { id: 'feminine', label: 'Au féminin' },
              { id: 'masculine', label: 'Au masculin' },
            ],
            value: identity.address || 'neutral',
            onSelect: (v) => patchProfile({ address: v || 'neutral' }),
          }),
          el('p', { class: 'card-hint', style: { marginBottom: '0' } },
            "N'entre dans aucun calcul."
          ),
        ]),

        el('div', { class: 'card' }, [
          el('h2', { class: 'card-title' }, 'Comment tu bouges'),
          choice({
            legend: 'Comment te déplaces-tu le plus souvent ?',
            name: 'p-mobility',
            options: MOBILITY,
            value: capabilities.mobility,
            onSelect: (v) => patchCapability('mobility', v),
            allowNone: true,
          }),
        ]),

        el('div', { class: 'card' }, [
          el('h2', { class: 'card-title' }, 'Montre ou bracelet'),
          choice({
            legend: 'As-tu un appareil connecté ?',
            name: 'p-wearable',
            options: [
              { id: 'none', label: 'Non, aucun' },
              ...WEARABLES.map((w) => ({ id: w.id, label: w.label, hint: `Score « ${w.term} »` })),
            ],
            value: capabilities.wearable || 'none',
            onSelect: (v) => patchCapability('wearable', v === 'none' ? null : v),
          }),
        ]),

        el('div', { class: 'card' }, [
          el('h2', { class: 'card-title' }, 'Cycle menstruel'),
          choice({
            legend: 'As-tu un cycle menstruel à suivre ?',
            name: 'p-cycle',
            options: CYCLE,
            value: capabilities.cycle || null,
            onSelect: (v) => patchCapability('cycle', v === 'none' ? null : v),
            allowNone: true,
          }),
          // Les durees n'ont de sens que pour un cycle qui tourne. On ne les
          // demande pas a quelqu'un qui vient de repondre que le sien est
          // suspendu : ce serait n'avoir pas ecoute sa reponse.
          (capabilities.cycle === 'regular' || capabilities.cycle === 'irregular') &&
            el('div', {}, [
              el('p', { class: 'card-hint' },
                'Facultatif. Remplacé par tes cycles réels dès qu’il y en a deux.'
              ),
              numberField({
                id: 'p-cycle-length',
                label: 'Jours entre le début de deux cycles',
                value: capabilities.cycleLength ?? null,
                step: 1,
                min: DECLARED_CYCLE_RANGE[0],
                max: DECLARED_CYCLE_RANGE[1],
                unit: 'jours',
                placeholder: 'ex. 28',
                onInput: (v) =>
                  patchCapabilityQuietly('cycleLength', sanitizeDeclared(v, DECLARED_CYCLE_RANGE)),
              }).node,
              numberField({
                id: 'p-period-length',
                label: 'Durée de tes règles',
                value: capabilities.periodLength ?? null,
                step: 1,
                min: DECLARED_PERIOD_RANGE[0],
                max: DECLARED_PERIOD_RANGE[1],
                unit: 'jours',
                placeholder: 'ex. 5',
                onInput: (v) =>
                  patchCapabilityQuietly('periodLength', sanitizeDeclared(v, DECLARED_PERIOD_RANGE)),
              }).node,
            ]),

          capabilities.cycle &&
            choice({
              legend: 'Veux-tu voir un repère de prochaines règles ?',
              name: 'p-cycle-forecast',
              options: [
                { id: 'yes', label: 'Oui' },
                {
                  id: 'no',
                  label: 'Non, je préfère juste noter',
                  hint: 'Aucune date affichée nulle part',
                },
              ],
              value:
                capabilities.cycleForecast === false
                  ? 'no'
                  : capabilities.cycleForecast === true
                    ? 'yes'
                    : null,
              // Pas de « Je préfère ne pas répondre » ici : ne pas repondre
              // revient exactement a repondre oui, et proposer trois portes pour
              // deux destinations n'aide personne.
              onSelect: (v) => patchCapability('cycleForecast', v === 'yes'),
            }),

          el('p', { class: 'card-hint', style: { marginBottom: '0' } },
            'Ni un moyen de contraception, ni un outil de conception.'
          ),
        ]),

        el('div', { class: 'card' }, [
          el('h2', { class: 'card-title' }, 'Traitements'),
          choice({
            legend: 'Suis-tu un traitement en ce moment ?',
            name: 'p-treatment',
            options: [
              { id: 'yes', label: 'Oui' },
              { id: 'no', label: 'Non' },
            ],
            value: capabilities.treatment === true ? 'yes' : capabilities.treatment === false ? 'no' : null,
            onSelect: (v) => patchCapability('treatment', v === 'yes' ? true : v === 'no' ? false : null),
            allowNone: true,
          }),
        ]),

        el('div', { class: 'card' }, [
          el('h2', { class: 'card-title' }, 'Recommencer'),
          el('p', { class: 'card-hint' },
            'Repose les questions du début. Tes journées sont conservées.'
          ),
          el('div', { class: 'card-actions' }, [
            el('button', { class: 'btn', type: 'button', onClick: redoOnboarding },
              'Refaire la présentation'
            ),
          ]),

          el('hr', { class: 'card-sep' }),

          el('p', { class: 'card-hint' }, [
            el('strong', {}, 'Tout effacer '),
            "supprime définitivement tes journées, ton profil et tes réglages. " +
              "Aucune copie n'existe ailleurs — pense à sauvegarder avant.",
          ]),
          el('div', { class: 'card-actions' }, [
            el('button', { class: 'btn btn-danger', type: 'button', onClick: resetEverything },
              'Effacer toutes mes données'
            ),
          ]),
        ]),
      ]),
    ]);
  }

  return { render: draw };
}
