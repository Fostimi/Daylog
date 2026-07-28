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
import {
  formatDayShort, formatDayMonth, formatDayRange, formatNumber, formatDuration,
} from '../core/i18n.js';

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

  /**
   * Bilan de sante.
   *
   * Ne s'affiche que si quelque chose a ete releve sur la periode : une carte
   * de tirets n'apprend rien, et la plupart des gens ne notent qu'une ou deux
   * de ces mesures. Chaque ligne suit la meme regle -- pas de mesure, pas de
   * ligne -- plutot qu'un tableau fixe ou l'on chercherait sa donnee parmi six
   * cases vides.
   *
   * Aucun chiffre n'est qualifie. Une tension moyenne s'affiche, elle n'est ni
   * verte ni rouge : Daylog ne sait pas ce qu'elle signifie pour la personne
   * qui la lit, et le laisser croire serait un diagnostic deguise.
   *
   * Le calcul n'est telecharge que s'il sert.
   */
  async function healthCard(rows) {
    const KEYS = ['weightKg', 'bpmRest', 'bpmMin', 'bpmMax', 'tempC', 'bpSys', 'spo2', 'pain'];
    if (!rows.some((r) => KEYS.some((k) => typeof r?.[k] === 'number'))) return null;

    const { weightTrend } = await import('../core/health.js');
    const trend = weightTrend(rows);
    const last = [...rows].reverse().find((r) => typeof r.weightKg === 'number');

    const lines = [
      last && fact('Dernière pesée', formatNumber(last.weightKg, { digits: 1 }), 'kg'),
      trend.change !== null &&
        fact(
          'Tendance',
          `${trend.change > 0 ? '+' : trend.change < 0 ? '−' : ''}` +
            formatNumber(Math.abs(trend.change), { digits: 1 }),
          `kg sur ${trend.days} j`
        ),
      meanOf(rows, 'bpmRest') !== null &&
        fact('Pouls au repos', formatNumber(round(meanOf(rows, 'bpmRest'), 0)), 'bpm'),
      meanOf(rows, 'tempC') !== null &&
        fact('Température', formatNumber(round(meanOf(rows, 'tempC'), 1), { digits: 1 }), '°C'),
      meanOf(rows, 'bpSys') !== null &&
        fact(
          'Tension',
          `${formatNumber(round(meanOf(rows, 'bpSys'), 0))}/` +
            `${formatNumber(round(meanOf(rows, 'bpDia'), 0))}`,
          'mmHg'
        ),
      meanOf(rows, 'spo2') !== null &&
        fact('Oxygénation', formatNumber(round(meanOf(rows, 'spo2'), 0)), '%'),
      meanOf(rows, 'pain') !== null &&
        fact('Douleur', formatNumber(round(meanOf(rows, 'pain'), 1), { digits: 1 }), '/ 10'),
    ].filter(Boolean);

    return el('div', { class: 'card' }, [
      el('h2', { class: 'card-title' }, 'Santé'),
      el('dl', { class: 'facts' }, lines),
      el('p', { class: 'card-hint', style: { marginBottom: '0' } },
        'Des relevés, sans interprétation. Ce sont ces chiffres que ton extrait ' +
          '« Santé » emporte.'
      ),
    ]);
  }

  /**
   * Bilan de l'activite.
   *
   * On compte ce qui a eu lieu : des jours ou quelque chose a ete note, jamais
   * des jours « manques ». La distinction n'est pas cosmetique -- « 12 jours
   * actifs sur 30 » et « 18 jours sans activité » decrivent les memes chiffres
   * et ne disent pas la meme chose a qui les lit.
   *
   * Aucune calorie active ici : elles se deduisent du poids, que le resume ne
   * porte pas. Elles restent sur l'ecran du jour, ou le profil est sous la main.
   */
  function activityCard(rows) {
    const bougé = rows.filter((r) => typeof r.moveMin === 'number' || typeof r.moveM === 'number');
    const repos = rows.filter((r) => r.restDay === 1).length;
    if (!bougé.length && !repos) return null;

    const minutes = rows.map((r) => r.moveMin).filter((v) => typeof v === 'number');
    const metres = rows.map((r) => r.moveM).filter((v) => typeof v === 'number');
    const seances = rows.map((r) => r.workouts).filter((v) => typeof v === 'number');

    return el('div', { class: 'card' }, [
      el('h2', { class: 'card-title' }, 'Bouger'),
      el('dl', { class: 'facts' }, [
        fact('Jours notés', String(bougé.length)),
        seances.length &&
          fact('Séances', String(seances.reduce((a, b) => a + b, 0))),
        minutes.length &&
          fact('Temps total', formatDuration(minutes.reduce((a, b) => a + b, 0))),
        metres.length &&
          fact(
            'Distance',
            formatNumber(metres.reduce((a, b) => a + b, 0) / 1000, { digits: 1 }),
            'km'
          ),
        repos > 0 && fact('Jours de repos notés', String(repos)),
      ].filter(Boolean)),
    ]);
  }

  /**
   * Bilan de l'argent.
   *
   * Trois chiffres, et pas un budget. Le cahier des charges n'en demande pas,
   * et une application qui dirait « tu as trop depense en restaurants » ferait
   * exactement ce qu'elle refuse partout ailleurs : juger un releve.
   *
   * Le classement par categorie exigerait de relire les fiches completes -- les
   * resumes ne portent que les trois totaux. Il vaut mieux le laisser a l'ecran
   * du jour que faire relire quatre-vingt-dix fiches pour un camembert.
   */
  async function moneyCard(rows) {
    if (!rows.some((r) => typeof r?.balance === 'number')) return null;
    const { periodTotals, formatMoney } = await import('../core/money.js');
    const currency = store.getCapabilities()?.currency || 'EUR';
    const totals = periodTotals(rows);

    return el('div', { class: 'card' }, [
      el('h2', { class: 'card-title' }, 'Argent'),
      el('dl', { class: 'facts' }, [
        fact('Jours notés', String(totals.days)),
        totals.spent !== null && fact('Dépensé', formatMoney(totals.spent, currency)),
        totals.earned !== null && fact('Reçu', formatMoney(totals.earned, currency)),
        fact('Balance', formatMoney(totals.balance, currency, { sign: true })),
      ].filter(Boolean)),
      el('p', { class: 'card-hint', style: { marginBottom: '0' } },
        'Sur les journées où tu as noté quelque chose. Les virements bougent la ' +
          'balance sans entrer dans les deux autres totaux.'
      ),
    ]);
  }

  /**
   * Courbe de poids.
   *
   * Une echelle calee sur les valeurs relevees, et non sur zero : partir de
   * zero pour un poids de 72 kg ecraserait toute la courbe sur un dixieme de la
   * hauteur, et les deux kilos qu'on cherche justement a voir deviendraient
   * invisibles. C'est pour la meme raison que ce n'est pas un histogramme.
   */
  function weightChart(labels, values) {
    const known = values.filter((v) => typeof v === 'number');
    if (known.length < 2) return null;
    const lo = Math.min(...known);
    const hi = Math.max(...known);
    // Une marge d'au moins 500 g, sinon une serie presque plate remplit
    // l'ecran de bruit et donne a voir une variation qui n'existe pas.
    const pad = Math.max((hi - lo) * 0.15, 0.5);
    return el('div', { class: 'card' }, [
      lineChart({
        title: 'Poids',
        labels,
        series: [{ label: 'Poids', values }],
        min: Math.floor((lo - pad) * 10) / 10,
        max: Math.ceil((hi + pad) * 10) / 10,
      }),
    ]);
  }

  async function draw() {
    const end = today(store.getSettings().dayStartHour || 0);
    const dates = lastNDays(periodDays, end);
    const [rows, cycleBlock] = await Promise.all([
      db.getSummaries(dates[0], end),
      cycleCard(end).catch(() => null),
    ]);
    const healthBlock = await healthCard(rows).catch(() => null);
    const moneyBlock = await moneyCard(rows).catch(() => null);

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
            fact('Calories', formatNumber(round(meanOf(rows, 'kcal'), 0)), 'kcal / jour'),
            fact('Protéines', formatNumber(round(meanOf(rows, 'protein'), 0)), 'g / jour'),
          ]),
        ]),

        cycleBlock,
        healthBlock,
        activityCard(rows),
        moneyBlock,

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

        // Les graphiques ne s'affichent que si la serie contient quelque chose :
        // une carte de trous n'apprend rien et occupe un ecran entier.
        tracked > 0 && value('kcal').some((v) => v !== null) && el('div', { class: 'card' }, [
          barChart({
            title: 'Calories',
            labels,
            values: value('kcal'),
            label: 'Calories',
            unit: 'kcal',
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

        tracked > 0 && weightChart(labels, value('weightKg')),

        tracked > 0 && value('moveM').some((v) => v !== null) && el('div', { class: 'card' }, [
          barChart({
            title: 'Distance',
            labels,
            // En kilometres : un histogramme en metres affiche des nombres a
            // cinq chiffres sous chaque barre.
            values: value('moveM').map((v) => (v === null ? null : Math.round(v / 10) / 100)),
            label: 'Distance',
            unit: 'km',
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
