/**
 * Sante et traitements.
 *
 * Le cahier des charges enumere ici une douzaine de mesures : temperature,
 * tension, oxygenation, trois frequences cardiaques, douleur et sa
 * localisation, digestion, symptomes, traitements. Les afficher toutes, tous
 * les jours, reproduirait exactement le defaut du prototype v5 -- cent
 * cinquante champs quotidiens, abandonnes en trois semaines.
 *
 * Le parti pris est donc different : LA PERSONNE DIT CE QU'ELLE MESURE, une
 * fois, et ne voit que cela. Un tensiometre ne se devine pas, un thermometre
 * non plus. Personne ne se retrouve devant un champ qu'il ne pourrait pas
 * remplir.
 *
 * Quatre regles tenues dans ce fichier :
 *
 * 1. AUCUN SEUIL, AUCUN JUGEMENT. Daylog n'a pas d'avis sur une tension a
 *    14/9 ni sur un pouls a 52. Il n'existe ici ni "normal", ni "eleve", ni
 *    couleur d'alerte. Ce sont des chiffres qu'on releve et qu'on peut montrer
 *    a un professionnel de sante -- c'est lui qui les lit.
 *
 * 2. DES BORNES DE VRAISEMBLANCE, QUI NE SONT PAS DES SEUILS. Une temperature
 *    a 370 est une virgule oubliee, pas une fievre : refuser la saisie evite
 *    d'empoisonner toutes les moyennes pour une faute de frappe. La borne dit
 *    "je ne sais pas enregistrer ça", jamais "ce n'est pas normal".
 *
 * 3. UNE DOSE EST FIGEE A LA PRISE. Un traitement dont la dose evolue -- le cas
 *    du TDAH cite par le cahier des charges -- doit laisser un historique
 *    exact : ce qui a ete pris en fevrier reste ce qui a ete pris en fevrier,
 *    meme si la dose change en mars. C'est la meme regle que pour les aliments
 *    et les habitudes.
 *
 * 4. LE POIDS EST UNE SERIE, PAS UNE VALEUR. Une pesee isolee ne dit rien : le
 *    poids varie de plus d'un kilo dans une journee. Toute tendance passe donc
 *    par une moyenne mobile, et refuse de se prononcer sur trop peu de points.
 */

/**
 * Ce qu'on peut mesurer.
 *
 * `range` borne ce que le corps humain vivant peut afficher, largement -- ce
 * n'est pas une plage de reference medicale mais un garde-fou de saisie. Les
 * bornes sont volontairement genereuses : une hypothermie a 31 °C et une fievre
 * a 42 °C existent, et une application qui refuserait de les noter serait
 * inutile precisement le jour ou elle servirait.
 *
 * `device` dit ce qu'il faut avoir sous la main. Il ne masque rien tout seul :
 * il sert a formuler la question posee une fois, "qu'est-ce que tu peux
 * mesurer ?", plutot qu'a deduire d'une marque de montre ce que quelqu'un
 * possede.
 */
