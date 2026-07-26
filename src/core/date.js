/**
 * Dates locales.
 *
 * Regle absolue de ce fichier : une "cle de jour" (YYYY-MM-DD) designe toujours
 * la journee telle que la personne la vit, dans SON fuseau horaire.
 *
 * Le prototype v5 utilisait `new Date().toISOString().split('T')[0]`, qui renvoie
 * la date UTC : a 23h30 a Paris en ete, l'app basculait deja au lendemain, soit
 * exactement au moment ou l'on remplit son bilan de journee. Aucune fonction de
 * ce fichier n'utilise toISOString() pour produire une cle de jour.
 *
 * `dayStartHour` permet de decaler la frontiere entre deux journees. A 0, minuit
 * fait foi. A 4, tout ce qui est saisi entre minuit et 3h59 compte encore pour la
 * veille -- utile pour les couche-tard, et pour qui rentre a 2h du matin et note
 * sa soiree.
 */

const KEY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Cle de jour (YYYY-MM-DD) pour une Date, en heure locale. */
export function dayKey(date = new Date(), dayStartHour = 0) {
  const d = new Date(date.getTime());
  if (dayStartHour > 0) d.setHours(d.getHours() - dayStartHour);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Cle du jour courant. */
export function today(dayStartHour = 0) {
  return dayKey(new Date(), dayStartHour);
}

/** Valide la forme d'une cle de jour (et rejette le 31 fevrier). */
export function isValidKey(key) {
  if (typeof key !== 'string' || !KEY_RE.test(key)) return false;
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/**
 * Date locale a midi pour une cle donnee.
 *
 * Midi, et pas minuit : dans les fuseaux ou le changement d'heure d'ete se fait
 * a minuit (Bresil, Chili, Iran...), `new Date(y, m, d)` peut renvoyer la veille
 * a 23h. A midi, aucun decalage saisonnier connu ne fait changer la date.
 */
export function toDate(key) {
  if (!isValidKey(key)) throw new RangeError(`Cle de jour invalide : ${key}`);
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** Decale une cle de jour de n jours (n peut etre negatif). */
export function addDays(key, n) {
  const d = toDate(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** Nombre de jours entiers de `from` a `to` (positif si `to` est apres). */
export function diffDays(from, to) {
  const MS_PER_DAY = 86400000;
  return Math.round((toDate(to) - toDate(from)) / MS_PER_DAY);
}

/** Liste de cles de `from` a `to`, bornes incluses. */
export function range(from, to) {
  const out = [];
  const n = diffDays(from, to);
  if (n < 0) return out;
  for (let i = 0; i <= n; i++) out.push(addDays(from, i));
  return out;
}

/** Les `n` derniers jours, se terminant a `end` (inclus), du plus ancien au plus recent. */
export function lastNDays(n, end = today()) {
  return range(addDays(end, -(n - 1)), end);
}

/** Lundi de la semaine contenant `key` (semaine ISO : lundi -> dimanche). */
export function weekStart(key) {
  const d = toDate(key);
  const offset = (d.getDay() + 6) % 7; // 0 = lundi
  return addDays(key, -offset);
}

/** Les 7 cles de la semaine contenant `key`. */
export function weekDays(key) {
  const start = weekStart(key);
  return range(start, addDays(start, 6));
}

/** Premier jour du mois contenant `key`. */
export function monthStart(key) {
  return `${key.slice(0, 7)}-01`;
}

export function isToday(key, dayStartHour = 0) {
  return key === today(dayStartHour);
}

export function isFuture(key, dayStartHour = 0) {
  return diffDays(today(dayStartHour), key) > 0;
}
