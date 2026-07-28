# Activité physique

Le piège de ce module était connu d'avance et signalé dans la passation : **le
niveau d'activité du profil et l'activité notée au jour le jour ne doivent pas se
compter deux fois.**

## Les calories actives sont une information, jamais un crédit

Le facteur d'activité du profil — « une semaine ordinaire, ça ressemble à
quoi ? », de 1,2 à 1,9 — **contient déjà le sport**. Ajouter par-dessus les
calories d'une séance revient à compter la même dépense deux fois, et à proposer
de manger davantage pour une séance déjà prise en compte.

C'est le mécanisme exact par lequel une application de suivi devient une machine
à compenser : on fait une séance, l'application « rend » 400 kcal, on mange
davantage, on recommence. Aucune de ces applications ne présente ça comme un
défaut ; c'en est un.

Donc, ici :

- les calories actives s'affichent sur l'écran du jour ;
- elles n'entrent dans **aucune** cible ;
- l'écran le dit en toutes lettres, parce que c'est exactement ce que tout le
  monde suppose du contraire, et l'y laisser croire en silence serait pire que de
  ne rien afficher du tout.

Et si quelqu'un veut que ses séances pèsent vraiment sur son estimation, c'est
déjà le cas : le [recalage sur les faits](calculs-metaboliques.md) les compte,
puisqu'elles se voient dans le poids et dans les repas. Sans que rien n'ait été
additionné à la main.

### Un MET, moins un

Les calories d'une séance valent `(MET − 1) × poids × heures`, et non
`MET × poids × heures`.

Un MET est, par définition, la dépense au repos. Une heure de yoga à 2,5 METs
n'ajoute que 1,5 fois le repos : le reste, le corps l'aurait dépensé assis, et il
est déjà dans le métabolisme de base. Compter le brut referait, une deuxième
fois, l'erreur que tout ce module cherche à éviter.

**Sans poids connu, aucune calorie n'est estimée.** Une dépense se calcule sur la
masse déplacée ; à défaut on affiche la durée, qui est un fait.

## On ne range personne en capable et incapable

La mobilité déclarée à la première ouverture change **l'ordre** du catalogue et
le vocabulaire employé. Jamais ce qui est accessible.

| | |
|---|---|
| En fauteuil | le déplacement en fauteuil, le handbike et la natation passent devant |
| Je marche | la marche, la course et le vélo passent devant |
| Avec une aide | la marche, la randonnée et le renforcement passent devant |

Un test vérifie que **chaque activité reste atteignable quelle que soit la
mobilité déclarée**, escalade comprise. Masquer l'escalade à une personne en
fauteuil serait décider à sa place de ce qu'elle peut faire, et se tromper.

### Le mot employé

« 4 200 pas » ne veut rien dire pour quelqu'un en fauteuil, et l'afficher tous
les jours revient à lui rappeler tous les jours que l'application n'a pas été
pensée pour lui. Le comptage, lui, ne change pas : c'est une distance.

### Ce qu'on refuse de convertir

Une foulée se déduit honnêtement d'une taille : `0,414 × taille`. Un nombre de
**poussées**, non — il dépend du réglage du fauteuil, du diamètre des mains
courantes, du terrain et de la technique, qui varient d'une personne à l'autre
bien plus que le chiffre lui-même. Convertir quand même, avec la formule de la
marche, produirait un nombre précis et faux.

Donc : distance affichée, équivalent en poussées jamais. C'est la même règle que
partout — aucun chiffre sans les données pour le produire.

### Le genre n'entre pas dans la foulée

Le coefficient est publié séparément pour deux groupes de référence, à 0,415 et
0,413. L'écart vaut **0,5 %** ; la variabilité individuelle à taille égale dépasse
**10 %**. Utiliser le genre ici coûterait une question intime pour une précision
imaginaire — et il n'entre que dans un seul calcul de toute l'application, qui
est ailleurs.

**Sans taille connue, aucun nombre de pas n'est inventé.** Un compteur de pas
faux est pire qu'un compteur absent : on le croit.

## Le jour de repos est une réponse

Trois états, et non deux : coché (repos), décoché après avoir coché (« non, j'ai
bougé »), et jamais touché. Seul le dernier est un silence. Même distinction
qu'entre « zéro verre d'eau » et « hydratation non renseignée ».

Il est en haut de la carte : c'est le geste le plus rapide, et le seul que
quelqu'un ouvre l'application pour faire un jour où il n'a rien fait. En bas, il
lui aurait fallu traverser tout l'écran de ce qu'il n'a pas fait.

Rien n'interdit de cocher « jour de repos » **et** de noter une marche : on peut
se reposer de l'entraînement en ayant marché. La tête de carte affiche alors ce
qui a eu lieu, pas la case cochée — l'inverse se contredirait à l'écran.