export const MEASURES = [
  {
    id: 'weight',
    label: 'Poids',
    short: 'Poids',
    unit: 'kg',
    step: 0.1,
    digits: 1,
    range: [20, 400],
    device: 'une balance',
    summaryKey: 'weightKg',
  },
  {
    id: 'bodyFat',
    label: 'Masse grasse',
    short: 'Masse grasse',
    unit: '%',
    step: 0.1,
    digits: 1,
    range: [2, 70],
    device: 'une balance à impédance, ou une mesure en cabinet',
    summaryKey: 'bodyFatPct',
  },
  {
    id: 'temp',
    label: 'Température',
    short: 'Température',
    unit: '°C',
    step: 0.1,
    digits: 1,
    range: [30, 43],
    device: 'un thermomètre',
    summaryKey: 'tempC',
  },
  {
    id: 'bp',
    label: 'Tension artérielle',
    short: 'Tension',
    unit: 'mmHg',
    pair: true,
    device: 'un tensiomètre',
    summaryKey: 'bpSys',
  },
  {
    id: 'spo2',
    label: 'Oxygénation du sang',
    short: 'Oxygénation',
    unit: '%',
    step: 1,
    digits: 0,
    range: [70, 100],
    device: 'un oxymètre, ou une montre qui le mesure',
    summaryKey: 'spo2',
  },
  {
    id: 'bpmRest',
    label: 'Pouls au repos',
    short: 'Pouls au repos',
    unit: 'bpm',
    step: 1,
    digits: 0,
    range: [25, 140],
    device: 'une montre, ou deux doigts et une minute',
    summaryKey: 'bpmRest',
  },
  {
    id: 'bpmMin',
    label: 'Pouls le plus bas de la journée',
    short: 'Pouls bas',
    unit: 'bpm',
    step: 1,
    digits: 0,
    range: [25, 140],
    device: 'une montre',
    summaryKey: 'bpmMin',
  },
  {
    id: 'bpmMax',
    label: 'Pouls le plus haut de la journée',
    short: 'Pouls haut',
    unit: 'bpm',
    step: 1,
    digits: 0,
    range: [60, 230],
    device: 'une montre',
    summaryKey: 'bpmMax',
  },
];

/** Bornes de vraisemblance de la tension, en millimetres de mercure. */
export const BP_RANGE = { systolic: [60, 260], diastolic: [30, 160] };

export function getMeasure(id) {
  return MEASURES.find((m) => m.id === id) || null;
}

/**
 * Mesures pre-cochees a la question "qu'est-ce que tu mesures ?".
 *
 * Le poids seul : c'est la seule que presque tout le monde peut relever, et
 * c'est celle qui sert ailleurs dans l'application. Une montre connectee
 * ajoute les frequences cardiaques et l'oxygenation, qu'elle mesure toute
 * seule -- proposer de les saisir a la main a quelqu'un qui n'a rien pour les
 * mesurer serait absurde.
 */
export function suggestedMeasures({ wearable = null } = {}) {
  const base = ['weight'];
  if (wearable) base.push('bpmRest', 'spo2');
  return base;
}

/**
 * Localisations de la douleur.
 *
 * Volontairement grossieres. Une carte anatomique precise donnerait
 * l'impression d'un dossier medical, demanderait dix fois plus de gestes, et
 * n'apporterait rien a quelqu'un qui veut simplement se souvenir que son dos a
 * ete penible trois jours de suite.
 */
export const PAIN_SITES = [
  { id: 'head', label: 'Tête' },
  { id: 'neck', label: 'Nuque, cou' },
  { id: 'shoulders', label: 'Épaules' },
  { id: 'back', label: 'Dos' },
  { id: 'lower-back', label: 'Bas du dos' },
  { id: 'chest', label: 'Poitrine' },
  { id: 'belly', label: 'Ventre' },
  { id: 'pelvis', label: 'Bassin' },
  { id: 'arms', label: 'Bras, mains' },
  { id: 'legs', label: 'Jambes' },
  { id: 'knees', label: 'Genoux' },
  { id: 'feet', label: 'Pieds' },
  { id: 'joints', label: 'Articulations' },
  { id: 'diffuse', label: 'Un peu partout' },
];

/**
 * Digestion.
 *
 * « Rien à signaler » est une reponse a part entiere, et non l'absence de
 * reponse : c'est la meme distinction qu'entre zero verre d'eau et une
 * hydratation non renseignee. Sans elle, une journee ou tout allait bien serait
 * indiscernable d'une journee ou l'on n'a rien note.
 */
export const DIGESTION = [
  { id: 'fine', label: 'Rien à signaler' },
  { id: 'bloating', label: 'Ballonnements' },
  { id: 'heavy', label: 'Lourdeur' },
  { id: 'nausea', label: 'Nausées' },
  { id: 'burning', label: 'Brûlures' },
  { id: 'cramps', label: 'Crampes' },
  { id: 'fast', label: 'Transit rapide' },
  { id: 'slow', label: 'Transit lent' },
];

