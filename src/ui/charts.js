/**
 * Graphiques en SVG, sans aucune bibliotheque.
 *
 * Le prototype v5 chargeait 200 Ko de Chart.js depuis un CDN pour dessiner des
 * barres et des courbes -- plus lourd que toute l'application actuelle, et une
 * requete vers un serveur tiers a chaque ouverture. Ce fichier fait le meme
 * travail en quelques kilo-octets, sans reseau.
 *
 * Le SVG n'est pas qu'un choix de poids, c'est aussi un choix d'accessibilite.
 * Chart.js dessine dans un `<canvas>`, c'est-a-dire une image : un lecteur
 * d'ecran n'y voit rien, et agrandir la police du systeme ne change rien. Ici
 * chaque graphique porte une description lisible, et s'accompagne d'un tableau
 * de ses valeurs -- consultable par tout le monde, pas seulement par ceux qui
 * distinguent bien les couleurs.
 *
 * Regle commune a tout ce fichier : une valeur absente est un TROU, jamais un
 * zero. Une journee non renseignee ne doit pas dessiner une chute.
 */

import { el } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';

/** Cree un element SVG (namespace different de celui du HTML). */
function svgEl(tag, attrs = {}, children = []) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    node.setAttribute(k, String(v));
  }
  for (const child of [].concat(children)) {
    if (child) node.appendChild(child);
  }
  return node;
}

/** Bornes verticales d'une serie, en ignorant les trous. */
function bounds(values, { min = null, max = null } = {}) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!nums.length) return null;
  return {
    min: min ?? Math.min(...nums),
    max: max ?? Math.max(...nums),
  };
}

/**
 * Tableau de valeurs, replie sous le graphique.
 *
 * C'est l'alternative textuelle : elle rend le graphique consultable au lecteur
 * d'ecran, et donne les chiffres exacts a qui en veut. `<details>` fournit
 * gratuitement le clavier et l'annonce de l'etat.
 */
function dataTable({ labels, series }) {
  return el('details', { class: 'chart-data' }, [
    el('summary', {}, 'Voir les chiffres'),
    el('div', { class: 'chart-table-wrap' }, [
      el('table', { class: 'chart-table' }, [
        el('thead', {}, [
          el('tr', {}, [
            el('th', { scope: 'col' }, 'Jour'),
            ...series.map((s) => el('th', { scope: 'col' }, s.label)),
          ]),
        ]),
        el('tbody', {},
          labels.map((label, i) =>
            el('tr', {}, [
              el('th', { scope: 'row' }, label),
              ...series.map((s) => {
                const v = s.values[i];
                return el('td', {},
                  typeof v === 'number' ? String(Math.round(v * 10) / 10) : '—'
                );
              }),
            ])
          )
        ),
      ]),
    ]),
  ]);
}

/**
 * Graphique en barres.
 *
 * Utilise pour le sommeil : chaque nuit est une quantite independante, une
 * barre le dit mieux qu'une courbe -- qui suggererait une continuite entre deux
 * nuits qui n'existe pas.
 */
