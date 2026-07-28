/**
 * Besoins energetiques et cibles de macronutriments.
 *
 * Les formules et leurs raisons sont dans docs/calculs-metaboliques.md. Ce
 * fichier les applique, et il applique surtout quatre garde-fous.
 *
 * 1. AUCUN CHIFFRE SANS LES DONNEES POUR LE PRODUIRE. Il manque la taille ? On
 *    ne renvoie pas une estimation « raisonnable », on renvoie `null` et la
 *    raison. Le v5 affichait 2000 kcal a tout le monde par defaut, et ce nombre
 *    finissait par etre pris pour un objectif personnel.
 *
 * 2. AUCUN DEFICIT SOUS LE METABOLISME DE BASE. C'est le garde-fou le plus
 *    important du fichier. Une application qui propose de manger moins que ce
 *    que le corps depense au repos ne fait pas du suivi, elle fabrique un
 *    trouble. Le deficit est plafonne, et la cible ne descend jamais sous le
 *    metabolisme de base -- quel que soit l'objectif choisi.
 *
 * 3. LE GENRE N'ENTRE DANS AUCUN CALCUL. `body.calcBasis` est une variable
 *    physiologique choisie explicitement, pas une case « homme / femme » ;
 *    l'identite declaree ne pilote que le vocabulaire.
 *
 * 4. LES FAITS L'EMPORTENT SUR LA FORMULE. Si le poids evolue autrement que
 *    prevu sur six a huit semaines, c'est l'estimation qui a tort : elle se
 *    recale sur ce qui a ete observe. Au bout de deux mois, le choix de depart
 *    ne pese presque plus.
 */

/**
 * Niveaux d'activite.
 *
 * Question posee SEPAREMENT de la mobilite, et jamais deduite d'elle : une
 * personne en fauteuil peut etre sportive de haut niveau, une personne qui
 * marche peut etre sedentaire. Deduire l'un de l'autre serait faux, et le
 * message envoye serait pire que le calcul.
 *
 * Les libelles decrivent des semaines, pas des identites : on ne demande pas
 * « es-tu sportif ? » mais « une semaine ordinaire, ça ressemble a quoi ? ».
 */
export const ACTIVITY_LEVELS = [
  { id: 'sedentary', factor: 1.2, label: 'Surtout assis', hint: 'Peu de déplacements' },
  { id: 'light', factor: 1.375, label: 'Un peu de mouvement', hint: '1 à 3 fois par semaine' },
  { id: 'moderate', factor: 1.55, label: 'Régulièrement actif', hint: '3 à 5 fois par semaine' },
  { id: 'high', factor: 1.725, label: 'Très actif', hint: '6 à 7 fois par semaine' },
  { id: 'athlete', factor: 1.9, label: 'Intense', hint: 'Métier physique, ou deux séances par jour' },
];

/**
 * Objectifs de poids, en ecart quotidien.
 *
 * 500 kcal est le plafond, dans les deux sens. Au-dela, on ne perd pas plus
 * vite : on perd davantage de muscle, et on tient moins longtemps. Une
 * application qui propose « -1000 kcal, resultats rapides » fait une promesse
 * qu'elle sait fausse.
 *
 * Les libelles ne classent personne : pas de « perte agressive », pas de
 * « seche ». Une vitesse, et ce qu'elle represente par semaine.
 */
export const WEIGHT_GOALS = [
  { id: 'lose', delta: -500, label: 'Perdre', hint: 'environ 0,5 kg par semaine' },
  { id: 'lose-slow', delta: -250, label: 'Perdre doucement', hint: 'environ 0,25 kg par semaine' },
  { id: 'maintain', delta: 0, label: 'Stabiliser', hint: 'ni perte ni prise' },
  { id: 'gain-slow', delta: 250, label: 'Prendre doucement', hint: 'environ 0,25 kg par semaine' },
  { id: 'gain', delta: 500, label: 'Prendre', hint: 'environ 0,5 kg par semaine' },
];