/**
 * Symptomes generaux.
 *
 * Distincts de ceux du cycle, qui vivent dans `core/cycle.js` : les deux listes
 * se recouperaient a peine, et fusionner obligerait a montrer « bouffées de
 * chaleur » a tout le monde ou « toux » a qui suit ses regles.
 */
export const SYMPTOMS = [
  { id: 'fever', label: 'Fièvre' },
  { id: 'chills', label: 'Frissons' },
  { id: 'cough', label: 'Toux' },
  { id: 'nose', label: 'Nez pris' },
  { id: 'throat', label: 'Mal de gorge' },
  { id: 'headache', label: 'Mal de tête' },
  { id: 'tired', label: 'Fatigue inhabituelle' },
  { id: 'dizzy', label: 'Vertiges' },
  { id: 'breath', label: 'Souffle court' },
  { id: 'palpitations', label: 'Palpitations' },
  { id: 'skin', label: 'Peau, démangeaisons' },
  { id: 'appetite', label: "Appétit en berne" },
  { id: 'sleep', label: 'Sommeil perturbé' },
];

/**
 * Unites de dose.
 *
 * « Comprimé » et « goutte » figurent a cote des milligrammes parce que c'est
 * ainsi que la plupart des gens comptent leur traitement. Obliger a convertir
 * en milligrammes ferait perdre l'information vraie -- un demi-comprimé se note
 * 0,5 comprimé, et sa conversion depend d'un dosage que Daylog ne connait pas.
 */
export const DOSE_UNITS = ['mg', 'µg', 'g', 'ml', 'comprimé', 'goutte', 'bouffée', 'UI', 'patch'];

/** Moments de prise. Sert a ordonner la liste, jamais a signaler un oubli. */
export const MOMENTS = [
  { id: 'morning', label: 'Matin' },
  { id: 'noon', label: 'Midi' },
  { id: 'evening', label: 'Soir' },
  { id: 'night', label: 'Au coucher' },
  { id: 'as-needed', label: 'Au besoin' },
];

const MOMENT_ORDER = new Map(MOMENTS.map((m, i) => [m.id, i]));

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Verifie une mesure saisie.
 *
 * Renvoie `{ value }` si elle est enregistrable, `{ value: null, reason }`
 * sinon. `reason` vaut 'range' quand le nombre sort des bornes de
 * vraisemblance -- l'ecran peut alors dire ce qu'il attend, plutot que de
 * refuser en silence ou, pire, d'arrondir a la borne la plus proche. Corriger
 * une saisie a la place de quelqu'un reviendrait a inventer une donnee.
 *
 * Une valeur vide n'est pas une erreur : c'est un champ qu'on efface, et il
 * revient a « non renseigne ».
 */
export function sanitizeMeasure(id, value) {
  if (value === null || value === undefined || value === '') return { value: null };
  const measure = getMeasure(id);
  if (!measure || measure.pair) return { value: null, reason: 'unknown' };

  const n = Number(value);
  if (!Number.isFinite(n)) return { value: null, reason: 'nan' };

  const [min, max] = measure.range;
  if (n < min || n > max) return { value: null, reason: 'range', min, max };

  // On arrondit a la precision de la mesure : une temperature a 37,0333 vient
  // d'une conversion, pas d'un thermometre.
  const f = 10 ** measure.digits;
  return { value: Math.round(n * f) / f };
}

/**
 * Verifie une tension arterielle.
 *
 * Deux nombres qui ne veulent rien dire l'un sans l'autre, et dont l'ordre ne
 * s'invente pas : la systolique est toujours la plus haute. Une saisie inversee
 * est signalee plutot que remise a l'endroit toute seule -- on ne corrige pas
 * une donnee de sante a la place de quelqu'un.
 */
