/**
 * Activite physique.
 *
 * Le piege de ce module etait connu d'avance et signale dans la passation :
 * LE NIVEAU D'ACTIVITE DU PROFIL ET L'ACTIVITE NOTEE AU JOUR LE JOUR NE
 * DOIVENT PAS SE COMPTER DEUX FOIS.
 *
 * Le facteur d'activite du profil (« une semaine ordinaire, ça ressemble a
 * quoi ? », de 1,2 a 1,9) contient DEJA le sport. Ajouter par-dessus les
 * calories d'une seance reviendrait a compter la meme depense deux fois, et a
 * proposer de manger davantage pour une seance deja prise en compte. C'est le
 * mecanisme exact par lequel une application de suivi devient une machine a
 * compenser.
 *
 * D'ou la regle tenue partout ici :
 *
 *   LES CALORIES ACTIVES SONT UNE INFORMATION, JAMAIS UN CREDIT.
 *
 * Elles s'affichent, elles entrent dans le bilan, et elles n'augmentent aucune
 * cible. L'ecran le dit en toutes lettres plutot que de laisser deviner.
 *
 * Et de toute facon, le recalage sur les faits (voir core/nutrition.js) finit
 * par trancher : au bout de six semaines, la depense reelle vient des pesees et
 * des repas notes, seances comprises, sans que rien n'ait besoin d'etre
 * additionne a la main.
 *
 * Trois autres regles :
 *
 * 1. ON NE RANGE PERSONNE EN CAPABLE ET INCAPABLE. La mobilite declaree change
 *    l'ORDRE du catalogue et le vocabulaire (« pas » ou « poussées »), jamais ce
 *    qui est accessible. Une personne en fauteuil peut faire de l'escalade, et
 *    une application qui le lui cacherait serait insultante.
 *
 * 2. AUCUNE ESTIMATION SANS LE POIDS. Une depense se calcule a partir de la
 *    masse deplacee. Sans poids connu, on affiche la duree et rien d'autre --
 *    pas un chiffre par defaut.
 *
 * 3. LE GENRE N'ENTRE NULLE PART. Y compris dans la longueur de foulee, qui est
 *    publiee separement pour deux groupes de reference. L'ecart entre les deux
 *    coefficients est de 0,5 % ; la variabilite individuelle est de l'ordre de
 *    10 %. Utiliser le genre ici couterait une question intime pour une
 *    precision imaginaire.
 */

/**
 * Catalogue.
 *
 * `met` est l'equivalent metabolique, tire du compendium des activites
 * physiques. C'est un ordre de grandeur : la meme seance de musculation vaut 3
 * ou 6 METs selon la charge et les temps de repos. Les chiffres affiches
 * heritent donc de cette imprecision, et l'ecran ne fait pas semblant du
 * contraire.
 *
 * `tracks` dit ce qu'il y a a saisir. Une seance de natation n'a pas de
 * denivele, une seance de musculation n'a pas de distance : afficher les six
 * champs pour tout le monde ferait un formulaire que personne ne remplit.
 *
 * `suits` sert a TRIER, jamais a filtrer. Il place en tete ce qui a le plus de
 * chances de servir, et laisse tout le reste accessible juste en dessous.
 */
