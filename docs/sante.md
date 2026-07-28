# Santé et traitements

Ce que le module relève, ce qu'il refuse de faire de ces chiffres, et pourquoi.

À lire avec [architecture.md](architecture.md) pour les décisions générales et
[calculs-metaboliques.md](calculs-metaboliques.md) pour ce que le poids
déclenche ailleurs.

## Le problème posé

Le cahier des charges énumère ici douze mesures : température, tension, SpO2,
pouls au repos, pouls minimum, pouls maximum, poids, masse grasse, douleur et sa
localisation, digestion, symptômes, traitements.

Les afficher toutes, tous les jours, reproduirait exactement le défaut du
prototype v5 — cent cinquante champs quotidiens, abandonnés en trois semaines.
Quelqu'un qui surveille sa tension après une ordonnance note deux nombres par
jour ; lui en présenter douze garantit qu'il arrête avant la fin de la semaine.

**La personne dit ce qu'elle mesure, une fois, et ne voit que cela.** La liste se
choisit dans « Ce que je note », en bas de la carte Santé, et nulle part
ailleurs — surtout pas dans les réglages généraux, où personne n'irait la
chercher.

Un thermomètre ne se devine pas, un tensiomètre non plus. C'est pour ça que la
question posée est « qu'est-ce que tu peux mesurer ? » et non une déduction à
partir de la marque de montre déclarée.

## Les quatre règles

### 1. Aucun seuil, aucun jugement

Daylog n'a pas d'avis sur une tension à 14/9 ni sur un pouls à 52. Il n'existe
nulle part de « normal », d'« élevé », ni de couleur d'alerte sur une mesure.

Ce n'est pas de la prudence juridique : c'est qu'un seuil affirmerait quelque
chose de faux. La même tension ne veut pas dire la même chose à 25 ans et à
70 ans, sous traitement ou non, mesurée au repos ou après trois étages. Daylog ne
sait rien de tout ça. Afficher une pastille rouge reviendrait à fabriquer un avis
médical à partir d'une seule colonne de chiffres.

Ce qu'il fait à la place : relever proprement, et produire un extrait lisible que
la personne peut montrer à quelqu'un dont c'est le métier.

### 2. Des bornes de vraisemblance, qui ne sont pas des seuils

Une température saisie à `370` est une virgule oubliée. L'enregistrer
empoisonnerait toutes les moyennes pour une faute de frappe.

Chaque mesure porte donc des bornes, larges, qui décrivent ce que le corps humain
vivant peut afficher :

| Mesure | Bornes | Pourquoi si large |
|---|---|---|
| Température | 30 – 43 °C | l'hypothermie et la forte fièvre existent |
| Poids | 20 – 400 kg | |
| Masse grasse | 2 – 70 % | |
| Oxygénation | 70 – 100 % | |
| Pouls au repos | 25 – 140 bpm | un cœur d'athlète descend sous 35 |
| Pouls le plus haut | 60 – 230 bpm | |
| Tension | 60 – 260 / 30 – 160 mmHg | |

Une application qui refuserait de noter une hypothermie serait inutile
précisément le jour où elle servirait. Les bornes disent **ce que Daylog sait
enregistrer**, jamais ce qu'un corps a le droit d'afficher — et le message de
refus est écrit dans ces termes-là.

**Rien n'est corrigé à la place de la personne.** Une valeur hors bornes est
refusée et expliquée, jamais ramenée à la borne la plus proche : arrondir une
mesure de santé reviendrait à en inventer une. Même règle qu'ailleurs dans
l'application (voir `sanitizeDeclared` pour les durées de cycle).

La tension a son propre contrôle : deux nombres qui ne veulent rien dire l'un
sans l'autre, et dont l'ordre ne s'invente pas. Une saisie inversée est
**signalée**, pas remise à l'endroit toute seule.

### 3. Une dose est figée à la prise

C'est la règle n°3 de l'application — l'historique est immuable — appliquée aux
traitements.

Un traitement est enregistré une fois, dans le magasin `lists`, avec sa dose
actuelle et `doseHistory`, la liste datée de ses changements. Chaque prise
enregistre dans la journée :

```
{ id, label, dose, unit, at }
```

- `id` fait le lien : renommer un traitement met à jour tout l'affichage ;
- `label`, `dose` et `unit` sont **figés à l'instant de la prise**.

Pourquoi figer le libellé alors qu'un identifiant suffirait ? Parce qu'un extrait
« Santé » n'emporte pas les listes de l'application — `buildBackup` ne les inclut
que dans une sauvegarde complète, un extrait partagé ne doit pas contenir le
reste du profil. Une ligne `trt_x8k2 : 1` n'apprendrait rien au médecin à qui on
la montre.

Pourquoi figer la dose : c'est le cas du TDAH cité par le cahier des charges. Un
dosage qui évolue n'a d'intérêt que si l'on peut relire quelle dose correspondait
à quel ressenti. Augmenter en mars ne doit pas réécrire janvier.

