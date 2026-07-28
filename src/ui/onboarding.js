/**
 * Premiere ouverture.
 *
 * C'est ici que se joue l'essentiel de l'inclusion. Le principe directeur :
 * **poser des questions, pas cocher des cases**. On ne demande pas "activer le
 * module cycle ?" mais "as-tu un cycle menstruel a suivre ?", et on ne demande
 * jamais "peux-tu faire du sport ?" -- formulation qui range les gens en
 * capables et incapables -- mais "comment bouges-tu ?", qui accueille la marche,
 * le fauteuil et les bequilles sur le meme plan.
 *
 * Regles tenues dans tout ce fichier :
 *
 * - La promesse de confidentialite passe AVANT toute question. On explique ce
 *   qu'on ne fait pas de vos donnees avant d'en demander.
 * - Chaque question peut etre passee. Aucune n'est obligatoire.
 * - Aucune question n'a de reponse pre-cochee : on n'induit rien.
 * - Tout est modifiable ensuite dans les reglages, et c'est dit explicitement.
 * - Une seule question par ecran, pour que ce soit rapide et jamais intimidant.
 *
 * Ce fichier n'est telecharge qu'a la premiere ouverture : les personnes deja
 * installees n'en paient jamais le poids.
 */

import { el, mount } from './dom.js';
import { basisForGender } from '../core/nutrition.js';
import { optionRow, choice, numberField } from './controls.js';
import {
  THEMES, WEARABLES, MOBILITY, CYCLE, GENDERS,
  sanitizeDeclared, DECLARED_CYCLE_RANGE, DECLARED_PERIOD_RANGE,
} from '../modules/profile-options.js';