/**
 * Reference de calcul, deduite du genre.
 *
 * PARTI PRIS, ET IL A CHANGE. Les premieres versions posaient la question de la
 * « variante de calcul » a tout le monde, avec des libelles qui contournaient le
 * mot « genre ». C'etait maladroit sur deux plans : le detour se voyait, et il
 * revenait a faire porter a chacun un choix technique dont la reponse est
 * evidente pour la plupart des gens.
 *
 * Les formules publiees ont bien ete calibrees separement sur des groupes de
 * reference feminins et masculins, et cette difference physiologique est reelle.
 * Daylog en tient donc compte, automatiquement, a partir d'une seule question --
 * et cette question ne sert qu'ici.
 *
 * Deux cas ne se laissent pas ramener a l'une des deux references :
 *
 *   non binaire   on prend le milieu des deux, en le disant. L'estimation est
 *                 moins precise, et le recalage sur les faits la corrigera.
 *   trans         la personne choisit elle-meme, et peut faire glisser la
 *                 reference progressivement. C'est le seul cas ou le choix
 *                 explicite vaut mieux qu'une deduction : qui suit une
 *                 transition connait son etape mieux que n'importe quelle regle.
 */
export function basisForGender(gender) {
  return { woman: 'b', man: 'a', nonbinary: 'median' }[gender] || null;
}

/** Sens de transition proposes, pour qui choisit la reference glissante. */
export const TRANSITION_DIRECTIONS = [
  { id: 'mtf', from: 'a', to: 'b', label: 'Vers la référence féminine' },
  { id: 'ftm', from: 'b', to: 'a', label: 'Vers la référence masculine' },
];

/** References explicites, proposees aux personnes trans uniquement. */
export const CALC_BASES = [
  { id: 'b', label: 'Référence féminine' },
  { id: 'a', label: 'Référence masculine' },
  {
    id: 'interpolated',
    label: 'Transition en cours',
    hint: 'Glisse d’une référence à l’autre sur trois ans',
  },
];

/** Energie contenue dans un kilo de masse corporelle, en kcal. */
export const KCAL_PER_KG = 7700;

/** Duree de la transition progressive entre deux bases de calcul, en annees. */
export const INTERPOLATION_YEARS = 3;

export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 };

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function activityFactor(id) {
  return ACTIVITY_LEVELS.find((a) => a.id === id)?.factor ?? null;
}

export function goalDelta(id) {
  return WEIGHT_GOALS.find((g) => g.id === id)?.delta ?? null;
}

/**
 * Metabolisme de base, en kcal par jour.
 *
 * Trois voies, parce qu'aucune ne convient a tout le monde :
 *
 *   lean-mass     Katch-McArdle, si la masse grasse a ete MESUREE. La meilleure
 *                 quand elle est possible, et la seule ou la question du sexe ne
 *                 se pose pas : le corps est decrit par ce qu'il est.
 *   'a' / 'b'     Mifflin-St Jeor, dont les deux constantes viennent des deux
 *                 groupes de calibration. Daylog demande laquelle utiliser au
 *                 lieu de la deduire d'une case.
 *   interpolated  glissement progressif de l'une vers l'autre, pour une
 *                 hormonotherapie en cours.
 *
 * Renvoie `{ value, basis }`, ou `{ value: null, missing: [...] }` en listant ce
 * qui manque -- l'ecran peut alors dire quoi completer plutot que d'afficher un
 * tiret sans explication.
 */
export function basalRate({ weightKg, heightCm, ageYears, body = {}, at = new Date() }) {
  const weight = num(weightKg);
  const missing = [];
  if (weight === null) missing.push('weight');

  // Voie Katch-McArdle : elle n'a besoin ni de la taille, ni de l'age, ni
  // d'aucune constante liee a un groupe de population.
  const fatPct = num(body.bodyFatPct);
  if (body.calcBasis === 'lean-mass') {
    if (fatPct === null) missing.push('bodyFat');
    if (missing.length) return { value: null, missing };
    const lean = weight * (1 - fatPct / 100);
    return { value: 370 + 21.6 * lean, basis: 'lean-mass' };
  }

  const height = num(heightCm);
  const age = num(ageYears);
  if (height === null) missing.push('height');
  if (age === null) missing.push('age');
  if (!body.calcBasis) missing.push('calcBasis');
  if (missing.length) return { value: null, missing };

  const common = 10 * weight + 6.25 * height - 5 * age;
  // Les deux constantes des groupes de calibration, et leur milieu -- qui n'est
  // publie nulle part, et qui est presente comme l'approximation qu'il est.
  const variant = { a: 5, b: -161, median: (5 - 161) / 2 };

  if (body.calcBasis === 'interpolated') {
    const from = variant[body.basisFrom];
    const to = variant[body.basisTo];
    if (from === undefined || to === undefined || !body.basisStartDate) {
      return { value: null, missing: ['interpolation'] };
    }
    const years = (at - new Date(body.basisStartDate)) / (365.25 * 24 * 3600 * 1000);
    const progress = Math.min(1, Math.max(0, years / INTERPOLATION_YEARS));
    return {
      value: common + from + (to - from) * progress,
      basis: 'interpolated',
      progress,
    };
  }

  const constant = variant[body.calcBasis];
  if (constant === undefined) return { value: null, missing: ['calcBasis'] };
  return { value: common + constant, basis: body.calcBasis };
}

