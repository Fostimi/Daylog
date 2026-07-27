/**
 * Alimentation, mode express.
 *
 * Le module qui fait abandonner les applications de suivi. Le prototype v5
 * demandait ~150 champs par jour ; personne ne tient trois semaines. Tout ce
 * fichier est organise autour d'un seul objectif : QUE LA MEMOIRE FASSE LE
 * TRAVAIL.
 *
 *   jour 1     on cherche dans la base livree, on saisit une quantite
 *   jour 5     ses propres aliments remontent en tete des recherches
 *   jour 15    ses repas habituels s'ajoutent d'un seul geste
 *
 * Deux regles non negociables, heritees du reste de l'application :
 *
 * - UNE ENTREE EST FIGEE. Elle porte la reference a l'aliment ET les valeurs
 *   calculees au moment de la saisie. Corriger « mon riz » en decembre ne
 *   reecrit pas ce qu'on a mange en mars.
 * - RIEN N'EST INVENTE. Un aliment sans proteines renseignees ne compte pas
 *   zero : il est exclu du total, qui affiche « — ».
 *
 * Le mode detaille (micronutriments) viendra plus tard, et seulement une fois
 * qu'on saura ce que celui-ci donne a l'usage.
 */

import { el, mount } from '../../ui/dom.js';
import { numberField } from '../../ui/controls.js';
import * as db from '../../core/db.js';
import { createListItem, activeItems } from '../../core/ids.js';
import { formatNumber } from '../../core/i18n.js';
import {
  UNITS,
  REFERENCE_GRAMS,
  normalize,
  toGrams,
  unitsFor,
  macrosFor,
  createEntry,
  searchFoods,
  totals,
  createMealTemplate,
  entriesFromTemplate,
} from '../../core/foods.js';
import { BASE_FOODS } from '../foods-base.js';
import { energyNeeds, macroTargets } from '../../core/nutrition.js';

const FOOD_KIND = 'food';
const MEAL_KIND = 'meal';

/**
 * Moments de la journee.
 *
 * Quatre, pas six : chaque case supplementaire est une decision de plus a
 * prendre avant de pouvoir noter une pomme.
 */
export const SLOTS = [
  { id: 'breakfast', label: 'Matin' },
  { id: 'lunch', label: 'Midi' },
  { id: 'dinner', label: 'Soir' },
  { id: 'snack', label: 'À côté' },
];

