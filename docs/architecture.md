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
| `npm test` | 83 tests unitaires |
| `npm run test:timezones` | la suite complète dans 10 fuseaux |
| `npm run smoke` | 103 vérifications dans un vrai navigateur |
| `npm run verify` | tout l'enchaînement |

Le test de bout en bout intercepte **toutes** les requêtes réseau et échoue s'il
en sort une seule. C'est ainsi que la promesse « rien ne quitte l'appareil »
devient vérifiable automatiquement, et non une affirmation.

Il vérifie aussi l'accessibilité : ordre de tabulation, motif ARIA des échelles,
lien d'évitement, et absence de défilement horizontal **à 200 % de taille de
texte** — c'est ce dernier test qui a révélé deux bugs invisibles autrement.

## Poids

Mesuré compressé, comme le sert un vrai hébergeur :

| | Compressé |
|---|---|
| Ouverture quotidienne | **16,4 Ko** |
| Première ouverture (avec la présentation) | 19,4 Ko |
| Cumul de tous les écrans | 31,5 Ko |

Aucune dépendance à l'exécution : ni framework, ni bibliothèque de graphiques,
ni police externe. Le v5 chargeait à lui seul 200 Ko de Chart.js depuis un CDN.

Chaque écran et chaque module forme un fichier séparé, téléchargé à sa première
ouverture. Une session ordinaire ne charge que l'écran du jour : le bilan, les
données et le profil ne coûtent rien tant qu'on ne les ouvre pas.

Le budget est vérifié automatiquement, et distingue ces trois chiffres — les
confondre ferait grossir la limite à chaque écran ajouté, et le nombre ne
voudrait plus rien dire.

## Décision 9 — L'onboarding pose des questions, il ne coche pas des cases

C'est là que se joue l'essentiel de l'inclusion, et cela tient à la formulation
autant qu'au code.

On ne demande pas « activer le module cycle ? » mais **« as-tu un cycle
menstruel à suivre ? »**. On ne demande jamais « peux-tu faire du sport ? » —
formulation qui range les gens en capables et incapables — mais **« comment
bouges-tu ? »**, qui accueille la marche, le fauteuil roulant et les béquilles
sur le même plan, sans hiérarchie.

Quatre règles tenues dans tout l'écran de présentation :

1. **La promesse de confidentialité passe avant toute question.** On explique ce
   qu'on ne fait pas des données avant d'en demander.
2. **Aucune réponse n'est pré-cochée.** On n'induit rien, et une question passée
   reste `null` — jamais une valeur par défaut déguisée.
3. **Chaque question est passable**, sans conséquence.
4. **Une seule question par écran**, pour que ce soit rapide et jamais
   intimidant.

Techniquement, les choix reposent sur des `input` natifs enveloppés dans des
`label`, à l'intérieur de `fieldset`/`legend` : toute la ligne est cliquable, le
clavier fonctionne sans une ligne de code, et les lecteurs d'écran annoncent
correctement le groupe et l'état de chaque option. Le focus se déplace sur le
titre à chaque changement d'écran — sans cela, un lecteur d'écran resterait sur
l'ancien contenu.

Les réponses alimentent le registre de modules et les « capacités » : un module
qui exige une capacité absente reste invisible. Sans montre connectée, aucun
champ de fréquence cardiaque ou d'oxygénation n'apparaît — pas de case que l'on
ne pourrait pas remplir.

## Décision 10 — Un garde-fou orthographique

L'application est en français. Un texte affiché sans ses accents — « journee »,
« regulier », « repere » — est une faute que tout le monde voit.

La vérification de bout en bout inspecte le texte **réellement rendu** à chaque
écran et signale les formes fautives courantes. C'est un test qui a déjà servi :
la première version de l'onboarding avait été écrite sans accents, et rien
d'autre ne l'aurait signalé automatiquement.

## Décision 11 — Chaque module apporte son propre écran, chargé à la demande

Le registre ne déclarait au départ que des données (identifiant, libellé,
fonction de résumé). Il déclare désormais aussi un écran :

```js
view: () => import('./views/habits.js'),
```

L'écran du jour parcourt les modules actifs et télécharge leur écran **au
moment de l'afficher**. Conséquence directe : un module désactivé ne coûte
rien — ni en poids téléchargé, ni en temps de démarrage.