/**
 * Besoin quotidien, et cible compte tenu de l'objectif.
 *
 * `maintenance` est ce que le corps depense ; `target` est ce vers quoi la
 * personne a choisi d'aller. Les deux sont affiches separement : confondre
 * « ce que je depense » et « ce que je vise » est la porte ouverte a se croire
 * en faute des qu'on mange a sa faim.
 *
 * `floored` signale que le plafond de securite est entre en jeu. L'ecran doit
 * le dire : une cible silencieusement relevee ressemblerait a un bug.
 */
export function energyNeeds({
  weightKg,
  heightCm,
  ageYears,
  body = {},
  activity = null,
  goal = null,
  at = new Date(),
  // Resumes quotidiens, pour recaler l'estimation sur les faits. Absents,
  // l'estimation reste celle de la formule -- c'est le cas de quelqu'un qui ne
  // se pese pas, et ce n'est pas un defaut.
  rows = null,
}) {
  const basal = basalRate({ weightKg, heightCm, ageYears, body, at });
  if (basal.value === null) return { maintenance: null, target: null, ...basal };

  const factor = activityFactor(activity);
  if (factor === null) {
    return { basal: Math.round(basal.value), maintenance: null, target: null, missing: ['activity'] };
  }

  const formula = basal.value * factor;
  let maintenance = formula;

  /*
   * Le recalage.
   *
   * Ce qui rend le choix de la base de calcul beaucoup moins critique qu'il
   * n'y parait : au bout de six semaines de pesees et de repas notes, ce sont
   * les faits qui decident, et le point de depart ne pese presque plus.
   *
   * Un garde-fou tout de meme : au-dela de 40 % d'ecart avec la formule, on ne
   * recale pas. A ce niveau-la ce n'est plus la formule qui se trompe, c'est le
   * journal alimentaire qui est incomplet -- et adopter le chiffre reviendrait
   * a proposer une cible batie sur des repas qui n'ont pas ete notes.
   */
  let calibration = rows ? observedExpenditure(rows) : null;
  if (calibration?.value) {
    const deviation = Math.abs(calibration.value - formula) / formula;
    if (deviation <= CALIBRATION.maxDeviation) {
      maintenance = calibration.value;
      calibration = { ...calibration, applied: true, formula: Math.round(formula) };
    } else {
      calibration = {
        ...calibration,
        applied: false,
        reason: 'implausible',
        formula: Math.round(formula),
        deviation: Math.round(deviation * 100),
      };
    }
  }

  const delta = goalDelta(goal) ?? 0;

  // Le garde-fou : quelle que soit la vitesse choisie, la cible ne descend
  // jamais sous le metabolisme de base. Manger moins que ce que le corps
  // depense au repos n'est pas un objectif, c'est une privation.
  const raw = maintenance + delta;
  const floor = basal.value;
  const floored = raw < floor;

  return {
    basal: Math.round(basal.value),
    maintenance: Math.round(maintenance),
    target: Math.round(floored ? floor : raw),
    basis: basal.basis,
    floored,
    delta,
    calibration,
  };
}

/**
 * Cibles de macronutriments.
 *
 * Les proteines se calculent par kilo de poids -- c'est la seule facon qui ait
 * du sens -- et seulement si la personne a choisi une valeur. Aucune valeur par
 * defaut n'est inventee : « 1,6 g/kg » n'est pas une verite universelle, et
 * l'afficher sans avoir ete demande en ferait un objectif rate des le premier
 * jour.
 *
 * Les lipides prennent 30 % de l'energie, part communement retenue, et les
 * glucides le reste. Si le reste devient negatif -- objectif tres bas et
 * proteines tres hautes -- on renvoie `null` plutot qu'un nombre absurde.
 */
