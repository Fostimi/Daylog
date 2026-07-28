/**
 * Sante et traitements.
 *
 * L'ecran le plus long de l'application par le nombre de choses qu'il peut
 * contenir, et pourtant celui qui doit rester le plus court a l'usage. La
 * tension se resout en une seule decision, prise une fois :
 *
 *   ON N'AFFICHE QUE CE QUE LA PERSONNE A DIT MESURER.
 *
 * Le cahier des charges enumere temperature, tension, oxygenation, trois
 * frequences cardiaques, poids, masse grasse, douleur, digestion, symptomes et
 * traitements. Quelqu'un qui suit une tension a la suite d'une ordonnance note
 * deux nombres par jour ; lui en presenter treize garantit qu'il abandonne
 * avant la fin de la semaine. La liste se choisit dans « Ce que je note », en
 * bas de la carte, et nulle part ailleurs -- surtout pas dans les reglages
 * generaux, ou personne ne penserait a la chercher.
 *
 * Ce que cet ecran ne fait jamais :
 *
 * - il ne qualifie aucun chiffre. Ni « normal », ni « élevé », ni couleur
 *   d'alerte. Daylog ne sait pas ce qu'une tension a 14/9 signifie pour
 *   quelqu'un dont il ignore l'age, le traitement et les antecedents ;
 * - il ne signale aucun oubli de traitement. Une prise notee est une
 *   information ; une prise non notee n'en est pas une, et transformer un
 *   blanc en reproche serait exactement ce que l'application refuse ailleurs ;
 * - il ne corrige rien tout seul. Une saisie invraisemblable est refusee et
 *   expliquee, jamais ramenee a la borne la plus proche.
 *
 * Cet ecran n'est telecharge que si le module est actif.
 */

import { el, mount } from '../../ui/dom.js';
import { info, scale, numberField } from '../../ui/controls.js';
import * as db from '../../core/db.js';
import { addDays } from '../../core/date.js';
import { formatDayMonth, formatNumber } from '../../core/i18n.js';
import { createListItem, activeItems } from '../../core/ids.js';
import {
  MEASURES,
  PAIN_SITES,
  DIGESTION,
  SYMPTOMS,
  DOSE_UNITS,
  MOMENTS,
  getMeasure,
  suggestedMeasures,
  sanitizeMeasure,
  sanitizeBloodPressure,
  weightTrend,
  shouldAdoptWeight,
  doseAt,
  recentDoseChange,
  sortTreatments,
  takeDose,
  formatDose,
} from '../../core/health.js';

const KIND = 'treatment';

/** Profondeur d'historique lue pour la tendance de poids : un peu plus d'un an. */
const HISTORY_DAYS = 400;