export function sanitizeBloodPressure(systolic, diastolic) {
  const s = systolic === null || systolic === undefined || systolic === '' ? null : Number(systolic);
  const d =
    diastolic === null || diastolic === undefined || diastolic === '' ? null : Number(diastolic);

  if (s === null && d === null) return { value: null };
  if (s === null || d === null) return { value: null, reason: 'incomplete' };
  if (!Number.isFinite(s) || !Number.isFinite(d)) return { value: null, reason: 'nan' };

  const inRange = (v, [min, max]) => v >= min && v <= max;
  if (!inRange(s, BP_RANGE.systolic) || !inRange(d, BP_RANGE.diastolic)) {
    return { value: null, reason: 'range' };
  }
  if (d >= s) return { value: null, reason: 'inverted' };

  return { value: { systolic: Math.round(s), diastolic: Math.round(d) } };
}

// ------------------------------------------------------------------ poids

/**
 * Serie de poids, du plus ancien au plus recent.
 *
 * Lit les resumes quotidiens et non les fiches completes : un an de pesees se
 * lit en quelques kilo-octets.
 */
export function weightSeries(rows = []) {
  return (rows || [])
    .filter((r) => r && num(r.weightKg) !== null)
    .map((r) => ({ date: r.date, kg: r.weightKg }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Moyenne des `n` premiers, ou des `n` derniers si `n` est negatif. */
function edgeMean(points, n) {
  const slice = n < 0 ? points.slice(n) : points.slice(0, n);
  if (!slice.length) return null;
  return slice.reduce((a, p) => a + p.kg, 0) / slice.length;
}

/**
 * Tendance du poids sur une periode.
 *
 * Les extremites sont LISSEES sur une semaine de pesees. Comparer la premiere
 * pesee a la derniere donnerait une tendance qui saute de 1,5 kg selon le jour
 * ou l'on regarde : le poids d'un matin depend surtout de ce qu'on a mange et
 * bu la veille. C'est le meme piege que la correlation sur sept points -- un
 * chiffre juste en apparence, faux en pratique.
 *
 * Renvoie `null` s'il n'y a pas de quoi conclure : deux pesees suffisent a
 * tracer une droite, pas a decrire une tendance.
 */
export function weightTrend(rows = [], { minPoints = 4, window = 7 } = {}) {
  const points = weightSeries(rows);
  if (points.length < minPoints) {
    return { change: null, n: points.length, missing: minPoints - points.length };
  }

  // Les fenetres ne se recouvrent jamais : sur cinq pesees, sept de chaque cote
  // compteraient deux fois les memes points et la tendance serait toujours
  // nulle.
  const size = Math.min(window, Math.floor(points.length / 2));
  const first = edgeMean(points, size);
  const last = edgeMean(points, -size);

  const from = points[0].date;
  const to = points[points.length - 1].date;
  const days = Math.round((new Date(to) - new Date(from)) / 86400000);

  return {
    change: Math.round((last - first) * 100) / 100,
    first: Math.round(first * 100) / 100,
    last: Math.round(last * 100) / 100,
    n: points.length,
    days,
    from,
    to,
  };
}

/**
 * La pesee du jour doit-elle devenir le poids de reference du profil ?
 *
 * Le cahier des charges veut que le poids saisi une fois au profil soit ensuite
 * tenu a jour par le suivi quotidien. Mais on consulte aussi les journees
 * passees, et completer une pesee oubliee la semaine derniere ne doit pas
 * remplacer la pesee d'hier par une plus ancienne -- l'estimation energetique
 * reculerait d'une semaine sans que rien ne l'explique.
 *
 * D'ou la seule regle : une mesure ne prend la place de la reference que si
 * elle est au moins aussi recente que celle deja enregistree.
 */
export function shouldAdoptWeight(date, measuredAt) {
  if (!date) return false;
  if (!measuredAt) return true;
  const current = String(measuredAt).slice(0, 10);
  return date >= current;
}

// ------------------------------------------------------------- traitements

/**
 * Dose en vigueur a une date donnee.
 *
 * Un traitement porte sa dose actuelle et l'historique de ses changements. La
 * dose d'une journee passee est donc celle qui s'appliquait CE JOUR-LA, et non
 * celle d'aujourd'hui : sans cela, augmenter un dosage en mars reecrirait tout
 * le suivi de janvier, et le seul interet de noter un ressenti -- voir ce qu'un
 * changement a change -- disparaitrait.
 */
export function doseAt(treatment, date) {
  if (!treatment) return { dose: null, unit: null };
  const history = (treatment.doseHistory || [])
    .filter((h) => h && h.at)
    .sort((a, b) => (a.at < b.at ? -1 : 1));

  let current = { dose: treatment.dose ?? null, unit: treatment.unit ?? null };
  // Aucun historique : la dose actuelle vaut pour toute la periode. C'est le
  // cas d'un traitement qui n'a jamais bouge.
  if (!history.length) return current;

  // Le premier enregistrement date de la creation : avant lui, il n'y avait
  // rien a prendre.
  current = { dose: history[0].dose ?? null, unit: history[0].unit ?? null };
  for (const entry of history) {
    if (String(entry.at).slice(0, 10) <= date) {
      current = { dose: entry.dose ?? null, unit: entry.unit ?? null };
    }
  }
  return current;
}

/**
 * Changement de dose recent, s'il y en a un.
 *
 * Sert a proposer -- pas a imposer -- de noter un ressenti dans les semaines
 * qui suivent un ajustement. C'est le moment ou l'information a de la valeur,
 * et le seul ou la question merite d'etre posee.
 */
export function recentDoseChange(treatment, date, { within = 21 } = {}) {
  const history = (treatment?.doseHistory || []).filter((h) => h && h.at);
  if (history.length < 2) return null;

  const day = new Date(date);
  let latest = null;
  for (const entry of history) {
    const at = String(entry.at).slice(0, 10);
    if (at > date) continue;
    const days = Math.round((day - new Date(at)) / 86400000);
    if (days <= within && (!latest || at > latest.at)) latest = { ...entry, at, days };
  }
  // Le tout premier enregistrement n'est pas un changement : c'est une creation.
  if (!latest || latest.at === String(history[0].at).slice(0, 10)) return null;
  return latest;
}

/** Ordonne les traitements par moment de prise, puis par ordre de creation. */
export function sortTreatments(items = []) {
  return [...items].sort((a, b) => {
    const ma = MOMENT_ORDER.get(a.moments?.[0]) ?? MOMENTS.length;
    const mb = MOMENT_ORDER.get(b.moments?.[0]) ?? MOMENTS.length;
    if (ma !== mb) return ma - mb;
    return (a.order || 0) - (b.order || 0);
  });
}

/**
 * Fabrique l'enregistrement d'une prise.
 *
 * Il porte l'identifiant du traitement ET son libelle, sa dose et son unite,
 * figes a cet instant. L'identifiant fait le lien -- renommer un traitement met
 * a jour tout l'affichage. Les valeurs figees, elles, rendent l'enregistrement
 * lisible seul : un extrait « Santé » remis a un medecin n'emporte pas les
 * listes de l'application, et une ligne « trt_x8k2 : 1 » ne lui apprendrait
 * rien.
 */
export function takeDose(treatment, date, at = new Date()) {
  const { dose, unit } = doseAt(treatment, date);
  return {
    id: treatment.id,
    label: treatment.label,
    dose,
    unit,
    at: at.toISOString(),
  };
}

/** Description lisible d'une dose : « 20 mg », « 1 comprimé », « 2 comprimés ». */
export function formatDose(dose, unit) {
  const n = num(dose);
  if (n === null) return unit || '';
  if (!unit) return String(n);
  // Seules les unites ecrites en toutes lettres s'accordent ; « mg » ni « ml »
  // ne prennent la marque du pluriel.
  const plural = n > 1 && /^[a-zà-ÿ]/i.test(unit) && unit.length > 3 ? 's' : '';
  return `${n} ${unit}${plural}`;
}
