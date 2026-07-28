/**
 * Menu de navigation.
 *
 * La barre du haut accumulait un bouton par ecran : quatre a la derniere
 * mesure, et elle debordait deja a 200 % de taille de texte. Chaque ecran
 * ajoute aurait empire les choses.
 *
 * Le cahier des charges prevoit un menu deroulant pour passer d'un ecran a
 * l'autre. C'est fait ici, et la barre revient a deux boutons : la navigation
 * du jour, et le menu.
 *
 * Cote accessibilite, le motif retenu est le plus simple qui soit correct :
 * un bouton `aria-expanded` qui revele une liste de boutons. Pas de `role="menu"`
 * -- ce role impose une gestion complete des fleches et de la touche Home, et
 * mal implemente il degrade l'experience au lieu de l'ameliorer. Une liste de
 * boutons se navigue deja parfaitement au clavier.
 *
 * Ce qui est gere ici : fermeture par Echap, fermeture au clic exterieur, et
 * retour du focus sur le bouton a la fermeture -- sans quoi la tabulation
 * repartirait du haut de la page.
 */

import { el } from './dom.js';

export const DESTINATIONS = [
  { id: 'today', label: "Aujourd'hui", icon: '📅' },
  { id: 'week', label: 'Semaine', icon: '🗓️' },
  { id: 'bilan', label: 'Bilan', icon: '📊' },
  { id: 'data', label: 'Mes données', icon: '💾' },
  { id: 'profile', label: 'Profil', icon: '👤' },
  { id: 'help', label: 'Comment ça marche', icon: '❓' },
];

/**
 * @param current   identifiant de l'ecran affiche
 * @param go        appele avec l'identifiant choisi
 * @param alert     'due' | 'overdue' | null — pastille sur le menu et sur
 *                  l'entree « Mes données »
 */
export function navMenu({ current, go, alert = null }) {
  let open = false;

  const panel = el('div', {
    class: 'nav-panel',
    id: 'nav-panel',
    hidden: true,
  }, DESTINATIONS.map((d) => {
    const isCurrent = d.id === current;
    return el('button', {
      type: 'button',
      class: `nav-item${isCurrent ? ' is-current' : ''}`,
      // `aria-current` dit « vous etes ici » aux lecteurs d'ecran, ce que la
      // seule mise en evidence visuelle ne fait pas.
      'aria-current': isCurrent ? 'page' : null,
      onClick: () => {
        setOpen(false);
        if (!isCurrent) go(d.id);
      },
    }, [
      el('span', { class: 'nav-icon', 'aria-hidden': 'true' }, d.icon),
      el('span', {}, d.label),
      d.id === 'data' && alert &&
        el('span', { class: `nav-badge is-${alert}` }, 'sauvegarde à faire'),
    ]);
  }));

  const button = el('button', {
    type: 'button',
    class: `icon-btn nav-toggle${alert ? ` has-alert is-${alert}` : ''}`,
    'aria-expanded': 'false',
    'aria-controls': 'nav-panel',
    'aria-label': alert ? 'Menu — sauvegarde à faire' : 'Menu',
    onClick: () => setOpen(!open),
  }, '☰');

  function setOpen(next) {
    open = next;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    wrapper.classList.toggle('is-open', open);
    if (open) {
      // On donne le focus a la premiere entree : sans cela, la tabulation
      // continuerait derriere le panneau qui vient de s'ouvrir.
      panel.querySelector('.nav-item')?.focus();
      document.addEventListener('keydown', onKey, true);
      document.addEventListener('pointerdown', onOutside, true);
    } else {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onOutside, true);
    }
  }

  function onKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      button.focus(); // le focus revient d'ou il venait
    }
  }

  function onOutside(event) {
    if (!wrapper.contains(event.target)) setOpen(false);
  }

  const wrapper = el('div', { class: 'nav' }, [button, panel]);
  return wrapper;
}

/**
 * Barre du haut commune a tous les ecrans.
 *
 * `before` accueille ce qui est propre a l'ecran -- la navigation entre les
 * jours, par exemple. Tout le reste est identique partout, ce qui evite que
 * chaque ecran reinvente sa propre barre et finisse par diverger.
 */
export function topbar({ title, subtitle = null, before = [], current, go, alert = null }) {
  return el('header', { class: 'topbar' }, [
    ...before,
    el('h1', {}, [title, subtitle && el('span', { class: 'topbar-date' }, subtitle)]),
    navMenu({ current, go, alert }),
  ]);
}
