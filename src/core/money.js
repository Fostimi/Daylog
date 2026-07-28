/**
 * Argent.
 *
 * Deux decisions structurent tout ce fichier.
 *
 * 1. LES MONTANTS SONT DES ENTIERS DE CENTIMES.
 *
 *    `0.1 + 0.2` vaut `0.30000000000000004` en virgule flottante. Sur une
 *    application de suivi de depenses, cela veut dire une balance qui affiche
 *    `-0.009999999999990905 €` apres trente saisies, et un total qui ne tombe
 *    jamais juste. Aucun arrondi a l'affichage ne repare ça : il faut ne jamais
 *    additionner de flottants. On saisit des euros, on stocke des centimes, on
 *    n'additionne que des entiers.
 *
 * 2. UN VIREMENT N'EST NI UNE DEPENSE NI UN REVENU.
 *
 *    Le cahier des charges le demande explicitement : « en cas de remboursement
 *    a quelqu'un ou quelqu'un te rembourse ». Se faire rembourser 20 € d'un
 *    repas n'est pas un revenu -- le compter comme tel gonflerait le total des
 *    revenus du mois et rendrait la categorie inutilisable. Rembourser un ami
 *    n'est pas une depense de loisir.
 *
 *    Les virements bougent donc la balance, et restent hors des deux totaux.
 *    C'est la seule facon d'avoir a la fois une balance juste et des categories
 *    qui veulent dire quelque chose.
 *
 * Et un principe repris du reste de l'application : aucune conversion de
 * devise. Rien ne sort de l'appareil, donc aucun taux de change ne peut etre a
 * jour. La monnaie se choisit une fois et sert d'unite ; convertir avec un taux
 * fige serait faux des le lendemain.
 */

/** Monnaies proposees. Le symbole seul sert a l'affichage. */
export const CURRENCIES = [
  { id: 'EUR', symbol: '€', label: 'Euro' },
  { id: 'USD', symbol: '$', label: 'Dollar' },
  { id: 'GBP', symbol: '£', label: 'Livre' },
  { id: 'CHF', symbol: 'CHF', label: 'Franc suisse' },
  { id: 'CAD', symbol: '$ CA', label: 'Dollar canadien' },
];

export function currencyOf(id) {
  return CURRENCIES.find((c) => c.id === id) || CURRENCIES[0];
}

/**
 * Categories de depense.
 *
 * « Assez varie » dit le cahier des charges, et les animaux y figurent
 * nommement -- c'est un poste reel, souvent lourd, qu'aucune application
 * grand public ne propose. Le reste couvre ce qui revient tous les mois sans
 * chercher l'exhaustivite comptable : une liste de quarante lignes se parcourt
 * plus lentement qu'on ne tape le mot.
 */
export const EXPENSE_CATEGORIES = [
  { id: 'food', label: 'Courses' },
  { id: 'eatout', label: 'Restaurant, café' },
  { id: 'home', label: 'Logement, charges' },
  { id: 'transport', label: 'Transport, carburant' },
  { id: 'health', label: 'Santé' },
  { id: 'pets', label: 'Animaux' },
  { id: 'leisure', label: 'Loisirs, sorties' },
  { id: 'subscription', label: 'Abonnements' },
  { id: 'shopping', label: 'Vêtements, achats' },
  { id: 'gifts', label: 'Cadeaux, dons' },
  { id: 'education', label: 'Études, formation' },
  { id: 'family', label: 'Enfants, famille' },
  { id: 'fees', label: 'Banque, impôts, assurances' },
  { id: 'other', label: 'Autre' },
];

export const INCOME_CATEGORIES = [
  { id: 'salary', label: 'Salaire' },
  { id: 'freelance', label: 'Activité indépendante' },
  { id: 'benefits', label: 'Aides, allocations' },
  { id: 'refund', label: 'Remboursement officiel' },
  { id: 'sale', label: 'Vente' },
  { id: 'gift', label: 'Cadeau reçu' },
  { id: 'other', label: 'Autre' },
];

/** Les trois natures d'une ligne. Le virement est la raison d'etre de ce champ. */
export const KINDS = [
  { id: 'expense', label: 'Dépense', sign: -1 },
  { id: 'income', label: 'Revenu', sign: 1 },
  { id: 'transfer', label: 'Virement', sign: 0 },
];

/** Sens d'un virement. */
export const TRANSFER_DIRECTIONS = [
  { id: 'in', label: 'On m’a remboursé', sign: 1 },
  { id: 'out', label: 'J’ai remboursé', sign: -1 },
];

export function categoriesFor(kind) {
  if (kind === 'income') return INCOME_CATEGORIES;
  if (kind === 'transfer') return [];
  return EXPENSE_CATEGORIES;
}

export function categoryLabel(kind, id) {
  return categoriesFor(kind).find((c) => c.id === id)?.label || null;
}

