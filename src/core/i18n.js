/**
 * Textes de l'application.
 *
 * Strategie d'ecriture inclusive, decidee en amont :
 *
 * On ecrit NEUTRE PAR DEFAUT, pour tout le monde. Pas de point median : les
 * lecteurs d'ecran le prononcent mal et c'est un obstacle en cas de dyslexie --
 * il desservirait donc precisement les personnes qu'on veut inclure. A la place,
 * des tournures epicenes : "Bon retour", "Journee enregistree", "Ta semaine".
 * Zero reglage, zero debat, et c'est meilleur pour tout le monde.
 *
 * Il ne reste qu'une poignee de phrases ou l'accord est inevitable. Elles seules
 * portent des variantes, activees si la personne a explicitement demande qu'on
 * s'adresse a elle au feminin ou au masculin. Le neutre reste la base, jamais un
 * mode degrade.
 *
 * Une chaine est soit une string, soit { n, f, m } ou `n` est obligatoire.
 */

const STRINGS = {
  'app.name': 'Daylog',
  'app.tagline': 'Ton suivi, sur ton téléphone, nulle part ailleurs',

  'nav.today': "Aujourd'hui",
  'nav.week': 'Semaine',
  'nav.dashboard': 'Bilan',
  'nav.history': 'Historique',
  'nav.settings': 'Réglages',

  'day.today': "Aujourd'hui",
  'day.yesterday': 'Hier',
  'day.previous': 'Jour précédent',
  'day.next': 'Jour suivant',
  'day.future': "Cette journée n'est pas encore arrivée",

  'save.saving': 'Enregistrement…',
  'save.saved': 'Enregistré',
  'save.savedAt': 'Enregistré à {time}',
  'save.error': "L'enregistrement a échoué. Tes données sont toujours à l'écran.",
  'save.auto': 'Tout est enregistré automatiquement',

  'express.title': 'Ta journée en bref',
  'express.subtitle': 'Trois questions. Le détail si tu en as envie.',
  'express.expand': 'Voir tout le détail',
  'express.collapse': "Revenir à l'essentiel",

  'field.unset': 'Non renseigné',
  'field.clear': 'Effacer',
  'field.optional': 'facultatif',

  'welcome.back': 'Bon retour',
  'welcome.first': 'Bienvenue',
  // Exemple de phrase ou l'accord est inevitable : elle porte donc des variantes.
  'welcome.ready': {
    n: 'Prêt à noter ta journée ?',
    f: 'Prête à noter ta journée ?',
    m: 'Prêt à noter ta journée ?',
  },

  'backup.reminder': 'Dernière sauvegarde il y a {days} jours',
  'backup.never': "Tu n'as jamais fait de sauvegarde",
  'backup.why':
    'Tes données sont uniquement sur cet appareil. Si tu le perds, elles sont perdues avec lui.',
  'backup.action': 'Sauvegarder maintenant',
  'backup.done': 'Sauvegarde créée',
  'backup.import': 'Restaurer une sauvegarde',

  'privacy.title': 'Rien ne quitte ton téléphone',
  'privacy.body':
    "Daylog n'envoie aucune donnée, nulle part. Pas de compte, pas de serveur, pas de publicité. " +
    "Tes notes restent sur cet appareil, et toi seul peux les exporter.",

  'stat.tracked': '{tracked} jours suivis sur les {window} derniers',
  'stat.noData': 'Pas encore assez de données',
  'stat.notEnough': 'Il faut au moins {n} jours pour dire quelque chose de fiable',
};

/** Interpolation simple : {cle} remplace par params.cle. */
function interpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in params ? String(params[key]) : match
  );
}

/**
 * Recupere un texte.
 * `address` vaut 'neutral' (defaut), 'feminine' ou 'masculine'.
 */
export function t(key, params = null, address = 'neutral') {
  const entry = STRINGS[key];
  if (entry === undefined) {
    if (import.meta?.env?.DEV) console.warn(`[i18n] texte manquant : ${key}`);
    return key;
  }
  if (typeof entry === 'string') return interpolate(entry, params);
  const variant = address === 'feminine' ? entry.f : address === 'masculine' ? entry.m : entry.n;
  return interpolate(variant || entry.n, params);
}

/** Fabrique un `t` lie a une preference d'adresse. */
export function createTranslator(getAddress) {
  return (key, params) => t(key, params, getAddress?.() || 'neutral');
}

/** Toutes les cles, pour verifier en test qu'aucune ne manque. */
export function allKeys() {
  return Object.keys(STRINGS);
}

// ------------------------------------------------------------------ formats

const DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTH_NAMES = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

/** "mardi 26 juillet" -- sans l'annee si c'est l'annee en cours. */
export function formatDayLong(date, now = new Date()) {
  const sameYear = date.getFullYear() === now.getFullYear();
  const base = `${DAY_NAMES[date.getDay()]} ${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
  return sameYear ? base : `${base} ${date.getFullYear()}`;
}

export function formatDayShort(date) {
  return `${DAY_NAMES[date.getDay()].slice(0, 3)} ${date.getDate()}`;
}

export function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Duree lisible : 90 -> "1 h 30". */
export function formatDuration(minutes) {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/**
 * Affiche un nombre ou un tiret cadratin.
 * `null` doit TOUJOURS s'afficher comme "—" et jamais comme 0 : c'est la
 * traduction visuelle du principe "on n'invente rien".
 */
export function formatNumber(value, { digits = 0, unit = '' } = {}) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const n = digits ? value.toFixed(digits) : String(Math.round(value));
  return unit ? `${n} ${unit}` : n;
}