export async function render({ store }) {
  const container = el('div', {});
  const date = store.getDate();
  const capabilities = store.getCapabilities() || {};

  let treatments = [];
  try {
    treatments = await db.getList(KIND);
  } catch {
    treatments = [];
  }

  let history = [];
  try {
    history = await db.getSummaries(addDays(date, -HISTORY_DAYS), date);
  } catch {
    history = [];
  }

  // Ce que la personne a dit mesurer. Absent = elle n'a pas encore choisi, et
  // on part de ce qui a du sens compte tenu de son materiel declare.
  let tracks = Array.isArray(capabilities.healthTracks)
    ? capabilities.healthTracks.filter((id) => getMeasure(id))
    : suggestedMeasures({ wearable: capabilities.wearable });

  // Messages de refus de saisie, par champ. Ils vivent le temps d'un rendu :
  // corriger le champ les fait disparaitre.
  const errors = new Map();

  // Etat d'ouverture des blocs replies. `null` = on suit ce qui est note.
  const open = { pain: null, digestion: null, symptoms: null };

  function data() {
    return store.get('health') || {};
  }

  // ---------------------------------------------------------------- ecriture

  function write(patch) {
    store.update('health', patch);
  }

  /**
   * Enregistre une pesee, et tient a jour le poids de reference du profil.
   *
   * Le cahier des charges demande que le poids saisi une fois au profil soit
   * ensuite entretenu par le suivi quotidien. La regle de sauvegarde est dans
   * `core/health.js` : completer une journee oubliee ne doit pas faire reculer
   * la reference sur laquelle reposent les calculs de nutrition.
   */
  async function saveWeight(kg) {
    write({ weight: kg });
    if (kg === null) return;
    const profile = store.getProfile() || {};
    const body = profile.body || {};
    if (!shouldAdoptWeight(date, body.weightMeasuredAt)) return;
    await store.setProfile({
      ...profile,
      body: { ...body, weightKg: kg, weightMeasuredAt: `${date}T12:00:00.000Z` },
    });
  }

  function setMeasure(id, raw) {
    const out = sanitizeMeasure(id, raw);
    if (out.reason) {
      errors.set(id, out);
      draw();
      return;
    }
    errors.delete(id);
    if (id === 'weight') saveWeight(out.value);
    else write({ [id]: out.value });
    draw();
  }

  function setBloodPressure(systolic, diastolic) {
    const out = sanitizeBloodPressure(systolic, diastolic);
    // Une tension a moitie saisie n'est pas une erreur : c'est quelqu'un qui
    // est en train de taper le second nombre. On attend, sans rien dire.
    if (out.reason === 'incomplete') {
      errors.delete('bp');
      return;
    }
    if (out.reason) {
      errors.set('bp', out);
      draw();
      return;
    }
    errors.delete('bp');
    write({ bp: out.value });
    draw();
  }

  function togglePainSite(id) {
    const pain = data().pain || {};
    const sites = new Set(pain.sites || []);
    if (sites.has(id)) sites.delete(id);
    else sites.add(id);
    write({ pain: { ...pain, sites: [...sites] } });
    draw();
  }

  function setPainLevel(level) {
    const pain = data().pain || {};
    write({ pain: { ...pain, level } });
    draw();
  }

  /**
   * Bascule un element d'une liste de cases.
   *
   * « Rien à signaler » est exclusif du reste : cocher un ballonnement apres
   * avoir dit que tout allait bien decrit deux journees differentes, et laisser
   * les deux coches ne voudrait rien dire.
   */
  function toggleChip(key, id, { exclusive = null } = {}) {
    const current = new Set(data()[key] || []);
    if (current.has(id)) current.delete(id);
    else {
      if (exclusive && id === exclusive) current.clear();
      else if (exclusive) current.delete(exclusive);
      current.add(id);
    }
    write({ [key]: [...current] });
    draw();
  }

  async function setTracks(id, on) {
    const next = on ? [...new Set([...tracks, id])] : tracks.filter((t) => t !== id);
    tracks = next;
    capabilities.healthTracks = next;
    await store.setCapabilities({ healthTracks: next });
    draw();
  }

  // ------------------------------------------------------------ traitements

  function taken() {
    return data().doses || [];
  }

  async function reloadTreatments() {
    treatments = await db.getList(KIND);
  }

  async function addTreatment({ label, dose, unit, moments }) {
    const clean = (label || '').trim();
    if (!clean) return;
    const item = createListItem(KIND, clean, {
      dose,
      unit: unit || null,
      moments: moments || [],
      // Le premier enregistrement date la dose de depart. Sans lui, un
      // changement ulterieur ferait croire que la nouvelle dose a toujours ete
      // celle-la.
      doseHistory: [{ at: new Date().toISOString(), dose, unit: unit || null }],
    });
    await db.putListItem(item);
    await reloadTreatments();
    draw();
  }

  /**
   * Change la dose d'un traitement.
   *
   * On empile un enregistrement date plutot que d'ecraser la valeur : c'est ce
   * qui permet de relire un suivi de traitement evolutif -- le cas du TDAH cite
   * par le cahier des charges -- et de savoir a quelle dose correspondait quel
   * ressenti.
   */
  async function changeDose(item, dose, unit) {
    const next = { ...item, dose, unit: unit || item.unit || null };
    next.doseHistory = [
      ...(item.doseHistory || []),
      { at: new Date().toISOString(), dose, unit: next.unit },
    ];
    await db.putListItem(next);
    await reloadTreatments();
    draw();
  }

  async function archiveTreatment(item) {
    await db.putListItem({ ...item, archivedAt: new Date().toISOString() });
    await reloadTreatments();
    // La prise du jour disparait avec lui, mais les journees deja enregistrees
    // gardent la leur : elles portent leurs propres valeurs figees.
    write({ doses: taken().filter((d) => d.id !== item.id) });
    draw();
  }

  function toggleDose(item) {
    const list = taken();
    const already = list.some((d) => d.id === item.id);
    write({
      doses: already
        ? list.filter((d) => d.id !== item.id)
        : [...list, takeDose(item, date)],
    });
    draw();
  }

  // ------------------------------------------------------------------ rendu

  /** Champ d'une mesure simple, avec son message de refus eventuel. */
  function measureField(measure) {
    const current = data()[measure.id];
    const error = errors.get(measure.id);

    const field = numberField({
      id: `health-m-${measure.id}`,
      label: measure.label,
      value: current ?? null,
      step: measure.step,
      unit: measure.unit,
      placeholder: '—',
      onInput: () => {},
    });

    const input = field.node.querySelector('input');
    input.addEventListener('change', () => setMeasure(measure.id, input.value));
    input.addEventListener('blur', () => setMeasure(measure.id, input.value));

    if (error) {
      field.node.appendChild(
        el('p', { class: 'field-error', role: 'status' }, refusal(measure, error))
      );
    }
    return field.node;
  }

  /**
   * Ce qu'on dit quand une saisie est refusee.
   *
   * Jamais « valeur anormale » : la borne dit ce que Daylog sait enregistrer,
   * pas ce qu'un corps a le droit d'afficher. La nuance change tout pour qui
   * releve justement une mesure qui l'inquiete.
   */
  function refusal(measure, error) {
    if (error.reason === 'nan') return 'Il faut un nombre.';
    return (
      `Daylog note ${measure.label.toLowerCase()} entre ${error.min} et ${error.max} ` +
      `${measure.unit}. Vérifie la virgule.`
    );
  }

  /** Tension : deux nombres qui ne veulent rien dire l'un sans l'autre. */
  function bloodPressureField() {
    const current = data().bp || {};
    const error = errors.get('bp');

    const sys = el('input', {
      type: 'number',
      id: 'health-bp-sys',
      class: 'input',
      inputmode: 'numeric',
      step: '1',
      'aria-label': 'Tension, chiffre du haut',
    });
    sys.value = current.systolic ?? '';

    const dia = el('input', {
      type: 'number',
      id: 'health-bp-dia',
      class: 'input',
      inputmode: 'numeric',
      step: '1',
      'aria-label': 'Tension, chiffre du bas',
    });
    dia.value = current.diastolic ?? '';

    const submit = () => setBloodPressure(sys.value, dia.value);
    for (const node of [sys, dia]) {
      node.addEventListener('change', submit);
      node.addEventListener('blur', submit);
    }

    return el('div', { class: 'field' }, [
      el('span', { class: 'field-label', id: 'health-bp-label' }, 'Tension artérielle'),
      el('div', { class: 'input-row', role: 'group', 'aria-labelledby': 'health-bp-label' }, [
        sys,
        el('span', { class: 'input-unit', 'aria-hidden': 'true' }, '/'),
        dia,
        el('span', { class: 'input-unit' }, 'mmHg'),
      ]),
      error &&
        el('p', { class: 'field-error', role: 'status' },
          error.reason === 'inverted'
            ? 'Le premier chiffre est le plus haut des deux.'
            : error.reason === 'nan'
              ? 'Il faut deux nombres.'
              : 'Deux nombres en millimètres de mercure, par exemple 120 et 80.'
        ),
    ]);
  }

  /**
   * Ce que la pesee du jour raconte, s'il y a de quoi le dire.
   *
   * Une tendance sur quatre pesees minimum, lissee sur une semaine : le poids
   * d'un matin depend surtout de la veille, et annoncer « +1,2 kg » sur deux
   * points serait un chiffre juste en apparence et faux en pratique.
   */
  function weightNote() {
    const rows = history.filter((r) => r.date !== date);
    const current = data().weight;
    if (typeof current === 'number') rows.push({ date, weightKg: current });

    const trend = weightTrend(rows);
    if (trend.change === null) {
      return el('p', { class: 'card-hint', style: { marginBottom: '0' } },
        trend.n === 0
          ? 'La première pesée sert de point de départ.'
          : `Tendance disponible à partir de ${trend.n + trend.missing} pesées.`
      );
    }

    const detail = info({
      id: 'health-weight-info',
      label: 'Sur quoi repose cette tendance',
      text: [
        `Écart entre la moyenne de tes premières pesées et celle de tes dernières, ` +
          `sur ${trend.n} pesées entre le ${formatDayMonth(trend.from)} et le ` +
          `${formatDayMonth(trend.to)}. `,
        'Comparer deux pesées isolées ne dirait rien : le poids varie de plus d’un ' +
          'kilo dans une même journée.',
      ],
    });

    const change = trend.change;
    const phrase =
      Math.abs(change) < 0.15
        ? `Stable sur ${trend.days} jours.`
        : `${change > 0 ? '+' : '−'}${formatNumber(Math.abs(change), { digits: 1 })} kg ` +
          `sur ${trend.days} jours.`;

    return el('div', { class: 'health-trend' }, [
      el('div', { class: 'health-trend-head' }, [
        el('p', { class: 'health-trend-main' }, phrase),
        detail.button,
      ]),
      detail.panel,
    ]);
  }

  /** Les cases de mesures, dans l'ordre de la declaration. */
  function measuresBlock() {
    const chosen = MEASURES.filter((m) => tracks.includes(m.id));
    if (!chosen.length) {
      return el('p', { class: 'card-hint' },
        'Choisis plus bas ce que tu mesures : seuls ces champs apparaîtront ici.'
      );
    }
    return el('div', {}, [
      ...chosen.map((m) => (m.pair ? bloodPressureField() : measureField(m))),
      tracks.includes('weight') && weightNote(),
    ]);
  }

  /** Un groupe de cases repliable, resume par ce qui est coche. */
  function chipsBlock({ key, title, options, selected, empty, exclusive = null }) {
    const labels = options.filter((o) => selected.has(o.id)).map((o) => o.label);
    const details = el('details', {
      class: 'foldable',
      open: open[key] === null ? selected.size > 0 : open[key],
      onToggle: () => {
        open[key] = details.open;
      },
    }, [
      el('summary', { class: 'foldable-head' }, [
        el('span', { class: 'field-label' }, title),
        el('span', { class: `foldable-note${labels.length ? ' is-set' : ''}` },
          labels.length ? labels.join(' · ') : empty
        ),
      ]),
      el('div', { class: 'chips' }, options.map((option) => {
        const on = selected.has(option.id);
        return el('div', { class: `chip${on ? ' is-done' : ''}` }, [
          el('button', {
            type: 'button',
            class: 'chip-toggle',
            style: { paddingRight: '0.875rem' },
            'aria-pressed': on ? 'true' : 'false',
            onClick: () => toggleChip(key, option.id, { exclusive }),
          }, [
            el('span', { class: 'chip-mark', 'aria-hidden': 'true' }, on ? '✓' : ''),
            el('span', {}, option.label),
          ]),
        ]);
      })),
    ]);
    return details;
  }

  /** Douleur : une intensite, et ou ça se passe. */
  function painBlock() {
    const pain = data().pain || {};
    const sites = new Set(pain.sites || []);
    const noted = typeof pain.level === 'number' || sites.size > 0;
    const labels = PAIN_SITES.filter((s) => sites.has(s.id)).map((s) => s.label);

    const details = el('details', {
      class: 'foldable',
      open: open.pain === null ? noted : open.pain,
      onToggle: () => {
        open.pain = details.open;
      },
    }, [
      el('summary', { class: 'foldable-head' }, [
        el('span', { class: 'field-label' }, 'Douleur'),
        el('span', { class: `foldable-note${noted ? ' is-set' : ''}` },
          typeof pain.level === 'number'
            ? `${pain.level} sur 10${labels.length ? ` · ${labels.join(' · ')}` : ''}`
            : labels.length
              ? labels.join(' · ')
              : 'Rien de noté'
        ),
      ]),
      scale({
        id: 'health-pain',
        label: 'Intensité',
        value: typeof pain.level === 'number' ? pain.level : null,
        lowLabel: 'à peine',
        highLabel: 'insupportable',
        onChange: setPainLevel,
      }).node,
      el('span', { class: 'field-label' }, 'Où'),
      el('div', { class: 'chips' }, PAIN_SITES.map((site) => {
        const on = sites.has(site.id);
        return el('div', { class: `chip${on ? ' is-done' : ''}` }, [
          el('button', {
            type: 'button',
            class: 'chip-toggle',
            style: { paddingRight: '0.875rem' },
            'aria-pressed': on ? 'true' : 'false',
            onClick: () => togglePainSite(site.id),
          }, [
            el('span', { class: 'chip-mark', 'aria-hidden': 'true' }, on ? '✓' : ''),
            el('span', {}, site.label),
          ]),
        ]);
      })),
    ]);
    return details;
  }

  /** « Ce que je note » : la liste des mesures, modifiable ici et pas ailleurs. */
  function tracksBlock() {
    const details = el('details', { class: 'foldable' }, [
      el('summary', { class: 'foldable-head' }, [
        el('span', { class: 'field-label' }, 'Ce que je note'),
        el('span', { class: 'foldable-note' },
          tracks.length === 1 ? '1 mesure' : `${tracks.length} mesures`
        ),
      ]),
      el('p', { class: 'card-hint' },
        'Seules les mesures cochées apparaissent au-dessus. Décocher n’efface rien.'
      ),
      ...MEASURES.map((m) => {
        const id = `health-track-${m.id}`;
        return el('label', { class: 'onb-option', for: id }, [
          el('input', {
            type: 'checkbox',
            id,
            class: 'onb-input',
            checked: tracks.includes(m.id),
            onChange: (e) => setTracks(m.id, e.target.checked),
          }),
          el('span', { class: 'onb-option-text' }, [
            el('span', { class: 'onb-option-label' }, m.label),
            el('span', { class: 'onb-option-hint' }, `Demande ${m.device}`),
          ]),
        ]);
      }),
    ]);
    return details;
  }

  // ------------------------------------------------------ carte traitements

  /** Ligne d'un traitement : la prise, la dose, et de quoi la faire evoluer. */
  function treatmentRow(item) {
    const list = taken();
    const entry = list.find((d) => d.id === item.id);
    const on = Boolean(entry);
    const { dose, unit } = doseAt(item, date);
    const changed = recentDoseChange(item, date);
    const boxId = `health-take-${item.id}`;

    return el('div', { class: 'treatment' }, [
      el('label', { class: 'onb-option', for: boxId }, [
        el('input', {
          type: 'checkbox',
          id: boxId,
          class: 'onb-input',
          checked: on,
          onChange: () => toggleDose(item),
        }),
        el('span', { class: 'onb-option-text' }, [
          el('span', { class: 'onb-option-label' }, item.label),
          el('span', { class: 'onb-option-hint' }, [
            // La dose affichee est celle du jour consulte, pas celle
            // d'aujourd'hui : c'est tout l'interet de garder l'historique.
            formatDose(entry ? entry.dose : dose, entry ? entry.unit : unit) || 'Dose non notée',
            item.moments?.length
              ? ` · ${item.moments.map((m) => MOMENTS.find((x) => x.id === m)?.label).filter(Boolean).join(', ')}`
              : '',
          ]),
        ]),
      ]),
      changed &&
        el('p', { class: 'card-hint', style: { margin: '0 0 0.25rem' } },
          `Dose passée à ${formatDose(changed.dose, changed.unit)} il y a ${changed.days} jour` +
            `${changed.days > 1 ? 's' : ''}.`
        ),
      doseEditor(item),
    ]);
  }

  /** Modification de dose et retrait, replies : ce sont des gestes rares. */
  function doseEditor(item) {
    const dose = el('input', {
      type: 'number',
      id: `health-dose-${item.id}`,
      class: 'input',
      inputmode: 'decimal',
      step: '0.5',
      min: '0',
      'aria-label': `Nouvelle dose de ${item.label}`,
    });
    dose.value = item.dose ?? '';

    const unit = el('select', {
      class: 'input',
      id: `health-unit-${item.id}`,
      'aria-label': `Unité de ${item.label}`,
    }, DOSE_UNITS.map((u) => el('option', { value: u }, u)));
    unit.value = item.unit || DOSE_UNITS[0];

    return el('details', { class: 'foldable' }, [
      el('summary', { class: 'foldable-head' }, [
        el('span', { class: 'foldable-note' }, 'Modifier'),
      ]),
      el('div', { class: 'add-row' }, [
        dose,
        unit,
        el('button', {
          type: 'button',
          class: 'btn btn-sm',
          onClick: () => {
            const value = dose.value === '' ? null : Number(dose.value);
            if (value === null || !Number.isFinite(value) || value < 0) return;
            changeDose(item, value, unit.value);
          },
        }, 'Enregistrer'),
      ]),
      el('p', { class: 'card-hint', style: { marginTop: '0.5rem' } },
        'Les journées déjà notées gardent la dose qu’elles portaient.'
      ),
      el('div', { class: 'card-actions' }, [
        el('button', {
          type: 'button',
          class: 'btn btn-sm',
          onClick: () => archiveTreatment(item),
        }, 'Retirer de ma liste'),
      ]),
    ]);
  }

  /** Formulaire d'ajout, replie tant qu'on ne le demande pas. */
  function addTreatmentForm() {
    const name = el('input', {
      type: 'text',
      id: 'health-trt-name',
      class: 'input',
      autocomplete: 'off',
      placeholder: 'Nom du traitement',
    });
    const dose = el('input', {
      type: 'number',
      id: 'health-trt-dose',
      class: 'input',
      inputmode: 'decimal',
      step: '0.5',
      min: '0',
      placeholder: 'Dose',
      'aria-label': 'Dose',
    });
    const unit = el('select', {
      class: 'input',
      id: 'health-trt-unit',
      'aria-label': 'Unité',
    }, DOSE_UNITS.map((u) => el('option', { value: u }, u)));

    const moments = new Set();

    function submit() {
      const value = dose.value === '' ? null : Number(dose.value);
      addTreatment({
        label: name.value,
        dose: Number.isFinite(value) && value >= 0 ? value : null,
        unit: unit.value,
        moments: [...moments],
      });
      name.value = '';
      dose.value = '';
    }

    return el('details', { class: 'foldable' }, [
      el('summary', { class: 'foldable-head' }, [
        el('span', { class: 'field-label' }, 'Ajouter un traitement'),
        el('span', { class: 'foldable-note' }, 'Une seule fois'),
      ]),
      el('div', { class: 'field' }, [
        el('label', { class: 'field-label', for: 'health-trt-name' }, 'Nom'),
        name,
      ]),
      el('div', { class: 'field' }, [
        el('span', { class: 'field-label' }, 'Dose'),
        el('div', { class: 'add-row' }, [dose, unit]),
      ]),
      el('fieldset', { class: 'onb-fieldset' }, [
        el('legend', { class: 'onb-legend' }, 'Quand'),
        ...MOMENTS.map((m) => {
          const id = `health-moment-${m.id}`;
          return el('label', { class: 'onb-option', for: id }, [
            el('input', {
              type: 'checkbox',
              id,
              class: 'onb-input',
              onChange: (e) => {
                if (e.target.checked) moments.add(m.id);
                else moments.delete(m.id);
              },
            }),
            el('span', { class: 'onb-option-text' }, [
              el('span', { class: 'onb-option-label' }, m.label),
            ]),
          ]);
        }),
      ]),
      // « Ajouter » tout court : l'ecran du jour en compte deja un autre, celui
      // des seances. Deux boutons du meme nom dans une page ne renseignent
      // personne qui navigue de bouton en bouton.
      el('div', { class: 'card-actions' }, [
        el('button', { type: 'button', class: 'btn btn-primary', onClick: submit },
          'Ajouter le traitement'
        ),
      ]),
      el('p', { class: 'card-hint', style: { marginBottom: '0' } },
        'Enregistré une fois, coché en un geste les jours suivants.'
      ),
    ]);
  }

  function treatmentsCard() {
    const list = sortTreatments(activeItems(treatments));
    // La carte n'apparait pas d'elle-meme : il faut avoir declare un traitement
    // a la premiere ouverture, ou en avoir deja enregistre un. Quelqu'un qui
    // n'en prend aucun n'a pas a voir une carte vide tous les jours.
    if (!list.length && !capabilities.treatment) return null;

    const count = taken().length;

    return el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('h2', { class: 'card-title' }, 'Traitements'),
        // On compte ce qui a ete pris, jamais ce qui manquerait : un blanc
        // n'est pas un oubli, et Daylog n'a pas a le qualifier.
        count > 0 &&
          el('span', { class: 'card-count' },
            count === 1 ? '1 prise notée' : `${count} prises notées`
          ),
      ]),
      list.length
        ? el('div', {}, list.map(treatmentRow))
        : el('p', { class: 'card-hint' },
            'Enregistre tes traitements une fois : ensuite, une case à cocher suffit.'
          ),
      addTreatmentForm(),
    ]);
  }

  // ------------------------------------------------------------ carte sante

  /** Resume d'une ligne : ce qui a ete note aujourd'hui. */
  function headline() {
    const current = data();
    const parts = [];
    for (const m of MEASURES) {
      if (!tracks.includes(m.id)) continue;
      if (m.pair) {
        const bp = current.bp;
        if (bp) parts.push(`${bp.systolic}/${bp.diastolic}`);
        continue;
      }
      const value = current[m.id];
      if (typeof value === 'number') {
        parts.push(`${m.short.toLowerCase()} ${formatNumber(value, { digits: m.digits })} ${m.unit}`);
      }
    }
    return parts.length ? parts.slice(0, 2).join(' · ') : 'Non renseigné';
  }

  function draw() {
    const current = data();
    const digestion = new Set(current.digestion || []);
    const symptoms = new Set(current.symptoms || []);
    const somethingNoted =
      MEASURES.some((m) => current[m.id] !== undefined && current[m.id] !== null) ||
      Boolean(current.bp) ||
      Boolean(current.pain) ||
      digestion.size > 0 ||
      symptoms.size > 0;

    mount(container, [
      el('div', { class: 'card' }, [
        el('div', { class: 'card-head' }, [
          el('h2', { class: 'card-title' }, 'Santé'),
          el('span', { class: 'card-count' }, headline()),
        ]),

        measuresBlock(),
        painBlock(),
        chipsBlock({
          key: 'digestion',
          title: 'Digestion',
          options: DIGESTION,
          selected: digestion,
          empty: 'Rien de noté',
          // « Rien à signaler » et « ballonnements » ne decrivent pas la meme
          // journee : les deux cochees ensemble ne voudraient rien dire.
          exclusive: 'fine',
        }),
        chipsBlock({
          key: 'symptoms',
          title: 'Symptômes',
          options: SYMPTOMS,
          selected: symptoms,
          empty: 'Rien de noté',
        }),

        tracksBlock(),

        somethingNoted &&
          el('div', { class: 'card-actions' }, [
            el('button', {
              type: 'button',
              class: 'btn btn-sm',
              onClick: () => {
                const cleared = { bp: null, pain: null, digestion: null, symptoms: null };
                for (const m of MEASURES) cleared[m.id] = null;
                errors.clear();
                write(cleared);
                draw();
              },
            }, 'Effacer la saisie du jour'),
          ]),

        el('p', { class: 'card-hint', style: { marginBottom: '0' } },
          'Daylog relève ces chiffres, il ne les interprète pas.'
        ),
      ]),

      treatmentsCard(),
    ]);
  }

  draw();
  return container;
}