export const ACTIVITIES = [
  // ------------------------------------------------------------ deplacement
  { id: 'walk', label: 'Marche', met: 3.5, group: 'Déplacement', tracks: ['duration', 'distance', 'elevation'], suits: ['walking', 'aids', 'varies'] },
  { id: 'walk-fast', label: 'Marche rapide', met: 5, group: 'Déplacement', tracks: ['duration', 'distance', 'elevation'], suits: ['walking', 'varies'] },
  { id: 'hike', label: 'Randonnée', met: 6, group: 'Déplacement', tracks: ['duration', 'distance', 'elevation'], suits: ['walking', 'aids', 'varies'] },
  { id: 'run', label: 'Course à pied', met: 9.8, group: 'Déplacement', tracks: ['duration', 'distance', 'elevation'], suits: ['walking', 'varies'] },
  { id: 'wheel', label: 'Fauteuil, déplacement', met: 3.5, group: 'Déplacement', tracks: ['duration', 'distance', 'elevation'], suits: ['wheelchair'] },
  { id: 'wheel-sport', label: 'Fauteuil, allure sportive', met: 6.5, group: 'Déplacement', tracks: ['duration', 'distance', 'elevation'], suits: ['wheelchair'] },
  { id: 'handbike', label: 'Handbike', met: 6, group: 'Déplacement', tracks: ['duration', 'distance', 'elevation'], suits: ['wheelchair'] },
  { id: 'bike', label: 'Vélo', met: 6.8, group: 'Déplacement', tracks: ['duration', 'distance', 'elevation'], suits: ['walking', 'varies'] },
  { id: 'bike-hard', label: 'Vélo, effort soutenu', met: 10, group: 'Déplacement', tracks: ['duration', 'distance', 'elevation'], suits: ['walking', 'varies'] },
  { id: 'swim', label: 'Natation', met: 6, group: 'Déplacement', tracks: ['duration', 'distance'], suits: ['walking', 'wheelchair', 'aids', 'varies'] },
  { id: 'swim-hard', label: 'Natation, effort soutenu', met: 9.8, group: 'Déplacement', tracks: ['duration', 'distance'], suits: ['walking', 'wheelchair', 'varies'] },
  { id: 'row', label: 'Rameur', met: 7, group: 'Déplacement', tracks: ['duration', 'distance'], suits: ['walking', 'wheelchair', 'aids', 'varies'] },
  { id: 'elliptical', label: 'Elliptique', met: 5, group: 'Déplacement', tracks: ['duration', 'distance'], suits: ['walking', 'varies'] },

  // ------------------------------------------------------------ renforcement
  { id: 'strength', label: 'Musculation', met: 5, group: 'Renforcement', tracks: ['duration', 'sets', 'reps', 'weight'], suits: ['walking', 'wheelchair', 'aids', 'varies'] },
  { id: 'strength-light', label: 'Renforcement léger', met: 3.5, group: 'Renforcement', tracks: ['duration', 'sets', 'reps', 'weight'], suits: ['walking', 'wheelchair', 'aids', 'varies'] },
  { id: 'calisthenics', label: 'Callisthénie', met: 8, group: 'Renforcement', tracks: ['duration', 'sets', 'reps'], suits: ['walking', 'wheelchair', 'aids', 'varies'] },
  { id: 'crossfit', label: 'Cross-training', met: 8, group: 'Renforcement', tracks: ['duration', 'sets', 'reps'], suits: ['walking', 'wheelchair', 'varies'] },
  { id: 'climb', label: 'Escalade', met: 8, group: 'Renforcement', tracks: ['duration'], suits: ['walking', 'wheelchair', 'varies'] },
  { id: 'jumprope', label: 'Corde à sauter', met: 11, group: 'Renforcement', tracks: ['duration'], suits: ['walking', 'varies'] },

  // ------------------------------------------------------------------ souple
  { id: 'yoga', label: 'Yoga', met: 2.5, group: 'Souplesse et calme', tracks: ['duration'], suits: ['walking', 'wheelchair', 'aids', 'varies'] },
  { id: 'pilates', label: 'Pilates', met: 3, group: 'Souplesse et calme', tracks: ['duration'], suits: ['walking', 'wheelchair', 'aids', 'varies'] },
  { id: 'stretch', label: 'Étirements', met: 2.3, group: 'Souplesse et calme', tracks: ['duration'], suits: ['walking', 'wheelchair', 'aids', 'varies'] },
  { id: 'physio', label: 'Kinésithérapie', met: 3, group: 'Souplesse et calme', tracks: ['duration'], suits: ['wheelchair', 'aids', 'varies', 'walking'] },

  // ------------------------------------------------------------------- jeux
  { id: 'dance', label: 'Danse', met: 5, group: 'Jeux et sports', tracks: ['duration'], suits: ['walking', 'wheelchair', 'varies'] },
  { id: 'football', label: 'Football', met: 7, group: 'Jeux et sports', tracks: ['duration'], suits: ['walking', 'varies'] },
  { id: 'basket', label: 'Basket', met: 6.5, group: 'Jeux et sports', tracks: ['duration'], suits: ['walking', 'wheelchair', 'varies'] },
  { id: 'tennis', label: 'Tennis, badminton', met: 7.3, group: 'Jeux et sports', tracks: ['duration'], suits: ['walking', 'wheelchair', 'varies'] },
  { id: 'volley', label: 'Volley', met: 4, group: 'Jeux et sports', tracks: ['duration'], suits: ['walking', 'wheelchair', 'varies'] },
  { id: 'martial', label: 'Arts martiaux', met: 10, group: 'Jeux et sports', tracks: ['duration'], suits: ['walking', 'wheelchair', 'varies'] },
  { id: 'other', label: 'Autre activité', met: 5, group: 'Jeux et sports', tracks: ['duration', 'distance'], suits: ['walking', 'wheelchair', 'aids', 'varies'] },
];

