/**
 * Ecran du jour, mode express.
 *
 * C'est le premier ecran, sans detour : on ouvre l'app, on est devant. Le
 * critere qui prime sur tout le reste est "une journee utile en 60 secondes".
 * Le v5 demandait ~150 champs par jour ; personne ne tient trois semaines a ce
 * regime. Ici, trois questions suffisent, et le detail n'apparait que si on le
 * demande.
 *
 * Aucun bouton "enregistrer" : tout part tout seul (voir core/store.js).
 */

import { el, mount, announce } from './dom.js';
import { scale, textarea, numberField, timeField } from './controls.js';
import { CHECKIN_SLOTS, createCheckin } from '../modules/index.js';
import { formatDayLong, formatTime } from '../core/i18n.js';
import { toDate, today, addDays, isFuture } from '../core/date.js';

export function createExpressView({ store, root }) {
  let detailOpen = false;

  function currentSlot() {
    const h = new Date().getHours();
    if (h < 12) return 'morning';
    if (h < 18) return 'afternoon';
    return 'evening';
  }

  // ------------------------------------------------------------- check-ins

  function renderCheckin(slot) {
    const mood = store.get('mood') || {};
    const checkins = mood.checkins || {};
    const data = checkins[slot.id] || createCheckin();
    const logged = Boolean(data.loggedAt);

    function write(patch) {
      const next = { ...(store.get('mood')?.checkins || {}) };
      next[slot.id] = { ...(next[slot.id] || createCheckin()), ...patch };
      store.update('mood', { checkins: next });
    }

    const controls = [
      ['mood', 'Humeur', 'Au plus bas', 'Au top'],
      ['energy', 'Energie', 'Vide', 'Plein'],
      ['stress', 'Stress', 'Serein', 'Sous pression'],
    ].map(([key, label, low, high]) =>
      scale({
        id: `${slot.id}-${key}`,
        label,
        value: data[key],
        lowLabel: low,
        highLabel: high,
        onChange: (value) => {
          // Repondre a une question vaut enregistrement du check-in : pas de
          // bouton de validation supplementaire a aller chercher.
          write({ [key]: value, loggedAt: value === null ? data.loggedAt : new Date().toISOString() });
          refreshCheckinHeader(slot.id);
        },
      })
    );

    // Seul le moment en cours est deplie. Les trois check-ins ouverts en meme
    // temps, c'est neuf echelles a faire defiler : l'ecran "express" devenait
    // plus long que le formulaire complet qu'il devait remplacer.
    //
    // `<details>` plutot qu'un repliage maison : le navigateur fournit
    // gratuitement le clavier, l'annonce aux lecteurs d'ecran, l'etat
    // ouvert/ferme et la recherche dans la page.
    const isCurrent = slot.id === currentSlot();
    const open = isCurrent || (logged && !hasCurrentSlotLogged());

    return el(
      'details',
      {
        class: `checkin${logged ? ' is-logged' : ''}`,
        dataset: { slot: slot.id },
        open,
      },
      [
        el('summary', { class: 'checkin-head' }, [
          el('span', { class: 'checkin-name', id: `${slot.id}-title` }, slot.label),
          el(
            'span',
            {
              class: `checkin-time${logged ? ' is-logged' : ''}`,
              dataset: { role: 'time' },
            },
            logged ? summaryLine(data) : 'Pas encore note'
          ),
        ]),
        el('div', { class: 'checkin-body' }, controls.map((c) => c.node)),
      ]
    );
  }

  /** Resume d'un check-in replie : ce qui a ete note, en une ligne. */
  function summaryLine(data) {
    const parts = [];
    if (data.mood !== null && data.mood !== undefined) parts.push(`humeur ${data.mood}`);
    if (data.energy !== null && data.energy !== undefined) parts.push(`energie ${data.energy}`);
    if (data.stress !== null && data.stress !== undefined) parts.push(`stress ${data.stress}`);
    return parts.length ? parts.join(' · ') : `Note a ${formatTime(data.loggedAt)}`;
  }

  function hasCurrentSlotLogged() {
    return Boolean(store.get('mood')?.checkins?.[currentSlot()]?.loggedAt);
  }

  function refreshCheckinHeader(slotId) {
    const data = store.get('mood')?.checkins?.[slotId];
    const section = root.querySelector(`[data-slot="${slotId}"]`);
    if (!section || !data) return;
    const logged = Boolean(data.loggedAt);
    section.classList.toggle('is-logged', logged);
    const time = section.querySelector('[data-role="time"]');
    if (time) {
      time.textContent = logged ? summaryLine(data) : 'Pas encore note';
      time.classList.toggle('is-logged', logged);
    }
  }

  // ---------------------------------------------------------------- detail

  function renderDetail() {
    const sleep = store.get('sleep') || {};

    const bed = timeField({
      id: 'sleep-bed',
      label: 'Coucher',
      value: sleep.bedtime,
      onInput: (v) => {
        store.update('sleep', { bedtime: v });
        recomputeHours();
      },
    });
    const wake = timeField({
      id: 'sleep-wake',
      label: 'Lever',
      value: sleep.wake,
      onInput: (v) => {
        store.update('sleep', { wake: v });
        recomputeHours();
      },
    });
    const hours = numberField({
      id: 'sleep-hours',
      label: 'Duree',
      value: sleep.hours,
      step: 0.25,
      min: 0,
      max: 24,
      unit: 'h',
      onInput: (v) => store.update('sleep', { hours: v }),
    });

    function recomputeHours() {
      const s = store.get('sleep') || {};
      if (!s.bedtime || !s.wake) return;
      const [bh, bm] = s.bedtime.split(':').map(Number);
      const [wh, wm] = s.wake.split(':').map(Number);
      let mins = wh * 60 + wm - (bh * 60 + bm);
      if (mins < 0) mins += 1440; // on a traverse minuit
      const value = Math.round((mins / 60) * 100) / 100;
      hours.set(value);
      store.update('sleep', { hours: value });
    }

    const quality = scale({
      id: 'sleep-quality',
      label: 'Qualite du sommeil',
      value: sleep.quality,
      lowLabel: 'Mauvaise',
      highLabel: 'Excellente',
      onChange: (v) => store.update('sleep', { quality: v }),
    });

    return el('div', { class: 'card' }, [
      el('h2', { class: 'card-title' }, 'Sommeil'),
      el('div', { class: 'field-row' }, [bed.node, wake.node, hours.node]),
      quality.node,
    ]);
  }

  // ------------------------------------------------------------------ note

  function renderNote() {
    const note = store.get('note') || {};
    const field = textarea({
      id: 'note-text',
      label: 'Un mot sur ta journee',
      value: note.text || '',
      placeholder: 'Ce que tu veux en garder...',
      rows: 3,
      onInput: (value) => store.update('note', { text: value }),
    });
    return el('div', { class: 'card' }, [field.node]);
  }

  // ------------------------------------------------------------------ rendu

  function render() {
    const date = store.getDate();
    const dateObj = toDate(date);
    const isToday = date === today(store.getSettings().dayStartHour || 0);

    const header = el('header', { class: 'topbar' }, [
      el('button', {
        class: 'icon-btn',
        type: 'button',
        'aria-label': 'Jour precedent',
        onClick: () => go(-1),
      }, '←'),
      el('h1', {}, [
        isToday ? "Aujourd'hui" : formatDayLong(dateObj),
        el('span', { class: 'topbar-date' }, isToday ? formatDayLong(dateObj) : ''),
      ]),
      el('button', {
        class: 'icon-btn',
        type: 'button',
        'aria-label': 'Jour suivant',
        disabled: isFuture(addDays(date, 1)),
        onClick: () => go(1),
      }, '→'),
    ]);

    const saveState = el('div', { class: 'save-state', dataset: { role: 'save-state' } }, [
      el('span', { class: 'save-dot', 'aria-hidden': 'true' }),
      el('span', { dataset: { role: 'save-text' } }, 'Tout est enregistre automatiquement'),
    ]);

    const detailBtn = el('button', {
      class: 'btn btn-block',
      type: 'button',
      'aria-expanded': detailOpen ? 'true' : 'false',
      onClick: () => {
        detailOpen = !detailOpen;
        render();
      },
    }, detailOpen ? 'Masquer le detail' : 'Ajouter du detail');

    mount(root, [
      el('a', { class: 'skip-link', href: '#main' }, 'Aller au contenu'),
      header,
      el('main', { class: 'app', id: 'main' }, [
        el('div', { class: 'card' }, [
          el('h2', { class: 'card-title' }, 'Ta journee en bref'),
          el('p', { class: 'card-hint' }, 'Trois questions. Le detail si tu en as envie.'),
          ...CHECKIN_SLOTS.map(renderCheckin),
        ]),
        renderNote(),
        detailOpen && renderDetail(),
        detailBtn,
        el('p', { class: 'footer-note' }, [
          saveState,
          el('br'),
          "Tes donnees restent sur cet appareil. Daylog n'envoie rien, nulle part.",
        ]),
      ]),
    ]);

    // On signale le moment de la journee, sans faire defiler la page.
    //
    // Un `scrollIntoView` automatique semblait pratique, mais il deplace le
    // point de depart de la navigation au clavier : le premier Tab sautait le
    // lien d'evitement et les boutons de navigation pour atterrir au milieu de
    // la page. Deplacer le contenu sous les yeux de quelqu'un sans qu'il l'ait
    // demande est de toute facon desorientant, en particulier avec un lecteur
    // d'ecran. On se contente donc d'un repere visuel et textuel.
    if (isToday) {
      const section = root.querySelector(`[data-slot="${currentSlot()}"]`);
      if (section) {
        section.classList.add('is-current');
        const name = section.querySelector('.checkin-name');
        if (name) name.appendChild(el('span', { class: 'checkin-now' }, 'maintenant'));
      }
    }
  }

  async function go(delta) {
    const next = addDays(store.getDate(), delta);
    if (isFuture(next)) return;
    await store.loadDay(next);
    render();
  }

  // Reflete l'etat de sauvegarde sans reconstruire l'ecran.
  store.subscribe((event, detail) => {
    const box = root.querySelector('[data-role="save-state"]');
    const text = root.querySelector('[data-role="save-text"]');
    if (!box || !text) return;

    if (event === 'dirty') {
      box.classList.add('is-dirty');
      box.classList.remove('is-error');
      text.textContent = 'Enregistrement...';
    } else if (event === 'saved') {
      box.classList.remove('is-dirty', 'is-error');
      text.textContent = detail?.at ? `Enregistre a ${formatTime(detail.at)}` : 'Enregistre';
    } else if (event === 'save-error') {
      box.classList.add('is-error');
      text.textContent = "L'enregistrement a echoue. Tes donnees sont toujours a l'ecran.";
      announce("L'enregistrement a echoue.", true);
    }
  });

  return { render, go };
}
