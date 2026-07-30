# Regards II — après la première semaine d'usage

[regards.md](regards.md) a été écrit après quelques jours de développement, sans
qu'aucune journée réelle n'ait été saisie. Ce document-ci est écrit après une
semaine d'usage véritable, et en réponse au relevé qui l'a suivie.

Il ne remplace pas le premier : un point d'étape se lit avec sa date. Le premier
reste tel quel, y compris là où il s'est trompé — c'est écrit ci-dessous, section
5. Celui-ci a le même statut : un avis, pas une règle. À contester.

---

## 1. Ce que la semaine a appris

### Le défaut du cycle est réel, et pire que ce qu'il en paraît

Reproduit dans un vrai navigateur, sur l'application construite. Dans le profil,
la question « As-tu un cycle menstruel à suivre ? » propose cinq réponses, dont
deux qui **font exactement la même chose** :

- « Non, pas concerné » enregistre `cycle = null` ;
- « Je préfère ne pas répondre » enregistre `cycle = null`.

Conséquence visible, et c'est celle que tu as vue : on clique sur « Non, pas
concerné », l'écran se redessine, et c'est « Je préfère ne pas répondre » qui
apparaît coché. Le bouton sur lequel on a appuyé n'est pas celui qui reste
allumé. Une interface qui répond autre chose que ce qu'on lui a demandé, c'est le
genre de détail qui fait douter de tout le reste de l'écran.

Conséquence invisible, et elle est plus grave : les deux réponses **éteignent le
module**. Il n'existe aujourd'hui aucune façon de dire « j'ai un cycle, mais je
ne veux pas en dire plus ». Répondre « je préfère ne pas répondre » à une
question sur son corps fait disparaître la section entière — soit précisément le
contraire de ce que cette option promet.

Ta question — « est-ce une entrée nécessaire ? » — a donc une réponse nette :
**non, pas à cet endroit**. La liste contient déjà une façon de dire non. Le
« je préfère ne pas répondre » a été ajouté par une règle générale (toute
question du profil doit pouvoir redevenir sans réponse), appliquée sans regarder
que celle-ci avait déjà sa porte de sortie. Le correctif tient en deux lignes :
enregistrer `'none'` comme `'none'`, et retirer l'option surnuméraire de cette
question-là uniquement.

Il faut ensuite décider ce que veut dire « pas concerné » : le module s'éteint,
c'est le comportement actuel et il est bon. Ce qui manque est ailleurs — un cycle
suivi mais qu'on ne veut pas détailler, c'est le module allumé et le repère
désactivé. Cette combinaison existe déjà dans le code (`cycleForecast = false`),
elle n'est simplement pas atteignable depuis cette question.

### L'habitude « reportée au lendemain » : tu as raison, mais pas là où tu crois

Vérifié aussi. Ce qui se passe :

La liste d'habitudes est **globale**, pas quotidienne. « Lecture » ajoutée le 26
est une entrée de *ta liste*, et elle se réaffiche le 27, le 28, tous les jours —
décochée. Ce n'est pas un report de ta saisie du 26 : c'est la même liste, vide,
qu'on te repropose.

Le défaut n'est donc pas dans la donnée, il est dans ce que l'écran raconte. La
carte s'appelle « Ce que tu as fait », le champ dit « Ce que tu as fait… » et le
bouton dit « Ajouter ». Tout, dans cette formulation, annonce un relevé du jour ;
le modèle, lui, est une liste durable qu'on coche. Deux lectures possibles, une
seule vraie, et c'est l'écran qui ment. Un intitulé du type « Ta liste » pour la
zone d'ajout, distinct de « Ce que tu as fait aujourd'hui » pour les cases,
suffirait à lever l'ambiguïté sans rien changer au modèle.

**Mais en cherchant ça, j'ai trouvé autre chose, et c'est un vrai défaut.**

