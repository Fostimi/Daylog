# Calculs métaboliques

Ce document explique comment Daylog estime les besoins énergétiques, et surtout
**pourquoi il pose les questions qu'il pose**. C'est le point de l'application
qui touche au plus intime, il doit donc être le plus transparent.

## Le principe qui gouverne tout le reste

> **On n'estime jamais la composition corporelle. On n'affiche que ce que la
> personne a mesuré.**

Il existe des formules qui « devinent » un taux de masse grasse à partir du
poids et de la taille. Elles sont dérivées de l'IMC et héritent donc de son
défaut : elles classent une personne musclée en surpoids, et une personne âgée
peu musclée en pleine forme. Afficher à quelqu'un un chiffre de composition
corporelle inventé à partir de son poids est au mieux faux, au pire violent.

Daylog ne le fait pas, et ne le fera pas.

## Séparer la langue du calcul — et assumer ce que le calcul demande

Deux choses sans rapport sont volontairement séparées dans le profil :

| Champ | Rôle | Entre dans les calculs ? |
|---|---|---|
| `identity.address` | Comment l'app s'adresse à la personne | **Non, jamais** |
| `identity.pronouns` | Pronoms d'usage | **Non, jamais** |
| `identity.gender` | Référence des formules de dépense | Oui, et **uniquement là** |
| `body.calcBasis` | Référence retenue, déduite du genre | Oui |
| `body.bodyFatPct` | Masse grasse **mesurée** | Oui, si renseignée |

**Ce parti pris a changé en cours de route, et c'est une correction.** Les
premières versions refusaient de poser la question du genre et présentaient à
la place un choix de « variante de calcul », avec des libellés qui contournaient
le mot. C'était maladroit sur deux plans : le détour se voyait, et il faisait
porter à chacun un choix technique dont la réponse est évidente pour la plupart
des gens.

Les formules publiées **ont bien été calibrées séparément** sur des groupes de
référence féminins et masculins, et cette différence physiologique est réelle.
Daylog en tient donc compte, automatiquement, à partir d'une seule question — et
cette question ne sert nulle part ailleurs.

| Réponse | Référence retenue |
|---|---|
| Femme | constante féminine |
| Homme | constante masculine |
| Non binaire | **le milieu des deux**, en le disant |
| Personne trans | **choix explicite**, avec transition progressive possible |
| Pas de réponse | aucun calcul affiché |

Deux cas ne se laissent pas ramener à l'une des deux références, et chacun est
traité pour ce qu'il est :

- **Non binaire** — on prend le milieu des deux constantes. Ce point milieu
  n'est publié nulle part : il est présenté comme l'approximation qu'il est, et
  le recalage sur les faits observés le corrigera de toute façon.
- **Personne trans** — c'est le seul cas où le choix explicite vaut mieux qu'une
  déduction. Qui suit une transition connaît son étape, son traitement et son
  ancienneté mieux que n'importe quelle règle automatique. La référence peut
  aussi glisser progressivement d'une constante à l'autre.

Et une porte de sortie pour tout le monde : **la masse grasse mesurée l'emporte
sur toute référence**. C'est une mesure, pas une catégorie, et elle ne pose
aucune question.

## Les trois voies de calcul

Les trois coexistent parce qu'aucune ne convient à tout le monde.

### 1. Katch-McArdle — quand la masse grasse est connue

```
Masse maigre  = poids × (1 − masse grasse %)
Métabolisme   = 370 + 21,6 × masse maigre
```

C'est la voie à privilégier quand elle est possible, pour deux raisons :

- elle est plus juste pour les personnes musclées comme pour les personnes très
  minces, parce qu'elle regarde la composition du corps et non sa masse ;
- **elle ne contient aucune variable de sexe.** Le corps est décrit par ce qu'il
  est. La question ne se pose tout simplement pas.

Condition d'usage : un taux de masse grasse réellement mesuré (balance à
impédance, pince à plis cutanés, DEXA). Jamais estimé.

### 2. Mifflin-St Jeor — la voie par défaut

