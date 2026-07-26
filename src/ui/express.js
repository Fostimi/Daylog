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
import { topbar } from './menu.js';
import { scale, textarea } from './controls.js';
import { CHECKIN_SLOTS, createCheckin } from '../modules/index.js';
import { enabledModules } from '../core/modules.js';
import { formatDayLong, formatTime } from '../core/i18n.js';
import { toDate, today, addDays, isFuture } from '../core/date.js';
import { backupUrgency, daysSinceBackup } from '../core/backup.js';
import * as db from '../core/db.js';

export function createExpressView({ store, root, go }) {
  let backupLevel = null; // null | 'due' | 'overdue'

  /** Le rappel est evalue une fois par ouverture, pas a chaque rendu. */
  async function refreshBackupNeed() {
    try {
      const totalDays = await db.countDays();
      backupLevel = backupUrgency(store.getSettings(), { totalDays });
    } catch {
      backupLevel = null;
    }
  }

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

    // Les reperes sont prefixes de leur valeur a l'affichage ("1 au plus bas"),
    // d'ou l'absence de majuscule ici.
    const controls = [
      ['mood', 'Humeur', 'au plus bas', 'au top'],
      ['energy', 'Énergie', 'vide', 'plein'],
      ['stress', 'Stress', 'serein', 'sous pression'],
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
            logged ? summaryLine(data) : 'Pas encore noté'
          ),
        ]),
        el('div', { class: 'checkin-body' }, [
          ...controls.map((c) => c.node),
          // Note courte, propre a ce moment de la journee. Elle repond a un
          // besoin different de la note du jour : celle-ci capte l'instant
          // (« reunion tendue », « bien dormi »), l'autre fait le bilan.
          noteField(slot, data, write),
          el('p', {
            class: 'checkin-stamp',
            dataset: { role: 'stamp' },
          }, stampLine(data)),
        ]),
      ]
    );
  }

  /** Champ de note courte d'un check-in. */
  function noteField(slot, data, write) {
    const input = el('input', {
      type: 'text',
      id: `${slot.id}-note`,
      class: 'input',
      maxlength: '140',
      placeholder: 'Un mot sur ce moment…',
      onInput: (e) => {
        const value = e.target.value.trim() || null;
        write({
          note: value,
          // Ecrire une note vaut enregistrement du check-in, comme repondre a
          // une echelle : on ne demande pas de valider quoi que ce soit.
          loggedAt: value === null ? data.loggedAt : new Date().toISOString(),
        });
        refreshCheckinHeader(slot.id);
      },
    });
    input.value = data.note || '';
    return el('div', { class: 'field' }, [
      el('label', { class: 'field-label', for: `${slot.id}-note` }, 'Note du moment'),
      input,
    ]);
  }

  /**
   * Horodatage du check-in.
   *
   * Il se met a jour a chaque modification : ce qui compte est de savoir quand
   * remonte l'information affichee, pas quand on a repondu la premiere fois.
   */
  function stampLine(data) {
    if (!data?.loggedAt) return '';
    return `Noté à ${formatTime(data.loggedAt)}`;
  }

  /** Resume d'un check-in replie : ce qui a ete note, en une ligne. */
  function summaryLine(data) {
    const parts = [];
    if (data.mood !== null && data.mood !== undefined) parts.push(`humeur ${data.mood}`);
    if (data.energy !== null && data.energy !== undefined) parts.push(`énergie ${data.energy}`);
    if (data.stress !== null && data.stress !== undefined) parts.push(`stress ${data.stress}`);
    if (!parts.length && data.note) return data.note;
    return parts.length ? parts.join(' · ') : `Noté à ${formatTime(data.loggedAt)}`;
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
      time.textContent = logged ? summaryLine(data) : 'Pas encore noté';
      time.classList.toggle('is-logged', logged);
    }
    const stamp = section.querySelector('[data-role="stamp"]');
    if (stamp) stamp.textContent = stampLine(data);
  }

  // ------------------------------------------------------------------ note

  function renderNote() {
    const note = store.get('note') || {};
    const field = textarea({
      id: 'note-text',
      label: 'Un mot sur ta journée',
      value: note.text || '',
      placeholder: 'Ce que tu veux en garder…',
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

    const header = topbar({
      title: isToday ? "Aujourd'hui" : formatDayLong(dateObj),
      subtitle: isToday ? formatDayLong(dateObj) : null,
      current: 'today',
      go,
      alert: backupLevel,
      before: [
        el('button', {
          class: 'icon-btn',
          type: 'button',
          'aria-label': 'Jour précédent',
          onClick: () => goDay(-1),
        }, '←'),
        el('button', {
          class: 'icon-btn',
          type: 'button',
          'aria-label': 'Jour suivant',
          disabled: isFuture(addDays(date, 1)),
          onClick: () => goDay(1),
        }, '→'),
      ],
    });

    const saveState = el('div', { class: 'save-state', dataset: { role: 'save-state' } }, [
      el('span', { class: 'save-dot', 'aria-hidden': 'true' }),
      el('span', { dataset: { role: 'save-text' } }, 'Tout est enregistré automatiquement'),
    ]);

    // Emplacement des modules actifs. Ils sont ajoutes apres coup, une fois leur
    // ecran telecharge, pour que la saisie du jour soit utilisable
    // immediatement sans attendre quoi que ce soit.
    const modulesSlot = el('div', { dataset: { role: 'modules' } });

    mount(root, [
      el('a', { class: 'skip-link', href: '#main' }, 'Aller au contenu'),
      header,
      el('main', { class: 'app', id: 'main' }, [
        backupBanner(),
        el('div', { class: 'card' }, [
          el('h2', { class: 'card-title' }, 'Ta journée en bref'),
          el('p', { class: 'card-hint' }, 'Trois questions. Le détail si tu en as envie.'),
          ...CHECKIN_SLOTS.map(renderCheckin),
        ]),
        renderNote(),
        modulesSlot,
        el('p', { class: 'footer-note' }, [
          saveState,
          el('br'),
          "Tes données restent sur cet appareil. Daylog n'envoie rien, nulle part.",
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

    renderModules(modulesSlot);
  }

  /**
   * Bandeau de rappel de sauvegarde.
   *
   * Un bandeau discret, jamais une fenetre modale. En local-first il n'existe
   * aucun filet automatique : perdre son telephone, c'est tout perdre. Ce
   * rappel est donc une vraie fonction de securite, pas une relance
   * commerciale -- et il ne s'affiche pas avant qu'il y ait quelque chose a
   * perdre.
   */
  function backupBanner() {
    if (!backupLevel) return null;
    const since = daysSinceBackup(store.getSettings().lastBackupAt);
    const urgent = backupLevel === 'overdue';
    return el('div', { class: `banner${urgent ? ' is-urgent' : ''}` }, [
      el('p', {}, [
        since === null
          ? "Tu n'as jamais fait de sauvegarde. "
          : `Dernière sauvegarde il y a ${since} jours. `,
        urgent
          ? 'Ça commence à faire long — tes notes ne sont que sur cet appareil.'
          : 'Tes notes ne sont que sur cet appareil.',
      ]),
      el('button', {
        class: 'btn btn-sm',
        type: 'button',
        onClick: () => go('data'),
      }, 'Sauvegarder'),
    ]);
  }

  /**
   * Affiche les modules actifs sous la saisie du jour.
   *
   * Chaque ecran de module est telecharge a la demande : un module desactive ne
   * coute rien du tout. C'est ce qui permet a l'application de rester legere
   * quel que soit le nombre de suivis disponibles -- quelqu'un qui ne note que
   * son humeur charge une fraction de ce que charge quelqu'un qui suit tout.
   *
   * Un module qui echoue a se charger n'empeche jamais le reste de fonctionner.
   */
  async function renderModules(slot) {
    const active = enabledModules(store.getModuleState(), store.getCapabilities()).filter(
      (m) => typeof m.view === 'function'
    );

    for (const mod of active) {
      try {
        const { render: renderView } = await mod.view();
        const node = await renderView({ store });
        // L'ecran a pu changer pendant le telechargement (changement de jour) :
        // on n'insere que si l'emplacement est toujours dans la page.
        if (slot.isConnected) slot.appendChild(node);
      } catch (error) {
        console.error(`[daylog] module ${mod.id}`, error);
      }
    }
  }

  async function goDay(delta) {
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
      text.textContent = 'Enregistrement…';
    } else if (event === 'saved') {
      box.classList.remove('is-dirty', 'is-error');
      text.textContent = detail?.at ? `Enregistré à ${formatTime(detail.at)}` : 'Enregistré';
    } else if (event === 'save-error') {
      box.classList.add('is-error');
      text.textContent = "L'enregistrement a échoué. Tes données sont toujours à l'écran.";
      announce("L'enregistrement a échoué.", true);
    }
  });

  return { render, goDay, refreshBackupNeed };
}
