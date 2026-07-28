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
  DURATION_UNITS,
  STRENGTH_EXERCISES,
  catalogue,
  getActivity,
  getExercise,
  moveTerms,
  toMeters,
  fromMeters,
  toMinutes,
  stepsFromDistance,
  strengthTotals,
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
  let durationUnit = 'min';
  const draft = {};
  // Exercices en cours de saisie pour la seance qu'on est en train d'ajouter.
  let drafted = [];
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
    write({ meters: null, sessions: null, restDay: null, measuredKcal: null, avgHr: null, maxHr: null });
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
    const totals = strengthTotals(session.exercises || []);
    const bits = [formatDuration(session.minutes)];
    if (typeof session.meters === 'number') {
      bits.push(`${formatNumber(fromMeters(session.meters, unit), { digits: 2 })} ${
        DISTANCE_UNITS.find((u) => u.id === unit)?.label
      }`);
    }
    if (typeof session.elevation === 'number') bits.push(`${formatNumber(session.elevation)} m D+`);
    if (totals.sets) bits.push(`${totals.sets} séries`);
    if (totals.reps) bits.push(`${totals.reps} répétitions`);
    if (totals.volumeKg) bits.push(`${formatNumber(totals.volumeKg)} kg soulevés`);

    return el('div', {}, [
      // Plus de calories sur la ligne : elles se comptent une fois, dans le
      // compteur du haut. Repetees a chaque seance, elles donnaient a un ordre
      // de grandeur l'allure d'une mesure, et transformaient un releve en
      // decompte de ce qu'on a « merite ».
      el('div', { class: 'meal-item' }, [
        el('span', { class: 'meal-item-main', style: { cursor: 'default' } }, [
          el('span', { class: 'meal-item-label' }, activity?.label || 'Activité'),
          el('span', { class: 'meal-item-qty' }, bits.join(' · ')),
        ]),
        el('button', {
          type: 'button',
          class: 'chip-remove',
          'aria-label': `Retirer ${activity?.label || 'cette séance'}`,
          onClick: () => removeSession(session.id),
        }, '×'),
      ]),
      // Le detail des exercices, replie : on le consulte rarement, mais quand
      // on le consulte c'est pour comparer a la seance precedente.
      (session.exercises || []).length > 0 &&
        el('details', { class: 'foldable' }, [
          el('summary', { class: 'foldable-head' }, [
            el('span', { class: 'foldable-note' },
              `${session.exercises.length} exercice${session.exercises.length > 1 ? 's' : ''}`
            ),
          ]),
          ...session.exercises.map((ex) =>
            el('p', { class: 'card-hint', style: { margin: '0 0 0.25rem' } },
              `${getExercise(ex.exerciseId)?.label || 'Exercice'} — ` +
                `${ex.sets ?? '?'} × ${ex.reps ?? '?'}` +
                (typeof ex.weightKg === 'number' ? ` à ${formatNumber(ex.weightKg)} kg` : '')
            )
          ),
        ]),
    ]);
  }

  /**
   * Liste deroulante avec saisie.
   *
   * Un `<select>` de trente entrees se parcourt au doigt, ligne par ligne. Ici
   * on tape trois lettres et la liste se reduit -- et elle reste entiere si on
   * ne tape rien, pour qui prefere parcourir. Meme motif que la recherche
   * d'aliments : il a fait ses preuves la-bas.
   */
  function combobox({ id, label, items, value, onPick, placeholder }) {
    const choisi = items.find((i) => i.id === value);
    const input = el('input', {
      type: 'text',
      id,
      class: 'input',
      autocomplete: 'off',
      role: 'combobox',
      'aria-expanded': 'false',
      'aria-controls': `${id}-list`,
      placeholder: placeholder || 'Tape pour chercher…',
      onInput: () => filtrer(),
      onFocus: () => filtrer(),
    });
    input.value = choisi?.label || '';

    const liste = el('div', {
      class: 'suggestions',
      id: `${id}-list`,
      role: 'listbox',
      'aria-label': label,
    });

    function filtrer() {
      const q = input.value.trim().toLowerCase();
      const trouves = items
        .filter((i) => !q || i.label.toLowerCase().includes(q) || (i.group || '').toLowerCase().includes(q))
        .slice(0, 8);
      mount(liste, trouves.map((i) =>
        el('button', {
          type: 'button',
          class: `suggestion${i.id === value ? ' is-current' : ''}`,
          role: 'option',
          'aria-selected': i.id === value ? 'true' : 'false',
          onClick: () => {
            input.value = i.label;
            mount(liste, []);
            onPick(i.id);
          },
        }, i.label)
      ));
      input.setAttribute('aria-expanded', trouves.length ? 'true' : 'false');
    }

    return el('div', { class: 'field' }, [
      el('label', { class: 'field-label', for: id }, label),
      input,
      liste,
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
    const renforcement = tracks.has('sets') || tracks.has('reps');

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

    // Duree : le nombre ET son unite. Une randonnee se compte en heures.
    const dureeInput = el('input', {
      type: 'number', id: 'activity-new-min', class: 'input', inputmode: 'decimal',
      min: '0', step: durationUnit === 'h' ? '0.25' : '1',
      placeholder: durationUnit === 'h' ? 'ex. 1,5' : 'ex. 45',
      onInput: (e) => { draft.duration = e.target.value; },
    });
    dureeInput.value = draft.duration ?? '';
    const dureeUnite = el('select', {
      class: 'input', id: 'activity-new-min-unit', 'aria-label': 'Unité de durée',
      onChange: (e) => { durationUnit = e.target.value; draw(); },
    }, DURATION_UNITS.map((u) => el('option', { value: u.id }, u.label)));
    dureeUnite.value = durationUnit;

    const distanceUnitSelect = el('select', {
      class: 'input',
      id: 'activity-new-dist-unit',
      'aria-label': 'Unité de la distance parcourue',
    }, DISTANCE_UNITS.map((u) => el('option', { value: u.id }, u.label)));
    distanceUnitSelect.value = unit;

    function submit() {
      const minutes = sanitize('minutes', toMinutes(Number(draft.duration), durationUnit));
      if (minutes.value === null) {
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
      if (tracks.has('elevation') && fields.elevation?.value) {
        const out = sanitize('elevation', fields.elevation.value);
        if (out.reason) {
          errors.set('session', { reason: 'elevation' });
          draw();
          return;
        }
        session.elevation = out.value;
      }
      // Les series, repetitions et charges viennent des exercices, jamais d'une
      // saisie globale : 4x10 a 60 kg et 3x12 a 20 kg ne se resument a aucune
      // moyenne.
      if (drafted.length) session.exercises = drafted;

      errors.delete('session');
      for (const key of Object.keys(draft)) delete draft[key];
      drafted = [];
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
      combobox({
        id: 'activity-new-kind',
        label: 'Activité',
        items: list,
        value: kind,
        onPick: (id) => {
          kind = id;
          draw();
        },
      }),
      el('div', { class: 'field' }, [
        el('label', { class: 'field-label', for: 'activity-new-min' }, 'Durée'),
        el('div', { class: 'add-row' }, [dureeInput, dureeUnite]),
      ]),
      tracks.has('distance') &&
        el('div', { class: 'field' }, [
          el('label', { class: 'field-label', for: 'activity-new-dist' }, 'Distance'),
          el('div', { class: 'add-row' }, [
            (() => {
              const node = el('input', {
                type: 'number', id: 'activity-new-dist', class: 'input',
                inputmode: 'decimal', min: '0', step: '0.01', placeholder: 'facultatif',
                onInput: (e) => { draft.distance = e.target.value; },
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

      renforcement && exerciseBlock(),

      error &&
        el('p', { class: 'field-error', role: 'status' },
          error.reason === 'minutes'
            ? 'Il faut au moins une durée.'
            : error.reason === 'duration-range'
              ? 'Daylog note une séance jusqu’à 24 heures.'
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

  /**
   * Les exercices d'une seance de renforcement.
   *
   * Le cahier des charges le demande explicitement : le nombre de repetitions
   * et le poids souleve d'une seance ne se saisissent pas globalement, ils
   * VIENNENT des exercices. La seance affiche ensuite leurs totaux -- series,
   * repetitions, volume -- et c'est le volume qui dit si une seance a ete plus
   * lourde que la precedente.
   */
  function exerciseBlock() {
    let choix = draft.exerciseId || STRENGTH_EXERCISES[0].id;
    const totals = strengthTotals(drafted);

    const champ = (name, id, label, extra = {}) => {
      const node = el('input', {
        type: 'number', id, class: 'input', inputmode: 'decimal', min: '0',
        onInput: (e) => { draft[name] = e.target.value; },
        ...extra,
      });
      node.value = draft[name] ?? '';
      return { node, wrap: el('div', { class: 'field' }, [
        el('label', { class: 'field-label', for: id }, label), node,
      ]) };
    };

    const series = champ('sets', 'activity-new-sets', 'Séries', { step: '1', placeholder: 'ex. 4' });
    const reps = champ('reps', 'activity-new-reps', 'Répétitions par série', { step: '1', placeholder: 'ex. 10' });
    const charge = champ('weight', 'activity-new-weight', 'Charge (kg)', { step: '0.5', placeholder: 'facultatif' });

    function ajouter() {
      const s = sanitize('sets', series.node.value);
      const r = sanitize('reps', reps.node.value);
      if (s.value === null || r.value === null) {
        errors.set('exercise', { reason: 'incomplete' });
        draw();
        return;
      }
      const w = sanitize('weight', charge.node.value);
      const ex = { exerciseId: choix, sets: s.value, reps: r.value };
      if (w.value !== null) ex.weightKg = w.value;
      drafted = [...drafted, ex];
      errors.delete('exercise');
      // On garde series et charge : on enchaine souvent le meme schema.
      delete draft.exerciseId;
      draw();
    }

    const erreur = errors.get('exercise');

    return el('div', { class: 'health-trend' }, [
      el('p', { class: 'health-trend-main' },
        drafted.length
          ? `${totals.sets} séries · ${totals.reps} répétitions` +
            (totals.volumeKg ? ` · ${formatNumber(totals.volumeKg)} kg soulevés` : '')
          : 'Ajoute tes exercices : les totaux de la séance en découlent.'
      ),
      ...drafted.map((ex, i) =>
        el('div', { class: 'meal-item' }, [
          el('span', { class: 'meal-item-main', style: { cursor: 'default' } }, [
            el('span', { class: 'meal-item-label' }, getExercise(ex.exerciseId)?.label || 'Exercice'),
            el('span', { class: 'meal-item-qty' },
              `${ex.sets} × ${ex.reps}` +
                (typeof ex.weightKg === 'number' ? ` à ${formatNumber(ex.weightKg)} kg` : '')
            ),
          ]),
          el('button', {
            type: 'button', class: 'chip-remove',
            'aria-label': `Retirer ${getExercise(ex.exerciseId)?.label || 'cet exercice'}`,
            onClick: () => { drafted = drafted.filter((_, j) => j !== i); draw(); },
          }, '×'),
        ])
      ),
      combobox({
        id: 'activity-new-ex',
        label: 'Exercice',
        items: STRENGTH_EXERCISES,
        value: choix,
        onPick: (id) => { choix = id; draft.exerciseId = id; },
      }),
      series.wrap,
      reps.wrap,
      charge.wrap,
      erreur && el('p', { class: 'field-error', role: 'status' },
        'Il faut au moins des séries et des répétitions.'
      ),
      el('div', { class: 'card-actions' }, [
        el('button', { type: 'button', class: 'btn btn-sm', onClick: ajouter }, 'Ajouter l’exercice'),
      ]),
    ]);
  }

  /**
   * Ce que la montre a mesure.
   *
   * N'apparait que si un appareil a ete declare. Pour tous les autres, ces
   * champs seraient invitables a remplir et impossibles a renseigner -- la
   * regle tenue depuis le debut : pas de champ qu'on ne pourrait pas remplir.
   *
   * Ces valeurs-la sont des MESURES. Quand elles existent, elles priment sur
   * l'estimation par les METs, qui n'est qu'un ordre de grandeur : personne ne
   * prefere une formule a un capteur.
   */
  function wearableBlock() {
    if (!capabilities.wearable) return null;
    const current = data();

    const champ = (key, id, label, unite, extra = {}) => {
      const node = el('input', {
        type: 'number', id, class: 'input', inputmode: 'numeric', min: '0', ...extra,
      });
      node.value = current[key] ?? '';
      const submit = () => {
        const raw = node.value === '' ? null : Number(node.value);
        write({ [key]: Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : null });
        draw();
      };
      node.addEventListener('change', submit);
      node.addEventListener('blur', submit);
      return el('div', { class: 'field' }, [
        el('label', { class: 'field-label', for: id }, label),
        el('div', { class: 'input-row' }, [node, el('span', { class: 'input-unit' }, unite)]),
      ]);
    };

    const details = el('details', { class: 'foldable' }, [
      el('summary', { class: 'foldable-head' }, [
        el('span', { class: 'field-label' }, 'Relevé de ta montre'),
        el('span', { class: `foldable-note${typeof current.measuredKcal === 'number' ? ' is-set' : ''}` },
          typeof current.measuredKcal === 'number'
            ? `${formatNumber(current.measuredKcal)} kcal mesurées`
            : 'Rien de noté'
        ),
      ]),
      champ('measuredKcal', 'activity-w-kcal', 'Calories actives mesurées', 'kcal', { max: '20000' }),
      champ('avgHr', 'activity-w-hr', 'Fréquence cardiaque moyenne', 'bpm', { max: '230' }),
      champ('maxHr', 'activity-w-hrmax', 'Fréquence cardiaque maximale', 'bpm', { max: '230' }),
      el('p', { class: 'card-hint', style: { marginBottom: '0' } },
        'Ce que ta montre a mesuré passe devant l’estimation de Daylog : une ' +
          'formule ne vaut pas un capteur. Ces chiffres ne s’ajoutent à aucune ' +
          'cible non plus.'
      ),
    ]);
    return details;
  }

  function draw() {
    const current = data();
    const sessions = current.sessions || [];
    const totals = dayTotals(current, bodyWeight());
    const rest = current.restDay === true;
    const mesure = typeof current.measuredKcal === 'number' ? current.measuredKcal : null;

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

      // Le compteur, et un seul. Une mesure de montre passe devant
      // l'estimation : personne ne prefere une formule a un capteur.
      (mesure !== null || totals.activeKcal !== null) &&
        el('div', { class: 'health-trend' }, [
          el('p', { class: 'health-trend-main' },
            mesure !== null
              ? `${formatNumber(mesure)} kcal actives, d’après ta montre.`
              : `Environ ${formatNumber(totals.activeKcal)} kcal actives.`
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

      wearableBlock(),

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
