/**
 * Activite physique.
 *
 * Trois choses que cet ecran ne fait jamais, et qui expliquent presque toutes
 * ses formes :
 *
 * 1. IL N'OUVRE AUCUN CREDIT. Les calories d'une seance s'affichent, et ne
 *    s'ajoutent a aucune cible. Le facteur d'activite du profil les compte
 *    deja ; les additionner ferait manger deux fois la meme seance. Le texte
 *    du bas le dit, parce que c'est exactement ce que tout le monde suppose
 *    d'une application de suivi -- et l'y laisser croire en silence serait
 *    pire que de ne rien afficher.
 *
 * 2. IL NE FELICITE NI NE RECLAME. Pas de serie, pas d'objectif hebdomadaire,
 *    pas de « il te manque 2 000 pas ». Un jour de repos se coche, et c'est une
 *    reponse, pas un aveu.
 *
 * 3. IL NE RANGE PERSONNE. La mobilite declaree change l'ordre du catalogue et
 *    le mot employe -- « pas » ou « poussées » -- jamais ce qui est accessible.
 *    Tout le catalogue reste ouvert a tout le monde.
 *
 * Cet ecran n'est telecharge que si le module est actif.
 */

import { el, mount } from '../../ui/dom.js';
import { info } from '../../ui/controls.js';
import { newId } from '../../core/ids.js';
import { formatNumber, formatDuration } from '../../core/i18n.js';
import {
  DISTANCE_UNITS,
  catalogue,
  getActivity,
  moveTerms,
  toMeters,
  fromMeters,
  stepsFromDistance,
  sessionCalories,
  dayTotals,
  sanitize,
} from '../../core/activity.js';

