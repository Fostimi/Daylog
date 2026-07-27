/**
 * Bilan.
 *
 * L'application demandait beaucoup et ne rendait rien. Cet ecran est la
 * contrepartie : il ne se contente pas d'afficher des courbes, il essaie de
 * dire une phrase utile.
 *
 * Trois regles tenues ici :
 *
 * 1. ON NE CONCLUT PAS SUR DU VIDE. Une correlation demande au moins quatorze
 *    jours ou les DEUX valeurs existent. Le v5 annoncait « correlation forte »
 *    sur sept points, en appariant en plus des jours differents.
 *
 * 2. ON DECRIT, ON NE PRESCRIT PAS. « Tes nuits courtes s'accompagnent d'un
 *    stress plus eleve » est une observation. « Dors plus » serait un conseil,
 *    et Daylog n'est pas un dispositif medical.
 *
 * 3. ON NE CULPABILISE PAS. Pas de serie de jours qui se casse, pas d'objectif
 *    manque en rouge. Le suivi se mesure en « jours suivis sur la periode »,
 *    une mesure qui ne s'effondre pas parce qu'on a passe un week-end sans son
 *    telephone.
 *
 * Cet ecran n'est telecharge qu'a son ouverture, graphiques compris.
 */

import { el, mount } from './dom.js';
import { topbar } from './menu.js';
import { barChart, lineChart } from './charts.js';
import * as db from '../core/db.js';
import { addDays, lastNDays, today, toDate } from '../core/date.js';
import { meanOf, round } from '../core/summary.js';
import { buildInsights, RAPPEL_CORRELATION } from '../core/insights.js';
import { formatDayShort, formatDayMonth, formatDayRange, formatNumber } from '../core/i18n.js';

/** Profondeur d'historique du bilan de cycle : un cycle ne se lit pas sur 7 jours. */
const CYCLE_HISTORY_DAYS = 400;

const PERIODS = [
  { days: 7, label: '7 jours' },
  { days: 30, label: '30 jours' },
  { days: 90, label: '3 mois' },
];

