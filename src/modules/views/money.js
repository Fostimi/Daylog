/**
 * Argent.
 *
 * L'ecran est court parce que le geste l'est : on note une depense en trois
 * champs, dont deux sont pre-remplis. Un suivi de depenses qu'on ne remplit pas
 * le soir meme ne se remplit jamais.
 *
 * Deux choses qui ne se voient pas et qui decident de tout :
 *
 * 1. Les montants circulent en CENTIMES ENTIERS. La saisie convertit une fois,
 *    l'affichage reconvertit une fois, et entre les deux plus aucun flottant --
 *    voir core/money.js pour ce que ça evite.
 *
 * 2. Un VIREMENT bouge la balance sans entrer dans les totaux. Se faire
 *    rembourser un repas n'est pas un revenu, et rembourser un ami n'est pas
 *    une depense de loisir. L'ecran affiche donc trois chiffres et non deux, et
 *    dit lequel comprend quoi.
 *
 * Aucun budget, aucun plafond, aucune alerte de depassement. Le cahier des
 * charges n'en demande pas, et une application qui dirait « tu as trop depense
 * en restaurants » ferait exactement ce que celle-ci refuse partout ailleurs :
 * juger un releve.
 *
 * Cet ecran n'est telecharge que si le module est actif.
 */

import { el, mount } from '../../ui/dom.js';
import { info } from '../../ui/controls.js';
import { newId } from '../../core/ids.js';
import {
  CURRENCIES,
  KINDS,
  TRANSFER_DIRECTIONS,
  categoriesFor,
  categoryLabel,
  currencyOf,
  toCents,
  formatMoney,
  dayTotals,
} from '../../core/money.js';