Chaque journée enregistre `active` : la photographie des habitudes qui existaient
ce jour-là. C'est ce qui empêche qu'ajouter une habitude aujourd'hui fasse
baisser rétroactivement tous les scores passés — le bug n°1 du prototype v5, et
la raison d'être de tout le module.

Sauf que `active` n'est pas la photographie du jour concerné : c'est la liste
**au moment de la dernière modification**. Mesuré :

```
Habitude « Lecture » créée le 30 juillet.
Ouverture du 20 juillet, on coche « Lecture ».
Fiche du 20 juillet : { done: ["hab_0fvw…"], active: ["hab_0fvw…"] }
```

Le 20 juillet porte désormais une habitude qui n'existait pas. Avec une seule
habitude c'est sans conséquence. Avec une liste qui grandit, corriger un oubli
sur une journée d'il y a trois semaines lui applique le dénominateur
d'aujourd'hui : cette journée-là passe de « 3 sur 3 » à « 3 sur 8 ». Le v5
faisait ça à toutes les journées d'un coup ; ici ça n'arrive qu'aux journées
qu'on rouvre, ce qui est plus discret et donc plus dur à repérer.

C'est une entorse à la décision n°3, et le correctif existe déjà à moitié :
chaque élément de liste porte son `createdAt` et son `archivedAt`. `active` doit
se calculer pour **la date affichée** — les habitudes créées avant la fin de ce
jour-là et non archivées avant lui — et non pour aujourd'hui. Un test qui coche
une habitude sur une journée passée et vérifie que son `active` ne contient rien
de postérieur fermerait la porte définitivement.

### Le défaut que personne n'a signalé : rien ne garantit que tes données passent la semaine

C'est la correction la plus importante que j'apporte à regards.md, et elle porte
sur un point où je me suis trompé par omission.

J'ai écrit « perdre le téléphone, c'est tout perdre ». C'est vrai, et incomplet :
**on peut tout perdre sans perdre le téléphone.**

L'application n'appelle jamais `navigator.storage.persist()`. Sans cette demande,
le stockage d'un site web est révocable :

- sur iPhone, Safari efface le stockage d'un site qui n'a pas été visité depuis
  sept jours. Les applications **installées sur l'écran d'accueil** échappent à
  cette règle — mais rien, aujourd'hui, ne propose de l'installer ni n'explique
  que c'est la différence entre « mes données sont à moi » et « mes données
  disparaissent pendant les vacances » ;
- sur Android, le navigateur peut évincer le stockage quand l'appareil est plein.
  C'est-à-dire exactement sur les téléphones vieux ou saturés que le cahier des
  charges désigne comme public prioritaire.

(Les détails de comportement d'iOS méritent d'être vérifiés sur un vrai iPhone
avant d'écrire quoi que ce soit à ce sujet dans l'application. Ce qui n'a pas
besoin d'être vérifié : la demande de persistance n'est pas faite, et elle est
gratuite.)

Trois choses à faire, aucune n'est coûteuse :

1. demander la persistance au démarrage, et savoir si elle a été accordée ;
2. si elle ne l'est pas, le dire — et proposer l'installation sur l'écran
   d'accueil, non pas comme un gadget de croissance mais comme la mesure de
   sécurité qu'elle est ;
3. rendre le rappel de sauvegarde plus insistant tant qu'elle ne l'est pas.

Une application locale-first qui ne demande pas la persistance de son stockage
promet quelque chose qu'elle ne tient pas. C'est le seul point de ce document que
je considère comme urgent.

---

## 2. Tes réponses aux cinq points

### 1. La porte d'entrée : le mode express n'y répond pas — et pourtant tu y as répondu

Le découpage du mode express est bon, et je le prends comme acquis : le vital en
soixante secondes sur l'écran d'accueil, le détail par section dans le menu, un
tutoriel qui se déclenche quand on ouvre la partie détaillée. C'est cohérent avec
l'architecture par modules et ça règle un vrai problème.

