/**
 * Controles de saisie.
 *
 * Deux exigences guident ce fichier :
 *
 * 1. L'ETAT "NON RENSEIGNE" EST VISIBLE ET REVERSIBLE. Un controle neuf n'a
 *    aucune valeur selectionnee, et on peut toujours revenir en arriere. Le v5
 *    utilisait des curseurs positionnes d'office au milieu : impossible de
 *    distinguer "je vais bien, 5 sur 10" de "je n'ai pas repondu", et la valeur
 *    par defaut finissait enregistree comme une vraie reponse.
 *
 * 2. UTILISABLE AUTREMENT QU'AU DOIGT. Un curseur `range` demande une motricite
 *    fine que tout le monde n'a pas, et se manipule mal au clavier. Un groupe de
 *    boutons radio se navigue aux fleches, s'annonce correctement aux lecteurs
 *    d'ecran, et se vise plus facilement.
 */

import { el } from './dom.js';

/**
 * Echelle 1-10 sans valeur par defaut.
 *
 * Implemente le motif ARIA "radiogroup" : une seule tabulation pour entrer dans
 * le groupe, puis les fleches pour choisir.
 */
export function scale({
  id,
  label,
  value = null,
  min = 1,
  max = 10,
  lowLabel = '',
  highLabel = '',
  onChange,
}) {
  const buttons = [];
  let current = value;

  const group = el('div', {
    class: 'scale',
    role: 'radiogroup',
    'aria-labelledby': `${id}-label`,
  });

  function select(next, { focus = false } = {}) {
    // Re-cliquer sur la valeur deja choisie la retire : c'est ainsi qu'on
    // revient a "non renseigne" apres avoir repondu par erreur.
    current = current === next ? null : next;
    render();
    if (focus) {
      const active = buttons.find((b) => Number(b.dataset.value) === current) || buttons[0];
      active.focus();
    }
    onChange?.(current);
  }

  function render() {
    for (const btn of buttons) {
      const v = Number(btn.dataset.value);
      const selected = v === current;
      btn.setAttribute('aria-checked', selected ? 'true' : 'false');
      btn.classList.toggle('is-selected', selected);
      // Un seul bouton tabulable : on entre dans le groupe, pas dans chaque bouton.
      btn.tabIndex = selected || (current === null && v === min) ? 0 : -1;
    }
    valueLabel.textContent = current === null ? 'Non renseigné' : String(current);
    valueLabel.classList.toggle('is-unset', current === null);
  }

  for (let v = min; v <= max; v++) {
    const btn = el('button', {
      type: 'button',
      role: 'radio',
      class: 'scale-btn',
      dataset: { value: String(v) },
      'aria-label': `${v} sur ${max}`,
      'aria-checked': 'false',
      onClick: () => select(v),
      onKeydown: (event) => {
        const keys = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
        if (event.key in keys) {
          event.preventDefault();
          const base = current === null ? min - keys[event.key] : current;
          const next = Math.min(max, Math.max(min, base + keys[event.key]));
          select(next === current ? next + keys[event.key] : next, { focus: true });
        } else if (event.key === 'Home') {
          event.preventDefault();
          select(min, { focus: true });
        } else if (event.key === 'End') {
          event.preventDefault();
          select(max, { focus: true });
        } else if (event.key === 'Backspace' || event.key === 'Delete') {
          event.preventDefault();
          current = null;
          render();
          onChange?.(null);
        }
      },
    }, String(v));
    buttons.push(btn);
    group.appendChild(btn);
  }

  const valueLabel = el('span', { class: 'scale-value' });

  const wrapper = el('div', { class: 'field' }, [
    el('div', { class: 'field-head' }, [
      el('span', { class: 'field-label', id: `${id}-label` }, label),
      valueLabel,
    ]),
    group,
    // Les reperes portent leur valeur ("1 au plus bas" plutot que "au plus
    // bas"). Ainsi ils restent justes meme si la grille repasse sur deux
    // rangees a grande taille de police, ou l'extremite gauche n'est plus
    // alignee sous le 1.
    (lowLabel || highLabel) &&
      el('div', { class: 'scale-ends', 'aria-hidden': 'true' }, [
        el('span', {}, lowLabel ? `${min} ${lowLabel}` : ''),
        el('span', {}, highLabel ? `${max} ${highLabel}` : ''),
      ]),
  ]);

  render();

  return {
    node: wrapper,
    get value() {
      return current;
    },
    set(next) {
      current = next;
      render();
    },
  };
}