`doseAt(traitement, date)` renvoie donc la dose **en vigueur ce jour-là**, et
c'est elle qu'affiche l'écran quand on consulte une journée passée.

Un changement de dose est rappelé pendant trois semaines sous le traitement
concerné : c'est le moment où noter un ressenti a de la valeur, et le seul où la
question mérite d'être posée.

**Aucun oubli n'est signalé.** Une prise notée est une information ; une case
vide n'en est pas une. Transformer un blanc en reproche serait exactement ce que
l'application refuse partout ailleurs (règle n°7 : on ne culpabilise personne).

### 4. Le poids est une série, pas une valeur

Le poids varie de plus d'un kilo dans une même journée, selon ce qu'on a mangé et
bu la veille. Comparer la première pesée à la dernière donne une tendance qui
saute d'un kilo et demi selon le jour où l'on regarde — un chiffre juste en
apparence, faux en pratique. C'est le même piège que la corrélation sur sept
points.

`weightTrend` compare donc **la moyenne des premières pesées à celle des
dernières**, sur une fenêtre allant jusqu'à sept de chaque côté, et les deux
fenêtres ne se recouvrent jamais. En dessous de quatre pesées, elle ne dit rien
et annonce ce qui lui manque.

### Le poids de référence du profil

Le cahier des charges demande que le poids saisi une fois au profil soit ensuite
tenu à jour par le suivi quotidien. C'est fait : une pesée met à jour
`profile.body.weightKg` et `weightMeasuredAt`.

Avec une réserve, qui a sa propre fonction (`shouldAdoptWeight`) et son propre
test : **une mesure ne prend la place de la référence que si elle est au moins
aussi récente que celle déjà enregistrée**. On consulte aussi les journées
passées, et compléter une pesée oubliée la semaine dernière ne doit pas
remplacer celle d'hier par une plus ancienne — l'estimation énergétique
reculerait d'une semaine sans que rien ne l'explique.

## L'horodatage des prises : direction arrêtée

Une prise doit pouvoir se valider vite — depuis le check-in du matin, du midi ou
du soir — et rester exacte dans un extrait remis à un médecin. Ces deux
exigences tirent dans des sens opposés : le geste rapide se fait souvent **après
coup**, et l'heure du clic n'est alors pas l'heure de la prise.

Ce qui a été décidé :

- chaque prise porte son **heure de prise**, modifiable. Pré-remplie à l'heure
  du clic, corrigeable d'un geste ;
- l'écran affiche cette heure, pas celle de la dernière modification ;
- l'export porte la **liste des prises avec leurs heures et leurs doses figées**.

### Ce qui a été écarté, et pourquoi

L'idée d'un journal d'événements complet — `22:03 prise 10 mg | 22:13 modifié en
20 mg | 22:33 supprimé` — a été examinée et écartée pour l'export.

Une correction n'est pas un fait sur le corps, c'est un fait sur la frappe. Un
médecin a besoin de savoir *quand* et *combien*, pas quand une faute de saisie a
été rattrapée. Et surtout : un export qui révèle ce que quelqu'un a **supprimé**
retourne la promesse de l'application contre elle. On ne peut pas dire « tu
choisis ce que tu partages » et livrer en même temps la trace de ce qui a été
retiré.

Ce qui est conservé, en revanche : la dose figée au moment de la prise, et
l'historique des **changements de dosage du traitement** (`doseHistory`), qui
est bien un fait clinique — c'est lui qui permet de relire un traitement
évolutif. La différence est nette : le dosage prescrit change, la faute de
frappe non.

## Ce qui reste à faire

- **Le recalage énergétique sur les faits.** `calibrate()` existe dans
  `core/nutrition.js` et n'est encore branché nulle part. Le module santé fournit
  maintenant ce qui lui manquait : une série de poids. C'est la suite immédiate.
- **Le ressenti lié à un changement de dose** est aujourd'hui un rappel affiché,
  sans champ dédié. La note du jour fait l'affaire ; un champ propre au
  traitement se justifiera si l'usage le demande.
- **Les symptômes personnalisés.** La liste est fermée. L'ouvrir demande le même
  soin que les habitudes : identifiants stables, archivage plutôt que
  suppression.

## Où c'est écrit

| | |
|---|---|
| `src/core/health.js` | mesures, bornes, tendance de poids, doses |
| `src/modules/views/health.js` | l'écran |
| `src/modules/index.js` | déclaration du module et clés de résumé |
| `tests/health.test.js` | 27 vérifications |

Les clés de résumé sont déclarées à deux endroits — dans `MEASURES` et dans le
`summarize` du module. C'est volontaire : importer le noyau de santé dans le
registre de modules ferait payer son poids à tout le monde, y compris à qui n'a
jamais activé le module. Un test vérifie que les deux listes ne divergent pas, et
qu'aucune clé n'entre en collision avec celles d'un autre module — le cycle
publie déjà `symptoms`, la santé publie `ailments`.