export function createBilanView({ store, root, go, alert = null }) {
  let periodDays = 30;

  /**
   * Bilan du cycle.
   *
   * A part des autres : un cycle ne se lit pas sur la periode choisie en haut
   * de l'ecran -- sept jours n'en contiennent aucun -- mais sur l'annee. La
   * carte le dit explicitement plutot que de laisser croire que les chiffres
   * suivent le selecteur.
   *
   * Le calcul n'est telecharge que si la personne suit un cycle : les autres ne
   * paient rien.
   */
  async function cycleCard(end) {
    const capabilities = store.getCapabilities() || {};
    if (!capabilities.cycle) return null;

    const [cycle, rows] = await Promise.all([
      import('../core/cycle.js'),
      db.getSummaries(addDays(end, -CYCLE_HISTORY_DAYS), end),
    ]);

    const stats = cycle.cycleStats(rows, { mode: capabilities.cycle });
    // Aucune date de regles notee : une carte pleine de tirets n'apprend rien.
    if (!stats.starts.length) return null;

    const periods = cycle.periodStats(rows, { upTo: end });
    const prediction = cycle.predictNextPeriod(stats, {
      mode: capabilities.cycle,
      declared: capabilities.cycleLength,
      forecast: capabilities.cycleForecast !== false,
    });

    return el('div', { class: 'card' }, [
      el('h2', { class: 'card-title' }, 'Cycle'),
      el('dl', { class: 'facts' }, [
        fact('Cycles complets', String(stats.lengths.length)),
        fact('Durée moyenne', formatNumber(stats.average), 'jours'),
        fact(
          'Variation',
          stats.count > 1 && stats.spread ? `${stats.min} à ${stats.max}` : '—',
          stats.count > 1 && stats.spread ? 'jours' : ''
        ),
        fact('Règles', formatNumber(periods.average), 'jours'),
      ]),

      prediction.date &&
        el('p', {},
          prediction.exact
            ? `Prochaines règles autour du ${formatDayMonth(prediction.date)}.`
            : `Prochaines règles entre le ${formatDayRange(prediction.from, prediction.to)}.`
        ),

      el('p', { class: 'card-hint', style: { marginBottom: '0' } },
        'Sur les douze derniers mois, pas sur la période choisie plus haut.'
      ),
    ]);
  }

  async function draw() {
    const end = today(store.getSettings().dayStartHour || 0);
    const dates = lastNDays(periodDays, end);
    const [rows, cycleBlock] = await Promise.all([
      db.getSummaries(dates[0], end),
      cycleCard(end).catch(() => null),
    ]);

    // On aligne les resumes sur la suite complete des jours : les journees non
    // suivies deviennent des trous, pas des zeros.
    const byDate = new Map(rows.map((r) => [r.date, r]));
    const series = dates.map((d) => byDate.get(d) || null);
    const labels = dates.map((d) => formatDayShort(toDate(d)));
    const value = (key) => series.map((s) => (typeof s?.[key] === 'number' ? s[key] : null));

    const tracked = rows.length;

    mount(root, [
      el('a', { class: 'skip-link', href: '#main' }, 'Aller au contenu'),
      topbar({ title: 'Bilan', current: 'bilan', go, alert }),

      el('main', { class: 'app', id: 'main' }, [
        // Choix de la periode
        el('div', { class: 'segmented', role: 'group', 'aria-label': 'Période' }, [
          ...PERIODS.map((p) =>
            el('button', {
              type: 'button',
              class: `segmented-btn${p.days === periodDays ? ' is-active' : ''}`,
              'aria-pressed': p.days === periodDays ? 'true' : 'false',
              onClick: () => {
                periodDays = p.days;
                draw();
              },
            }, p.label)
          ),
        ]),

        tracked === 0
          ? el('div', { class: 'card' }, [
              el('h2', { class: 'card-title' }, 'Rien à montrer pour l’instant'),
              el('p', { class: 'card-hint', style: { marginBottom: '0' } },
                'Note quelques journées et reviens : les premières tendances ' +
                  'apparaissent au bout d’une semaine environ.'
              ),
            ])
          : null,

        tracked > 0 && el('div', { class: 'card' }, [
          el('h2', { class: 'card-title' }, 'En résumé'),
          el('dl', { class: 'facts' }, [
            fact('Jours suivis', `${tracked} sur ${periodDays}`),
            fact('Humeur', formatNumber(round(meanOf(rows, 'mood'), 1), { digits: 1 }), '/ 10'),
            fact('Énergie', formatNumber(round(meanOf(rows, 'energy'), 1), { digits: 1 }), '/ 10'),
            fact('Stress', formatNumber(round(meanOf(rows, 'stress'), 1), { digits: 1 }), '/ 10'),
            fact('Sommeil', formatNumber(round(meanOf(rows, 'sleepH'), 1), { digits: 1 }), 'h'),
            fact('Eau', formatNumber(round(meanOf(rows, 'waterMl'), 0)), 'ml / jour'),
          ]),
        ]),

        cycleBlock,

        ...(() => {
          const phrases = buildInsights(rows);
          if (!phrases.length) return [];
          return [
            el('div', { class: 'card insight' }, [
              ...phrases.map((text) => el('p', {}, text)),
              // Le rappel figure une fois sous l'ensemble, pas apres chaque
              // phrase : repete, il cessait d'etre lu.
              phrases.some((t) => t.includes('Sur ')) &&
                el('p', { class: 'card-hint', style: { marginBottom: '0' } },
                  RAPPEL_CORRELATION
                ),
            ]),
          ];
        })(),

        tracked > 0 && el('div', { class: 'card' }, [
          lineChart({
            title: 'Humeur, énergie et stress',
            labels,
            series: [
              { label: 'Humeur', values: value('mood') },
              { label: 'Énergie', values: value('energy') },
              { label: 'Stress', values: value('stress') },
            ],
          }),
        ]),

        tracked > 0 && el('div', { class: 'card' }, [
          barChart({
            title: 'Heures de sommeil',
            labels,
            values: value('sleepH'),
            label: 'Sommeil',
            unit: 'h',
          }),
        ]),

        tracked > 0 && el('div', { class: 'card' }, [
          barChart({
            title: 'Hydratation',
            labels,
            values: value('waterMl'),
            label: 'Eau',
            unit: 'ml',
          }),
        ]),

        el('p', { class: 'footer-note' },
          'Outil de suivi, pas un dispositif médical.'
        ),
      ]),
    ]);
  }

  function fact(label, value, unit = '') {
    return el('div', { class: 'fact' }, [
      el('dt', {}, label),
      el('dd', {}, unit ? `${value} ${unit}` : value),
    ]);
  }

  return { render: draw };
}
