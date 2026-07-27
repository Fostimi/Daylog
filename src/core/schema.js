/**
 * Modele de donnees versionne.
 *
 * Deux principes non negociables :
 *
 * 1. RIEN N'EST INVENTE. Un champ auquel la personne n'a pas touche vaut `null`,
 *    jamais une valeur "raisonnable". Le prototype v5 enregistrait anxiete 3,
 *    motivation 5, qualite de sommeil 7 et score de productivite 7 sur toute
 *    journee sauvegardee, meme sans y toucher : au bout de trois mois, les
 *    moyennes decrivaient quelqu'un qui n'existe pas. Ici, `null` veut dire
 *    "non renseigne" et est exclu de tout calcul.
 *
 * 2. TOUT EST MIGRABLE. Chaque export porte sa version de schema. Ajouter un
 *    champ = ajouter une migration. Un fichier exporte aujourd'hui doit
 *    s'ouvrir dans dix ans.
 */

export const SCHEMA_VERSION = 1;

/** Fabrique une fiche de jour vide. Aucun champ pre-rempli, par construction. */
export function createDay(date) {
  return {
    date,
    createdAt: null,
    updatedAt: null,
    schemaVersion: SCHEMA_VERSION,
    // Chaque module ecrit sous sa propre cle. Une cle absente = module jamais
    // utilise ce jour-la, ce qui n'est pas la meme chose qu'un module rempli
    // avec des valeurs vides.
    modules: {},
  };
}

/**
 * Une journee est-elle vide ?
 *
 * Sert a ne jamais ecrire de fiche fantome : ouvrir l'app sans rien saisir ne
 * doit pas creer d'entree. Sinon l'historique se remplit de journees vides qui
 * faussent les moyennes et les compteurs de suivi.
 */
export function isEmptyDay(day) {
  if (!day || !day.modules) return true;
  return Object.values(day.modules).every(isEmptyValue);
}

function isEmptyValue(value) {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0 || value.every(isEmptyValue);
  if (value instanceof Date) return false;
  if (typeof value === 'object') {
    // Les horodatages internes ne comptent pas comme du contenu : une section
    // qui ne porte qu'un `updatedAt` est vide.
    return Object.entries(value)
      .filter(([k]) => !META_KEYS.has(k))
      .every(([, v]) => isEmptyValue(v));
  }
  return false;
}

const META_KEYS = new Set(['updatedAt', 'createdAt', 'loggedAt', 'id', 'schemaVersion']);

/**
 * Retire recursivement les valeurs vides avant ecriture.
 *
 * C'est ce qui fait qu'une journee ou l'on n'a note que son humeur pese ~200
 * octets et non ~1,5 Ko : on ne stocke pas des dizaines de `null` explicites.
 * A la lecture, un champ absent et un champ `null` sont traites a l'identique.
 */
export function prune(value) {
  if (Array.isArray(value)) {
    const arr = value.map(prune).filter((v) => !isEmptyValue(v));
    return arr.length ? arr : null;
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const pruned = prune(v);
      if (pruned !== null && pruned !== undefined && pruned !== '') out[k] = pruned;
    }
    // On conserve les cles meta uniquement si la section a du contenu par ailleurs.
    const hasContent = Object.keys(out).some((k) => !META_KEYS.has(k));
    if (!hasContent) return null;
    return out;
  }
  if (value === '' || value === undefined) return null;
  return value;
}

/**
 * Profil et reglages.
 *
 * `identity` et `body` sont volontairement separes. L'identite de genre pilote
 * la facon dont l'app s'adresse a la personne. Elle n'entre dans aucun calcul.
 * Les calculs metaboliques utilisent `body.calcBasis`, qui est une variable
 * physiologique choisie explicitement -- voir docs/calculs-metaboliques.md.
 */
export function createProfile() {
  return {
    identity: {
      name: null,
      // 'neutral' par defaut : l'app parle a tout le monde de la meme facon,
      // sauf demande explicite. Ce n'est pas un mode degrade, c'est la base.
      address: 'neutral', // 'neutral' | 'feminine' | 'masculine'
      pronouns: null,
    },
    body: {
      birthYear: null,
      heightCm: null,
      // Poids de reference des calculs. Le suivi du poids au jour le jour
      // viendra avec le module sante ; celui-ci est le point de depart, et il
      // porte sa date pour qu'on sache s'il est encore d'actualite.
      weightKg: null,
      weightMeasuredAt: null,
      // Base de calcul metabolique, choisie explicitement et modifiable a tout
      // moment. `null` = pas encore choisi, aucun calcul n'est affiche.
      calcBasis: null, // 'a' | 'b' | 'interpolated' | 'lean-mass'
      // Pour l'interpolation progressive (hormonotherapie) : date de debut et
      // sens de la transition. Voir docs/calculs-metaboliques.md.
      basisFrom: null,
      basisTo: null,
      basisStartDate: null,
      // Composition corporelle : UNIQUEMENT si mesuree. Jamais estimee.
      bodyFatPct: null,
      bodyFatMethod: null, // 'impedance' | 'calipers' | 'dexa' | 'other'
      bodyFatMeasuredAt: null,
    },
    goals: {
      weight: null, // 'maintain' | 'lose-slow' | 'lose' | 'gain-slow' | 'gain'
      // Demande separement de la mobilite, et jamais deduit d'elle : une
      // personne en fauteuil peut etre sportive de haut niveau.
      activity: null, // 'sedentary' | 'light' | 'moderate' | 'high' | 'athlete'
      proteinPerKg: null,
      hydrationMl: null,
    },
    schemaVersion: SCHEMA_VERSION,
  };
}

export function createSettings() {
  return {
    theme: 'system', // 'system' | 'light' | 'dark'
    reduceMotion: null, // null = suit le reglage systeme
    dayStartHour: 0, // 0-6 : heure a laquelle commence une nouvelle journee
    locale: 'fr',
    // Marque de l'appareil connecte, pour afficher le bon vocabulaire
    // (Body Battery, Recovery, Readiness, Resources...). null = pas d'appareil,
    // et tous les champs non mesurables a l'oeil nu restent masques.
    wearable: null,
    backupReminderDays: 21,
    lastBackupAt: null,
    onboardedAt: null,
    schemaVersion: SCHEMA_VERSION,
  };
}

/**
 * Migrations. Cle = version cible, valeur = fonction qui transforme depuis la
 * version precedente. La v1 est la version initiale, elle n'a pas de migration.
 *
 * Regle : une migration ne doit JAMAIS perdre de donnee. En cas de doute, on
 * conserve l'ancien champ a cote du nouveau.
 */
export const migrations = {
  // 2: (data) => { ... }
};

/**
 * Applique les migrations necessaires pour amener `data` au schema courant.
 * Renvoie `{ data, migrated, from }`.
 */
export function migrate(data) {
  const from = Number(data?.schemaVersion) || 1;
  if (from > SCHEMA_VERSION) {
    throw new Error(
      `Cette sauvegarde vient d'une version plus recente de Daylog ` +
        `(schema ${from}, cette version en gere ${SCHEMA_VERSION}). ` +
        `Mets l'application a jour avant de l'importer.`
    );
  }
  let out = data;
  for (let v = from + 1; v <= SCHEMA_VERSION; v++) {
    const fn = migrations[v];
    if (!fn) throw new Error(`Migration manquante vers le schema ${v}`);
    out = fn(out);
  }
  return { data: { ...out, schemaVersion: SCHEMA_VERSION }, migrated: from !== SCHEMA_VERSION, from };
}
