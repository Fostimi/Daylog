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
  WEARABLES, MOBILITY, CYCLE, GENDERS,
  sanitizeDeclared, DECLARED_CYCLE_RANGE, DECLARED_PERIOD_RANGE,
} from '../modules/profile-options.js';
import * as db from '../core/db.js';
import { enabledModules } from '../core/modules.js';
import { addDays, today } from '../core/date.js';
import {
  ACTIVITY_LEVELS, WEIGHT_GOALS, CALC_BASES, TRANSITION_DIRECTIONS,
  basisForGender, energyNeeds, mealSplit, splitTarget,
} from '../core/nutrition.js';
import { formatNumber } from '../core/i18n.js';

export function createProfileView({ store, root, go, onReset, alert = null }) {
  let status = null;
  // Les journees recentes, lues une fois : elles servent a montrer comment la
  // personne repartit REELLEMENT ses repas, plutot qu'un modele theorique.
  let recentDays = [];

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

  /** Ecrit dans `profile.body`. `quiet` : sans reconstruire l'ecran. */
  async function patchBody(patch, { quiet = false } = {}) {
    const current = store.getProfile();
    await store.setProfile({ ...current, body: { ...current.body, ...patch } });
    if (!quiet) setStatus('Modification enregistrée.');
  }

  async function patchGoals(patch, { quiet = false } = {}) {
    const current = store.getProfile();
    await store.setProfile({ ...current, goals: { ...current.goals, ...patch } });
    if (!quiet) setStatus('Modification enregistrée.');
  }

  function numberOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
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

  /**
   * Le genre.
   *
   * Une seule question, un seul usage : choisir la reference des formules de
   * depense au repos. Elle ne s'affiche que si le suivi alimentaire est actif --
   * poser une question intime pour ne rien en faire serait indefendable.
   */
  function genderCard(profile) {
    const identity = profile.identity || {};
    return el('div', { class: 'card' }, [
      el('h2', { class: 'card-title' }, 'Genre'),
      choice({
        legend: 'Quel est ton genre ?',
        name: 'p-gender',
        options: GENDERS,
        value: identity.gender || null,
        onSelect: async (v) => {
          const current = store.getProfile();
          await store.setProfile({
            ...current,
            identity: { ...current.identity, gender: v },
            // La reference suit automatiquement, sauf pour les personnes trans
            // qui choisissent elles-memes, et sauf si une masse grasse mesuree
            // est deja utilisee -- une mesure vaut mieux qu'une categorie.
            body:
              v === 'trans' || current.body?.calcBasis === 'lean-mass'
                ? current.body
                : { ...current.body, calcBasis: basisForGender(v) },
          });
          setStatus('Modification enregistrée.');
        },
        allowNone: true,
      }),
      el('p', { class: 'card-hint', style: { marginBottom: '0' } },
        'Sert uniquement à estimer ta dépense au repos : les formules publiées ' +
          'ont été calibrées séparément sur des groupes féminins et masculins. ' +
          'Rien d’autre dans l’application ne s’en sert.'
      ),
    ]);
  }

  /**
   * Ton corps.
   *
   * Ces trois chiffres ne servent qu'aux calculs energetiques, et rien d'autre
   * dans l'application ne les regarde. Ils restent facultatifs : sans eux,
   * aucun besoin n'est affiche -- mais tout le reste fonctionne.
   */
  function bodyCard(profile) {
    const body = profile.body || {};
    return el('div', { class: 'card' }, [
      el('h2', { class: 'card-title' }, 'Ton corps'),
      el('p', { class: 'card-hint' }, 'Uniquement pour les calculs de nutrition.'),
      numberField({
        id: 'p-height',
        label: 'Taille',
        value: body.heightCm ?? null,
        step: 1,
        min: 80,
        max: 250,
        unit: 'cm',
        onInput: (v) => patchBody({ heightCm: numberOrNull(v) }, { quiet: true }),
      }).node,
      numberField({
        id: 'p-weight',
        label: 'Poids',
        value: body.weightKg ?? null,
        step: 0.1,
        min: 25,
        max: 300,
        unit: 'kg',
        onInput: (v) =>
          patchBody(
            { weightKg: numberOrNull(v), weightMeasuredAt: new Date().toISOString() },
            { quiet: true }
          ),
      }).node,
      numberField({
        id: 'p-birth-year',
        label: 'Année de naissance',
        value: body.birthYear ?? null,
        step: 1,
        min: 1900,
        max: new Date().getFullYear(),
        unit: '',
        onInput: (v) => patchBody({ birthYear: numberOrNull(v) }, { quiet: true }),
      }).node,
    ]);
  }

  /**
   * La reference de calcul.
   *
   * Deduite du genre pour la plupart des gens : les formules publiees ont ete
   * calibrees separement sur des groupes de reference feminins et masculins, et
   * faire porter ce choix technique a chacun etait a la fois maladroit et
   * inutile. Seules les personnes trans choisissent -- elles connaissent leur
   * etape mieux que n'importe quelle regle.
   *
   * La masse grasse mesuree, quand elle existe, l'emporte sur tout le reste :
   * c'est une mesure, pas une categorie, et elle ne pose aucune question.
   */
  function basisCard(profile) {
    const body = profile.body || {};
    const gender = profile.identity?.gender || null;
    const isTrans = gender === 'trans';
    const derived = basisForGender(gender);
    const usingLean = body.calcBasis === 'lean-mass';

    const dateInput = el('input', {
      type: 'date',
      id: 'p-basis-start',
      class: 'input',
      onInput: (e) => patchBody({ basisStartDate: e.target.value || null }, { quiet: true }),
    });
    dateInput.value = (body.basisStartDate || '').slice(0, 10);

    return el('div', { class: 'card' }, [
      el('h2', { class: 'card-title' }, 'Estimation de ta dépense'),

      isTrans
        ? el('div', {}, [
            choice({
              legend: 'Quelle référence utiliser ?',
              name: 'p-basis',
              options: CALC_BASES,
              value: usingLean ? null : body.calcBasis || null,
              onSelect: (v) => patchBody({ calcBasis: v }),
              allowNone: true,
            }),
            body.calcBasis === 'interpolated' &&
              el('div', {}, [
                choice({
                  legend: 'Dans quel sens ?',
                  name: 'p-basis-direction',
                  options: TRANSITION_DIRECTIONS,
                  value:
                    TRANSITION_DIRECTIONS.find(
                      (d) => d.from === body.basisFrom && d.to === body.basisTo
                    )?.id || null,
                  onSelect: (v) => {
                    const dir = TRANSITION_DIRECTIONS.find((d) => d.id === v);
                    patchBody({ basisFrom: dir?.from || null, basisTo: dir?.to || null });
                  },
                }),
                el('div', { class: 'field' }, [
                  el('label', { class: 'field-label', for: 'p-basis-start' },
                    'Depuis quand ?'
                  ),
                  dateInput,
                ]),
                el('p', { class: 'card-hint', style: { marginBottom: '0' } },
                  'La référence glisse progressivement sur trois ans.'
                ),
              ]),
          ])
        : el('p', { class: 'card-hint' },
            derived
              ? gender === 'nonbinary'
                ? 'Daylog prend le milieu des deux références publiées. ' +
                  'L’estimation est un peu moins précise, et se corrigera sur tes ' +
                  'mesures réelles.'
                : 'Déduite de ta réponse sur le genre. Rien à choisir.'
              : 'Réponds à la question sur le genre pour que Daylog puisse estimer.'
          ),

      // La mesure l'emporte toujours sur la categorie.
      el('label', { class: 'onb-option', for: 'p-lean' }, [
        el('input', {
          type: 'checkbox',
          id: 'p-lean',
          class: 'onb-input',
          checked: usingLean,
          onChange: (e) =>
            patchBody({ calcBasis: e.target.checked ? 'lean-mass' : derived || null }),
        }),
        el('span', { class: 'onb-option-text' }, [
          el('span', { class: 'onb-option-label' }, 'J’ai mesuré ma masse grasse'),
          el('span', { class: 'onb-option-hint' },
            'Plus juste que toute référence, et aucune catégorie en jeu'
          ),
        ]),
      ]),

      usingLean &&
        numberField({
          id: 'p-body-fat',
          label: 'Masse grasse mesurée',
          value: body.bodyFatPct ?? null,
          step: 0.1,
          min: 3,
          max: 70,
          unit: '%',
          onInput: (v) => patchBody({ bodyFatPct: numberOrNull(v) }, { quiet: true }),
        }).node,
      usingLean &&
        el('p', { class: 'card-hint', style: { marginBottom: '0' } },
          'Mesurée, jamais estimée : balance à impédance, pince à plis, DEXA.'
        ),
    ]);
  }

  /**
   * Activite et objectif.
   *
   * L'objectif est un choix a part entiere, et il se refuse. Sans lui, Daylog
   * affiche ce que le corps depense et s'arrete la -- ce qui est deja un suivi
   * complet, et le seul qui convienne a qui ne veut pas de cible du tout.
   */
  function goalsCard(profile) {
    const goals = profile.goals || {};
    return el('div', { class: 'card' }, [
      el('h2', { class: 'card-title' }, 'Activité et objectif'),
      choice({
        legend: 'Une semaine ordinaire, ça ressemble à quoi ?',
        name: 'p-activity',
        options: ACTIVITY_LEVELS,
        value: goals.activity || null,
        onSelect: (v) => patchGoals({ activity: v }),
        allowNone: true,
      }),
      choice({
        legend: 'Veux-tu suivre un objectif de poids ?',
        name: 'p-has-goal',
        options: [
          { id: 'yes', label: 'Oui' },
          {
            id: 'no',
            label: 'Non, juste suivre',
            hint: 'Aucune cible affichée, seulement ce que tu dépenses',
          },
        ],
        value: goals.hasGoal === true ? 'yes' : goals.hasGoal === false ? 'no' : null,
        onSelect: (v) =>
          patchGoals({ hasGoal: v === 'yes', ...(v === 'yes' ? {} : { weight: null }) }),
      }),
      goals.hasGoal === true &&
        el('div', {}, [
          choice({
            legend: 'Dans quel sens ?',
            name: 'p-goal',
            options: WEIGHT_GOALS,
            value: goals.weight || null,
            onSelect: (v) => patchGoals({ weight: v }),
            allowNone: true,
          }),
          numberField({
            id: 'p-protein',
            label: 'Protéines visées',
            value: goals.proteinPerKg ?? null,
            step: 0.1,
            min: 0.5,
            max: 4,
            unit: 'g / kg',
            onInput: (v) => patchGoals({ proteinPerKg: numberOrNull(v) }, { quiet: true }),
          }).node,
          el('p', { class: 'card-hint', style: { marginBottom: '0' } },
            'Aucune valeur par défaut : sans réponse, aucune cible de protéines.'
          ),
        ]),
    ]);
  }

  /**
   * Ce que Daylog calcule, et ce qu'il en fait.
   *
   * Trois chiffres qu'il ne faut surtout pas confondre, et -- replie -- la
   * seule chose qui reponde vraiment a « 2300 kcal, ça ressemble a quoi ? » :
   * leur repartition sur la journee, tiree des journees deja notees quand il y
   * en a assez.
   */
  function needsCard(profile) {
    const body = profile.body || {};
    const goals = profile.goals || {};
    const needs = energyNeeds({
      weightKg: body.weightKg,
      heightCm: body.heightCm,
      ageYears: body.birthYear ? new Date().getFullYear() - body.birthYear : null,
      body,
      activity: goals.activity,
      goal: goals.hasGoal === true ? goals.weight : null,
    });

    const NOMS = {
      weight: 'ton poids',
      height: 'ta taille',
      age: 'ton année de naissance',
      calcBasis: 'ta réponse sur le genre',
      bodyFat: 'ta masse grasse mesurée',
      activity: 'ton activité',
      interpolation: 'le sens et la date de ta transition',
    };

    const showTarget = goals.hasGoal === true && needs.target;

    return el('div', { class: 'card' }, [
      el('h2', { class: 'card-title' }, 'Tes besoins estimés'),
      el('dl', { class: 'facts' }, [
        el('div', { class: 'fact' }, [
          el('dt', {}, 'Au repos'),
          el('dd', {}, `${formatNumber(needs.basal ?? null)} kcal`),
        ]),
        el('div', { class: 'fact' }, [
          el('dt', {}, 'Dépense estimée'),
          el('dd', {}, `${formatNumber(needs.maintenance ?? null)} kcal`),
        ]),
        showTarget &&
          el('div', { class: 'fact' }, [
            el('dt', {}, 'Cible'),
            el('dd', {}, `${formatNumber(needs.target)} kcal`),
          ]),
      ]),

      needs.missing?.length &&
        el('p', { class: 'card-hint', style: { marginBottom: '0' } },
          `Il manque ${needs.missing.map((m) => NOMS[m] || m).join(', ')}.`
        ),
      needs.floored &&
        el('p', { class: 'card-hint', style: { marginBottom: '0' } },
          'Cible relevée au niveau de ta dépense au repos : en dessous, ce ne ' +
            'serait plus un objectif.'
        ),

      needs.maintenance && splitBlock(showTarget ? needs.target : needs.maintenance),

      needs.maintenance &&
        el('p', { class: 'card-hint', style: { marginBottom: '0' } },
          'Une estimation à ± 10 %, qui se corrigera sur tes mesures réelles.'
        ),
    ]);
  }

  /** Repartition sur la journee, repliee : elle repond a une question, elle ne s'impose pas. */
  function splitBlock(kcal) {
    const { split, source, days } = mealSplit(recentDays);
    const perSlot = splitTarget(kcal, split);
    const LABELS = { breakfast: 'Matin', lunch: 'Midi', dinner: 'Soir', snack: 'À côté' };

    return el('details', { class: 'foldable' }, [
      el('summary', { class: 'foldable-head' }, [
        el('span', { class: 'field-label' }, 'Ça ressemble à quoi dans une journée ?'),
        el('span', { class: 'foldable-note' }, `${formatNumber(kcal)} kcal`),
      ]),
      el('dl', { class: 'facts' }, Object.entries(perSlot).map(([slot, value]) =>
        el('div', { class: 'fact' }, [
          el('dt', {}, LABELS[slot] || slot),
          el('dd', {}, `${value} kcal`),
        ])
      )),
      el('p', { class: 'card-hint', style: { marginBottom: '0' } },
        source === 'observed'
          ? `D’après la façon dont tu répartis tes repas, sur ${days} journées notées.`
          : 'Répartition courante, faute d’assez de journées notées. Elle s’ajustera ' +
            'sur les tiennes.'
      ),
    ]);
  }

  /**
   * Les journees recentes, lues une fois a l'ouverture.
   *
   * Un echec de lecture ne doit rien empecher : on repart alors sur la
   * repartition courante, qui est de toute facon le cas le plus frequent.
   */
  async function loadRecentDays() {
    try {
      const end = today(store.getSettings().dayStartHour || 0);
      recentDays = await db.getDays(addDays(end, -60), end);
    } catch {
      recentDays = [];
    }
  }

  function draw() {
    const profile = store.getProfile();
    const identity = profile.identity || {};
    const capabilities = store.getCapabilities();
    const nutritionActive = enabledModules(store.getModuleState(), capabilities).some(
      (m) => m.id === 'nutrition'
    );

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

        // Le corps, le genre et les objectifs ne servent qu'a la nutrition :
        // sans ce suivi, ces questions n'auraient aucune raison d'etre posees.
        ...(nutritionActive
          ? [genderCard(profile), bodyCard(profile), basisCard(profile), goalsCard(profile), needsCard(profile)]
          : []),

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

  return {
    render: async () => {
      await loadRecentDays();
      draw();
    },
  };
}
