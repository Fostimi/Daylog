/**
 * Suggestions d'habitudes.
 *
 * Pourquoi des suggestions plutot qu'une liste imposee : une liste fermee
 * oblige a ranger sa vie dans les cases de quelqu'un d'autre, ce qui est
 * exactement ce qu'on veut eviter. Mais une page blanche a de vrais couts --
 * on ne sait pas quoi mettre, et surtout on ecrit « sport » lundi, « Sport »
 * mardi, « muscu » jeudi, et l'historique se retrouve avec trois habitudes la
 * ou il n'y en a qu'une.
 *
 * Les suggestions resolvent les deux : elles amorcent, et elles font converger
 * l'ecriture sans jamais l'imposer. Ce qu'on tape reste toujours accepte tel
 * quel.
 *
 * La categorie est enregistree quand l'habitude vient d'une suggestion, et
 * reste vide sinon. Elle ne sert a rien aujourd'hui ; elle permettra plus tard
 * de dire « tu as pris trois moments pour toi cette semaine » sans avoir a
 * demander a qui que ce soit de classer ses habitudes a la main.
 */

export const CATEGORIES = {
  calme: 'Calme et repos',
  corps: 'Corps et mouvement',
  soin: 'Prendre soin de soi',
  esprit: 'Tête et apprentissage',
  lien: 'Lien aux autres',
  maison: 'Maison et quotidien',
  sobriete: 'Sans',
};

export const SUGGESTIONS = [
  { label: 'Méditation', category: 'calme' },
  { label: 'Respiration', category: 'calme' },
  { label: 'Sieste', category: 'calme' },
  { label: 'Temps sans écran', category: 'calme' },
  { label: 'Sortir prendre l’air', category: 'calme' },

  { label: 'Marche', category: 'corps' },
  { label: 'Étirements', category: 'corps' },
  { label: 'Yoga', category: 'corps' },
  { label: 'Musculation', category: 'corps' },
  { label: 'Course à pied', category: 'corps' },
  { label: 'Vélo', category: 'corps' },
  { label: 'Natation', category: 'corps' },
  { label: 'Kiné', category: 'corps' },

  { label: 'Douche froide', category: 'soin' },
  { label: 'Se coucher tôt', category: 'soin' },
  { label: 'Boire assez d’eau', category: 'soin' },
  { label: 'Prendre mon traitement', category: 'soin' },
  { label: 'Soin de la peau', category: 'soin' },
  { label: 'Journal', category: 'soin' },

  { label: 'Lecture', category: 'esprit' },
  { label: 'Apprendre une langue', category: 'esprit' },
  { label: 'Instrument de musique', category: 'esprit' },
  { label: 'Écrire', category: 'esprit' },
  { label: 'Dessiner', category: 'esprit' },

  { label: 'Appeler un proche', category: 'lien' },
  { label: 'Voir quelqu’un', category: 'lien' },
  { label: 'Temps en famille', category: 'lien' },

  { label: 'Ranger', category: 'maison' },
  { label: 'Cuisiner', category: 'maison' },
  { label: 'Sortir le chien', category: 'maison' },

  { label: 'Sans alcool', category: 'sobriete' },
  { label: 'Sans sucre ajouté', category: 'sobriete' },
  { label: 'Sans tabac', category: 'sobriete' },
  { label: 'Sans réseaux sociaux', category: 'sobriete' },
];

/**
 * Normalise pour comparer : minuscules, accents retires, apostrophes
 * uniformisees. « Étirements » et « etirements » deviennent la meme chose.
 */
export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Distance d'edition, plafonnee.
 *
 * Sert uniquement a rattraper une faute de frappe (« meditaton »,
 * « etirement »). On s'arrete des que la distance depasse `max` : inutile de
 * calculer une distance de 9 pour la rejeter ensuite.
 */
export function editDistance(a, b, max = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (row[j] < best) best = row[j];
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

/**
 * Suggestions correspondant a une saisie.
 *
 * Trois niveaux, du plus sur au plus tolerant :
 *   1. commence par ce qui est tape
 *   2. contient ce qui est tape
 *   3. ressemble a ce qui est tape, a une ou deux fautes pres
 *
 * `exclude` retire ce que la personne suit deja, pour ne pas lui proposer ce
 * qu'elle a sous les yeux.
 */
export function suggest(query, { exclude = [], limit = 6 } = {}) {
  const taken = new Set(exclude.map(normalize));
  const pool = SUGGESTIONS.filter((s) => !taken.has(normalize(s.label)));
  const q = normalize(query);

  if (!q) {
    // Sans saisie, on montre un echantillon varie plutot que le debut de la
    // liste : sinon on ne verrait jamais que la categorie « calme ».
    const seen = new Set();
    const varied = [];
    for (const item of pool) {
      if (seen.has(item.category)) continue;
      seen.add(item.category);
      varied.push(item);
      if (varied.length >= limit) break;
    }
    return varied;
  }

  const starts = [];
  const contains = [];
  const close = [];

  for (const item of pool) {
    const label = normalize(item.label);
    if (label.startsWith(q)) starts.push(item);
    else if (label.includes(q)) contains.push(item);
    else if (q.length >= 4) {
      // On compare mot a mot : « etirement » doit trouver « Étirements ».
      const words = label.split(' ');
      const near = words.some((w) => w.length >= 4 && editDistance(q, w) <= (q.length > 6 ? 2 : 1));
      if (near || editDistance(q, label) <= 2) close.push(item);
    }
  }

  return [...starts, ...contains, ...close].slice(0, limit);
}

/** Categorie d'un libelle s'il correspond exactement a une suggestion connue. */
export function categoryOf(label) {
  const n = normalize(label);
  return SUGGESTIONS.find((s) => normalize(s.label) === n)?.category || null;
}
