# Architecture du socle

Ce document explique les décisions structurantes et **ce qui les a motivées**.
Beaucoup viennent de défauts constatés dans le prototype HTML v5 : les nommer
évite de les réintroduire.

## Vue d'ensemble

```
src/
├── core/            le socle, sans aucune dépendance à l'affichage
│   ├── date.js      dates locales (le v5 travaillait en UTC)
│   ├── schema.js    modèle versionné + migrations
│   ├── db.js        IndexedDB, une fiche par jour
│   ├── store.js     état courant + sauvegarde automatique
│   ├── summary.js   résumés compacts, moyennes, corrélations
│   ├── modules.js   registre de modules
│   ├── backup.js    export / import / partage sélectif
│   ├── ids.js       identifiants stables
│   └── i18n.js      textes, écriture neutre par défaut
├── modules/         déclaration des sections (humeur, sommeil…)
└── ui/              affichage
```

Le dossier `core/` ne connaît rien de l'affichage : il est testable sans
navigateur, et remplaçable sans toucher au reste.

## Décision 1 — IndexedDB, une fiche par jour

**Problème constaté.** Le v5 utilisait `localStorage` et re-sérialisait
*l'intégralité* de l'historique à chaque sauvegarde. Trois ans de données
réécrites parce qu'on a bougé un curseur. `localStorage` est de surcroît
synchrone : cette écriture bloque l'affichage.

**Décision.** Une fiche par jour dans IndexedDB. Sauvegarder une journée écrit
entre 200 octets et 2 Ko, **quelle que soit la taille de l'historique**.

**Conséquence.** On peut se permettre de sauvegarder toutes les deux secondes,
ce qui rend possible la suppression du bouton « enregistrer ».

## Décision 2 — Des résumés compacts pour le bilan

Le tableau de bord ne doit jamais relire 365 fiches complètes pour tracer une
courbe. À chaque sauvegarde, un résumé d'une trentaine d'octets est écrit **dans
la même transaction** que la fiche.

Mesuré : 55 octets par jour. Un an d'historique représente environ 20 Ko à lire.

Un résumé est entièrement reconstructible depuis les fiches : le perdre n'est
jamais une perte de données.

## Décision 3 — La sauvegarde automatique, à quatre filets

**Problème constaté.** Le v5 lisait le formulaire au moment du clic sur « Save
entry » : le DOM était la source de vérité. Changer de jour sans cliquer perdait
tout, silencieusement.

**Décision.** L'état en mémoire fait foi, l'écran n'en est qu'une vue. Quatre
déclencheurs superposés :

| Déclencheur | Quand |
|---|---|
| Debounce 2 s | 2 secondes après la dernière frappe |
| `blur` | à la sortie d'un champ |
| `visibilitychange` | quand l'app passe en arrière-plan |
| `pagehide` | à la fermeture |

Le troisième est le plus important : appel entrant, changement d'application,
écran verrouillé. `beforeunload` ne se déclenche **pas** quand le système tue un
onglet en arrière-plan — c'est-à-dire précisément dans le cas dangereux.

Perte maximale sur coupure de batterie : les deux dernières secondes de frappe.

## Décision 4 — `null` n'est pas zéro

**Problème constaté.** Le v5 enregistrait anxiété 3, motivation 5, qualité de
sommeil 7 et score de productivité 7 sur **toute journée sauvegardée**, même
sans y toucher. Au bout de trois mois, les moyennes décrivaient quelqu'un qui
n'existe pas.

**Décision, appliquée à trois niveaux :**

1. Les contrôles d'interface n'ont aucune valeur présélectionnée, et on peut
   revenir à « non renseigné » en re-cliquant sur son choix.
2. `prune()` retire les valeurs vides avant écriture — d'où les fiches de
   200 octets.
3. `mean()` exclut les `null` et renvoie `null` — jamais `0` — si rien n'est
   renseigné, pour que l'affichage puisse écrire « — ».

Une journée entièrement vide n'est pas écrite du tout : ouvrir l'application
sans rien saisir ne crée pas de fiche fantôme.