Mais ça règle le problème du **coût**, pas celui de la **raison**. « Combien de
temps ça me prend » et « pourquoi je l'installe » sont deux questions
différentes, et une réponse rapide à la première ne remplace pas la seconde.
Daylio ouvre en cinq secondes parce qu'il n'y a qu'une chose à saisir, pas parce
que sa saisie est optimisée ; se poser sur ce terrain, c'est affronter dix
millions d'installations avec neuf domaines à remplir.

Sauf que — et c'est le point — **tu as répondu à la vraie question sans le
dire**. En listant ce qui reste dans l'express, tu as tranché : check-ins,
médicamentation régulière, cycle si concerné. Autrement dit : *l'humeur, le
traitement, le cycle*. C'est une porte d'entrée, elle est nette, et elle tombe
exactement là où regards.md pariait. On peut la dire en dix mots :

> « Suivre ce qui agit sur mon état — traitement compris — sans que rien ne
> sorte du téléphone. »

Ce qui reste à faire n'est pas de choisir : c'est d'assumer. Cette phrase doit
être la première de la présentation, celle de la fiche du magasin, et le critère
qui départage les fonctionnalités futures. Le reste — alimentation, argent,
activité — devient ce qu'on découvre après, et c'est très bien.

Une réserve sur la liste : tu y mets « tout ce qui est pas, dépense de calories a
minima ». Un chiffre de calories dans l'écran de soixante secondes rouvrirait ce
que les décisions n°11 et n°15 ont fermé, et pour la donnée la moins fiable de
l'application. Les pas, oui — c'est une mesure. Les calories, non : elles ont
leur place dans la section activité, une fois, dans un compteur.

### 2. La sauvegarde : il y a un bon moyen, et il est petit

Tu écris ne pas en voir. Il y en a un, il est standard, il ne demande aucun
serveur, et il est déjà à moitié en place.

Aujourd'hui, l'export crée un fichier et le fait télécharger. Sur téléphone, ça
finit dans « Téléchargements », et il faut aller le chercher pour le ranger
ailleurs — c'est l'UX de 2010 dont je parlais.

Le navigateur sait faire autre chose : passer le fichier au **système de partage
du téléphone**. La feuille de partage s'ouvre, et « Drive », « Fichiers »,
« Enregistrer dans iCloud », « Envoyer par mail » sont là. Deux gestes, aucune
requête réseau depuis l'application — c'est le téléphone qui envoie, avec ses
propres droits et son propre compte. Le test qui garantit qu'aucune requête ne
part reste vert, parce qu'aucune requête ne part.