export function barChart({ labels, values, label, unit = '', max = null, title }) {
  const b = bounds(values, { min: 0, max });
  if (!b) return emptyChart(title);

  const W = 100;
  const H = 42;
  const top = b.max * 1.1 || 1;
  const n = values.length;
  const slot = W / n;
  const barW = Math.max(slot * 0.6, 0.6);

  const bars = values.map((v, i) => {
    if (typeof v !== 'number') return null; // trou : on ne dessine rien
    const h = (v / top) * H;
    return svgEl('rect', {
      x: i * slot + (slot - barW) / 2,
      y: H - h,
      width: barW,
      height: Math.max(h, 0.4),
      rx: 0.6,
      class: 'chart-bar',
    });
  });

  const described = values.filter((v) => typeof v === 'number');
  const moyenne = described.reduce((a, x) => a + x, 0) / described.length;

  return el('figure', { class: 'chart' }, [
    el('figcaption', { class: 'chart-title' }, title),
    svgEl('svg', {
      viewBox: `0 0 ${W} ${H}`,
      preserveAspectRatio: 'none',
      class: 'chart-svg',
      role: 'img',
      'aria-label':
        `${title} : ${described.length} jours renseignés sur ${n}, ` +
        `moyenne ${Math.round(moyenne * 10) / 10} ${unit}. Les chiffres exacts ` +
        'sont dans le tableau qui suit.',
    }, bars),
    el('div', { class: 'chart-legend' }, [
      el('span', {}, labels[0] || ''),
      el('span', {}, `${label} — moyenne ${Math.round(moyenne * 10) / 10} ${unit}`),
      el('span', {}, labels[labels.length - 1] || ''),
    ]),
    dataTable({ labels, series: [{ label: `${label} (${unit})`, values }] }),
  ]);
}

/**
 * Graphique en courbes, une ou plusieurs series.
 *
 * Les trous coupent la ligne au lieu de la faire plonger : une journee non
 * renseignee n'est pas une journee a zero, et une courbe qui descend a zero
 * raconterait quelque chose de faux.
 */
export function lineChart({ labels, series, title, min = 1, max = 10 }) {
  const all = series.flatMap((s) => s.values);
  if (!bounds(all)) return emptyChart(title);

  const W = 100;
  const H = 42;
  const n = labels.length;
  const x = (i) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v) => H - ((v - min) / (max - min)) * H;

  const paths = series.map((s, si) => {
    // On decoupe en segments continus : chaque trou termine le segment courant.
    const segments = [];
    let current = [];
    s.values.forEach((v, i) => {
      if (typeof v === 'number') current.push(`${x(i)},${y(v)}`);
      else if (current.length) {
        segments.push(current);
        current = [];
      }
    });
    if (current.length) segments.push(current);

    return segments.map((seg) =>
      seg.length === 1
        ? svgEl('circle', {
            cx: seg[0].split(',')[0],
            cy: seg[0].split(',')[1],
            r: 0.9,
            class: `chart-dot chart-serie-${si}`,
          })
        : svgEl('polyline', {
            points: seg.join(' '),
            fill: 'none',
            class: `chart-line chart-serie-${si}`,
          })
    );
  });

  return el('figure', { class: 'chart' }, [
    el('figcaption', { class: 'chart-title' }, title),
    svgEl('svg', {
      viewBox: `0 0 ${W} ${H}`,
      preserveAspectRatio: 'none',
      class: 'chart-svg',
      role: 'img',
      'aria-label':
        `${title}. ${series
          .map((s) => {
            const nums = s.values.filter((v) => typeof v === 'number');
            if (!nums.length) return `${s.label} : aucune donnée`;
            const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
            return `${s.label} : moyenne ${Math.round(avg * 10) / 10} sur ${max}`;
          })
          .join('. ')}. Les chiffres exacts sont dans le tableau qui suit.`,
    }, paths.flat()),

    // La legende nomme chaque serie ET porte sa pastille : la couleur seule
    // n'est pas percue par tout le monde.
    el('div', { class: 'chart-keys' },
      series.map((s, si) =>
        el('span', { class: 'chart-key' }, [
          el('span', { class: `chart-swatch chart-serie-${si}`, 'aria-hidden': 'true' }),
          s.label,
        ])
      )
    ),
    el('div', { class: 'chart-legend' }, [
      el('span', {}, labels[0] || ''),
      el('span', {}, labels[labels.length - 1] || ''),
    ]),
    dataTable({ labels, series }),
  ]);
}

function emptyChart(title) {
  return el('figure', { class: 'chart chart-empty' }, [
    el('figcaption', { class: 'chart-title' }, title),
    el('p', { class: 'card-hint', style: { marginBottom: '0' } },
      'Pas encore de données sur cette période.'
    ),
  ]);
}