## Ce que le module ne publie pas

Le résumé quotidien porte `moveM`, `moveMin`, `workouts` et `restDay` — des faits
mesurés. **Pas les calories actives** : elles se déduisent du poids, qui vit dans
le profil et non dans la journée, et un module n'a pas à publier un chiffre qu'il
ne peut pas calculer honnêtement. L'écran du jour, lui, a le profil sous la main.

## Un piège d'interface, trouvé au premier essai

Les champs proposés dépendent de l'activité choisie — une séance de natation n'a
pas de dénivelé, une séance de musculation pas de distance. Choisir une activité
redessine donc la carte.

La première version **refermait le formulaire et effaçait la durée déjà tapée**,
juste avant de demander les séries et les répétitions. C'est le même piège que le
bloc des symptômes du cycle, qui se refermait sous le doigt. L'état d'ouverture
et les valeurs saisies vivent maintenant en dehors du rendu, et le stress test
contrôle les deux.

## Où c'est écrit

| | |
|---|---|
| `src/core/activity.js` | catalogue, METs, foulée, calories, totaux |
| `src/modules/views/activity.js` | l'écran |
| `src/modules/index.js` | déclaration du module et clés de résumé |
| `tests/activity.test.js` | 23 vérifications |

## La saisie, après le premier essai

Quatre changements demandés à l'usage, tous pour la même raison : la friction
tue le suivi.

**La liste se cherche à la frappe.** Trente activités dans un `<select>` se
parcourent au doigt, ligne par ligne. On tape trois lettres, la liste se réduit,
et elle reste entière si on ne tape rien — pour qui préfère parcourir. Même
motif que la recherche d'aliments.

**La durée se saisit dans l'unité qu'on veut.** Une randonnée se compte en
heures. Obliger à convertir « 2 h 15 » en 135 avant de le taper est le genre de
friction qui fait qu'on note la séance « plus tard », c'est-à-dire jamais. Le
stockage, lui, reste en minutes.

**Les séries, répétitions et charges viennent des exercices.** Une séance n'a pas
UNE charge : elle en a autant que d'exercices. `4×10 à 60 kg` et `3×12 à 20 kg`
ne se résument à aucune moyenne, et demander « poids soulevé » pour la séance
entière obligeait à additionner de tête. On saisit exercice par exercice, et la
séance porte leurs totaux : séries, répétitions, et surtout **volume**
(`Σ séries × répétitions × charge`) — la mesure qui dit si une séance a été plus
lourde que la précédente.

Un exercice au poids du corps compte ses répétitions mais pas son volume : exclu
du total plutôt que compté zéro, comme partout ailleurs.

**Un seul compteur de calories.** Elles ne s'affichent plus sur chaque ligne de
séance. Répétées, elles donnaient à un ordre de grandeur l'allure d'une mesure,
et transformaient un relevé en décompte de ce qu'on a « mérité ». Un compteur, en
haut, et c'est tout.

## Quand on a une montre

Un bloc « Relevé de ta montre » apparaît **seulement si un appareil a été
déclaré** — pour tous les autres, ces champs seraient impossibles à remplir.

Il porte les calories actives mesurées, la fréquence cardiaque moyenne et la
maximale. Quand une mesure existe, **elle prime sur l'estimation par les METs** :
personne ne préfère une formule à un capteur. Elle ne s'ajoute à aucune cible
non plus — la règle du module ne change pas selon la provenance du chiffre.

L'import direct depuis l'appareil reste à voir : il suppose un pont système
(Health Connect, HealthKit) et se discutera à ce moment-là.

## Ce qui reste à faire

- **Les exercices personnels.** Le catalogue est fermé. L'ouvrir demande le même
  soin que les habitudes : identifiants stables, archivage plutôt que
  suppression. Le cahier des charges évoque aussi de pouvoir en proposer à la
  publication — cela suppose un serveur, donc rien pour l'instant.
- **L'intensité par séance.** Le champ existe dans les données (`met`) et n'a pas
  d'interface : la même séance de musculation vaut du simple au double selon la
  charge et les temps de repos.
- **La table calorique par profil de référence.** Demandée, pas encore faite : le
  calcul actuel est `(MET − 1) × poids × heures`, qui tient déjà compte de la
  masse déplacée mais d'aucune différence de composition corporelle. Le point à
  trancher avant de la construire est *quelle variable* l'alimente — voir la
  question laissée en suspens dans `passation.md`.
- **Le lien avec le niveau d'activité du profil.** À terme, quelqu'un qui note
  ses séances tous les jours n'aurait plus besoin de déclarer une moyenne
  hebdomadaire. Attention : c'est exactement là que le double comptage
  reviendrait par la fenêtre.
