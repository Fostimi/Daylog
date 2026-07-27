/**
 * Cycle menstruel.
 *
 * L'ecran le plus delicat de l'application, pour trois raisons.
 *
 * 1. IL S'ADRESSE A DES GENS TRES DIFFERENTS. Cycles reguliers, irreguliers,
 *    suspendus par une contraception ou un traitement hormonal, SOPK,
 *    endometriose, perimenopause, post-partum. Un ecran qui suppose « 28 jours,
 *    5 jours de regles » ne parle qu'a une minorite et renvoie tous les autres a
 *    une anomalie. Ici, rien n'est presente comme la norme.
 *
 * 2. IL NE DIT JAMAIS « FEMME ». Le module s'active sur une question posee a
 *    tout le monde -- « as-tu un cycle menstruel a suivre ? » -- et jamais sur
 *    une case « sexe » ou sur l'identite declaree. C'est la seule facon d'etre
 *    juste a la fois pour les femmes qui n'ont pas de cycle et pour les
 *    personnes trans ou non binaires qui en ont un.
 *
 * 3. IL N'ESTIME AUCUNE FERTILITE. Le repere porte sur les prochaines regles,
 *    calcule a partir de la moyenne des cycles precedents, et rien d'autre. Voir
 *    core/cycle.js et docs/cycle.md.
 *
 * Cet ecran n'est telecharge que si la personne suit un cycle : il ne coute rien
 * a tous les autres.
 */

import { el, mount } from '../../ui/dom.js';
import * as db from '../../core/db.js';
import { addDays, diffDays } from '../../core/date.js';
import { formatDayMonth, formatDayRange } from '../../core/i18n.js';
import {
  FLOW_LEVELS,
  SYMPTOMS,
  cycleStats,
  periodStats,
  periodStarts,
  cycleDay,
  cyclePhase,
  predictNextPeriod,
  usableDeclaredPeriod,
  daysLate,
} from '../../core/cycle.js';

/**
 * Profondeur d'historique lue pour les moyennes.
 *
 * Un peu plus d'un an : assez pour une moyenne solide, et cela ne represente
 * qu'une dizaine de kilo-octets puisqu'on lit les resumes quotidiens et non les
 * fiches completes.
 */
const HISTORY_DAYS = 400;