export function createOnboarding({ store, root, onDone }) {
  // Rien n'est pre-selectionne : chaque valeur reste `null` tant que la
  // personne n'a pas repondu.
  const answers = {
    name: null,
    address: null,
    themes: new Set(),
    wearable: null,
    mobility: null,
    gender: null,
    cycle: null,
    cycleLength: null,
    periodLength: null,
    cycleForecast: null,
    treatment: null,
  };

  let index = 0;

  /** Les etapes conditionnelles n'apparaissent que si elles ont du sens. */
  function steps() {
    return [
      stepWelcome,
      stepIdentity,
      stepThemes,
      stepMobility,
      stepGender,
      stepWearable,
      stepCycle,
      stepCycleDetail,
      stepTreatment,
      stepDone,
    ].filter((s) => !s.when || s.when());
  }

  // ------------------------------------------------------------------ etapes

  const stepWelcome = {
    id: 'welcome',
    render: () => ({
      title: 'Rien ne quitte ton téléphone',
      body: [
        para(
          "Daylog n'envoie aucune donnée, nulle part. Pas de compte, pas de serveur, " +
            'pas de publicité, pas de traceur.'
        ),
        para(
          'Tes notes sont enregistrées sur cet appareil, et personne ne peut y accéder ' +
            "à distance — moi non plus. Le code de l'application est ouvert : n'importe " +
            'qui peut le vérifier.'
        ),
        el('div', { class: 'onb-note' }, [
          el('strong', {}, 'La contrepartie : '),
          "si tu perds ton téléphone, tu perds tes notes. L'application te rappellera " +
            'régulièrement de faire une sauvegarde, et cet export sera toujours gratuit ' +
            'et complet.',
        ]),
      ],
      next: 'Commencer',
    }),
  };

  const stepIdentity = {
    id: 'identity',
    render: () => ({
      title: 'Comment on se parle',
      intro: 'Les deux questions sont facultatives.',
      body: [
        field('Ton prénom', 'onb-name', () => {
          const input = el('input', {
            id: 'onb-name',
            type: 'text',
            class: 'input',
            autocomplete: 'given-name',
            placeholder: 'Comme tu veux être appelé',
            onInput: (e) => {
              answers.name = e.target.value.trim() || null;
            },
          });
          input.value = answers.name || '';
          return input;
        }),
        choice({
          legend: "Comment veux-tu qu'on s'adresse à toi ?",
          name: 'address',
          options: [
            { id: 'neutral', label: 'De façon neutre', hint: 'Le choix par défaut' },
            { id: 'feminine', label: 'Au féminin' },
            { id: 'masculine', label: 'Au masculin' },
          ],
          value: answers.address,
          onSelect: (v) => {
            answers.address = v;
          },
        }),
        el('p', { class: 'onb-hint' },
          "Cela ne change que la formulation des phrases. Ce choix n'entre dans aucun " +
            'calcul, et tu peux le modifier quand tu veux.'
        ),
      ],
    }),
  };

  const stepThemes = {
    id: 'themes',
    render: () => ({
      title: 'Ce que tu veux suivre',
      intro:
        "L'humeur et le journal sont toujours là, c'est le cœur de Daylog. " +
        'Choisis ce que tu veux y ajouter.',
      body: [
        el('fieldset', { class: 'onb-fieldset' }, [
          el('legend', { class: 'sr-only' }, 'Thèmes à suivre'),
          ...THEMES.map((theme) =>
            optionRow({
              type: 'checkbox',
              name: 'themes',
              id: `theme-${theme.id}`,
              label: theme.label,
              hint: theme.hint,
              checked: answers.themes.has(theme.id),
              onChange: (on) => {
                if (on) answers.themes.add(theme.id);
                else answers.themes.delete(theme.id);
              },
            })
          ),
        ]),
        el('p', { class: 'onb-hint' },
          "D'autres suivis arriveront : activité physique, argent, apprentissage. " +
            'Tu pourras les activer au fur et à mesure.'
        ),
      ],
    }),
  };

  const stepMobility = {
    id: 'mobility',
    render: () => ({
      title: 'Comment tu bouges',
      intro:
        'Pour adapter le suivi de déplacement. Il n\'y a pas de bonne réponse, ' +
        'juste la tienne.',
      body: [
        choice({
          legend: 'Comment te déplaces-tu le plus souvent ?',
          name: 'mobility',
          options: MOBILITY,
          value: answers.mobility,
          onSelect: (v) => {
            answers.mobility = v;
          },
        }),
      ],
    }),
  };

  /**
   * Le genre.
   *
   * Posee UNIQUEMENT si la personne a choisi de suivre son alimentation, parce
   * qu'elle ne sert qu'a ça : les formules de depense au repos ont ete
   * calibrees separement sur des groupes de reference feminins et masculins.
   * Poser une question intime sans en faire quoi que ce soit serait
   * indefendable -- et le dire ici evite qu'on se le demande.
   */
  const stepGender = {
    id: 'gender',
    when: () => answers.themes.has('food'),
    render: () => ({
      title: 'Une question pour les calculs',
      intro:
        'Elle ne sert qu’à estimer ce que ton corps dépense au repos, et à rien ' +
        'd’autre dans l’application.',
      body: [
        choice({
          legend: 'Quel est ton genre ?',
          name: 'gender',
          options: GENDERS,
          value: answers.gender,
          onSelect: (v) => {
            answers.gender = v;
          },
        }),
        el('div', { class: 'onb-note' }, [
          'Les formules publiées ont été calibrées séparément sur des groupes ' +
            'féminins et masculins : la différence est réelle, et Daylog en tient ' +
            'compte tout seul. ',
          el('strong', {}, 'Personne trans'),
          ' ouvre un choix explicite dans ton profil — tu connais ton étape mieux ' +
            'que n’importe quelle règle.',
        ]),
        el('p', { class: 'onb-hint' },
          'Cela ne change pas la façon dont l’application te parle : c’était la ' +
            'question précédente.'
        ),
      ],
    }),
  };

  const stepWearable = {
    id: 'wearable',
    render: () => ({
      title: 'Montre ou bracelet',
      intro:
        'Si tu en as un, Daylog emploiera son vocabulaire. La saisie à la main ' +
        'reste toujours possible.',
      body: [
        choice({
          legend: 'As-tu un appareil connecté ?',
          name: 'wearable',
          options: [
            { id: 'none', label: 'Non, aucun' },
            ...WEARABLES.map((w) => ({ id: w.id, label: w.label, hint: `Score « ${w.term} »` })),
          ],
          value: answers.wearable,
          onSelect: (v) => {
            answers.wearable = v;
          },
        }),
        el('p', { class: 'onb-hint' },
          'Sans appareil, tout ce qui ne se mesure pas à l\'œil nu reste masqué : ' +
            'fréquence cardiaque, oxygénation, réveils nocturnes. Pas de champ que tu ' +
            'ne pourrais pas remplir.'
        ),
      ],
    }),
  };

  const stepCycle = {
    id: 'cycle',
    render: () => ({
      title: 'Cycle menstruel',
      intro: 'Question posée à tout le monde, et sans aucune conséquence si tu passes.',
      body: [
        choice({
          legend: 'As-tu un cycle menstruel à suivre ?',
          name: 'cycle',
          options: CYCLE,
          value: answers.cycle,
          onSelect: (v) => {
            answers.cycle = v;
          },
        }),
        el('div', { class: 'onb-note' }, [
          'Daylog ne donne qu\'un ',
          el('strong', {}, 'repère'),
          ', calculé à partir de la moyenne de tes cycles précédents. Si tes cycles ' +
            'varient beaucoup, il affiche une fourchette plutôt qu\'une date. Ce n\'est ' +
            'ni un moyen de contraception, ni un outil de conception.',
        ]),
      ],
    }),
  };

  /**
   * Durees habituelles.
   *
   * Sans elles, l'application ne sert a rien pendant deux mois : il faut deux
   * cycles complets avant qu'une moyenne existe. La personne, elle, connait
   * souvent son ordre de grandeur -- autant le lui demander.
   *
   * L'ecran ne s'affiche pas pour un cycle suspendu : une duree habituelle n'y
   * veut rien dire, et poser la question donnerait l'impression que
   * l'application n'a pas ecoute la reponse precedente.
   */
  const stepCycleDetail = {
    id: 'cycle-detail',
    when: () => answers.cycle === 'regular' || answers.cycle === 'irregular',
    render: () => ({
      title: 'Tes ordres de grandeur',
      intro:
        'Deux chiffres approximatifs, pour avoir un repère tout de suite. ' +
        'Si tu ne les connais pas, passe : Daylog les calculera tout seul.',
      body: [
        numberField({
          id: 'onb-cycle-length',
          label: 'Jours entre le début de deux cycles',
          value: answers.cycleLength,
          step: 1,
          min: DECLARED_CYCLE_RANGE[0],
          max: DECLARED_CYCLE_RANGE[1],
          unit: 'jours',
          placeholder: 'ex. 28',
          onInput: (v) => {
            answers.cycleLength = sanitizeDeclared(v, DECLARED_CYCLE_RANGE);
          },
        }).node,
        numberField({
          id: 'onb-period-length',
          label: 'Durée de tes règles',
          value: answers.periodLength,
          step: 1,
          min: DECLARED_PERIOD_RANGE[0],
          max: DECLARED_PERIOD_RANGE[1],
          unit: 'jours',
          placeholder: 'ex. 5',
          onInput: (v) => {
            answers.periodLength = sanitizeDeclared(v, DECLARED_PERIOD_RANGE);
          },
        }).node,
        choice({
          legend: 'Veux-tu voir un repère de prochaines règles ?',
          name: 'cycle-forecast',
          options: [
            { id: 'yes', label: 'Oui' },
            {
              id: 'no',
              label: 'Non, je préfère juste noter',
              hint: 'Aucune date affichée nulle part',
            },
          ],
          value: answers.cycleForecast === null ? null : answers.cycleForecast ? 'yes' : 'no',
          onSelect: (v) => {
            answers.cycleForecast = v === 'yes' ? true : v === 'no' ? false : null;
          },
        }),
        el('p', { class: 'onb-hint' },
          'Un compte à rebours n’est pas souhaitable pour tout le monde, et ce ' +
            'n’est pas à l’application d’en décider. Ce choix se change à tout moment.'
        ),
      ],
    }),
  };

  const stepTreatment = {
    id: 'treatment',
    render: () => ({
      title: 'Traitements',
      intro: 'Pour te proposer un suivi adapté, et t\'éviter de tout retaper chaque jour.',
      body: [
        choice({
          legend: 'Suis-tu un traitement en ce moment ?',
          name: 'treatment',
          options: [
            { id: 'yes', label: 'Oui', hint: 'Tu enregistreras tes traitements une fois' },
            { id: 'no', label: 'Non' },
          ],
          value: answers.treatment,
          onSelect: (v) => {
            answers.treatment = v;
          },
        }),
        el('p', { class: 'onb-hint' },
          'Utile si un dosage évolue et que tu veux relier les changements à ton ' +
            'ressenti. Ces informations restent sur ton téléphone comme le reste.'
        ),
      ],
    }),
  };

  const stepDone = {
    id: 'done',
    render: () => ({
      title: answers.name ? `C'est prêt, ${answers.name}` : "C'est prêt",
      body: [
        para(
          'Tu arrives directement sur ta journée. Trois questions, et le détail ' +
            'seulement si tu en as envie.'
        ),
        para('Tout est enregistré automatiquement : il n\'y a pas de bouton à chercher.'),
        el('div', { class: 'onb-note' },
          'Tous ces choix se modifient dans les réglages, et tu peux refaire cette ' +
            'présentation quand tu veux.'
        ),
      ],
      next: 'Ouvrir ma journée',
    }),
  };

  // ------------------------------------------------------- fabriques de champs

  function para(text) {
    return el('p', { class: 'onb-para' }, text);
  }

  function field(label, id, build) {
    return el('div', { class: 'field' }, [
      el('label', { class: 'field-label', for: id }, label),
      build(),
    ]);
  }

  // ------------------------------------------------------------------- rendu

  function render() {
    const list = steps();
    const step = list[index];
    const view = step.render();
    const isFirst = index === 0;
    const isLast = index === list.length - 1;

    const heading = el('h1', { class: 'onb-title', id: 'onb-title', tabindex: '-1' }, view.title);

    mount(root, [
      el('div', { class: 'onb' }, [
        el('div', { class: 'onb-progress' }, [
          el('div', {
            class: 'onb-progress-bar',
            style: { width: `${((index + 1) / list.length) * 100}%` },
          }),
          el('span', { class: 'sr-only', role: 'status' },
            `Étape ${index + 1} sur ${list.length}`
          ),
        ]),
        el('main', { class: 'onb-body' }, [
          heading,
          view.intro && el('p', { class: 'onb-intro' }, view.intro),
          ...view.body,
        ]),
        el('div', { class: 'onb-actions' }, [
          !isFirst &&
            el('button', { class: 'btn', type: 'button', onClick: back }, 'Retour'),
          el('button', {
            class: 'btn btn-primary btn-block',
            type: 'button',
            onClick: next,
          }, view.next || (isLast ? 'Terminer' : 'Continuer')),
        ]),
        !isFirst && !isLast &&
          el('button', { class: 'onb-skip', type: 'button', onClick: next },
            'Passer cette question'
          ),
      ]),
    ]);

    // Le focus va sur le titre a chaque changement d'ecran : sans cela, un
    // lecteur d'ecran resterait sur l'ancien contenu et une navigation au
    // clavier repartirait du haut de la page.
    heading.focus();
  }

  function next() {
    const list = steps();
    if (index >= list.length - 1) return finish();
    index++;
    render();
  }

  function back() {
    if (index > 0) index--;
    render();
  }

  /** Traduit les reponses en reglages, puis passe la main a l'application. */
  async function finish() {
    const moduleState = {};
    for (const theme of THEMES) {
      const on = answers.themes.has(theme.id);
      for (const id of theme.modules) moduleState[id] = on;
    }
    // Repondre « oui » a la question des traitements, c'est demander de quoi
    // les suivre. Laisser le module eteint parce que la case « Santé » n'a pas
    // ete cochee deux ecrans plus tot serait prendre la reponse et ne rien en
    // faire -- exactement ce qu'on reproche aux questionnaires d'installation.
    if (answers.treatment === 'yes') moduleState.health = true;

    const capabilities = {
      wearable: answers.wearable && answers.wearable !== 'none' ? answers.wearable : null,
      mobility: answers.mobility,
      // Un cycle suspendu reste un cycle a suivre : la personne peut vouloir
      // noter ce que le traitement change.
      cycle: answers.cycle && answers.cycle !== 'none' ? answers.cycle : null,
      cycleLength: answers.cycleLength,
      periodLength: answers.periodLength,
      cycleForecast: answers.cycleForecast,
      treatment: answers.treatment === 'yes',
    };

    await store.setModuleState(moduleState);
    await store.setCapabilities(capabilities);
    await store.setProfile({
      identity: {
        name: answers.name,
        address: answers.address || 'neutral',
        pronouns: null,
        gender: answers.gender,
      },
      // La reference de calcul suit la reponse, sauf pour les personnes trans
      // qui la choisiront elles-memes dans leur profil.
      body: { calcBasis: answers.gender === 'trans' ? null : basisForGender(answers.gender) },
    });
    await store.setSettings({
      wearable: capabilities.wearable,
      onboardedAt: new Date().toISOString(),
    });

    onDone();
  }

  return { render };
}
