/**
 * Registre de modules.
 *
 * Le PDF demande "desactivable" a peu pres partout. Coder ca en booleens
 * eparpilles dans le rendu produit exactement le travers qu'il veut eviter :
 * des ecrans de reglages interminables et des `if` dans tous les coins.
 *
 * Ici, chaque section se declare une fois. L'ecran du jour, l'onboarding, le
 * tableau de bord, l'export et le partage selectif se derivent tous du registre.
 * Ajouter un module = ajouter une declaration, et rien d'autre.
 *
 * Un module declare :
 *   id            identifiant stable, sert de cle de stockage dans day.modules
 *   label         nom affiche
 *   essential     true = ne peut pas etre desactive (le noyau du journal)
 *   defaultEnabled etat par defaut a l'installation
 *   order         position dans l'ecran du jour
 *   express       true = present dans le mode express (saisie en 20 secondes)
 *   requires      capacites necessaires, ex. ['wearable'] : le module reste
 *                 masque tant que la personne n'a pas declare d'appareil
 *   summarize(d)  extrait du resume compact quotidien (~30 octets)
 *   shareable     true = peut etre exporte seul (montrer sa nutrition a une
 *                 dieteticienne sans montrer son journal intime)
 */

const registry = new Map();

export function registerModule(def) {
  if (!def?.id) throw new Error('Un module doit avoir un id.');
  if (registry.has(def.id)) throw new Error(`Module deja enregistre : ${def.id}`);
  registry.set(def.id, {
    essential: false,
    defaultEnabled: true,
    express: false,
    shareable: true,
    order: 100,
    requires: [],
    fields: [],
    summarize: () => null,
    ...def,
  });
  return registry.get(def.id);
}

export function getModule(id) {
  return registry.get(id) || null;
}

export function allModules() {
  return [...registry.values()].sort((a, b) => a.order - b.order);
}

export function clearRegistry() {
  registry.clear();
}

/** Etat par defaut des modules, pour une premiere installation. */
export function defaultModuleState() {
  const state = {};
  for (const m of allModules()) state[m.id] = m.essential || m.defaultEnabled;
  return state;
}

/**
 * Modules reellement affichables, compte tenu des choix de la personne et de
 * ses capacites declarees (appareil connecte, suivi de cycle, etc.).
 *
 * Un module essentiel reste toujours actif : on ne peut pas se retrouver avec
 * une app vide.
 */
export function enabledModules(moduleState = {}, capabilities = {}) {
  return allModules().filter((m) => {
    if (m.essential) return true;
    if (moduleState[m.id] === false) return false;
    if (moduleState[m.id] === undefined && !m.defaultEnabled) return false;
    return m.requires.every((cap) => Boolean(capabilities[cap]));
  });
}

/**
 * Modules qu'il est pertinent de PROPOSER, actifs ou non.
 *
 * Different d'`enabledModules` : on ignore ici les choix d'activation, mais pas
 * les capacites. L'ecran des reglages en a besoin pour ne pas afficher une case
 * « Cycle menstruel » a quelqu'un qui a repondu ne pas en avoir -- une case qui
 * de surcroit se serait redecochee toute seule, le module restant masque.
 */
export function availableModules(capabilities = {}) {
  return allModules().filter((m) => m.requires.every((cap) => Boolean(capabilities[cap])));
}

export function expressModules(moduleState, capabilities) {
  return enabledModules(moduleState, capabilities).filter((m) => m.express);
}

export function shareableModules(moduleState, capabilities) {
  return enabledModules(moduleState, capabilities).filter((m) => m.shareable);
}