## Décision 5 — Des identifiants stables

**Problème constaté.** Le v5 reliait les habitudes à l'historique **par leur
libellé**. Renommer « Sport » en « Muscu » cassait l'historique. Et le taux de
complétion était recalculé avec la liste d'habitudes *actuelle* : ajouter une
habitude faisait baisser rétroactivement tous les scores passés.

**Décision.** Tout élément durable reçoit un identifiant qui ne change jamais.
Les éléments ne sont pas supprimés mais archivés. Chaque journée enregistre la
photographie des habitudes actives **ce jour-là**.

L'historique devient immuable : ce qui a été vécu ne se réécrit pas.

## Décision 6 — Le registre de modules

Le cahier des charges demande « désactivable » à peu près partout. Codé en
booléens éparpillés, cela produit des écrans de réglages interminables.

Chaque section se déclare **une fois** : identifiant, libellé, essentiel ou non,
présence dans le mode express, partageable ou non, et sa fonction de résumé.
L'écran du jour, l'onboarding, le bilan, l'export sélectif et le partage se
dérivent tous du registre.

Deux propriétés font un vrai travail :

- `essential` — l'humeur et le journal ne peuvent pas être désactivés, l'app ne
  peut pas se retrouver vide.
- `shareable` — le journal intime et les check-ins d'humeur ne figurent
  **jamais** dans un export partiel. Montrer sa nutrition à une diététicienne
  n'expose pas ses notes personnelles.

## Décision 7 — Dates locales

**Problème constaté.** Le v5 produisait ses clés de jour avec `toISOString()`,
donc en UTC. À Paris, tout ce qui était saisi après 22h atterrissait au
lendemain — soit exactement l'heure où l'on remplit son bilan de journée. Le bug
était invisible pour qui développait en UTC.

**Décision.** Aucune clé de jour n'est produite par `toISOString()`. Les
conversions passent par midi heure locale, ce qui neutralise les changements
d'heure qui surviennent à minuit dans certains pays.

La suite de tests est rejouée dans **dix fuseaux horaires**, dont des décalages
non entiers et des changements d'heure à minuit (`npm run test:timezones`).

Un réglage `dayStartHour` permet de décaler la frontière entre deux journées :
à 4, ce qui est saisi entre minuit et 3h59 compte encore pour la veille.

## Décision 8 — Aucun HTML construit par concaténation

**Problème constaté.** Le v5 construisait tout son affichage par concaténation
de chaînes, avec les données de la personne injectées dedans — y compris dans
des attributs `onclick`. Une habitude nommée avec un guillemet cassait la page.

**Décision.** `innerHTML` n'apparaît nulle part. Les valeurs passent par
`textContent` et par des propriétés. Il n'existe aucun chemin par lequel une
saisie puisse devenir du balisage.

## Vérification

| Commande | Ce qu'elle couvre |
|---|---|
| `npm test` | 60 tests unitaires |
| `npm run test:timezones` | la suite complète dans 10 fuseaux |
| `node scripts/smoke.js` | 25 vérifications dans un vrai navigateur |

Le test de bout en bout intercepte **toutes** les requêtes réseau et échoue s'il
en sort une seule. C'est ainsi que la promesse « rien ne quitte l'appareil »
devient vérifiable automatiquement, et non une affirmation.

Il vérifie aussi l'accessibilité : ordre de tabulation, motif ARIA des échelles,
lien d'évitement, et absence de défilement horizontal **à 200 % de taille de
texte** — c'est ce dernier test qui a révélé deux bugs invisibles autrement.

## Poids

| | Brut | Compressé |
|---|---|---|
| JavaScript | 21,4 Ko | 8,1 Ko |
| CSS | 6,7 Ko | 1,9 Ko |
| HTML | 1,6 Ko | 0,7 Ko |
| **Total chargé** | **29 Ko** | |

Aucune dépendance à l'exécution : ni framework, ni bibliothèque de graphiques,
ni police externe. Le v5 chargeait à lui seul 200 Ko de Chart.js depuis un CDN.
