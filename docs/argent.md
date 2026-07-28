# Argent

Deux décisions structurent tout le module. Les deux se voient à l'usage bien
avant de se voir dans le code.

## 1. Les montants sont des entiers de centimes

`0.1 + 0.2` vaut `0.30000000000000004` en virgule flottante.

Sur une application de suivi de dépenses, ça veut dire une balance qui affiche
`−0,009999999999990905 €` après trente saisies, et un total qui ne tombe jamais
juste. **Aucun arrondi à l'affichage ne répare ça** : il faut ne jamais
additionner de flottants.

On saisit des euros, on stocke des centimes, on n'additionne que des entiers.
L'arrondi se fait **une seule fois**, à la saisie. Un test enregistre trente
lignes de 0,10 € et vérifie que le total vaut exactement 3,00 €.

### La saisie accepte la virgule

Sur un clavier français, le pavé numérique produit une virgule. Refuser
« 12,50 » reviendrait à refuser la façon dont la moitié des gens écrivent un
prix. Les espaces de frappe sont ignorés (`1 250` fonctionne).

Les refus sont nommés séparément, parce qu'ils demandent des gestes différents :

| | |
|---|---|
| `nan` | ce n'est pas un nombre |
| `negative` | le montant s'écrit sans signe, la nature choisie dit le sens |
| `zero` | une ligne à zéro n'apprend rien |
| `range` | au-delà de dix milliards, Daylog ne suit plus |

Rien n'est corrigé à la place de la personne — même règle que pour les mesures
de santé et les durées de cycle.

### L'affichage est français

`12,50 €` avec une **espace insécable** avant le symbole, et une **espace fine
insécable** comme séparateur de milliers : `12 345,67 €`. C'est le chiffre qu'on
regarde le plus souvent de tout l'écran ; « 12.50 € » s'y lirait comme une
traduction ratée.

Les tests écrivent ces espaces en ` ` et ` ` plutôt que de les taper —
sinon elles seraient indiscernables d'une espace ordinaire dans le fichier, et la
première personne qui « corrigerait » le test casserait la règle.

## 2. Un virement n'est ni une dépense ni un revenu

Le cahier des charges le demande explicitement : « tracking de virement, en cas
de remboursement à quelqu'un ou quelqu'un te rembourse ».

**Se faire rembourser 20 € d'un repas n'est pas un revenu.** Le compter comme tel
gonflerait le total des revenus du mois et rendrait la catégorie inutilisable —
un mois où l'on avance de l'argent pour des amis afficherait un salaire fantôme.
Symétriquement, rembourser un ami n'est pas une dépense de loisir.

Mais l'argent a bien bougé sur le compte. Donc :

```
Dépensé  = somme des dépenses            (virements exclus)
Reçu     = somme des revenus             (virements exclus)
Balance  = Reçu + virements reçus − Dépensé − virements versés
```

Trois chiffres et non deux, et l'écran dit lequel comprend quoi. C'est la seule
façon d'avoir **à la fois** une balance juste et des catégories qui veulent dire
quelque chose.

Le signe affiché sur une ligne suit ce qui bouge sur le compte, pas la nature de
la ligne : un remboursement reçu s'affiche `+5,00 €` bien qu'il ne soit pas un
revenu.

## Aucune conversion de devise

Rien ne sort de l'appareil, donc aucun taux de change ne peut être à jour.
Convertir avec un taux figé serait faux dès le lendemain, et donnerait à des
chiffres inventés l'apparence de mesures.

La monnaie se choisit une fois et sert d'unité. Les lignes déjà notées ne
changent pas de valeur quand on en change.

## Aucun budget, aucun plafond

Le cahier des charges n'en demande pas, et une application qui dirait « tu as
trop dépensé en restaurants » ferait exactement ce que celle-ci refuse partout
ailleurs : juger un relevé. C'est la règle n°7 — on ne culpabilise personne —
appliquée à un domaine où elle est particulièrement facile à oublier.

Le classement par catégorie existe (`byCategory`) et sert à répondre à « où part
l'argent », jamais à « tu dépenses trop ». Les revenus et les virements en sont
exclus : mélanger un salaire aux courses dans un même classement ne dirait rien.

## Ce que le résumé quotidien porte

`spent`, `earned`, `balance` — **en centimes**, comme le reste du module.

Le bilan s'en contente : le classement par catégorie exigerait de relire les
fiches complètes, et faire relire quatre-vingt-dix fiches pour un camembert
contredirait tout le travail fait sur les résumés compacts.

## Où c'est écrit

| | |
|---|---|
| `src/core/money.js` | conversion, formats, totaux, catégories |
| `src/modules/views/money.js` | l'écran |
| `src/modules/index.js` | déclaration du module et clés de résumé |
| `tests/money.test.js` | 20 vérifications |

## Ce qui reste à faire

- **Les catégories personnelles.** La liste est fermée. L'ouvrir demande le même
  soin que les habitudes : identifiants stables, archivage plutôt que
  suppression.
- **Les dépenses récurrentes.** Un abonnement se re-tape tous les mois. Le
  mécanisme des repas fréquents (`lists`, kind `meal`) est le bon modèle.
- **Une vue mensuelle.** La balance d'un mois est plus parlante que celle d'un
  jour, et c'est l'échelle à laquelle un loyer se lit.
