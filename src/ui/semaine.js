/**
 * Vue hebdomadaire.
 *
 * Prevue au cahier des charges depuis le debut, et absente jusqu'ici. Elle
 * repond a une question que ni l'ecran du jour ni le bilan ne traitent : « ma
 * semaine, ça a donne quoi ? » -- l'un est trop pres, l'autre trop loin.
 *
 * Elle rend aussi le service que le cahier des charges appelait « acces rapide
 * au journal jour par jour » : les sept journees sont la, et chacune s'ouvre
 * d'un geste. C'est le premier morceau de l'historique navigable.
 *
 * Ce que cet ecran ne fait pas :
 *
 * - il ne note pas la semaine. Pas de score, pas de « bonne semaine », pas de
 *   couleur. La semaine precedente est affichee a cote, et c'est tout : Daylog
 *   ne sait pas si un stress en hausse est une mauvaise nouvelle pour la
 *   personne qui le lit ;
 * - il ne compte pas les jours manquants. « 3 jours suivis » et « 4 jours
 *   manques » sont la meme information ; l'une se lit sans reproche.
 *
 * Cet ecran n'est telecharge qu'a son ouverture.
 */

import { el, mount } from './dom.js';
import { topbar } from './menu.js';
import * as db from '../core/db.js';
import { addDays, weekStart, weekDays, today, toDate, isFuture } from '../core/date.js';
import { formatDayMonth, formatNumber, formatDuration } from '../core/i18n.js';
import { weekReview, dayGlance, compareWeeks } from '../core/week.js';

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export function createSemaineView({ store, root, go, alert = null }) {
  const dayStart = store.getSettings().dayStartHour || 0;
  let start = weekStart(today(dayStart));

  async function load() {
    const days = weekDays(start);
    const previous = weekDays(addDays(start, -7));
    try {
      const [rows, before] = await Promise.all([
        db.getSummaries(days[0], days[6]),
        db.getSummaries(previous[0], previous[6]),
      ]);
      return {
        days,
        current: weekReview(rows, days),
        previous: weekReview(before, previous),
      };
    } catch {
      return { days, current: weekReview([], days), previous: null };
    }
  }

  function fact(label, value, unit = '') {
    return el('div', { class: 'fact' }, [
      el('dt', {}, label),
      el('dd', {}, unit ? `${value} ${unit}` : value),
    ]);
  }

  /**
   * La bande des sept jours.
   *
   * Chaque ligne est un bouton qui ouvre la journee : c'est ce qui manquait le
   * plus a l'application, ou l'on ne pouvait atteindre le 12 du mois qu'en
   * cliquant douze fois sur la fleche « jour precedent ».
   *
   * Une journee a venir n'est pas cliquable -- on ne note pas une journee qui
   * n'a pas eu lieu -- et le dit, plutot que d'etre grisee sans explication.
   */
  function dayStrip(review) {
    return el('div', { class: 'week-strip' }, review.dates.map((date, i) => {
      const row = review.days[i];
      const futur = isFuture(date, dayStart);
      const glance = dayGlance(row);

      const contenu = [
        el('span', { class: 'week-day-name' }, [
          JOURS[i],
          el('span', { class: 'week-day-date' }, ` ${formatDayMonth(date)}`),
        ]),
        el('span', { class: `week-day-note${glance ? ' is-set' : ''}` },
          futur ? 'Pas encore' : glance || 'Rien de noté'
        ),
      ];

      if (futur) {
        return el('div', { class: 'week-day is-future' }, contenu);
      }
      return el('button', {
        type: 'button',
        class: `week-day${glance ? ' is-tracked' : ''}`,
        'aria-label': `Ouvrir ${JOURS[i].toLowerCase()} ${formatDayMonth(date)}`,
        onClick: () => go('today', { date }),
      }, contenu);
    }));
  }

  /** Les deux semaines cote a cote, sans jamais dire laquelle est la bonne. */
  function comparison(current, previous) {
    const lignes = compareWeeks(current, previous);
    if (!lignes.length) return null;

    return el('div', { class: 'card' }, [
      el('h2', { class: 'card-title' }, 'Et la semaine d’avant'),
      el('dl', { class: 'facts' }, lignes.map((c) =>
        el('div', { class: 'fact' }, [
          el('dt', {}, c.label),
          el('dd', {}, [
            `${formatNumber(c.now, { digits: c.digits })}${c.unit ? ` ${c.unit}` : ''}`,
            el('span', { class: 'fact-goal' },
              ` contre ${formatNumber(c.before, { digits: c.digits })}`
            ),
          ]),
        ])
      )),
      el('p', { class: 'card-hint', style: { marginBottom: '0' } },
        'Deux semaines côte à côte. À toi de voir ce que ça vaut.'
      ),
    ]);
  }

  async function draw() {
    const { current, previous } = await load();
    const days = current.dates;
    const debutSemaineCourante = weekStart(today(dayStart));
    const cetteSemaine = start === debutSemaineCourante;

    const facts = [
      fact('Jours suivis', `${current.tracked} sur 7`),
      current.mood !== null && fact('Humeur', formatNumber(current.mood, { digits: 1 }), '/ 10'),
      current.energy !== null && fact('Énergie', formatNumber(current.energy, { digits: 1 }), '/ 10'),
      current.stress !== null && fact('Stress', formatNumber(current.stress, { digits: 1 }), '/ 10'),
      current.sleepTotal !== null &&
        fact('Sommeil', formatNumber(current.sleepTotal, { digits: 1 }), 'h au total'),
      current.sleepMean !== null &&
        fact('Par nuit', formatNumber(current.sleepMean, { digits: 1 }), `h sur ${current.sleepNights}`),
      current.moveMin !== null && fact('Temps actif', formatDuration(current.moveMin)),
      current.moveM !== null &&
        fact('Distance', formatNumber(current.moveM / 1000, { digits: 1 }), 'km'),
      current.workouts !== null && fact('Séances', String(current.workouts)),
      current.restDays !== null && fact('Repos noté', `${current.restDays} j`),
      current.kcalMean !== null && fact('Calories', formatNumber(current.kcalMean), 'kcal / jour'),
      current.waterMean !== null && fact('Eau', formatNumber(current.waterMean), 'ml / jour'),
      current.weight !== null &&
        fact('Dernière pesée', formatNumber(current.weight, { digits: 1 }), 'kg'),
      current.notes !== null && fact('Journal', `${current.notes} j`),
    ].filter(Boolean);

    mount(root, [
      el('a', { class: 'skip-link', href: '#main' }, 'Aller au contenu'),
      topbar({
        title: 'Ta semaine',
        subtitle: `du ${formatDayMonth(days[0])} au ${formatDayMonth(days[6])}`,
        current: 'week',
        go,
        alert,
        before: [
          el('button', {
            class: 'icon-btn',
            type: 'button',
            'aria-label': 'Semaine précédente',
            onClick: () => {
              start = addDays(start, -7);
              draw();
            },
          }, '←'),
          el('button', {
            class: 'icon-btn',
            type: 'button',
            'aria-label': 'Semaine suivante',
            disabled: cetteSemaine,
            onClick: () => {
              start = addDays(start, 7);
              draw();
            },
          }, '→'),
        ],
      }),

      el('main', { class: 'app', id: 'main' }, [
        current.tracked === 0
          ? el('div', { class: 'card' }, [
              el('h2', { class: 'card-title' }, 'Rien de noté cette semaine'),
              el('p', { class: 'card-hint', style: { marginBottom: '0' } },
                'Ouvre une journée ci-dessous pour la compléter — même longtemps ' +
                  'après, et sans avoir à te justifier.'
              ),
            ])
          : el('div', { class: 'card' }, [
              el('h2', { class: 'card-title' }, 'En résumé'),
              el('dl', { class: 'facts' }, facts),
            ]),

        el('div', { class: 'card' }, [
          el('h2', { class: 'card-title' }, 'Jour par jour'),
          el('p', { class: 'card-hint' }, 'Appuie sur une journée pour l’ouvrir.'),
          dayStrip(current),
        ]),

        comparison(current, previous),

        el('p', { class: 'footer-note' },
          'Outil de suivi, pas un dispositif médical.'
        ),
      ]),
    ]);
  }

  return { render: draw };
}