export function macroTargets({ kcal, weightKg, proteinPerKg = null, fatPct = 30 }) {
  const energy = num(kcal);
  const weight = num(weightKg);
  if (energy === null) return { protein: null, fat: null, carbs: null };

  const protein = num(proteinPerKg) !== null && weight !== null
    ? Math.round(proteinPerKg * weight)
    : null;

  const fat = Math.round((energy * (fatPct / 100)) / KCAL_PER_G.fat);

  if (protein === null) return { protein: null, fat, carbs: null };

  const rest = energy - protein * KCAL_PER_G.protein - fat * KCAL_PER_G.fat;
  return { protein, fat, carbs: rest > 0 ? Math.round(rest / KCAL_PER_G.carbs) : null };
}

/**
 * Totaux de la journee.
 *
 * Un repas dont un champ n'est pas renseigne ne compte pas zero pour ce
 * champ-la : il en est exclu. Sinon deux repas notes sur trois donneraient
 * l'impression d'une journee a 900 kcal, et le bilan mentirait.
 */
export function dayTotals(meals = []) {
  const total = (key) => {
    const values = (meals || []).map((m) => num(m?.[key])).filter((v) => v !== null);
    return values.length ? Math.round(values.reduce((a, b) => a + b, 0)) : null;
  };
  return {
    kcal: total('kcal'),
    protein: total('protein'),
    carbs: total('carbs'),
    fat: total('fat'),
    meals: meals?.length || null,
  };
}

/**
 * Energie d'un aliment, calculee depuis ses macronutriments.
 *
 * Sert quand on saisit les macros sans les calories -- ce qui arrive souvent,
 * une etiquette les donnant toutes. On ne remplace jamais une valeur saisie :
 * si les calories sont notees, ce sont elles qui font foi, meme si elles ne
 * collent pas exactement au calcul (les etiquettes arrondissent, et les fibres
 * comptent autrement).
 */
export function kcalFromMacros({ protein, carbs, fat }) {
  const parts = [
    [num(protein), KCAL_PER_G.protein],
    [num(carbs), KCAL_PER_G.carbs],
    [num(fat), KCAL_PER_G.fat],
  ].filter(([v]) => v !== null);
  if (!parts.length) return null;
  return Math.round(parts.reduce((sum, [v, k]) => sum + v * k, 0));
}

/**
 * Repartition d'une cible sur les moments de la journee.
 *
 * Repond a une question que l'ecran laissait sans reponse : « 2300 kcal »,
 * d'accord, mais ça ressemble a quoi dans une journee ?
 *
 * Deux sources, dans cet ordre : la repartition REELLE des journees deja notees
 * si elle existe, sinon une repartition courante presentee comme telle. La
 * premiere vaut toujours mieux -- quelqu'un qui ne dejeune jamais n'a que faire
 * d'un modele qui lui attribue un tiers de ses calories a midi.
 */
export const DEFAULT_SPLIT = { breakfast: 0.25, lunch: 0.35, dinner: 0.3, snack: 0.1 };

/** Journees notees exigees avant de se fier a la repartition observee. */
export const MIN_DAYS_FOR_SPLIT = 7;

export function mealSplit(days = [], { minDays = MIN_DAYS_FOR_SPLIT } = {}) {
  const sums = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
  let counted = 0;

  for (const day of days || []) {
    const items = day?.modules?.nutrition?.items || [];
    if (!items.some((i) => num(i?.kcal) !== null)) continue;
    counted += 1;
    for (const item of items) {
      const value = num(item?.kcal);
      if (value !== null && item.slot in sums) sums[item.slot] += value;
    }
  }

  const total = Object.values(sums).reduce((a, b) => a + b, 0);
  if (counted < minDays || total <= 0) {
    return { split: { ...DEFAULT_SPLIT }, source: 'default', days: counted };
  }

  const split = {};
  for (const [slot, value] of Object.entries(sums)) split[slot] = value / total;
  return { split, source: 'observed', days: counted };
}

