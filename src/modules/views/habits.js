/**
 * Habitudes.
 *
 * Le point delicat de ce module est l'integrite de l'historique, et c'est
 * exactement ce que le prototype v5 ratait :
 *
 * - il reliait les habitudes a l'historique PAR LEUR LIBELLE, donc renommer
 *   "Sport" en "Muscu" cassait tout le passe ;
 * - il recalculait le taux de completion avec la liste d'habitudes ACTUELLE,
 *   donc ajouter une habitude aujourd'hui faisait baisser retroactivement tous
 *   les scores des mois precedents.
 *
 * Ici, chaque habitude a un identifiant qui ne change jamais, et chaque journee
 * enregistre `active` : la photographie des habitudes qui existaient CE JOUR-LA.
 * Le score d'une journee passee ne bouge donc plus jamais.
 *
 * Une habitude n'est pas supprimee mais archivee : elle disparait de la saisie
 * tout en restant lisible dans l'historique.
 */

import { el, mount } from '../../ui/dom.js';
import * as db from '../../core/db.js';
import { createListItem, activeItems } from '../../core/ids.js';

const KIND = 'habit';

export async function render({ store }) {
  const container = el('div', { class: 'card' });
  let items = await db.getList(KIND);

  function currentData() {
    return store.get('habits') || {};
  }

  function done() {
    return new Set(currentData().done || []);
  }

  /**
   * Enregistre l'etat du jour.
   *
   * `active` est ecrit a chaque fois : sans cette photographie, le pourcentage
   * de la journee dependrait de la liste d'habitudes du moment ou on le regarde,
   * et non de celle du jour concerne.
   */
  function save(doneSet) {
    const active = activeItems(items).map((i) => i.id);
    store.update('habits', {
      done: [...doneSet],
      active,
    });
  }

  function toggle(id) {
    const set = done();
    if (set.has(id)) set.delete(id);
    else set.add(id);
    save(set);
    draw();
  }

  async function add(label) {
    const clean = label.trim();
    if (!clean) return;
    // Doublon : on ne cree pas une seconde habitude du meme nom, mais on
    // reactive celle qui existe deja si elle etait archivee.
    const existing = items.find((i) => i.label.toLowerCase() === clean.toLowerCase());
    if (existing) {
      if (existing.archivedAt) {
        existing.archivedAt = null;
        await db.putListItem(existing);
      }
    } else {
      const item = createListItem(KIND, clean);
      await db.putListItem(item);
      items.push(item);
    }
    items = await db.getList(KIND);
    save(done());
    draw();
  }

  async function archive(id) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    item.archivedAt = new Date().toISOString();
    await db.putListItem(item);
    items = await db.getList(KIND);
    // L'habitude archivee sort aussi du jour courant, mais reste dans les
    // journees deja enregistrees.
    const set = done();
    set.delete(id);
    save(set);
    draw();
  }

  function draw() {
    const list = activeItems(items);
    const doneSet = done();

    const chips = list.map((item) => {
      const isDone = doneSet.has(item.id);
      return el('div', { class: `chip${isDone ? ' is-done' : ''}` }, [
        el('button', {
          type: 'button',
          class: 'chip-toggle',
          'aria-pressed': isDone ? 'true' : 'false',
          onClick: () => toggle(item.id),
        }, [
          el('span', { class: 'chip-mark', 'aria-hidden': 'true' }, isDone ? '✓' : ''),
          el('span', {}, item.label),
        ]),
        el('button', {
          type: 'button',
          class: 'chip-remove',
          'aria-label': `Retirer « ${item.label} » de ma liste`,
          title: 'Retirer de ma liste',
          onClick: () => archive(item.id),
        }, '×'),
      ]);
    });

    const input = el('input', {
      type: 'text',
      class: 'input',
      id: 'habit-new',
      placeholder: 'Méditation, lecture, marche…',
      onKeydown: (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          add(input.value);
          input.value = '';
        }
      },
    });

    mount(container, [
      el('div', { class: 'card-head' }, [
        el('h2', { class: 'card-title' }, 'Habitudes'),
        list.length &&
          el('span', { class: 'card-count' }, `${doneSet.size} sur ${list.length}`),
      ]),
      list.length
        ? el('div', { class: 'chips' }, chips)
        : el('p', { class: 'card-hint' },
            "Ajoute ce que tu veux tenir au quotidien. Rien n'est impose, et tu peux " +
              'changer d\'avis quand tu veux.'
          ),
      el('div', { class: 'add-row' }, [
        el('label', { class: 'sr-only', for: 'habit-new' }, 'Nouvelle habitude'),
        input,
        el('button', {
          type: 'button',
          class: 'btn',
          onClick: () => {
            add(input.value);
            input.value = '';
          },
        }, 'Ajouter'),
      ]),
      list.length > 0 &&
        el('p', { class: 'card-hint', style: { marginTop: '0.75rem', marginBottom: '0' } },
          "Retirer une habitude ne touche pas aux journées déjà enregistrées : " +
            'leurs scores restent ceux du moment.'
        ),
    ]);
  }

  draw();
  return container;
}