C'est précisément ce que la documentation de la sauvegarde décrit déjà comme
principe (« l'app produit un fichier et le passe au système ») ; c'est
l'implémentation qui n'a pas suivi. Le téléchargement reste en secours pour les
navigateurs qui ne savent pas partager de fichiers.

Ça ne rend pas la sauvegarde automatique, et une sauvegarde qui demande un geste
sera oubliée. Mais entre « exporte, puis va chercher le fichier, puis ouvre
Drive, puis dépose-le » et « appuie sur Sauvegarder, choisis Drive », il y a
l'écart entre ce que personne ne fait et ce que les gens font. Combiné à la
persistance du stockage (section 1) et au rappel existant, le problème passe de
« non résolu » à « raisonnablement tenu ».

### 3. Le bilan : ce que je propose

Tu attends une proposition. La voici, par ordre de valeur et non de difficulté.

**a. Avant / après, autour d'un événement que tu connais.** C'est le manque
principal. Aujourd'hui le bilan sait faire des moyennes et quatre rapprochements
écrits à l'avance. Il ne sait pas répondre à la seule question que se pose
vraiment quelqu'un sous traitement : *est-ce que ça a changé quelque chose ?*

Un changement de dose est une date connue, saisie, indiscutable. Autour d'elle,
comparer les trente jours d'avant aux trente jours d'après sur ce qui est noté —
humeur, énergie, sommeil, douleur, symptômes — donne une phrase du type :

> « Depuis le changement de dose du 12 mars : sur les 28 jours notés avant, ton
> énergie moyenne était de 4,2 ; sur les 26 jours notés depuis, de 5,8. »

Aucune causalité affirmée, aucun conseil, deux dénominateurs affichés. C'est
lisible par un médecin en trois secondes, c'est ce qu'aucun concurrent ne fait
proprement, et c'est la contrepartie concrète de la saisie quotidienne. Le même
mécanisme sert pour l'arrêt d'un traitement, un changement de rythme de travail,
un déménagement — n'importe quel repère daté que la personne pose elle-même.

**b. Les rapprochements cherchés, pas seulement ceux trouvés.** Les quatre
paires actuelles sont écrites en dur. Les ouvrir à toutes les séries notées est
tentant et dangereux : avec vingt séries, on teste cent quatre-vingt-dix paires,
et le hasard seul en fait ressortir une dizaine. Si on élargit, il faut relever
le seuil en conséquence et **afficher ce qui a été cherché sans rien donner** —
« Daylog a comparé tes nuits à ton humeur sur 43 jours : aucun lien net ».
L'absence de lien est une information, et c'est le seul moyen honnête d'échapper
à l'effet horoscope.

**c. Le dénominateur, partout.** « Humeur moyenne : 6,4 » devrait toujours se
lire « sur 22 jours notés sur 30 ». La règle « null n'est pas zéro » est tenue
dans le calcul ; elle n'est pas encore *visible* à l'écran, et c'est là qu'elle
convainc.

**d. Tes mots.** Le journal chronologique que tu décris est aussi un matériau de
bilan : « les cinq journées où tu as noté l'humeur la plus basse, et ce que tu
écrivais ces jours-là ». Aucun calcul, aucune interprétation, et c'est
probablement ce qu'on relira le plus.

**e. L'extrait pour le rendez-vous.** Une page : traitements et doses avec leurs
dates de changement, symptômes relevés, moyennes avec leurs dénominateurs, et la
mention de ce qui n'a pas été noté. C'est le point (a) mis en forme, et c'est la
raison d'installer.

### 4. Le temps de saisie : je retire ma crainte

Tu as mesuré en vivant, moi j'avais estimé en lisant. Une semaine d'usage vaut
mieux que mon inquiétude : je retire le point du haut de la liste. Le premier
jour plus long est normal et attendu — c'est le jour où l'on crée ses
traitements, ses habitudes, ses repas fréquents, et cet investissement est
justement ce qui rend les jours suivants rapides.

Reste la seule chose qui manquait vraiment : la relance. Ce qui suit.

### 5. Le manque de notifications : le blocage n'est pas celui que tu crois

Tu écris que ça demanderait « une grosse infrastructure et des investissements ».
C'est vrai des **notifications poussées** — celles qu'un serveur envoie. Ce n'est
pas vrai de ce dont tu as besoin.

Un rappel de prise à 8 h est une **notification locale** : le téléphone se
prévient lui-même, à une heure connue d'avance, sans réseau, sans serveur, sans
compte, sans coût récurrent. C'est un problème résolu depuis quinze ans sur les
deux systèmes.

Ce qui bloque n'est pas l'argent, c'est le format. Une PWA ne sait pas
programmer une notification à heure fixe : la fonction qui devait le permettre
n'a jamais dépassé le stade de l'essai et a été abandonnée. Il reste sur Android,
pour une application installée, une synchronisation périodique dont le navigateur
décide seul du moment — assez pour un rappel quotidien approximatif, pas pour
« 8 h précises ». Sur iPhone, rien.

Donc : **la notification est l'argument qui tranche la question PWA / application
native.** Emballer la PWA (Capacitor ou équivalent) coûte 25 $ une fois pour
Android, 99 $ par an pour l'iPhone, ne demande aucun serveur, et débloque du même
coup les notifications locales *et* la lecture de Health Connect. Aucune ligne du
noyau n'est à réécrire. C'est le seul chemin, et il est plus court qu'il n'en a
l'air.

Une règle de rédaction, le jour où ça se fera : la notification dit l'heure, pas
le reproche. « C'est l'heure de ta prise du matin » — jamais « tu as oublié »,
jamais un badge qui compte les prises manquées. La décision n°7 vaut aussi hors
de l'écran.

---

## 3. Les idées neuves : ce que je garde, ce que je conteste

### Police pour dyslexiques par défaut — non, et pour deux raisons

L'intention est juste, le moyen ne l'est pas.

D'abord l'efficacité : les polices dites « pour dyslexiques » n'ont pas montré
d'effet dans les études contrôlées. Rello & Baeza-Yates (2013) en oculométrie,
Wery & Diliberto (2017) et Kuster et al. (2018) sur des enfants dyslexiques et
non dyslexiques : aucune amélioration mesurée de la vitesse ni de la précision,
et parfois l'inverse. Ce qui aide, en revanche, est mesuré : **l'espacement**
(Zorzi et al., 2012, sur l'espacement des lettres), la longueur de ligne, une
police sans empattement ordinaire, l'absence de justification, une taille
suffisante.

Ensuite le poids : une police chargée pour tout le monde, par défaut, coûte
plusieurs dizaines de kilo-octets à l'ouverture quotidienne — sur une application
qui en pèse dix-neuf.

Ce que je propose à la place : un réglage « confort de lecture » qui agit sur
l'espacement, la taille et l'interligne — gratuit, sans téléchargement, actif sur
tous les écrans — et la police spécialisée disponible **en option téléchargeable**
pour qui la préfère, comme les thèmes. Plus inclusif, plus léger, et honnête sur
ce qu'on sait.

À rouvrir avec des personnes concernées : la préférence subjective compte, même
sans effet mesuré sur la vitesse. Mais elle se choisit, elle ne s'impose pas.

### Thèmes pour daltoniens — d'accord, et il faut aller plus loin

Un thème daltonien optionnel a un défaut logique : il admet que le thème par
défaut est cassé pour ces personnes. La bonne règle est plus forte et ne coûte
rien : **aucune information ne doit être portée par la couleur seule**, nulle
part. Une courbe se distingue par sa forme et son étiquette, pas par sa teinte.
Un état se lit par son texte, pas par sa pastille.

Concrètement : vérifier la palette une fois (contraste, et simulation des trois
formes de daltonisme), régler ce qui ne passe pas, et ajouter le contrôle aux
vérifications automatiques — le projet vérifie déjà les accents et les
identifiants en double à chaque écran, c'est la même discipline. Le thème
optionnel devient alors un confort, pas un rattrapage.

Et sur le principe : **l'accessibilité ne se paie jamais.** Tu l'as écrit, je le
souligne, ça mérite d'être une règle et pas une intention.

### Thème LGBT — d'accord, avec un piège auquel tu n'as pas pensé

Sobre, sur les contours, compatible clair et sombre, et surtout **toutes** les
identités et pas seulement l'arc-en-ciel : c'est bien vu, et c'est le genre de
détail qui ne se voit que de ceux qu'il concerne — donc qui compte.

Le piège : un téléphone se regarde par-dessus l'épaule. Une application de santé
qui affiche des couleurs identifiables peut désigner quelqu'un contre sa volonté,
dans une famille, un vestiaire, un pays. Ça ne condamne pas l'idée, ça en fixe la
forme : discret par défaut, jamais dans l'icône de l'application, jamais sur un
écran de démarrage. Le choix reste, le risque ne s'impose à personne.

C'est exactement la même logique que le partage sélectif : ce n'est pas à
l'application de décider ce qu'on montre.

### Gamification par expérience et niveaux — c'est là que je ne suis pas d'accord

Tu as écarté les séries, et pour la bonne raison. Mais l'expérience et les
niveaux sont la même mécanique avec un meilleur visage, et sur cette
application-là ils posent deux problèmes que la série ne posait pas.

Le premier : **ça rémunère le geste, pas le fait**. Gagner des points en
saisissant crée une raison de saisir autre que la vérité. Le jour où quelqu'un
complète une section pour finir sa barre, la donnée devient fausse — et la donnée
est le seul actif de l'application. Tout le reste (null n'est pas zéro,
l'historique immuable, les valeurs figées) existe pour la protéger ; un compteur
qui récompense le remplissage travaille contre.

Le second : **sur un suivi de santé, ça vise mal**. Un système qui récompense la
quantité de relevés favorise celui qui relève trop. Pour quelqu'un avec un
trouble alimentaire ou de l'anxiété de santé, « +10 points par repas pesé » n'est
pas neutre. C'est le public que la décision n°7 protège.

Ce que je propose à la place, en gardant ton objectif — de la fidélité, de la
relance, et quelque chose de beau à montrer : **rendre visible ce que le relevé
permet, au lieu de compter les gestes.** « Ton relevé couvre trois mois : les
comparaisons avant/après deviennent possibles. » « Quarante-trois journées avec
sommeil et humeur notés : les rapprochements peuvent commencer. » La récompense
est vraie, elle ne se triche pas — remplir n'importe quoi n'améliore rien — et
elle plafonne d'elle-même.

Et la belle image à partager reste possible, avec un tout autre contenu : « six
mois de relevés », une courbe, un prénom. Ça se montre aussi bien qu'un niveau,
et ça ne ment pas.

Si tu tiens aux niveaux, la version la moins nuisible existe : qu'ils comptent
les **jours couverts** et non les champs remplis, et qu'aucun ne se perde jamais.
Mais je préfère le dire clairement : c'est la première idée du document qui, à
mon avis, tire l'application dans la direction de celles dont elle se distingue.

### Le journal chronologique — la meilleure idée du document

Rassembler les notes des check-ins et celle de la journée dans un fil horodaté,
lisible jour par jour puis par semaine, ça ne coûte presque rien (la donnée est
déjà là) et ça change la nature de l'application : jusqu'ici on la remplit,
là on la **relit**. C'est une réponse directe au « pourquoi je saisis tout ça »
que je posais dans regards.md, et probablement une meilleure que l'enrichissement
du bilan.

Deux précautions :

- une note corrigée garde l'heure de sa première écriture ; l'historique reste
  immuable pour les mots comme pour les doses ;
- le journal est ce qu'il y a de plus intime dans l'application. Il lui faut sa
  propre part dans le partage, jamais cochée d'avance — la décision n°14 dit que
  rien n'est interdit de partage, elle ne dit pas que tout part ensemble.

### PDF stylés payants — oui, et sans embarquer de bibliothèque

Comme fonctionnalité payante, c'est bien vu : c'est du plaisir, pas de l'accès.
Personne n'est privé de ses données parce qu'il n'a pas payé le papier à
carreaux.

Techniquement, une bibliothèque de génération de PDF pèse plusieurs centaines de
kilo-octets et ferait exploser le budget. Le navigateur sait déjà produire un
PDF : une feuille de style d'impression suffit, les fonds, les polices et la mise
en page se font en CSS, et le résultat est un vrai PDF. Zéro dépendance, zéro
kilo-octet à l'ouverture quotidienne pour ceux qui ne s'en servent pas.

La règle à tenir : **l'extrait simple et complet reste gratuit.** Si l'extrait
médical est la porte d'entrée, il ne peut pas y avoir de mur devant. Ce qui se
paie, c'est la jolie version.

### Une vraie documentation — oui, et c'est cohérent avec le reste

« Comment ça marche » explique les principes ; les formules, elles, sont dans le
dépôt. Rendre le lien explicite est gratuit et sert l'argument principal de
l'application : on ne demande pas de croire, on montre. Un renvoi vers le dépôt
est acceptable **tant que rien d'essentiel n'existe qu'en ligne** — l'application
doit rester entièrement utilisable hors réseau, y compris ses explications.

### Health Connect — ce qui est vrai, ce qui reste à vérifier

Vrai : lire Health Connect demande une application native, donc la même étape
d'emballage que les notifications. C'est le même travail, fait une fois.

À vérifier avant de compter dessus : Health Sync est un pont **tiers**, payant
après une semaine, qui sert à faire entrer des données dans Health Connect. Si
l'application Suunto y écrit elle-même, ce pont ne sert à rien et le problème
disparaît. Si elle n'y écrit pas, c'est une limite de Suunto que Daylog ne peut
pas contourner — et c'est un argument de plus pour que le score de récupération
reste une option accessoire, jamais un élément central. Une application qui
dépend d'un pont payant appartenant à quelqu'un d'autre n'est pas locale-first.

Ton choix d'actualiser à chaque check-in ou à l'ouverture, plutôt qu'en tâche de
fond, est le bon : moins de batterie, moins d'infrastructure, et un moment où la
personne regarde l'écran.

### Monétisation — d'accord, avec une précaution de magasin

L'achat unique à 1,99 € via le magasin est simple et cohérent. Le bouton « montant
libre » qui renvoie vers Ko-fi l'est moins : les règles d'Apple sur les liens
sortants pour du contenu numérique sont strictes et changeantes, et un refus de
validation se paie en semaines. La version qui passe partout : l'achat dans
l'application, et le lien de soutien libre sur le **site** du projet, pas dans
l'application.

Et je maintiens ce que disait regards.md : l'export reste gratuit, complet, sans
limite de durée. Ça n'a pas bougé.

---

## 4. Ce que je ferais maintenant, dans l'ordre

1. **La persistance du stockage** et l'invitation à installer sur l'écran
   d'accueil. C'est la seule urgence : tout le reste suppose que les données sont
   encore là.
2. **Les deux défauts trouvés** — le cycle, et l'instantané `active` des
   habitudes. Petits, vérifiables par un test chacun.
3. **La sauvegarde par la feuille de partage du système.** Quelques lignes, et
   ça règle la moitié du problème que je jugeais le plus grave.
4. **Les prises de traitement au check-in** (déjà tranché, jamais écrit) puis
   **l'avant/après autour d'un changement de dose**. C'est la porte d'entrée qui
   se construit ; le reste du bilan vient après.
5. **Le journal chronologique.**
6. **L'emballage natif**, pour les notifications locales et Health Connect.
7. Puis le reste : express découpé par section, documentation, thèmes,
   apprentissage, productivité.

Les points 1 à 3 tiennent probablement dans une journée. Ils ne se voient pas sur
une capture d'écran, et ce sont eux qui décident si quelqu'un a encore ses
données dans six mois.

---

## 5. Ce que je retire de regards.md

- **Le temps de saisie** n'est plus une crainte de premier rang : une semaine
  d'usage l'a réglée mieux qu'une estimation.
- **« Perdre le téléphone, c'est tout perdre »** était trop indulgent : on peut
  tout perdre en gardant le téléphone, et l'application ne fait rien contre ça.
- **La porte d'entrée** n'était pas une question ouverte : elle était déjà
  tranchée, dans la liste de ce que tu gardes en soixante secondes. Il reste à
  l'écrire.

Ce qui ne change pas : la largeur reste le risque principal, et chaque idée neuve
de ce document en ajoute. Police, thèmes, gamification, PDF, documentation,
journal, notifications — c'est beaucoup, et rien là-dedans ne fait installer
l'application. Le journal et l'avant/après, si.