Quelqu'un qui ne note que son humeur charge une fraction de ce que charge
quelqu'un qui suit tout. C'est ce qui permet d'ajouter des suivis sans jamais
alourdir l'application pour ceux qui ne s'en servent pas, et c'est mesurable :
habitudes et hydratation forment deux fichiers de 1,4 Ko et 0,9 Ko compressés,
séparés du reste.

Un module dont le chargement échoue est ignoré sans empêcher les autres de
fonctionner.

## Décision 12 — À horodatage égal, la version locale gagne

Trouvé en rejouant les tests plusieurs fois de suite : la fusion de sauvegarde
comparait les dates de modification avec `>=`. Deux écritures dans la même
milliseconde sont indiscernables, et l'égalité profitait donc à la sauvegarde
**importée**.

Pour une fusion dont le rôle est de ne jamais faire disparaître une saisie
récente, c'est le mauvais sens. La comparaison est désormais stricte : en cas
d'égalité, on conserve ce qui est déjà sur l'appareil.

Le symptôme initial ressemblait à un test instable. C'en était un — mais
l'instabilité révélait une vraie règle métier mal posée, pas un aléa de mesure.

## Décision 13 — La sauvegarde dans le cloud, sans serveur

L'écran « Mes données » fabrique un fichier et le remet au **système**. C'est
ensuite le téléphone qui l'envoie sur Drive, iCloud ou ailleurs, avec ses
propres mécanismes.

Résultat : on obtient la sauvegarde dans le cloud sans serveur, sans frais
récurrents, et sans que l'application ait besoin de la moindre permission
réseau. La promesse « aucune requête ne sort » reste littéralement vraie —
et vérifiée automatiquement.

Trois choses ne seront jamais payantes, parce que les faire payer contredirait
tout le reste : l'export, la restauration, et l'accès à l'historique complet.

L'export sélectif s'appuie sur le drapeau `shareable` du registre : montrer
trois mois de nutrition à une diététicienne n'expose ni le journal, ni les
check-ins d'humeur, ni le profil.

## Décision 14 — Les questions du profil vivent à un seul endroit

Les listes d'options (mobilité, cycle, appareil connecté) et les contrôles de
choix sont partagés entre la première ouverture et l'écran de profil, dans
`src/modules/profile-options.js` et `src/ui/controls.js`.

Dupliqués, on finirait par en corriger une version et pas l'autre : quelqu'un
qui revient sur son profil ne retrouverait pas exactement la question à
laquelle il a répondu. Sur des sujets aussi personnels que le cycle ou la
mobilité, cette incohérence ne serait pas anodine.

Corollaire ajouté au passage : chaque question du profil accepte « Je préfère
ne pas répondre ». Une question passée à la première ouverture doit pouvoir le
rester quand on revient dessus — un choix fait un jour ne doit pas devenir une
prison.

Un bug trouvé en écrivant le test de cet écran : l'option « Je préfère ne pas
répondre » et l'option « Non, pas concerné » du cycle produisaient le **même
identifiant HTML**. Un `id` en double casse l'association entre le libellé et
la case, donc le clic sur le texte et l'annonce par les lecteurs d'écran. La
vérification contrôle désormais qu'aucun identifiant n'est dupliqué dans la
page.

## Décision 15 — Deux paliers d'alerte pour la sauvegarde, jamais plus

Le rappel monte en ambre après le délai réglé, puis en rouge au double de ce
délai — avec un plancher à 45 jours pour que quelqu'un ayant réglé un rappel
très court ne voie pas du rouge au bout de deux semaines.

Deux paliers, parce qu'un rappel d'intensité constante finit par se fondre dans
le décor. Mais pas trois : au-delà on fabrique de l'anxiété, et le but est de
protéger des données, pas de stresser quelqu'un tous les matins.

La pastille se pose sur l'engrenage et non seulement dans un bandeau : un
bandeau se lit une fois puis disparaît de l'attention, la pastille reste. Le
libellé accessible du bouton porte l'information, pas seulement la couleur.

## Décision 16 — Les suggestions plutôt qu'une liste imposée

Une liste fermée d'habitudes oblige à ranger sa vie dans les cases de quelqu'un
d'autre. Mais la page blanche a un coût réel : on ne sait pas quoi mettre, et
surtout on écrit « sport » lundi, « Sport » mardi, « muscu » jeudi — et
l'historique se retrouve avec trois entrées là où il n'y a qu'une activité.

