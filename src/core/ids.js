/**
 * Identifiants stables.
 *
 * Le v5 generait ses identifiants avec `Date.now()`, ce qui produit des
 * collisions des qu'on ajoute deux elements dans la meme milliseconde (cliquer
 * deux fois sur "+ Exercice" suffit). Et surtout, les habitudes n'avaient pas
 * d'identifiant du tout : elles etaient reliees a l'historique par leur libelle.
 *
 * Ici, tout element durable recoit un identifiant qui ne changera jamais, meme
 * si on renomme l'element. C'est ce qui rend l'historique immuable.
 */

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** 10 caracteres aleatoires : ~52 bits, largement assez pour un usage local. */
export function newId(prefix = '') {
  const bytes = new Uint8Array(10);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return prefix ? `${prefix}_${out}` : out;
}

/**
 * Cree un element de liste (habitude, traitement, repas frequent...).
 *
 * `archivedAt` plutot qu'une suppression : les journees passees continuent de
 * referencer l'identifiant, et leurs scores restent justes. Un element archive
 * disparait simplement des ecrans de saisie.
 */
export function createListItem(kind, label, extra = {}) {
  return {
    id: newId(kind.slice(0, 3)),
    kind,
    label,
    createdAt: new Date().toISOString(),
    archivedAt: null,
    order: Date.now(),
    ...extra,
  };
}

export function isActive(item) {
  return item && !item.archivedAt;
}

export function activeItems(items) {
  return (items || []).filter(isActive).sort((a, b) => (a.order || 0) - (b.order || 0));
}
