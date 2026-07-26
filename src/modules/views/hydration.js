/**
 * Hydratation.
 *
 * Volontairement le module le plus simple de tous : quelques boutons, une
 * barre. C'est le suivi qu'on remplit dix fois par jour, souvent d'une main,
 * parfois sans regarder -- il doit donc coûter un seul geste.
 *
 * Point de coherence avec le reste de l'application : `null` (jamais renseigne)
 * et `0` (bu zero verre) sont deux informations differentes. Tant qu'on n'a rien
 * saisi, la journee ne contient aucune donnee d'hydratation ; appuyer sur
 * "remettre a zero" enregistre en revanche un vrai zero.
 */

import { el, mount } from '../../ui/dom.js';

const QUICK_ADDS = [
  { ml: 150, label: 'Tasse', hint: '150 ml' },
  { ml: 250, label: 'Verre', hint: '250 ml' },
  { ml: 330, label: 'Canette', hint: '330 ml' },
  { ml: 500, label: 'Bouteille', hint: '500 ml' },
  { ml: 750, label: 'Gourde', hint: '750 ml' },
];

const DEFAULT_TARGET = 2000;

export async function render({ store }) {
  const container = el('div', { class: 'card' });

  function data() {
    return store.get('hydration') || {};
  }

  function target() {
    return data().target || store.getProfile()?.goals?.hydrationMl || DEFAULT_TARGET;
  }

  function addMl(amount) {
    const current = typeof data().ml === 'number' ? data().ml : 0;
    store.update('hydration', { ml: Math.max(0, current + amount), target: target() });
    draw();
  }

  function reset() {
    // Zero explicite, pas `null` : la personne dit qu'elle n'a rien bu, ce qui
    // n'est pas la meme chose que ne pas avoir repondu.
    store.update('hydration', { ml: 0, target: target() });
    draw();
  }

  function clear() {
    store.update('hydration', { ml: null, target: null });
    draw();
  }

  function draw() {
    const ml = data().ml;
    const tgt = target();
    const known = typeof ml === 'number';
    const pct = known && tgt > 0 ? Math.min(Math.round((ml / tgt) * 100), 100) : 0;
    const reached = known && ml >= tgt;

    mount(container, [
      el('div', { class: 'card-head' }, [
        el('h2', { class: 'card-title' }, 'Hydratation'),
        el('span', { class: 'card-count' },
          known ? `${ml} ml sur ${tgt} ml` : 'Non renseigné'
        ),
      ]),

      el('div', {
        class: 'meter',
        role: 'meter',
        'aria-valuenow': known ? String(ml) : '0',
        'aria-valuemin': '0',
        'aria-valuemax': String(tgt),
        'aria-label': `Hydratation : ${known ? `${ml} millilitres sur ${tgt}` : 'non renseignée'}`,
      }, [
        el('div', {
          class: `meter-fill${reached ? ' is-reached' : ''}`,
          style: { width: `${pct}%` },
        }),
      ]),

      // Le pourcentage est double d'un mot : la couleur seule de la barre n'est
      // pas percue par tout le monde.
      el('p', { class: 'card-hint', style: { marginTop: '0.375rem' } },
        !known
          ? 'Appuie sur ce que tu viens de boire.'
          : reached
            ? `Objectif atteint — ${pct} %`
            : `${pct} % de ton objectif, il reste ${tgt - ml} ml`
      ),

      el('div', { class: 'quick-adds' },
        QUICK_ADDS.map((q) =>
          el('button', {
            type: 'button',
            class: 'quick-add',
            'aria-label': `Ajouter ${q.hint}`,
            onClick: () => addMl(q.ml),
          }, [
            el('span', { class: 'quick-add-label' }, q.label),
            el('span', { class: 'quick-add-hint' }, q.hint),
          ])
        )
      ),

      el('div', { class: 'card-actions' }, [
        known &&
          el('button', { type: 'button', class: 'btn btn-sm', onClick: () => addMl(-250) },
            'Retirer un verre'
          ),
        known &&
          el('button', { type: 'button', class: 'btn btn-sm', onClick: reset }, 'Remettre à zéro'),
        known &&
          el('button', { type: 'button', class: 'btn btn-sm', onClick: clear },
            'Effacer la saisie'
          ),
      ]),
    ]);
  }

  draw();
  return container;
}
