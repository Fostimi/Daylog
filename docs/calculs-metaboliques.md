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

## Séparer l'identité des paramètres de calcul

Deux choses sans rapport sont volontairement séparées dans le profil :

| Champ | Rôle | Entre dans les calculs ? |
|---|---|---|
| `identity.address` | Comment l'app s'adresse à la personne | **Non, jamais** |
| `identity.pronouns` | Pronoms d'usage | **Non, jamais** |
| `body.calcBasis` | Base de calcul métabolique | Oui |
| `body.bodyFatPct` | Masse grasse **mesurée** | Oui, si renseignée |

L'identité de genre ne pilote que le vocabulaire. Les calculs utilisent une
variable physiologique choisie explicitement, que l'on peut changer à tout
moment sans que cela ne modifie la façon dont l'app parle à la personne.

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
Base commune = (10 × poids) + (6,25 × taille) − (5 × âge)
Variante A   = base commune + 5
Variante B   = base commune − 161
```

Ces deux constantes viennent des deux groupes de population sur lesquels la
formule a été calibrée. Daylog demande explicitement laquelle utiliser, avec une
explication, plutôt que de la déduire d'une case « homme / femme ».

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

## Le garde-fou : la réalité l'emporte sur la formule

C'est le mécanisme le plus important de ce document, et celui qui rend le choix
de départ beaucoup moins critique qu'il n'y paraît.

Si, sur six à huit semaines, le poids évolue dans un sens que la formule ne
prédit pas, **c'est la formule qui a tort**. Daylog ajuste alors son estimation
sur les faits observés :

```
écart observé = variation de poids réelle × 7700 kcal/kg ÷ nombre de jours
estimation ajustée = estimation initiale − écart observé
```

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