export function getActivity(id) {
  return ACTIVITIES.find((a) => a.id === id) || null;
}

/**
 * Le catalogue, trie selon la mobilite declaree.
 *
 * On TRIE, on ne filtre pas. Masquer l'escalade a une personne en fauteuil
 * serait decider a sa place de ce qu'elle peut faire -- et se tromper. Ce qui
 * a le plus de chances de servir passe devant, le reste suit.
 */
export function catalogue(mobility = null) {
  if (!mobility) return [...ACTIVITIES];
  return [...ACTIVITIES].sort((a, b) => {
    const sa = a.suits.includes(mobility) ? 0 : 1;
    const sb = b.suits.includes(mobility) ? 0 : 1;
    return sa - sb;
  });
}

/**
 * Vocabulaire du deplacement, selon la mobilite declaree.
 *
 * « 4 200 pas » ne veut rien dire pour quelqu'un en fauteuil, et lui afficher
 * ce mot tous les jours revient a lui rappeler tous les jours que
 * l'application n'a pas ete pensee pour lui. Le comptage, lui, reste le meme :
 * c'est une distance.
 */
export function moveTerms(mobility = null) {
  if (mobility === 'wheelchair') {
    // `counts: false` : aucun equivalent en nombre de poussees n'est affiche.
    // La foulee se deduit honnetement de la taille ; le nombre de poussees, non
    // -- il depend du reglage du fauteuil, du diametre des mains courantes, du
    // terrain et de la technique, qui varient plus d'une personne a l'autre que
    // le chiffre lui-meme. Convertir quand meme, avec la formule de la marche,
    // produirait un nombre precis et faux. La distance, elle, est une mesure.
    return { unit: 'poussées', one: 'poussée', label: 'Distance parcourue', counts: false };
  }
  if (mobility === 'aids') {
    return { unit: 'pas', one: 'pas', label: 'Distance parcourue', counts: true };
  }
  return { unit: 'pas', one: 'pas', label: 'Marche du jour', counts: true };
}

/** Unites de distance proposees. Le systeme imperial est demande explicitement. */
export const DISTANCE_UNITS = [
  { id: 'km', label: 'km', meters: 1000 },
  { id: 'm', label: 'm', meters: 1 },
  { id: 'mi', label: 'miles', meters: 1609.344 },
  { id: 'ft', label: 'pieds', meters: 0.3048 },
];

export function toMeters(value, unit) {
  const n = num(value);
  const u = DISTANCE_UNITS.find((d) => d.id === unit);
  if (n === null || !u) return null;
  return n * u.meters;
}

export function fromMeters(meters, unit) {
  const n = num(meters);
  const u = DISTANCE_UNITS.find((d) => d.id === unit);
  if (n === null || !u) return null;
  return n / u.meters;
}

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Longueur de foulee, en metres.
 *
 * Le coefficient 0,414 x taille est publie separement pour deux groupes de
 * reference, a 0,415 et 0,413. L'ecart entre les deux vaut 0,5 % ; la
 * variabilite d'une personne a l'autre, a taille egale, depasse 10 %. Le genre
 * n'apporterait donc ici aucune precision reelle -- et il n'entre dans qu'un
 * seul calcul de toute l'application, qui est ailleurs.
 */
export const STRIDE_RATIO = 0.414;

export function strideMeters(heightCm) {
  const h = num(heightCm);
  return h === null ? null : (h * STRIDE_RATIO) / 100;
}