/** Applique une repartition a une cible, en kcal arrondies. */
export function splitTarget(kcal, split) {
  const total = num(kcal);
  if (total === null) return null;
  const out = {};
  for (const [slot, share] of Object.entries(split || {})) out[slot] = Math.round(total * share);
  return out;
}

/**
 * Recale l'estimation sur les faits.
 *
 * Le mecanisme le plus important du module, et celui qui rend le choix de la
 * base de calcul beaucoup moins critique qu'il n'y parait : si le poids evolue
 * autrement que les apports ne le laissaient prevoir, c'est l'estimation qui a
 * tort, pas le corps.
 *
 *   apports - depense reelle = variation de poids x 7700 kcal/kg / jours
 *   donc     depense reelle  = apports - (variation x 7700 / jours)
 *
 * LE PREMIER PARAMETRE EST CE QUI A ETE MANGE, pas ce que la formule avait
 * predit. La nuance decide de tout : quelqu'un qui mange volontairement 500 kcal
 * sous son entretien et maigrit comme prevu confirme son estimation, il ne la
 * contredit pas. Comparer sa perte a une variation nulle conclurait qu'il
 * depense 500 kcal de moins qu'en realite, et la cible s'effondrerait un peu
 * plus a chaque recalage.
 *
 * Exige une periode assez longue (42 jours par defaut) : sur deux semaines, la
 * variation de poids est surtout de l'eau, et recaler la-dessus produirait une
 * estimation qui saute dans tous les sens.
 */
export function calibrate({ intake, weightChangeKg, days, minDays = 42 }) {
  const eaten = num(intake);
  const change = num(weightChangeKg);
  const span = num(days);
  if (eaten === null || change === null || span === null || span < minDays) {
    return { value: eaten, calibrated: false, missingDays: span === null ? null : minDays - span };
  }

  const gap = (change * KCAL_PER_KG) / span;
  return {
    value: Math.round(eaten - gap),
    calibrated: true,
    gap: Math.round(gap),
    days: span,
  };
}

/**
 * Seuils du recalage.
 *
 * Ils sont volontairement eleves. Un recalage qui se declenche trop tot est
 * pire que pas de recalage du tout : il remplace une estimation connue pour
 * etre approximative a +-10 % par un chiffre faux qui, lui, a l'air d'avoir ete
 * mesure.
 */
export const CALIBRATION = {
  minDays: 42,       // moins de six semaines : on mesure surtout de l'eau
  minWeighings: 8,   // une droite sur trois points ne decrit rien
  minIntakeDays: 21, // la moyenne des apports doit reposer sur quelque chose
  // Au-dela de 40 % d'ecart avec la formule, ce n'est plus elle qui se trompe.
  // Mifflin-St Jeor tourne autour de +-15 % : un ecart de moitie signale un
  // journal alimentaire incomplet, une balance changee ou une periode de
  // maladie. On garde alors la formule, et on le dit.
  maxDeviation: 0.4,
};

/**
 * Moyenne des apports, debarrassee de ses extremes.
 *
 * Une moyenne ordinaire n'a pas resiste au premier essai : une seule journee
 * saisie a 99 999 g d'huile -- 900 000 kcal -- portait la moyenne de 2 600 a
 * 10 000 kcal par jour, et la depense « recalee » a 10 119 kcal. Le chiffre
 * aurait ensuite pilote la cible calorique pendant des mois.
 *
 * Ce n'est pas un cas de laboratoire : taper 999 au lieu de 99 arrive, et il
 * n'existe aucune raison de refuser la saisie -- personne ne sait ce que
 * quelqu'un a le droit de manger. Mais une valeur aberrante ne doit pas
 * decider de ce qu'on lui proposera de manger demain.
 *
 * On ecarte donc un dixieme de chaque cote avant de moyenner. Sur trois
 * semaines minimum, cela retire deux journees par bout : assez pour absorber
 * une faute de frappe et un reveillon, trop peu pour deformer une habitude.
 */
export function trimmedMean(values, share = 0.1) {
  const sorted = (values || []).filter((v) => num(v) !== null).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const cut = Math.floor(sorted.length * share);
  // Sur un tout petit echantillon, retirer les deux bouts ne laisserait rien.
  const kept = sorted.length - 2 * cut > 0 ? sorted.slice(cut, sorted.length - cut) : sorted;
  return kept.reduce((a, b) => a + b, 0) / kept.length;
}