/** Champ texte multiligne qui grandit avec son contenu. */
export function textarea({ id, label, value = '', placeholder = '', rows = 3, onInput }) {
  const field = el('textarea', {
    id,
    rows,
    placeholder,
    class: 'textarea',
    onInput: (event) => onInput?.(event.target.value),
  });
  field.value = value || '';

  return {
    node: el('div', { class: 'field' }, [
      el('label', { class: 'field-label', for: id }, label),
      field,
    ]),
    get value() {
      return field.value;
    },
    set(next) {
      field.value = next || '';
    },
  };
}

/** Champ numerique. Renvoie `null` quand il est vide -- jamais 0. */
export function numberField({ id, label, value = null, placeholder = '', step = 1, min, max, unit, onInput }) {
  const input = el('input', {
    id,
    type: 'number',
    inputmode: 'decimal',
    class: 'input',
    placeholder,
    step,
    min,
    max,
    onInput: (event) => {
      const raw = event.target.value;
      onInput?.(raw === '' ? null : Number(raw));
    },
  });
  input.value = value === null || value === undefined ? '' : String(value);

  return {
    node: el('div', { class: 'field' }, [
      el('label', { class: 'field-label', for: id }, label),
      el('div', { class: 'input-row' }, [input, unit && el('span', { class: 'input-unit' }, unit)]),
    ]),
    get value() {
      return input.value === '' ? null : Number(input.value);
    },
    set(next) {
      input.value = next === null || next === undefined ? '' : String(next);
    },
  };
}

/** Champ heure (HH:MM). */
export function timeField({ id, label, value = '', onInput }) {
  const input = el('input', {
    id,
    type: 'time',
    class: 'input',
    onInput: (event) => onInput?.(event.target.value || null),
  });
  input.value = value || '';

  return {
    node: el('div', { class: 'field' }, [
      el('label', { class: 'field-label', for: id }, label),
      input,
    ]),
    get value() {
      return input.value || null;
    },
    set(next) {
      input.value = next || '';
    },
  };
}

/**
 * Une ligne de choix (case a cocher ou bouton radio).
 *
 * Controle natif enveloppe dans un `label` : toute la ligne devient cliquable,
 * le clavier fonctionne sans une ligne de code, et les lecteurs d'ecran
 * annoncent l'etat sans qu'on ait a le declarer.
 *
 * Partage entre la premiere ouverture et l'ecran de profil : les memes questions
 * doivent se presenter exactement de la meme facon aux deux endroits, sinon on
 * finit par en corriger une et pas l'autre.
 */
export function optionRow({ type, name, id, label, hint, checked, disabled, onChange }) {
  const input = el('input', {
    type,
    name,
    id,
    class: 'onb-input',
    disabled,
    onChange: (e) => onChange?.(e.target.checked),
  });
  input.checked = Boolean(checked);

  return el('label', { class: 'onb-option', for: id }, [
    input,
    el('span', { class: 'onb-option-text' }, [
      el('span', { class: 'onb-option-label' }, label),
      hint && el('span', { class: 'onb-option-hint' }, hint),
    ]),
  ]);
}

/**
 * Groupe de choix exclusifs.
 *
 * `allowNone` ajoute une option « Je préfère ne pas répondre » : une question
 * passee a la premiere ouverture doit pouvoir le rester quand on revient
 * dessus, sans qu'on soit force de choisir pour sortir de l'ecran.
 */
export function choice({ legend, name, options, value, onSelect, allowNone = false }) {
  // `__unanswered` plutot que la chaine vide : plusieurs listes contiennent
  // deja une option « none » (« Non, pas concerné » pour le cycle, « Non,
  // aucun » pour la montre). Les deux produiraient le meme `id` HTML, et un id
  // en double casse l'association entre le libelle et la case -- donc le clic
  // sur le texte, et l'annonce par les lecteurs d'ecran.
  const all = allowNone
    ? [...options, { id: '__unanswered', label: 'Je préfère ne pas répondre' }]
    : options;

  return el('fieldset', { class: 'onb-fieldset' }, [
    el('legend', { class: 'onb-legend' }, legend),
    ...all.map((opt) =>
      optionRow({
        type: 'radio',
        name,
        id: `${name}-${opt.id}`,
        label: opt.label,
        hint: opt.hint,
        checked: opt.id === '__unanswered' ? value === null || value === undefined : value === opt.id,
        onChange: (on) => on && onSelect(opt.id === '__unanswered' ? null : opt.id),
      })
    ),
  ]);
}