```
Base commune       = (10 × poids) + (6,25 × taille) − (5 × âge)
Référence masculine = base commune + 5
Référence féminine  = base commune − 161
Milieu (non binaire) = base commune − 78
```

Les deux constantes viennent des groupes de population sur lesquels la formule a
été calibrée. Daylog en déduit celle à utiliser depuis la réponse sur le genre,
sans question supplémentaire.

Marge d'erreur : **environ 10 %, pour tout le monde**, y compris pour les
personnes correspondant exactement aux groupes de calibration. C'est une
estimation de départ, pas une mesure.

### 3. Interpolation — hormonothérapie en cours

Les hormones sexuelles influencent la répartition entre masse musculaire et
masse grasse, donc la dépense énergétique au repos. Sous traitement hormonal,
cette composition évolue progressivement : l'essentiel du changement se produit
sur les deux à trois premières années, puis se stabilise.

Aucune formule publiée ne prévoit ce cas. Daylog propose donc, si la personne le
souhaite et indique une date de début de traitement, de glisser progressivement
d'une variante vers l'autre sur trois ans :

```
progression = min(1, années écoulées depuis le début / 3)
résultat    = variante de départ + (variante d'arrivée − variante de départ) × progression
```

C'est une approximation, et elle est présentée comme telle dans l'interface.
Elle n'est pas moins fondée que d'imposer l'une ou l'autre variante fixe — elle
est simplement honnête sur le fait qu'il existe un entre-deux.

Cette option existe parce que **ne pas la proposer reviendrait à forcer un choix
binaire**. Elle n'est jamais activée d'office, et le choix manuel reste
disponible pour qui préfère ne pas se poser la question.

## Le garde-fou qui compte le plus : jamais sous le métabolisme de base

Quelle que soit la vitesse choisie, **la cible ne descend jamais sous ce que le
corps dépense au repos**. Le déficit est par ailleurs plafonné à 500 kcal par
jour dans les deux sens.

Ce n'est pas un réglage prudent, c'est une limite du produit. Proposer de manger
moins que son métabolisme de base ne relève pas du suivi ; et au-delà de
500 kcal d'écart on ne perd pas plus vite — on perd davantage de muscle, et on
tient moins longtemps. Quand le plancher entre en jeu, l'écran le dit : une
cible silencieusement relevée ressemblerait à un bug.

Dans le même esprit, aucun libellé d'objectif ne classe la personne. Pas de
« sèche », pas de « perte agressive » : une vitesse, et ce qu'elle représente
par semaine. Un test vérifie l'absence de ce vocabulaire.

## Le garde-fou : la réalité l'emporte sur la formule

C'est le mécanisme le plus important de ce document, et celui qui rend le choix
de départ beaucoup moins critique qu'il n'y paraît.

Si, sur six à huit semaines, le poids n'évolue pas comme les apports le
laissaient prévoir, **c'est l'estimation qui a tort**, pas le corps. La relation
exacte est un bilan d'énergie :

```
apports − dépense réelle = variation de poids × 7700 kcal/kg ÷ jours

donc  dépense réelle = moyenne des apports notés
                       − (variation de poids × 7700 kcal/kg ÷ jours)
```

### Le premier terme est ce qui a été mangé

Et c'est tout l'enjeu. Une version antérieure de ce document écrivait
`estimation ajustée = estimation initiale − écart observé`, en comparant
implicitement la variation de poids à zéro. C'est faux dès que la personne suit
un objectif.

Quelqu'un qui vise volontairement 500 kcal sous son entretien et perd le poids
attendu **confirme** son estimation. La formule fautive en concluait qu'il
dépense 500 kcal de moins qu'en réalité — et la cible, recalculée à partir de
cette dépense, descendait encore de 500 kcal. À chaque recalage. Une application
de suivi alimentaire qui fabrique une spirale descendante fabrique un trouble ;
c'est exactement ce que le plafond de déficit cherche à empêcher par ailleurs.

Le recalage a donc besoin des repas notés, pas seulement des pesées.

### Ce qu'il exige avant de se prononcer