export async function render({ store }) {
  const container = el('div', { class: 'card' });
  const date = store.getDate();
  const capabilities = store.getCapabilities() || {};
  const mode = capabilities.cycle || null;

  // Les resumes des journees precedentes. Un echec de lecture ne doit pas
  // empecher la saisie du jour : on repart alors d'un historique vide.
  let history = [];
  try {
    history = await db.getSummaries(addDays(date, -HISTORY_DAYS), date);
  } catch {
    history = [];
  }

  // `null` = on suit ce qui est note ; un booleen = la personne a decide.
  let symptomsOpen = null;

  function data() {
    return store.get('cycle') || {};
  }

  /**
   * L'historique, la journee en cours comprise.
   *
   * La fiche du jour n'est pas encore enregistree quand on vient de cliquer :
   * on la superpose en memoire pour que le jour de cycle et le repere se
   * mettent a jour immediatement, sans attendre la sauvegarde automatique.
   */
  function rows({ withCurrentStart = true } = {}) {
    const current = data();
    const merged = history.filter((r) => r.date !== date);
    const flow = typeof current.flow === 'number' ? current.flow : null;
    const start = withCurrentStart ? current.cycleStart : undefined;
    if (flow !== null || start !== undefined) {
      merged.push({ date, flow, ...(start === undefined ? {} : { cycleStart: start }) });
    }
    return merged;
  }

  // ---------------------------------------------------------------- ecriture

  function setFlow(value) {
    const current = data();
    // Re-cliquer sur la valeur choisie efface la saisie : c'est ainsi qu'on
    // revient a « non renseigne », qui n'est pas la meme chose que « rien ».
    const next = current.flow === value ? null : value;
    store.update('cycle', {
      flow: next,
      // Sans saignement, « premier jour » n'a plus de sens : on ne laisse pas
      // trainer une correction qui ne se rattache a rien.
      ...(next === null || next === 0 ? { cycleStart: null } : {}),
    });
    draw();
  }

  /**
   * Ce jour est-il un debut de cycle, d'apres les seules saisies ?
   *
   * Sert a pre-cocher la case sans rien ecrire : tant que la personne n'y
   * touche pas, la fiche ne contient aucun `cycleStart`, et la deduction reste
   * libre de changer si elle complete une journee oubliee.
   */
  function detectedStart() {
    return periodStarts(rows({ withCurrentStart: false })).includes(date);
  }

  function toggleStart() {
    const explicit = data().cycleStart;
    const detected = detectedStart();
    const currently = explicit === undefined || explicit === null ? detected : explicit;
    const next = !currently;
    // Revenir a ce que la deduction dit deja rend la main a l'automatisme
    // plutot que de figer la valeur.
    store.update('cycle', { cycleStart: next === detected ? null : next });
    draw();
  }

  function toggleSymptom(id) {
    const current = new Set(data().symptoms || []);
    if (current.has(id)) current.delete(id);
    else current.add(id);
    store.update('cycle', { symptoms: [...current] });
    draw();
  }

  function clearDay() {
    store.update('cycle', { flow: null, cycleStart: null, symptoms: null });
    draw();
  }

  // ------------------------------------------------------------------ rendu

  /**
   * Choix de l'intensite : cinq options exclusives, rien de pre-selectionne.
   *
   * Motif ARIA « radiogroup », comme les echelles de l'ecran du jour : une seule
   * tabulation pour entrer dans le groupe, puis les fleches. Cinq boutons
   * ordinaires feraient cinq arrets de tabulation a traverser, tous les jours,
   * pour qui navigue au clavier ou avec un contacteur.
   */
  function flowRow(value) {
    const buttons = FLOW_LEVELS.map((level) => {
      const selected = value === level.value;
      return el('button', {
        type: 'button',
        role: 'radio',
        class: `flow-btn${selected ? ' is-selected' : ''}`,
        dataset: { flow: String(level.value) },
        'aria-checked': selected ? 'true' : 'false',
        // Un seul bouton tabulable : on entre dans le groupe, pas dans chaque
        // bouton. A defaut de selection, c'est le premier qui accueille.
        tabindex: selected || (value === null && level.value === 0) ? '0' : '-1',
        onClick: () => setFlow(level.value),
        onKeydown: (event) => move(event, level.value),
      }, [
        // La coche double l'information de couleur, qui n'est pas percue par
        // tout le monde.
        el('span', { class: 'flow-mark', 'aria-hidden': 'true' }, selected ? '✓' : ''),
        el('span', {}, level.label),
      ]);
    });

    function move(event, current) {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (step) {
        event.preventDefault();
        const next = Math.min(FLOW_LEVELS.length - 1, Math.max(0, current + step));
        if (next !== current) select(next);
      } else if (event.key === 'Home') {
        event.preventDefault();
        select(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        select(FLOW_LEVELS.length - 1);
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        // Revenir a « non renseigne » sans avoir a retrouver la valeur choisie.
        event.preventDefault();
        setFlow(value);
      }
    }

    /** Deplace le choix ET le focus : sans cela, la fleche suivante repartirait de zero. */
    function select(index) {
      setFlow(FLOW_LEVELS[index].value);
      container.querySelector(`.flow-btn[data-flow="${FLOW_LEVELS[index].value}"]`)?.focus();
    }

    return el('div', {
      class: 'flow-row',
      role: 'radiogroup',
      'aria-labelledby': 'cycle-flow-label',
    }, buttons);
  }

  function startRow() {
    const explicit = data().cycleStart;
    const detected = detectedStart();
    const checked = explicit === undefined || explicit === null ? detected : explicit;
    const auto = explicit === undefined || explicit === null;

    const input = el('input', {
      type: 'checkbox',
      id: 'cycle-start',
      class: 'onb-input',
      checked,
      onChange: toggleStart,
    });

    return el('label', { class: 'onb-option', for: 'cycle-start' }, [
      input,
      el('span', { class: 'onb-option-text' }, [
        el('span', { class: 'onb-option-label' }, 'Premier jour de ces règles'),
        el('span', { class: 'onb-option-hint' },
          auto
            ? 'Déduit de ce que tu as noté. Corrige-le si ce n’est pas le cas.'
            : 'Corrigé à la main.'
        ),
      ]),
    ]);
  }

  /**
   * Symptomes, replies par defaut.
   *
   * Onze pastilles font sept rangees sur un telephone : depliees en
   * permanence, elles occupaient la moitie de l'ecran du jour tous les jours,
   * y compris pour quelqu'un qui ne note que son flux. Le repliage suit le
   * meme principe que les check-ins : ouvert s'il y a quelque chose dedans,
   * ferme sinon, et le resume dit ce qui est note sans avoir a ouvrir.
   *
   * `<details>` plutot qu'un repliage maison : le navigateur fournit le
   * clavier, l'annonce aux lecteurs d'ecran et la recherche dans la page.
   */
  function symptomsBlock(selected) {
    const labels = SYMPTOMS.filter((s) => selected.has(s.id)).map((s) => s.label);
    // `symptomsOpen` retient ce que la personne a fait du bloc. Sans lui, chaque
    // redessin le refermait : decocher son dernier symptome faisait disparaitre
    // la liste sous le doigt, au moment precis ou l'on veut en cocher un autre.
    const details = el('details', {
      class: 'foldable',
      open: symptomsOpen === null ? selected.size > 0 : symptomsOpen,
      onToggle: () => {
        symptomsOpen = details.open;
      },
    }, [
      el('summary', { class: 'foldable-head' }, [
        el('span', { class: 'field-label' }, 'Ce que tu ressens'),
        el('span', { class: `foldable-note${labels.length ? ' is-set' : ''}` },
          labels.length ? labels.join(' · ') : 'Rien de noté'
        ),
      ]),
      symptomChips(selected),
    ]);
    return details;
  }

  function symptomChips(selected) {
    return el('div', { class: 'chips' }, SYMPTOMS.map((symptom) => {
      const on = selected.has(symptom.id);
      return el('div', { class: `chip${on ? ' is-done' : ''}` }, [
        el('button', {
          type: 'button',
          class: 'chip-toggle',
          style: { paddingRight: '0.875rem' },
          'aria-pressed': on ? 'true' : 'false',
          onClick: () => toggleSymptom(symptom.id),
        }, [
          el('span', { class: 'chip-mark', 'aria-hidden': 'true' }, on ? '✓' : ''),
          el('span', {}, symptom.label),
        ]),
      ]);
    }));
  }

  /**
   * Le repere, et surtout ce qu'il vaut.
   *
   * Chaque cas dit pourquoi il dit ce qu'il dit. Un ecran qui reste vide sans
   * explication laisse chacun imaginer la raison -- souvent la mauvaise.
   */
  function forecastBlock(stats, prediction, periods) {
    const lines = [];

    if (prediction.reason === 'off') return null;

    if (prediction.reason === 'suppressed') {
      lines.push(
        el('p', { class: 'card-hint', style: { marginBottom: '0' } },
          'Ton cycle est noté comme suspendu : afficher une moyenne des cycles ' +
            'précédents ne voudrait rien dire. Tout ce que tu notes reste enregistré.'
        )
      );
      return el('div', { class: 'cycle-forecast' }, lines);
    }

    if (prediction.reason === 'too-variable') {
      lines.push(
        el('p', {}, 'Pas de repère : tes cycles varient trop pour qu’une moyenne en dise quelque chose.'),
        el('p', { class: 'card-hint', style: { marginBottom: '0' } },
          `Ils vont de ${stats.min} à ${stats.max} jours. C’est une information en ` +
            'soi, et elle peut intéresser un professionnel de santé — tes saisies ' +
            'restent complètes et exportables.'
        )
      );
      return el('div', { class: 'cycle-forecast' }, lines);
    }

    if (prediction.reason === 'not-enough') {
      lines.push(
        el('p', {}, 'Pas encore de repère de prochaines règles.'),
        el('p', { class: 'card-hint', style: { marginBottom: '0' } },
          stats.starts.length
            ? 'Il faut deux cycles complets pour calculer une moyenne. En attendant, ' +
              'tu peux indiquer ta durée habituelle dans ton profil.'
            : 'Note tes règles quand elles arrivent : le repère se calculera tout seul.'
        )
      );
      return el('div', { class: 'cycle-forecast' }, lines);
    }

    // Le retard se lit a la date affichee, pas a la date du jour : toute la
    // carte decrit la journee qu'on regarde, et une journee d'il y a trois mois
    // annoncerait sinon un retard de trois mois.
    const late = daysLate(prediction, date);

    lines.push(
      el('p', { class: 'cycle-forecast-main' },
        prediction.exact
          ? `Prochaines règles autour du ${formatDayMonth(prediction.date)}`
          : `Prochaines règles entre le ${formatDayRange(prediction.from, prediction.to)}`
      )
    );

    lines.push(
      el('p', { class: 'card-hint' },
        prediction.source === 'declared'
          ? `D’après la durée que tu as indiquée (${prediction.average} jours). ` +
            'Le repère s’ajustera sur tes cycles réels dès que tu en auras noté deux.'
          : `Moyenne de tes ${prediction.n} derniers cycles : ${prediction.average} jours` +
            (stats.spread ? `, de ${stats.min} à ${stats.max}.` : '.') +
            (prediction.exact
              ? ` Fourchette du ${formatDayMonth(prediction.from)} au ${formatDayMonth(prediction.to)}.`
              : '')
      )
    );

    if (late) {
      // Factuel et sans point d'exclamation : un retard n'est pas une alerte, et
      // l'application n'a aucune idee de ce qu'il signifie pour la personne.
      lines.push(
        el('p', { class: 'card-hint' },
          `Le repère est dépassé de ${late} jour${late > 1 ? 's' : ''}. Un cycle qui ` +
            'se décale est courant, et Daylog n’en tire aucune conclusion.'
        )
      );
    }

    // La duree des regles vient des episodes observes ; a defaut, de ce que la
    // personne a annonce. La phrase dit laquelle des deux, parce que « en
    // moyenne » sur une valeur jamais mesuree serait un mensonge.
    const declaredPeriod = usableDeclaredPeriod(capabilities.periodLength);
    if (periods.average || declaredPeriod) {
      const days = periods.average || declaredPeriod;
      lines.push(
        el('p', { class: 'card-hint' },
          periods.average
            ? `Tes règles durent ${days} jour${days > 1 ? 's' : ''} en moyenne.`
            : `Tu as indiqué des règles de ${days} jour${days > 1 ? 's' : ''}.`
        )
      );
    }

    lines.push(
      el('p', { class: 'card-hint', style: { marginBottom: '0' } },
        'C’est un repère calculé sur tes cycles précédents, rien de plus : ni un ' +
          'moyen de contraception, ni un outil de conception.'
      )
    );

    return el('div', { class: 'cycle-forecast' }, lines);
  }

  /** Ligne de tete : ou en est le cycle, en un coup d'oeil. */
  function headline(stats, phase, periods) {
    if (phase.id === 'period') {
      const ongoing = periods.ongoing;
      const day = ongoing ? diffDays(ongoing.start, date) + 1 : null;
      return day ? `Règles, jour ${day}` : 'Règles';
    }
    const day = cycleDay(stats.lastStart, date);
    if (day === null) return 'Non renseigné';
    return `Jour ${day} du cycle`;
  }

  function draw() {
    const current = data();
    const flow = typeof current.flow === 'number' ? current.flow : null;
    const symptoms = new Set(current.symptoms || []);
    const series = rows();

    const stats = cycleStats(series);
    const periods = periodStats(series, { upTo: date });
    const prediction = predictNextPeriod(stats, {
      mode,
      declared: capabilities.cycleLength,
      forecast: capabilities.cycleForecast !== false,
    });
    const phase = cyclePhase({ stats, prediction, date, flow });

    mount(container, [
      el('div', { class: 'card-head' }, [
        // « Cycle » et non « Cycle menstruel » : c'est l'ecran qu'on ouvre dans
        // le metro. Le libelle complet reste dans les reglages et l'export, la
        // ou il faut savoir exactement de quoi on parle.
        el('h2', { class: 'card-title' }, 'Cycle'),
        el('span', { class: 'card-count' }, headline(stats, phase, periods)),
      ]),

      // La phase n'apparait que lorsqu'elle repose sur quelque chose. « Avant »
      // et « apres les regles » plutot que les noms cliniques : nommer une phase
      // luteale affirmerait une ovulation que Daylog ne mesure pas.
      phase.label && phase.id !== 'period' &&
        el('p', { class: 'cycle-phase' }, [
          el('span', { class: 'cycle-phase-label' }, phase.label),
          phase.source === 'estimated' &&
            el('span', { class: 'cycle-phase-hint' }, ' — repère, pas une mesure'),
        ]),

      el('div', { class: 'field' }, [
        el('span', { class: 'field-label', id: 'cycle-flow-label' }, 'Saignements aujourd’hui'),
        flowRow(flow),
      ]),

      flow !== null && flow > 0 && startRow(),

      symptomsBlock(symptoms),

      forecastBlock(stats, prediction, periods),

      (flow !== null || symptoms.size > 0) &&
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