/**
 * Conversion distance <-> pas.
 *
 * Renvoie `null` sans taille connue, plutot qu'une foulee moyenne : un compteur
 * de pas faux est pire qu'un compteur absent, parce qu'on le croit.
 */
export function stepsFromDistance(meters, heightCm) {
  const d = num(meters);
  const stride = strideMeters(heightCm);
  if (d === null || stride === null || stride <= 0) return null;
  return Math.round(d / stride);
}

export function distanceFromSteps(steps, heightCm) {
  const s = num(steps);
  const stride = strideMeters(heightCm);
  if (s === null || stride === null) return null;
  return Math.round(s * stride);
}

/**
 * Calories actives d'une seance.
 *
 * On retranche 1 MET : un MET est, par definition, la depense au repos. Sans
 * cette soustraction, une heure de yoga a 2,5 METs « couterait » 2,5 fois le
 * repos alors qu'elle n'ajoute que 1,5 fois -- le corps aurait de toute facon
 * depense le reste, assis. Et cette depense-la est deja dans le metabolisme de
 * base. Compter le brut ferait donc, une deuxieme fois, l'erreur que tout ce
 * fichier cherche a eviter.
 *
 * Renvoie `null` sans poids connu. Une depense se calcule sur la masse
 * deplacee ; a defaut on affiche la duree, qui est un fait.
 */
export function activeCalories({ met, minutes, weightKg }) {
  const m = num(met);
  const min = num(minutes);
  const kg = num(weightKg);
  if (m === null || min === null || kg === null || min <= 0) return null;
  const net = Math.max(m - 1, 0);
  return Math.round(net * kg * (min / 60));
}

/** Calories actives d'une seance enregistree. */
export function sessionCalories(session, weightKg) {
  const activity = getActivity(session?.activityId);
  // Une seance dont l'intensite a ete corrigee a la main garde la sienne.
  const met = num(session?.met) ?? activity?.met ?? null;
  return activeCalories({ met, minutes: session?.minutes, weightKg });
}

/**
 * Totaux de la journee.
 *
 * Une seance sans poids connu compte pour sa duree et pas pour ses calories :
 * elle est exclue du total plutot que comptee zero, comme partout ailleurs
 * dans l'application.
 */
export function dayTotals(day = {}, weightKg = null) {
  const sessions = day?.sessions || [];
  const minutes = sessions.map((s) => num(s?.minutes)).filter((v) => v !== null);
  const kcals = sessions.map((s) => sessionCalories(s, weightKg)).filter((v) => v !== null);

  const sessionMeters = sessions.map((s) => num(s?.meters)).filter((v) => v !== null);
  const moved = num(day?.meters);
  const distance =
    moved === null && !sessionMeters.length
      ? null
      : (moved || 0) + sessionMeters.reduce((a, b) => a + b, 0);

  return {
    minutes: minutes.length ? minutes.reduce((a, b) => a + b, 0) : null,
    activeKcal: kcals.length ? kcals.reduce((a, b) => a + b, 0) : null,
    meters: distance === null ? null : Math.round(distance),
    sessions: sessions.length || null,
    restDay: day?.restDay === true ? 1 : null,
  };
}

/** Bornes de vraisemblance, memes principes que pour les mesures de sante. */
export const LIMITS = {
  minutes: [1, 1440],
  meters: [1, 500000],
  elevation: [0, 12000],
  reps: [1, 1000],
  sets: [1, 100],
  weight: [0, 1000],
};

/**
 * Nettoie une saisie de seance.
 *
 * Hors bornes, on refuse plutot que de ramener au plus proche : corriger une
 * saisie a la place de quelqu'un revient a inventer une donnee.
 */
export function sanitize(field, value) {
  if (value === null || value === undefined || value === '') return { value: null };
  const bounds = LIMITS[field];
  if (!bounds) return { value: null, reason: 'unknown' };
  const n = Number(value);
  if (!Number.isFinite(n)) return { value: null, reason: 'nan' };
  const [min, max] = bounds;
  if (n < min || n > max) return { value: null, reason: 'range', min, max };
  return { value: Math.round(n * 100) / 100 };
}