Les suggestions font converger l'écriture sans jamais l'imposer : trois niveaux
de correspondance (début du mot, contenu, puis ressemblance à une ou deux
fautes près), accents et casse ignorés. Ce qu'on tape reste toujours accepté
tel quel.

La comparaison de doublon ignore elle aussi les accents : « Meditation » et
« Méditation » ne peuvent plus coexister comme deux activités distinctes.

La catégorie est enregistrée quand l'activité vient d'une suggestion, et reste
vide sinon. Elle ne sert à rien aujourd'hui ; elle permettra plus tard de dire
« tu as pris trois moments pour toi cette semaine » sans jamais avoir demandé à
personne de classer ses activités à la main.

## Décision 17 — Des graphiques en SVG écrit à la main

Le v5 chargeait 200 Ko de Chart.js depuis un CDN pour dessiner des barres et
des courbes — plus lourd que toute l'application actuelle, et une requête vers
un serveur tiers à chaque ouverture. `src/ui/charts.js` fait le même travail en
quelques kilo-octets, sans réseau.

Ce n'est pas qu'une question de poids. Chart.js dessine dans un `<canvas>`,
c'est-à-dire une **image** : un lecteur d'écran n'y voit rien, et agrandir la
police du système ne change rien. En SVG, chaque graphique porte une
description lisible et s'accompagne d'un tableau de ses valeurs — consultable
par tout le monde, pas seulement par qui distingue bien les couleurs. Les
séries sont d'ailleurs nommées dans une légende, jamais identifiées par la
seule couleur.

Règle tenue partout : **une valeur absente est un trou, jamais un zéro.** Les
courbes se coupent et les barres disparaissent aux jours non renseignés. Une
courbe qui plongerait à zéro raconterait quelque chose de faux.

## Décision 18 — Le bilan dit une phrase, ou se tait

Afficher des courbes ne suffit pas : l'application demandait beaucoup et ne
rendait rien. `src/core/insights.js` produit des phrases — et surtout n'en
produit pas quand il n'y a rien d'honnête à dire.

Quatre garde-fous :

1. **Quatorze jours minimum** où les *deux* valeurs existent, et un lien trop
   faible n'est pas mentionné. Le v5 annonçait « corrélation forte » sur sept
   points, en appariant en plus des jours différents.
2. **Deux observations au maximum**, les plus nettes. Empiler cinq
   affirmations dilue les deux qui comptent et donne l'impression d'un
   horoscope.
3. **Descriptif, jamais prescriptif.** « Tes nuits les plus longues
   s'accompagnent d'un stress plus bas » est une observation ; « dors plus »
   serait un conseil médical. Un test vérifie l'absence de formulations
   prescriptives.
4. **Le rappel « ce ne sont pas des explications » figure une fois** sous
   l'ensemble. Répété après chaque phrase, il doublait la longueur du bloc et
   se mettait à ressembler à une clause juridique qu'on cesse de lire.

Les phrases sont **écrites en toutes lettres**, pas composées à partir de
morceaux. Le premier jet assemblait sujet, adverbe et verbe génériquement et
produisait « ton nuits nettement va à l'inverse de ton stress ». Le français
s'accorde : on l'écrit. Un test verrouille l'absence de ce genre de faute.

## Décision 19 — Un menu, pas un bouton par écran

La barre du haut accumulait un bouton par écran : quatre à la dernière mesure,
et elle débordait déjà à 200 % de taille de texte. Chaque écran ajouté aurait
empiré les choses.

Le cahier des charges prévoyait un menu déroulant ; il est en place, et la barre
revient à deux boutons — la navigation entre les jours, et le menu.

Le motif retenu est le plus simple qui soit correct : un bouton `aria-expanded`
qui révèle une liste de boutons. Volontairement **pas** de `role="menu"` — ce
rôle impose une gestion complète des flèches et de la touche Home, et mal
implémenté il dégrade l'expérience au lieu de l'améliorer. Une liste de boutons
se navigue déjà parfaitement au clavier.

Ce qui est géré : fermeture par Échap, fermeture au clic extérieur, focus qui
entre dans le menu à l'ouverture et **revient sur le bouton** à la fermeture —
sans quoi la tabulation repartirait du haut de la page. L'écran courant porte
`aria-current`, pas seulement une couleur.

Le routeur enregistre la journée en cours avant chaque changement d'écran :
naviguer ne doit jamais faire perdre une saisie.