/** Montant maximal accepte : mille milliards de centimes, soit dix milliards. */
export const MAX_CENTS = 1e12;

/**
 * Convertit un montant saisi en centimes.
 *
 * Accepte la virgule comme le point : sur un clavier francais, la touche du
 * pave numerique produit une virgule, et refuser « 12,50 » serait refuser la
 * facon dont la moitie des gens ecrivent un prix.
 *
 * L'arrondi se fait UNE FOIS, ici, au moment de la saisie. Ensuite, plus aucun
 * flottant : c'est ce qui garantit qu'une balance tombe juste.
 */
export function toCents(value) {
  if (value === null || value === undefined || value === '') return { value: null };
  const text = String(value).trim().replace(',', '.').replace(/\s/g, '');
  if (!/^-?\d*\.?\d*$/.test(text) || text === '' || text === '.' || text === '-') {
    return { value: null, reason: 'nan' };
  }
  const n = Number(text);
  if (!Number.isFinite(n)) return { value: null, reason: 'nan' };
  if (n < 0) return { value: null, reason: 'negative' };
  const cents = Math.round(n * 100);
  if (cents > MAX_CENTS) return { value: null, reason: 'range', max: MAX_CENTS };
  if (cents === 0) return { value: null, reason: 'zero' };
  return { value: cents };
}

export function fromCents(cents) {
  return typeof cents === 'number' && Number.isFinite(cents) ? cents / 100 : null;
}

/**
 * Montant lisible, a la francaise : « 12,50 € ».
 *
 * Virgule decimale et espace insecable avant le symbole. Un suivi de depenses
 * qui afficherait « 12.50 €  » se lit comme une traduction ratee -- et c'est le
 * chiffre qu'on regarde le plus souvent de tout l'ecran.
 */
export function formatMoney(cents, currency = 'EUR', { sign = false } = {}) {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '—';
  const symbol = currencyOf(currency).symbol;
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const units = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');

  // Separateur de milliers : espace insecable etroit, comme le veut l'usage.
  const grouped = String(units).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const prefix = negative ? '−' : sign && cents > 0 ? '+' : '';
  return `${prefix}${grouped},${rest} ${symbol}`;
}

function cents(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

/**
 * Totaux d'une journee.
 *
 * `balance` inclut les virements ; `spent` et `earned` les excluent. Les trois
 * chiffres ne racontent donc pas la meme histoire, et c'est exactement ce
 * qu'on veut : « j'ai depense 60 € » reste vrai meme si un ami en a rembourse
 * 30, et la balance du jour vaut bien -30.
 *
 * Renvoie `null` -- et non zero -- quand rien n'a ete note : une journee sans
 * saisie n'est pas une journee sans depense.
 */
export function dayTotals(day = {}) {
  const entries = day?.entries || [];
  if (!entries.length) {
    return { spent: null, earned: null, transferIn: null, transferOut: null, balance: null, count: null };
  }

  let spent = 0;
  let earned = 0;
  let transferIn = 0;
  let transferOut = 0;

  for (const entry of entries) {
    const amount = cents(entry?.amount);
    if (amount === null || amount <= 0) continue;
    if (entry.kind === 'expense') spent += amount;
    else if (entry.kind === 'income') earned += amount;
    else if (entry.kind === 'transfer') {
      if (entry.direction === 'out') transferOut += amount;
      else transferIn += amount;
    }
  }

  return {
    spent: spent || null,
    earned: earned || null,
    transferIn: transferIn || null,
    transferOut: transferOut || null,
    // La balance additionne tout, virements compris : c'est ce qui a
    // reellement bouge sur le compte.
    balance: earned + transferIn - spent - transferOut,
    count: entries.length,
  };
}

/**
 * Repartition des depenses par categorie, de la plus lourde a la plus legere.
 *
 * Sert au bilan. Les revenus et les virements en sont exclus : melanger un
 * salaire aux courses dans un meme classement ne dit rien de ce qu'on cherche
 * -- ou part l'argent.
 */
export function byCategory(entries = []) {
  const sums = new Map();
  for (const entry of entries || []) {
    if (entry?.kind !== 'expense') continue;
    const amount = cents(entry.amount);
    if (amount === null || amount <= 0) continue;
    const id = entry.categoryId || 'other';
    sums.set(id, (sums.get(id) || 0) + amount);
  }
  return [...sums.entries()]
    .map(([id, total]) => ({ id, label: categoryLabel('expense', id) || 'Autre', total }))
    .sort((a, b) => b.total - a.total);
}

/** Totaux sur une periode, a partir des resumes quotidiens. */
export function periodTotals(rows = []) {
  const add = (key) => {
    const values = (rows || []).map((r) => cents(r?.[key])).filter((v) => v !== null);
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  };
  const spent = add('spent');
  const earned = add('earned');
  const balance = add('balance');
  return {
    spent,
    earned,
    balance,
    days: (rows || []).filter((r) => typeof r?.balance === 'number').length,
  };
}