/**
 * Pente du poids : la mediane des pentes de toutes les paires de pesees.
 *
 * C'est l'estimateur de Theil-Sen, et non les moindres carres. La difference
 * tient a un seul cas, mais il arrive : une pesee de 724 kg au lieu de 72,4.
 * Les bornes de saisie ne peuvent pas l'attraper -- 724 est un poids humain
 * possible, et personne ne veut d'une application qui refuse de noter le sien.
 *
 * Une droite des moindres carres se laisse emporter par ce seul point : la
 * pente devient absurde, et avec elle la depense « reelle » qui pilote la cible
 * calorique. La mediane des pentes, elle, ne bouge pas tant que la majorite des
 * paires est saine.
 *
 * Cout : autant de paires que de pesees au carre. Sur les quatre mois lus par
 * les ecrans, c'est au plus une centaine de pesees, donc quelques milliers de
 * paires -- rien du tout.
 */
export function weightSlope(rows = []) {
  const points = (rows || [])
    .filter((r) => r?.date && num(r.weightKg) !== null)
    .map((r) => ({ date: r.date, kg: r.weightKg }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (points.length < 2) return { kgPerDay: null, n: points.length, days: 0 };

  const origin = new Date(points[0].date);
  const xs = points.map((p) => (new Date(p.date) - origin) / 86400000);

  const slopes = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = xs[j] - xs[i];
      // Deux pesees le meme jour ne disent rien d'une evolution.
      if (dx > 0) slopes.push((points[j].kg - points[i].kg) / dx);
    }
  }
  if (!slopes.length) return { kgPerDay: null, n: points.length, days: 0 };

  slopes.sort((a, b) => a - b);
  const mid = slopes.length >> 1;
  const kgPerDay =
    slopes.length % 2 ? slopes[mid] : (slopes[mid - 1] + slopes[mid]) / 2;

  return {
    kgPerDay,
    n: points.length,
    days: xs[xs.length - 1],
    from: points[0].date,
    to: points[points.length - 1].date,
  };
}

/**
 * Depense reelle, deduite des pesees et des repas notes.
 *
 * Renvoie `{ value: null, reason }` tant qu'il manque de quoi conclure, en
 * disant CE QUI manque : l'ecran peut alors annoncer ce qu'il reste a faire
 * plutot que de garder le silence sans expliquer pourquoi.
 *
 * Limite a enoncer et jamais a corriger en douce : un journal alimentaire est
 * sous-declare, souvent de 10 a 30 %. La depense calculee ici herite donc de ce
 * biais. Elle reste plus proche de la verite que la formule seule, parce que la
 * variation de poids, elle, ne ment pas -- mais elle n'est pas une mesure.
 */
export function observedExpenditure(rows = [], options = {}) {
  const { minDays, minWeighings, minIntakeDays } = { ...CALIBRATION, ...options };

  const slope = weightSlope(rows);
  if (slope.kgPerDay === null || slope.n < minWeighings) {
    return { value: null, reason: 'weighings', have: slope.n, need: minWeighings };
  }
  if (slope.days < minDays) {
    return { value: null, reason: 'span', have: slope.days, need: minDays };
  }

  // Les apports ne comptent que sur la periode reellement couverte par les
  // pesees : une moyenne prise en dehors decrirait une autre periode que celle
  // sur laquelle le poids a bouge.
  const intakes = (rows || [])
    .filter((r) => r?.date >= slope.from && r.date <= slope.to && num(r.kcal) !== null)
    .map((r) => r.kcal);

  if (intakes.length < minIntakeDays) {
    return { value: null, reason: 'intake', have: intakes.length, need: minIntakeDays };
  }

  const meanIntake = trimmedMean(intakes);
  const out = calibrate({
    intake: meanIntake,
    weightChangeKg: slope.kgPerDay * slope.days,
    days: slope.days,
    minDays,
  });

  return {
    value: out.value,
    gap: out.gap,
    days: slope.days,
    weighings: slope.n,
    intakeDays: intakes.length,
    meanIntake: Math.round(meanIntake),
    kgPerWeek: Math.round(slope.kgPerDay * 7 * 100) / 100,
    from: slope.from,
    to: slope.to,
  };
}