export async function render({ store }) {
  const container = el('div', { class: 'card' });

  let personalFoods = [];
  let meals = [];
  try {
    [personalFoods, meals] = await Promise.all([db.getList(FOOD_KIND), db.getList(MEAL_KIND)]);
  } catch {
    personalFoods = [];
    meals = [];
  }

  // Etat de l'ecran, volontairement local : rien de tout cela n'est une donnee
  // de suivi, et rien ne doit se retrouver dans une sauvegarde.
  let openSlot = null; // moment dont le champ de recherche est ouvert
  let query = '';
  let picked = null; // aliment choisi, en attente de quantite
  // Le moment auquel se rattache la saisie en cours. Sans lui, le formulaire de
  // quantite s'affichait dans les QUATRE moments a la fois -- donc quatre fois
  // le meme identifiant dans la page, ce qui casse l'association libelle/champ
  // et l'annonce aux lecteurs d'ecran.
  let activeSlot = null;
  let quantity = null;
  let unit = 'g';
  let creating = null; // brouillon d'aliment personnel
  // Entree en cours de modification. Sans elle, changer 80 g en 100 g obligeait
  // a supprimer la ligne puis a tout ressaisir -- un geste absurde pour la
  // correction la plus frequente de toutes.
  let editing = null;

  function data() {
    return store.get('nutrition') || {};
  }

  function entries() {
    return data().items || [];
  }

  /** La base livree et les aliments personnels, dans un seul jeu de recherche. */
  function allFoods() {
    return [...activeItems(personalFoods), ...BASE_FOODS];
  }

  // ---------------------------------------------------------------- ecriture

  function write(items) {
    store.update('nutrition', { items });
    draw();
  }

  function addEntries(list) {
    const clean = list.filter(Boolean);
    if (!clean.length) return;
    write([...entries(), ...clean]);
  }

  function removeEntry(id) {
    write(entries().filter((e) => e.id !== id));
  }

  /**
   * Marque un aliment comme utilise.
   *
   * C'est ce qui fait remonter en tete ce qu'on mange vraiment, sans jamais
   * demander de classer quoi que ce soit.
   */
  async function touchFood(food) {
    if (!food || food.base) return;
    const updated = { ...food, usedAt: new Date().toISOString() };
    await db.putListItem(updated);
    personalFoods = personalFoods.map((f) => (f.id === food.id ? updated : f));
  }

  async function confirmPick(slot) {
    const entry = createEntry(picked, { quantity, unit, slot });
    if (!entry) return;
    await touchFood(picked);

    const replaced = editing;
    picked = null;
    activeSlot = null;
    quantity = null;
    query = '';
    editing = null;

    if (replaced) {
      // On remplace en place pour garder l'ordre du repas : une correction ne
      // doit pas envoyer la ligne a la fin de la liste.
      write(entries().map((e) => (e.id === replaced.id ? { ...entry, id: replaced.id } : e)));
      return;
    }
    addEntries([entry]);
  }

  /**
   * Enregistre un aliment personnel.
   *
   * Deux chemins y menent : le creer de zero, ou partir d'un aliment de la base
   * dont les valeurs ne correspondent pas a ce qu'on achete. Dans les deux cas
   * il devient prioritaire dans les recherches -- c'est celui de la personne.
   */
  async function saveFood(draft) {
    const label = String(draft.label || '').trim();
    if (!label) return;

    const existing = personalFoods.find((f) => normalize(f.label) === normalize(label));
    const item = existing
      ? { ...existing, archivedAt: null }
      : createListItem(FOOD_KIND, label);

    const saved = {
      ...item,
      label,
      kcal: draft.kcal,
      protein: draft.protein,
      carbs: draft.carbs,
      fat: draft.fat,
      unitGrams: draft.unitGrams || null,
      usedAt: new Date().toISOString(),
    };
    await db.putListItem(saved);
    personalFoods = existing
      ? personalFoods.map((f) => (f.id === saved.id ? saved : f))
      : [...personalFoods, saved];

    creating = null;
    picked = saved;
    unit = 'g';
    draw();
  }

  async function saveMeal(slot, label) {
    const list = entries().filter((e) => e.slot === slot);
    const template = createMealTemplate(label, list);
    if (!template) return;
    await db.putListItem(template);
    meals = [...meals, template];
    draw();
  }

  async function archiveMeal(id) {
    const meal = meals.find((m) => m.id === id);
    if (!meal) return;
    const updated = { ...meal, archivedAt: new Date().toISOString() };
    await db.putListItem(updated);
    meals = meals.map((m) => (m.id === id ? updated : m));
    draw();
  }

  // ------------------------------------------------------------------ rendu

  /** Les cibles du jour, si le profil permet de les calculer. */
  function targets() {
    const profile = store.getProfile() || {};
    const body = profile.body || {};
    const goals = profile.goals || {};
    const needs = energyNeeds({
      weightKg: body.weightKg,
      heightCm: body.heightCm,
      ageYears: body.birthYear ? new Date().getFullYear() - body.birthYear : null,
      body,
      activity: goals.activity,
      // Sans objectif declare, on affiche ce que le corps depense et rien de
      // plus : c'est deja un suivi complet, et le seul qui convienne a qui ne
      // veut pas de cible.
      goal: goals.hasGoal === true ? goals.weight : null,
    });
    if (!needs.target) return null;
    return {
      kcal: needs.target,
      ...macroTargets({
        kcal: needs.target,
        weightKg: body.weightKg,
        proteinPerKg: goals.proteinPerKg,
      }),
    };
  }

  /** Bandeau du haut : ce qui a ete mange, et le reste s'il est calculable. */
  function summary(sums, target) {
    const facts = [
      ['Énergie', sums.kcal, target?.kcal, 'kcal'],
      ['Protéines', sums.protein, target?.protein, 'g'],
      ['Glucides', sums.carbs, target?.carbs, 'g'],
      ['Lipides', sums.fat, target?.fat, 'g'],
    ];

    return el('dl', { class: 'facts' }, facts.map(([label, value, goal, unitLabel]) =>
      el('div', { class: 'fact' }, [
        el('dt', {}, label),
        el('dd', {}, [
          `${formatNumber(value)} ${unitLabel}`,
          // La cible est un repere, pas une note : elle est en gris, a cote,
          // et jamais accompagnee d'un signe de reussite ou d'echec.
          goal ? el('span', { class: 'fact-goal' }, ` / ${goal}`) : null,
        ]),
      ])
    ));
  }

  /**
   * Une ligne deja enregistree.
   *
   * La ligne entiere est un bouton : corriger une quantite est le geste le plus
   * frequent, il ne doit pas demander de viser une cible de 2 mm.
   */
  function entryRow(entry) {
    const unitLabel = UNITS[entry.unit]?.label || '';
    return el('div', { class: 'meal-item' }, [
      el('button', {
        type: 'button',
        class: 'meal-item-main',
        'aria-label': `Modifier ${entry.label}`,
        onClick: () => startEdit(entry),
      }, [
        el('span', { class: 'meal-item-label' }, entry.label),
        el('span', { class: 'meal-item-qty' }, [
          `${formatNumber(entry.quantity, { digits: entry.quantity % 1 ? 1 : 0 })} ${unitLabel}`,
          el('span', { class: 'meal-item-edit' }, ' · modifier'),
        ]),
      ]),
      el('span', { class: 'meal-item-kcal' }, `${formatNumber(entry.kcal)} kcal`),
      el('button', {
        type: 'button',
        class: 'chip-remove',
        'aria-label': `Retirer ${entry.label}`,
        onClick: () => removeEntry(entry.id),
      }, '×'),
    ]);
  }

  /**
   * Reprend une entree pour la corriger.
   *
   * On retrouve l'aliment d'origine quand il existe encore ; sinon on repart de
   * ce que l'entree porte elle-meme. Une entree dont l'aliment a ete archive
   * doit rester modifiable : elle decrit un repas qui a bien eu lieu.
   */
  function startEdit(entry) {
    const source =
      allFoods().find((f) => f.id === entry.foodId) ||
      // Reconstitution a partir des valeurs figees : on remonte au « pour 100 g ».
      rebuildFood(entry);
    if (!source) return;
    editing = entry;
    picked = source;
    activeSlot = entry.slot;
    quantity = entry.quantity;
    unit = entry.unit;
    draw();
  }

  /**
   * Reconstitue un aliment a partir d'une entree.
   *
   * Sert quand l'aliment d'origine a disparu de la bibliotheque. On divise les
   * valeurs figees par la quantite pour revenir a la reference : c'est
   * exactement l'operation inverse de la saisie, et elle ne perd rien.
   */
  function rebuildFood(entry) {
    const grams = toGrams(entry.quantity, entry.unit, { unitGrams: {} });
    if (!grams) return null;
    const ratio = REFERENCE_GRAMS / grams;
    const scale = (v) => (typeof v === 'number' ? Math.round(v * ratio * 10) / 10 : null);
    return {
      id: entry.foodId || null,
      label: entry.label,
      kcal: scale(entry.kcal),
      protein: scale(entry.protein),
      carbs: scale(entry.carbs),
      fat: scale(entry.fat),
    };
  }

  /** Champ de recherche et resultats, pour un moment donne. */
  function picker(slot) {
    // La saisie en cours n'appartient qu'a un seul moment de la journee.
    if (activeSlot && activeSlot !== slot) return null;
    if (picked) return quantityForm(slot);
    if (creating) return foodForm(slot);

    const input = el('input', {
      type: 'text',
      class: 'input',
      id: `food-search-${slot}`,
      autocomplete: 'off',
      placeholder: 'Un aliment…',
      onInput: (e) => {
        query = e.target.value;
        drawResults();
      },
    });
    input.value = query;

    const results = el('div', { class: 'suggestions', dataset: { role: 'results' } });

    function drawResults() {
      // Sans recherche, on ne propose QUE ses propres aliments, les plus
      // recemment utilises d'abord. Derouler huit entrees de la base livree
      // sans rapport avec la personne remplissait l'ecran de bruit -- et au
      // premier jour, le champ vide dit deja ce qu'il faut faire.
      const pool = query.trim() ? allFoods() : activeItems(personalFoods);
      const found = searchFoods(pool, query, { limit: 8 });
      mount(results, [
        ...found.map((food) =>
          el('button', {
            type: 'button',
            class: `suggestion${food.base ? '' : ' is-mine'}`,
            onClick: () => {
              picked = food;
              activeSlot = slot;
              unit = unitsFor(food)[0]?.id || 'g';
              quantity = null;
              draw();
            },
          }, food.label)
        ),
        // Rien ne correspond : on propose de creer, avec ce qui a ete tape.
        query.trim() &&
          el('button', {
            type: 'button',
            class: 'suggestion is-new',
            onClick: () => {
              creating = { label: query.trim() };
              activeSlot = slot;
              draw();
            },
          }, `+ « ${query.trim()} »`),
      ]);
    }

    const node = el('div', { class: 'add-row-block' }, [
      el('label', { class: 'sr-only', for: `food-search-${slot}` }, 'Chercher un aliment'),
      input,
      results,
    ]);
    queueMicrotask(drawResults);
    return node;
  }

  /**
   * Quantite et unite, une fois l'aliment choisi.
   *
   * Le bouton et l'apercu se mettent a jour SANS reconstruire le bloc : un
   * redessin a chaque frappe ferait perdre le focus au bout d'un caractere, et
   * le champ deviendrait inutilisable.
   */
  function quantityForm(slot) {
    const units = unitsFor(picked);

    function previewText() {
      const macros = macrosFor(picked, quantity, unit);
      if (!macros || macros.kcal === null) return '';
      return (
        `${macros.kcal} kcal · P ${formatNumber(macros.protein)} · ` +
        `G ${formatNumber(macros.carbs)} · L ${formatNumber(macros.fat)}`
      );
    }

    const preview = el('p', { class: 'card-hint', dataset: { role: 'preview' } }, previewText());
    const addButton = el('button', {
      type: 'button',
      class: 'btn btn-primary btn-sm',
      disabled: !quantity,
      onClick: () => confirmPick(slot),
    }, editing ? 'Enregistrer' : 'Ajouter');

    const field = numberField({
      id: 'food-qty',
      label: picked.label,
      value: quantity,
      step: unit === 'g' || unit === 'ml' ? 5 : 0.5,
      min: 0,
      unit: '',
      onInput: (v) => {
        quantity = Number(v) > 0 ? Number(v) : null;
        preview.textContent = previewText();
        addButton.disabled = !quantity;
      },
    });

    return el('div', { class: 'qty-form' }, [
      field.node,
      el('div', { class: 'chips', role: 'group', 'aria-label': 'Unité' }, units.map((u) =>
        el('div', { class: `chip${u.id === unit ? ' is-done' : ''}` }, [
          el('button', {
            type: 'button',
            class: 'chip-toggle',
            style: { paddingRight: '0.875rem' },
            'aria-pressed': u.id === unit ? 'true' : 'false',
            onClick: () => {
              unit = u.id;
              draw();
            },
          }, u.label),
        ])
      )),
      preview,
      el('div', { class: 'card-actions' }, [
        addButton,
        el('button', {
          type: 'button',
          class: 'btn btn-sm',
          onClick: () => {
            // Partir de cet aliment pour en faire le sien : le cas de la marque
            // dont les valeurs ne collent pas a celles de la table.
            creating = { ...picked, id: null, label: picked.label };
            picked = null;
            draw();
          },
        }, 'Ajuster ses valeurs'),
        el('button', {
          type: 'button',
          class: 'btn btn-sm',
          onClick: () => {
            picked = null;
            activeSlot = null;
            editing = null;
            draw();
          },
        }, 'Annuler'),
      ]),
    ]);
  }

  /** Creation ou correction d'un aliment personnel. */
  function foodForm() {
    const draft = creating;
    const labelInput = el('input', {
      type: 'text',
      class: 'input',
      id: 'food-label',
      placeholder: 'Nom, marque comprise',
      onInput: (e) => {
        draft.label = e.target.value;
      },
    });
    labelInput.value = draft.label || '';

    const fields = [
      ['kcal', 'Calories', 'kcal'],
      ['protein', 'Protéines', 'g'],
      ['carbs', 'Glucides', 'g'],
      ['fat', 'Lipides', 'g'],
    ].map(([key, label, unitLabel]) =>
      numberField({
        id: `food-${key}`,
        label,
        value: draft[key] ?? null,
        step: key === 'kcal' ? 1 : 0.1,
        min: 0,
        unit: unitLabel,
        onInput: (v) => {
          draft[key] = Number(v) >= 0 && v !== '' ? Number(v) : null;
        },
      }).node
    );

    return el('div', { class: 'qty-form' }, [
      el('div', { class: 'field' }, [
        el('label', { class: 'field-label', for: 'food-label' }, 'Aliment'),
        labelInput,
      ]),
      el('p', { class: 'card-hint' }, 'Valeurs pour 100 g, comme sur l’emballage.'),
      ...fields,
      el('div', { class: 'card-actions' }, [
        el('button', {
          type: 'button',
          class: 'btn btn-primary btn-sm',
          onClick: () => saveFood(draft),
        }, 'Enregistrer'),
        el('button', {
          type: 'button',
          class: 'btn btn-sm',
          onClick: () => {
            creating = null;
            activeSlot = null;
            draw();
          },
        }, 'Annuler'),
      ]),
    ]);
  }

  /** Repas enregistres, rejouables d'un geste. */
  function mealShortcuts(slot) {
    const list = activeItems(meals);
    if (!list.length) return null;
    return el('div', { class: 'chips' }, list.map((meal) =>
      el('div', { class: 'chip' }, [
        el('button', {
          type: 'button',
          class: 'chip-toggle',
          onClick: () => addEntries(entriesFromTemplate(meal, { slot })),
        }, [
          el('span', { class: 'chip-mark', 'aria-hidden': 'true' }, '+'),
          el('span', {}, meal.label),
        ]),
        el('button', {
          type: 'button',
          class: 'chip-remove',
          'aria-label': `Retirer « ${meal.label} » de mes repas`,
          onClick: () => archiveMeal(meal.id),
        }, '×'),
      ])
    ));
  }

  function slotBlock(slot) {
    const list = entries().filter((e) => e.slot === slot.id);
    const sums = totals(list);
    const isOpen = openSlot === slot.id;

    return el('details', {
      class: 'foldable meal-slot',
      open: isOpen || activeSlot === slot.id || list.length > 0,
      // `mealSlot` et non `slot` : les check-ins de l'ecran du jour utilisent
      // deja `data-slot`, et deux sens pour un meme attribut finissent toujours
      // par se croiser -- ici, en faisant compter sept moments au lieu de trois.
      dataset: { mealSlot: slot.id },
      onToggle: (e) => {
        if (e.target.open) openSlot = slot.id;
        else if (openSlot === slot.id) openSlot = null;
      },
    }, [
      el('summary', { class: 'foldable-head' }, [
        el('span', { class: 'field-label' }, slot.label),
        el('span', { class: `foldable-note${list.length ? ' is-set' : ''}` },
          list.length ? `${formatNumber(sums.kcal)} kcal` : 'Rien de noté'
        ),
      ]),
      list.length ? el('div', { class: 'meal-items' }, list.map(entryRow)) : null,
      mealShortcuts(slot.id),
      picker(slot.id),
      // Enregistrer ce moment comme repas : la fonction qui fait gagner le plus
      // de temps sur la duree, et qui n'a de sens qu'une fois le repas compose.
      list.length >= 1 &&
        el('div', { class: 'card-actions' }, [
          el('button', {
            type: 'button',
            class: 'btn btn-sm',
            onClick: () => {
              const label = globalThis.prompt(
                'Nom de ce repas, pour le retrouver d’un geste :',
                slot.label
              );
              if (label) saveMeal(slot.id, label);
            },
          }, 'Enregistrer ce repas'),
        ]),
    ]);
  }

  function draw() {
    const list = entries();
    const sums = totals(list);
    const target = targets();

    mount(container, [
      el('div', { class: 'card-head' }, [
        el('h2', { class: 'card-title' }, 'Alimentation'),
        list.length
          ? el('span', { class: 'card-count' },
              list.length === 1 ? '1 aliment noté' : `${list.length} aliments notés`
            )
          : null,
      ]),

      summary(sums, target),

      !target &&
        el('p', { class: 'card-hint' },
          'Complète ton profil pour voir tes cibles. Le suivi fonctionne sans.'
        ),

      ...SLOTS.map(slotBlock),

      el('p', { class: 'card-hint', style: { marginBottom: '0' } },
        'Valeurs indicatives, modifiables : « Ajuster ses valeurs » enregistre les tiennes.'
      ),
    ]);
  }

  draw();
  return container;
}
