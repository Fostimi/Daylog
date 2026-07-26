/**
 * Sommeil.
 *
 * Ce module etait au depart cache derriere un bouton « Ajouter du detail »,
 * ce qui n'avait pas de sens : le sommeil n'est pas un detail de l'humeur,
 * c'est un suivi a part entiere, au meme titre que les habitudes ou
 * l'hydratation. Il s'affiche donc comme les autres, et se desactive comme les
 * autres si on ne veut pas le suivre.
 *
 * La duree se calcule toute seule a partir du coucher et du lever, tout en
 * restant modifiable a la main : les montres donnent un temps de sommeil
 * effectif, plus court que le temps passe au lit.
 */

import { el, mount } from '../../ui/dom.js';
import { scale, numberField, timeField } from '../../ui/controls.js';

export async function render({ store }) {
  const container = el('div', { class: 'card' });

  function data() {
    return store.get('sleep') || {};
  }

  /** Duree entre le coucher et le lever, minuit traverse compris. */
  function computeHours(bedtime, wake) {
    if (!bedtime || !wake) return null;
    const [bh, bm] = bedtime.split(':').map(Number);
    const [wh, wm] = wake.split(':').map(Number);
    let mins = wh * 60 + wm - (bh * 60 + bm);
    if (mins < 0) mins += 1440;
    return Math.round((mins / 60) * 100) / 100;
  }

  function draw() {
    const d = data();

    const bed = timeField({
      id: 'sleep-bed',
      label: 'Coucher',
      value: d.bedtime,
      onInput: (v) => {
        const hours = computeHours(v, data().wake);
        store.update('sleep', { bedtime: v, ...(hours !== null ? { hours } : {}) });
        refreshDuration();
      },
    });

    const wake = timeField({
      id: 'sleep-wake',
      label: 'Lever',
      value: d.wake,
      onInput: (v) => {
        const hours = computeHours(data().bedtime, v);
        store.update('sleep', { wake: v, ...(hours !== null ? { hours } : {}) });
        refreshDuration();
      },
    });

    const hours = numberField({
      id: 'sleep-hours',
      label: 'Durée',
      value: d.hours,
      step: 0.25,
      min: 0,
      max: 24,
      unit: 'h',
      onInput: (v) => store.update('sleep', { hours: v }),
    });

    function refreshDuration() {
      hours.set(data().hours ?? null);
    }

    const quality = scale({
      id: 'sleep-quality',
      label: 'Qualité du sommeil',
      value: d.quality,
      lowLabel: 'mauvaise',
      highLabel: 'excellente',
      onChange: (v) => store.update('sleep', { quality: v }),
    });

    const awakenings = numberField({
      id: 'sleep-awakenings',
      label: 'Réveils dans la nuit',
      value: d.awakenings,
      step: 1,
      min: 0,
      max: 30,
      onInput: (v) => store.update('sleep', { awakenings: v }),
    });

    mount(container, [
      el('div', { class: 'card-head' }, [
        el('h2', { class: 'card-title' }, 'Sommeil'),
        typeof d.hours === 'number' &&
          el('span', { class: 'card-count' }, `${String(d.hours).replace('.', ',')} h`),
      ]),
      el('div', { class: 'field-row' }, [bed.node, wake.node, hours.node]),
      quality.node,
      awakenings.node,
      el('p', { class: 'card-hint', style: { marginBottom: '0' } },
        'La durée se calcule toute seule, mais reste modifiable : une montre ' +
          'compte le sommeil réel, pas le temps passé au lit.'
      ),
    ]);
  }

  draw();
  return container;
}