export async function render({ store }) {
  const container = el('div', { class: 'card' });
  const capabilities = store.getCapabilities() || {};

  let currency = CURRENCIES.some((c) => c.id === capabilities.currency)
    ? capabilities.currency
    : 'EUR';

  // Etat du formulaire. Il survit aux redessins : changer la nature d'une ligne
  // change les champs proposes, et perdre le montant deja tape a ce moment-la
  // serait le meilleur moyen de ne jamais etre utilise deux fois.
  let kind = 'expense';
  let direction = 'in';
  const draft = { amount: '', label: '', category: '' };
  let error = null;

  function data() {
    return store.get('money') || {};
  }

  function entries() {
    return data().entries || [];
  }

  function write(next) {
    store.update('money', { entries: next.length ? next : null });
  }

  async function setCurrency(next) {
    currency = next;
    capabilities.currency = next;
    await store.setCapabilities({ currency: next });
    draw();
  }

  function addEntry() {
    const amount = toCents(draft.amount);
    if (amount.value === null) {
      error = amount.reason || 'missing';
      draw();
      return;
    }
    const entry = {
      id: newId('mon'),
      kind,
      amount: amount.value,
      at: new Date().toISOString(),
    };
    if (kind === 'transfer') entry.direction = direction;
    else entry.categoryId = draft.category || categoriesFor(kind)[0].id;
    if (draft.label.trim()) entry.label = draft.label.trim();

    error = null;
    draft.amount = '';
    draft.label = '';
    write([...entries(), entry]);
    draw();
  }

  function removeEntry(id) {
    write(entries().filter((e) => e.id !== id));
    draw();
  }

  // ------------------------------------------------------------------ rendu

  /** Une ligne enregistree. */
  function entryRow(entry) {
    const kindDef = KINDS.find((k) => k.id === entry.kind);
    const nature =
      entry.kind === 'transfer'
        ? TRANSFER_DIRECTIONS.find((d) => d.id === entry.direction)?.label || 'Virement'
        : categoryLabel(entry.kind, entry.categoryId) || kindDef?.label || '';

    // Le signe suit ce qui bouge sur le compte, pas la nature de la ligne : un
    // remboursement recu est un plus, meme s'il n'est pas un revenu.
    const positif = entry.kind === 'income' || (entry.kind === 'transfer' && entry.direction !== 'out');

    return el('div', { class: 'meal-item' }, [
      el('span', { class: 'meal-item-main', style: { cursor: 'default' } }, [
        el('span', { class: 'meal-item-label' }, entry.label || nature),
        el('span', { class: 'meal-item-qty' }, entry.label ? nature : kindDef?.label || ''),
      ]),
      el('span', { class: 'meal-item-kcal' },
        formatMoney(positif ? entry.amount : -entry.amount, currency, { sign: true })
      ),
      el('button', {
        type: 'button',
        class: 'chip-remove',
        'aria-label': `Retirer ${entry.label || nature}`,
        onClick: () => removeEntry(entry.id),
      }, '×'),
    ]);
  }

  /** Choix de la nature : trois boutons exclusifs, motif radiogroup. */
  function kindRow() {
    return el('div', {
      class: 'flow-row',
      role: 'radiogroup',
      'aria-labelledby': 'money-kind-label',
    }, KINDS.map((k) => {
      const on = k.id === kind;
      return el('button', {
        type: 'button',
        role: 'radio',
        class: `flow-btn${on ? ' is-selected' : ''}`,
        'aria-checked': on ? 'true' : 'false',
        tabindex: on ? '0' : '-1',
        onClick: () => {
          kind = k.id;
          draft.category = '';
          error = null;
          draw();
        },
      }, [
        el('span', { class: 'flow-mark', 'aria-hidden': 'true' }, on ? '✓' : ''),
        el('span', {}, k.label),
      ]);
    }));
  }

  function form() {
    const amount = el('input', {
      type: 'text',
      id: 'money-amount',
      class: 'input',
      inputmode: 'decimal',
      autocomplete: 'off',
      placeholder: 'ex. 12,50',
      onInput: (e) => {
        draft.amount = e.target.value;
      },
      onKeydown: (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addEntry();
        }
      },
    });
    amount.value = draft.amount;

    const label = el('input', {
      type: 'text',
      id: 'money-label',
      class: 'input',
      autocomplete: 'off',
      maxlength: '60',
      placeholder: 'facultatif',
      onInput: (e) => {
        draft.label = e.target.value;
      },
    });
    label.value = draft.label;

    const cats = categoriesFor(kind);
    const category = cats.length
      ? el('select', {
          class: 'input',
          id: 'money-cat',
          onChange: (e) => {
            draft.category = e.target.value;
          },
        }, cats.map((c) => el('option', { value: c.id }, c.label)))
      : null;
    if (category) category.value = draft.category || cats[0].id;

    const dirRow = kind !== 'transfer' ? null : el('fieldset', { class: 'onb-fieldset' }, [
      el('legend', { class: 'onb-legend' }, 'Dans quel sens'),
      ...TRANSFER_DIRECTIONS.map((d) => {
        const id = `money-dir-${d.id}`;
        return el('label', { class: 'onb-option', for: id }, [
          el('input', {
            type: 'radio',
            name: 'money-dir',
            id,
            class: 'onb-input',
            checked: direction === d.id,
            onChange: () => {
              direction = d.id;
            },
          }),
          el('span', { class: 'onb-option-text' }, [
            el('span', { class: 'onb-option-label' }, d.label),
          ]),
        ]);
      }),
    ]);

    const messages = {
      missing: 'Il faut un montant.',
      nan: 'Il faut un nombre, avec ou sans virgule.',
      negative: 'Le montant s’écrit sans signe : la nature choisie dit le sens.',
      zero: 'Une ligne à zéro n’apprend rien.',
      range: 'Ce montant dépasse ce que Daylog sait enregistrer.',
    };

    return el('div', {}, [
      el('span', { class: 'field-label', id: 'money-kind-label' }, 'Nature'),
      kindRow(),
      el('div', { class: 'field', style: { marginTop: '0.75rem' } }, [
        el('label', { class: 'field-label', for: 'money-amount' }, 'Montant'),
        el('div', { class: 'input-row' }, [
          amount,
          el('span', { class: 'input-unit' }, currencyOf(currency).symbol),
        ]),
      ]),
      dirRow,
      category &&
        el('div', { class: 'field' }, [
          el('label', { class: 'field-label', for: 'money-cat' }, 'Catégorie'),
          category,
        ]),
      el('div', { class: 'field' }, [
        el('label', { class: 'field-label', for: 'money-label' }, 'Intitulé'),
        label,
      ]),
      error && el('p', { class: 'field-error', role: 'status' }, messages[error] || messages.missing),
      el('div', { class: 'card-actions' }, [
        el('button', { type: 'button', class: 'btn btn-primary', onClick: addEntry },
          'Ajouter la ligne'
        ),
      ]),
    ]);
  }

  /** Choix de la monnaie : rare, donc replie. Aucune conversion n'existe. */
  function currencyBlock() {
    const select = el('select', {
      class: 'input',
      id: 'money-currency',
      onChange: (e) => setCurrency(e.target.value),
    }, CURRENCIES.map((c) => el('option', { value: c.id }, `${c.label} (${c.symbol})`)));
    select.value = currency;

    return el('details', { class: 'foldable' }, [
      el('summary', { class: 'foldable-head' }, [
        el('span', { class: 'field-label' }, 'Monnaie'),
        el('span', { class: 'foldable-note' }, currencyOf(currency).symbol),
      ]),
      select,
      el('p', { class: 'card-hint', style: { marginTop: '0.5rem', marginBottom: '0' } },
        'Daylog ne convertit rien : aucun taux de change ne peut être à jour sans ' +
          'réseau, et un taux figé serait faux dès le lendemain. La monnaie sert ' +
          'd’unité, et les lignes déjà notées ne changent pas de valeur.'
      ),
    ]);
  }

  function draw() {
    const list = entries();
    const totals = dayTotals(data());

    const detail = info({
      id: 'money-balance-info',
      label: 'Ce que comprend la balance',
      text: [
        'La balance additionne tout ce qui a bougé, virements compris. ',
        '« Dépensé » et « Reçu », eux, les excluent : se faire rembourser un ' +
          'repas n’est pas un revenu, et rembourser un ami n’est pas une dépense ' +
          'de loisir. ',
        'Sans cette séparation, un mois où l’on avance de l’argent pour des amis ' +
          'afficherait des revenus et des dépenses gonflés, et les catégories ne ' +
          'voudraient plus rien dire.',
      ],
    });

    mount(container, [
      el('div', { class: 'card-head' }, [
        el('h2', { class: 'card-title' }, 'Argent'),
        detail.button,
        el('span', { class: 'card-count' },
          totals.balance === null
            ? 'Non renseigné'
            : formatMoney(totals.balance, currency, { sign: true })
        ),
      ]),

      totals.count !== null &&
        el('div', {}, [
          el('dl', { class: 'facts' }, [
            el('div', { class: 'fact' }, [
              el('dt', {}, 'Dépensé'),
              el('dd', {}, formatMoney(totals.spent ?? 0, currency)),
            ]),
            el('div', { class: 'fact' }, [
              el('dt', {}, 'Reçu'),
              el('dd', {}, formatMoney(totals.earned ?? 0, currency)),
            ]),
            el('div', { class: 'fact' }, [
              el('dt', {}, 'Balance'),
              el('dd', {}, formatMoney(totals.balance, currency, { sign: true })),
            ]),
          ]),
          (totals.transferIn || totals.transferOut) &&
            el('div', { class: 'health-trend' }, [
              el('p', { class: 'health-trend-main' }, [
                'Virements : ',
                totals.transferIn ? `${formatMoney(totals.transferIn, currency)} reçus` : '',
                totals.transferIn && totals.transferOut ? ', ' : '',
                totals.transferOut ? `${formatMoney(totals.transferOut, currency)} versés` : '',
                '.',
              ]),
            ]),
        ]),

      detail.panel,

      list.length ? el('div', {}, list.map(entryRow)) : null,

      form(),

      currencyBlock(),
    ]);
  }

  draw();
  return container;
}