| | |
|---|---|
| 42 jours | entre la première et la dernière pesée — en dessous, on mesure de l'eau |
| 8 pesées | une droite sur trois points ne décrit rien |
| 21 journées de repas notés | sur la période couverte par les pesées, et pas ailleurs |

### Deux statistiques choisies pour leur robustesse

Ce chiffre pilote une cible calorique pendant des mois. Une seule journée saisie
de travers ne doit donc pas pouvoir le déplacer — et le stress test a montré que
c'était possible.

**Les apports : moyenne élaguée, pas moyenne.** Une journée notée à 99 999 g
d'huile — 900 000 kcal — portait la moyenne de 2 600 à 10 000 kcal/jour, et la
dépense « recalée » à 10 119 kcal. Taper 999 au lieu de 99 arrive, et il n'y a
aucune raison de refuser la saisie : personne n'a à décider de ce que quelqu'un
a le droit de manger. On écarte donc un dixième des valeurs de chaque côté avant
de moyenner. Sur les 21 journées minimum, cela retire deux journées par bout :
assez pour absorber une faute de frappe et un réveillon, trop peu pour déformer
une habitude.

**La pente du poids : Theil-Sen, pas les moindres carrés.** La pente retenue est
la **médiane des pentes de toutes les paires de pesées**. Une pesée à 724 kg au
lieu de 72,4 passe les bornes de saisie — 724 kg est un poids humain possible, et
une application qui refuserait de noter le sien serait indéfendable. Les moindres
carrés se laissent emporter par ce seul point ; la médiane des pentes ne bouge
pas tant que la majorité des paires est saine.

Dans les deux cas, on ne calcule pas sur deux extrémités : personne ne monte sur
la balance tous les jours, et la pesée du lendemain d'un repas de fête ne doit
pas emporter le résultat.

### Ce qu'il refuse de faire

Au-delà de **40 % d'écart** avec la formule, Daylog ne recale pas et le dit.
Mifflin-St Jeor tourne autour de ±15 % : un écart de moitié ne vient pas d'elle,
mais d'un journal alimentaire incomplet, d'une balance changée ou d'une période
de maladie. Adopter le chiffre reviendrait à proposer une cible bâtie sur des
repas qui n'ont pas été notés — c'est-à-dire, presque toujours, une cible trop
basse.

Limite à énoncer et jamais à corriger en douce : **un journal alimentaire est
sous-déclaré**, souvent de 10 à 30 %. La dépense calculée ici hérite de ce
biais. Elle reste plus proche de la vérité que la formule seule, parce que la
variation de poids, elle, ne ment pas — mais ce n'est pas une mesure, et l'écran
le dit derrière son « i ».

### Ce que ça change

Au bout de deux mois de suivi régulier, l'estimation ne dépend pratiquement plus
de la formule de départ, quel que soit le corps de la personne.

C'est là que se joue vraiment l'inclusion : pas dans une meilleure case à
cocher, mais dans un système qui n'a pas besoin des cases pour finir juste.

## Micronutriments : lier les seuils à la physiologie, pas au genre

Le prototype v5 indexait tous les seuils sur le champ `sexe`. C'est faux pour
plusieurs d'entre eux.

Le plus net est le fer : le besoin est nettement plus élevé (8 → 18 mg/jour) en
raison des **pertes menstruelles**. Le seuil doit donc être lié à l'activité du
module cycle, et non au genre déclaré. Une personne qui n'a pas de cycle — pour
quelque raison que ce soit — n'a pas le besoin majoré, et une personne qui en a
un l'a, indépendamment de la façon dont elle se définit.

Même logique pour les autres seuils : chacun doit être rattaché au fait
physiologique qui le justifie.

## Ce que Daylog n'est pas

Daylog est un outil de suivi, pas un dispositif médical. Il ne pose aucun
diagnostic, ne donne aucun conseil thérapeutique, et ne remplace aucun
professionnel de santé.

Les chiffres affichés sont des repères calculés à partir de ce que la personne a
saisi. Toutes les formules employées sont décrites ici et lisibles dans le code :
aucun calcul n'est une boîte noire, et il n'y a aucune intelligence artificielle
dans l'application.
