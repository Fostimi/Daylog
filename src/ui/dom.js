/**
 * Construction du DOM.
 *
 * Aucune fonction de ce fichier n'utilise innerHTML. Le v5 construisait tout son
 * affichage par concatenation de chaines, avec les donnees de la personne
 * injectees dedans -- y compris dans des attributs `onclick`. Une habitude
 * nommee avec un guillemet cassait la page ; un fichier importe pouvait
 * executer du code.
 *
 * Ici les valeurs passent par textContent et par des proprietes : il n'existe
 * aucun chemin par lequel une saisie puisse devenir du balisage.
 */

/**
 * Cree un element.
 * el('button', { class: 'x', onClick: fn, 'aria-label': 'Fermer' }, ['Texte'])
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'class') {
      node.className = value;
    } else if (key === 'dataset') {
      Object.assign(node.dataset, value);
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(node.style, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'text') {
      node.textContent = value; // jamais interprete comme du balisage
    } else if (key === 'value' || key === 'checked' || key === 'disabled') {
      node[key] = value;
    } else {
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }

  appendChildren(node, children);
  return node;
}

function appendChildren(node, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) {
      appendChildren(node, child);
    } else if (child instanceof Node) {
      node.appendChild(child);
    } else {
      node.appendChild(document.createTextNode(String(child)));
    }
  }
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function mount(node, children) {
  clear(node);
  appendChildren(node, children);
  return node;
}

export function $(selector, root = document) {
  return root.querySelector(selector);
}

/**
 * Annonce un message aux lecteurs d'ecran sans deplacer le focus.
 * Sert pour "Enregistre", qui doit etre percu sans etre intrusif.
 */
let liveRegion = null;
export function announce(message, assertive = false) {
  if (!liveRegion) {
    liveRegion = el('div', {
      class: 'sr-only',
      role: 'status',
      'aria-live': 'polite',
      'aria-atomic': 'true',
    });
    document.body.appendChild(liveRegion);
  }
  liveRegion.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
  // Vider d'abord force la relecture d'un message identique.
  liveRegion.textContent = '';
  requestAnimationFrame(() => {
    liveRegion.textContent = message;
  });
}