export async function render({ store }) {
  const container = el('div', { class: 'card' });
  const capabilities = store.getCapabilities() || {};
  const mobility = capabilities.mobility || null;
  const terms = moveTerms(mobility);
  const list = catalogue(mobility);

  // Unite de distance : demandee une fois, retenue. Le systeme imperial est un
  // choix explicite, jamais deduit d'une langue ou d'un fuseau.
  let unit = DISTANCE_UNITS.some((u) => u.id === capabilities.distanceUnit)
    ? capabilities.distanceUnit
    : 'km';

  // Etat du formulaire d'ajout, purement local : rien de tout cela n'est une
  // donnee de suivi.
  //
  // `formOpen` et `draft` existent parce que changer d'activite redessine la
  // carte -- les champs proposes en dependent. Sans eux, choisir « Musculation »
  // refermait le formulaire et effacait la duree deja tapee, juste avant de
  // demander les series et les repetitions. C'est le meme piege que le bloc des
  // symptomes du cycle, qui se refermait sous le doigt.
  let kind = list[0]?.id || 'walk';
  let formOpen = false;
  const draft = {};
  const errors = new Map();

  function data() {
    return store.get('activity') || {};
  }

  function bodyWeight() {
    return store.getProfile()?.body?.weightKg ?? null;
  }

  function height() {
    return store.getProfile()?.body?.heightCm ?? null;
  }

  // ---------------------------------------------------------------- ecriture

  function write(patch) {
    store.update('activity', patch);
  }

  function setMove(raw) {
    if (raw === '' || raw === null) {
      errors.delete('move');
      write({ meters: null });
      draw();
      return;
    }
    const meters = toMeters(Number(raw), unit);
    const out = sanitize('meters', meters);
    if (out.reason) {
      errors.set('move', out);
      draw();
      return;
    }
    errors.delete('move');
    write({ meters: out.value });
    draw();
  }

  async function setUnit(next) {
    unit = next;
    capabilities.distanceUnit = next;
    await store.setCapabilities({ distanceUnit: next });
    draw();
  }

  function toggleRest() {
    // Trois etats, et non deux : coche (repos), decoche apres avoir coche
    // (« non, j'ai bougé »), et jamais touche. Seul le dernier est un silence.
    write({ restDay: data().restDay === true ? null : true });
    draw();
  }

  function addSession(session) {
    write({ sessions: [...(data().sessions || []), session] });
    draw();
  }

  function removeSession(id) {
    const next = (data().sessions || []).filter((s) => s.id !== id);
    write({ sessions: next.length ? next : null });
    draw();
  }

  function clearDay() {
    errors.clear();
    write({ meters: null, sessions: null, restDay: null });
    draw();
  }

  // ------------------------------------------------------------------ rendu

  /** Deplacement du jour, avec son equivalent en pas quand il est calculable. */
  function moveBlock() {
    const meters = data().meters;
    const shown = typeof meters === 'number' ? fromMeters(meters, unit) : null;
    const error = errors.get('move');

    const input = el('input', {
      type: 'number',
      id: 'activity-move',
      class: 'input',
      inputmode: 'decimal',
      step: '0.01',
      min: '0',
      placeholder: '—',
    });
    input.value = shown === null ? '' : String(Math.round(shown * 100) / 100);
    const submit = () => setMove(input.value);
    input.addEventListener('change', submit);
    input.addEventListener('blur', submit);

    const unitSelect = el('select', {
      class: 'input',
      id: 'activity-move-unit',
      'aria-label': 'Unité de distance',
      onChange: (e) => setUnit(e.target.value),
    }, DISTANCE_UNITS.map((u) => el('option', { value: u.id }, u.label)));
    unitSelect.value = unit;

    const steps = terms.counts ? stepsFromDistance(meters, height()) : null;

    return el('div', { class: 'field' }, [
      el('label', { class: 'field-label', for: 'activity-move' }, terms.label),
      el('div', { class: 'add-row' }, [input, unitSelect]),
      error &&
        el('p', { class: 'field-error', role: 'status' },
          error.reason === 'nan'
            ? 'Il faut un nombre.'
            : 'Daylog note une distance jusqu’à 500 km par jour.'
        ),
      steps !== null &&
        el('p', { class: 'card-hint', style: { marginTop: '0.375rem', marginBottom: '0' } },
          `Environ ${formatNumber(steps)} ${steps > 1 ? terms.unit : terms.one}, ` +
            'd’après ta taille.'
        ),
    ]);
  }

  /** Une seance enregistree. */
  function sessionRow(session) {
    const activity = getActivity(session.activityId);
    const kcal = sessionCalories(session, bodyWeight());
    const bits = [formatDuration(session.minutes)];
    if (typeof session.meters === 'number') {
      bits.push(`${formatNumber(fromMeters(session.meters, unit), { digits: 2 })} ${
        DISTANCE_UNITS.find((u) => u.id === unit)?.label
      }`);
    }
    if (typeof session.sets === 'number' && typeof session.reps === 'number') {
      bits.push(`${session.sets} × ${session.reps}`);
    }
    if (typeof session.weightKg === 'number') bits.push(`${formatNumber(session.weightKg)} kg`);
    if (typeof session.elevation === 'number') bits.push(`${formatNumber(session.elevation)} m D+`);

    return el('div', { class: 'meal-item' }, [
      el('span', { class: 'meal-item-main', style: { cursor: 'default' } }, [
        el('span', { class: 'meal-item-label' }, activity?.label || 'Activité'),
        el('span', { class: 'meal-item-qty' }, bits.join(' · ')),
      ]),
      kcal !== null && el('span', { class: 'meal-item-kcal' }, `${formatNumber(kcal)} kcal`),
      el('button', {
        type: 'button',
        class: 'chip-remove',
        'aria-label': `Retirer ${activity?.label || 'cette séance'}`,
        onClick: () => removeSession(session.id),
      }, '×'),
    ]);
  }

  /**
   * Formulaire d'ajout.
   *
   * Les champs proposes dependent de l'activite choisie : une seance de
   * natation n'a pas de denivele, une seance de musculation pas de distance.
   * Les six champs pour tout le monde feraient un formulaire que personne ne
   * remplirait deux fois.
   */
  function addForm() {
    const activity = getActivity(kind) || list[0];
    const tracks = new Set(activity?.tracks || ['duration']);

    const kindSelect = el('select', {
      class: 'input',
      id: 'activity-new-kind',
      onChange: (e) => {
        kind = e.target.value;
        draw();
      },
    }, groupOptions());
    kindSelect.value = kind;

    const fields = {};
    const numberInput = (name, id, label, extra = {}) => {
      const node = el('input', {
        type: 'number',
        id,
        class: 'input',
        inputmode: 'decimal',
        min: '0',
        onInput: (e) => {
          draft[name] = e.target.value;
        },
        ...extra,
      });
      node.value = draft[name] ?? '';
      fields[name] = node;
      return el('div', { class: 'field' }, [
        el('label', { class: 'field-label', for: id }, label),
        node,
      ]);
    };

    const distanceUnitSelect = el('select', {
      class: 'input',
      id: 'activity-new-dist-unit',
      'aria-label': 'Unité de la distance parcourue',
    }, DISTANCE_UNITS.map((u) => el('option', { value: u.id }, u.label)));
    distanceUnitSelect.value = unit;

    function submit() {
      const minutes = sanitize('minutes', fields.minutes.value);
      if (minutes.value === null) {
        // On distingue « pas de durée » de « durée impossible » : les deux
        // demandent un geste different, et un message unique enverrait
        // chercher au mauvais endroit.
        errors.set('session', { reason: minutes.reason === 'range' ? 'duration-range' : 'minutes' });
        draw();
        return;
      }

      const session = { id: newId('ses'), activityId: activity.id, minutes: minutes.value };

      if (tracks.has('distance') && fields.distance?.value) {
        const meters = sanitize('meters', toMeters(Number(fields.distance.value), distanceUnitSelect.value));
        if (meters.reason) {
          errors.set('session', { reason: 'distance' });
          draw();
          return;
        }
        session.meters = meters.value;
      }
      for (const [name, field] of [
        ['elevation', 'elevation'],
        ['sets', 'sets'],
        ['reps', 'reps'],
        ['weight', 'weightKg'],
      ]) {
        if (!tracks.has(name) || !fields[name]?.value) continue;
        const out = sanitize(name, fields[name].value);
        if (out.reason) {
          errors.set('session', { reason: name });
          draw();
          return;
        }
        session[field] = out.value;
      }

      errors.delete('session');
      // La seance est enregistree : le brouillon repart de zero, mais le
      // formulaire reste ouvert -- on en enchaine souvent deux.
      for (const key of Object.keys(draft)) delete draft[key];
      addSession(session);
    }

    const error = errors.get('session');

    const details = el('details', {
      class: 'foldable',
      open: formOpen,
      onToggle: () => {
        formOpen = details.open;
      },
    }, [
      el('summary', { class: 'foldable-head' }, [
        el('span', { class: 'field-label' }, 'Ajouter une séance'),
        el('span', { class: 'foldable-note' }, activity?.label || ''),
      ]),
      el('div', { class: 'field' }, [
        el('label', { class: 'field-label', for: 'activity-new-kind' }, 'Activité'),
        kindSelect,
      ]),
      numberInput('minutes', 'activity-new-min', 'Durée (minutes)', { step: '1', placeholder: 'ex. 45' }),
      tracks.has('distance') &&
        el('div', { class: 'field' }, [
          el('label', { class: 'field-label', for: 'activity-new-dist' }, 'Distance'),
          el('div', { class: 'add-row' }, [
            (() => {
              const node = el('input', {
                type: 'number', id: 'activity-new-dist', class: 'input',
                inputmode: 'decimal', min: '0', step: '0.01', placeholder: 'facultatif',
                onInput: (e) => {
                  draft.distance = e.target.value;
                },
              });
              node.value = draft.distance ?? '';
              fields.distance = node;
              return node;
            })(),
            distanceUnitSelect,
          ]),
        ]),
      tracks.has('elevation') &&
        numberInput('elevation', 'activity-new-elev', 'Dénivelé positif (mètres)', { step: '1', placeholder: 'facultatif' }),
      tracks.has('sets') &&
        numberInput('sets', 'activity-new-sets', 'Séries', { step: '1', placeholder: 'facultatif' }),
      tracks.has('reps') &&
        numberInput('reps', 'activity-new-reps', 'Répétitions par série', { step: '1', placeholder: 'facultatif' }),
      tracks.has('weight') &&
        numberInput('weight', 'activity-new-weight', 'Charge (kg)', { step: '0.5', placeholder: 'facultatif' }),

      error &&
        el('p', { class: 'field-error', role: 'status' },
          error.reason === 'minutes'
            ? 'Il faut au moins une durée, en minutes.'
            : error.reason === 'duration-range'
              ? 'Daylog note une séance jusqu’à 24 heures, soit 1 440 minutes.'
              : 'Une des valeurs sort de ce que Daylog sait enregistrer.'
        ),

      el('div', { class: 'card-actions' }, [
        el('button', { type: 'button', class: 'btn btn-primary', onClick: submit },
          'Ajouter la séance'
        ),
      ]),
    ]);

    return details;
  }

  /** Le catalogue, groupe, dans l'ordre que la mobilite declaree a fixe. */
  function groupOptions() {
    const seen = [];
    for (const activity of list) {
      let group = seen.find((g) => g.label === activity.group);
      if (!group) {
        group = { label: activity.group, items: [] };
        seen.push(group);
      }
      group.items.push(activity);
    }
    return seen.map((g) =>
      el('optgroup', { label: g.label }, g.items.map((a) => el('option', { value: a.id }, a.label)))
    );
  }

  function draw() {
    const current = data();
    const sessions = current.sessions || [];
    const totals = dayTotals(current, bodyWeight());
    const rest = current.restDay === true;

    const detail = info({
      id: 'activity-kcal-info',
      label: 'À quoi servent ces calories',
      text: [
        'Elles ne s’ajoutent à aucune cible, et c’est voulu. Le niveau d’activité ' +
          'de ton profil — « une semaine ordinaire, ça ressemble à quoi ? » — ' +
          'contient déjà tes séances. Les additionner reviendrait à compter la ' +
          'même dépense deux fois, et à te proposer de manger davantage pour une ' +
          'séance déjà prise en compte. ',
        'Le chiffre est un ordre de grandeur : la même séance vaut du simple au ' +
          'double selon l’intensité, et il est calculé à partir de ton poids et ' +
          'de la durée. ',
        'Si tu veux que tes séances pèsent vraiment sur ton estimation, c’est le ' +
          'recalage sur tes pesées qui s’en charge — lui les compte, sans jamais ' +
          'rien additionner à la main.',
      ],
    });

    mount(container, [
      el('div', { class: 'card-head' }, [
        el('h2', { class: 'card-title' }, 'Bouger'),
        // Le « i » est ici et non dans le bloc des calories : celui-la
        // n'apparait qu'une fois une seance notee ET un poids connu, donc
        // jamais le premier jour -- au moment precis ou l'on se demande a quoi
        // servent ces chiffres.
        detail.button,
        // Ce qui a ete fait passe avant la case cochee. « Jour de repos » au-dessus
        // d'une seance de 45 minutes se contredirait -- et rien n'interdit de se
        // reposer de l'entrainement tout en ayant marche.
        el('span', { class: 'card-count' },
          totals.minutes
            ? formatDuration(totals.minutes)
            : totals.meters
              ? `${formatNumber(fromMeters(totals.meters, unit), { digits: 2 })} ${DISTANCE_UNITS.find((u) => u.id === unit)?.label}`
              : rest
                ? 'Jour de repos'
                : 'Non renseigné'
        ),
      ]),

      // Le repos vient en premier : c'est le geste le plus rapide, et le seul
      // que quelqu'un ouvre l'application pour faire un jour ou il n'a rien
      // fait. Le mettre en bas reviendrait a lui faire traverser tout l'ecran
      // de ce qu'il n'a pas fait.
      el('label', { class: 'onb-option', for: 'activity-rest' }, [
        el('input', {
          type: 'checkbox',
          id: 'activity-rest',
          class: 'onb-input',
          checked: rest,
          onChange: toggleRest,
        }),
        el('span', { class: 'onb-option-text' }, [
          el('span', { class: 'onb-option-label' }, 'Jour de repos'),
          el('span', { class: 'onb-option-hint' }, 'Une réponse comme une autre.'),
        ]),
      ]),

      moveBlock(),

      sessions.length
        ? el('div', {}, sessions.map(sessionRow))
        : null,

      detail.panel,

      totals.activeKcal !== null &&
        el('div', { class: 'health-trend' }, [
          el('p', { class: 'health-trend-main' },
            `Environ ${formatNumber(totals.activeKcal)} kcal actives.`
          ),
          el('p', { class: 'card-hint', style: { margin: '0.375rem 0 0' } },
            'Elles ne s’ajoutent à aucune cible.'
          ),
        ]),

      sessions.length > 0 && totals.activeKcal === null && bodyWeight() === null &&
        el('p', { class: 'card-hint' },
          'Renseigne ton poids dans ton profil pour voir un ordre de grandeur en calories.'
        ),

      addForm(),

      (sessions.length > 0 || typeof current.meters === 'number' || current.restDay != null) &&
        el('div', { class: 'card-actions' }, [
          el('button', { type: 'button', class: 'btn btn-sm', onClick: clearDay },
            'Effacer la saisie du jour'
          ),
        ]),
    ]);
  }

  draw();
  return container;
}
