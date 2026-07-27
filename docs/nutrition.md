# Nutrition — décisions de conception

Ce document fige ce qui a été arbitré avant l'écriture des écrans, pour ne pas
avoir à le re-débattre. Les formules, elles, sont dans
[calculs-metaboliques.md](calculs-metaboliques.md) et appliquées par
[`src/core/nutrition.js`](../src/core/nutrition.js).

État : **le mode express est en place** — profil, base d'aliments, saisie du
jour, repas enregistrés, bilan. Le mode détaillé (micronutriments) viendra
après, une fois qu'on saura ce que celui-ci donne à l'usage.

## Le problème à résoudre

Le suivi alimentaire est la fonction qui tue les applications de suivi. Le
prototype v5 demandait ~150 champs par jour ; personne ne tient trois semaines.
Deux échecs symétriques nous guettent :

- **trop demander** — on abandonne au bout d'une semaine ;
- **ne rien apporter** — si l'application ne sait rien des aliments, autant
  ouvrir une autre app pour chercher les valeurs, et à ce moment-là on utilise
  l'autre app.

Le second point est décisif : dépendre d'un tiers pour chaque saisie condamne le
module avant même qu'il serve.

## Décision 1 — L'express d'abord, seul

Le mode détaillé (micronutriments, treize champs par repas) viendra **après**, et
seulement une fois qu'on saura ce que la saisie rapide donne à l'usage. Les
construire ensemble doublerait la surface avant de savoir si la première tient.

## Décision 2 — Une petite base d'aliments, embarquée

Environ **80 aliments de base** — pâtes, riz, farine, œuf, poulet, bœuf, lait,
pain, huile, légumes courants — livrés avec le module.

Ce qui justifie l'écart au principe « rien n'est embarqué » : une bibliothèque
vide au premier jour rend le module inutilisable pendant la semaine où l'on
décide si on garde l'application.

Coût : **3 à 5 Ko compressés**, chargés avec le module nutrition uniquement.
Une base complète type CIQUAL pèse 5 à 30 Mo — cent fois l'application entière,
et sans réseau elle ne peut pas être consultée à distance. C'est non.

**Ces valeurs sont indicatives et modifiables.** Le riz d'une marque n'est pas
le riz d'une table de composition. La base amorce, elle ne fait pas autorité, et
l'écran doit le dire une fois — pas à chaque ligne.

## Décision 3 — Deux niveaux de mémoire

| Niveau | Ce que c'est | Exemple |
|---|---|---|
| Aliment personnel | valeurs saisies une fois, réutilisables | « Riz basmati Repère » |
| Repas nommé | une liste d'aliments avec leurs quantités | « Mon petit-déj » |

Un repas nommé s'insère d'un tap, et **ses quantités s'ajustent à l'insertion
sans modifier le modèle**. La plupart des gens ont dix à quinze repas
récurrents : après deux semaines, une journée se note en quatre gestes.

Même mécanique que les habitudes : identifiants stables, jamais supprimés mais
archivés. Renommer ne casse rien.

## Décision 4 — L'historique est immuable

Une entrée de repas enregistre **à la fois** la référence à l'aliment **et** les
macros calculées au moment de la saisie.

Sans cela, corriger les valeurs de « Mon riz » six mois plus tard réécrirait
rétroactivement toutes les journées passées — c'est exactement le défaut des
habitudes du v5, déjà corrigé une fois ici. Une correction d'aujourd'hui ne doit
jamais changer ce qu'on a mangé en mars.

Corollaire de performance : les totaux d'une journée se lisent dans la fiche,
sans recalculer une chaîne de références. Une année de suivi ne doit pas coûter
plus cher à afficher qu'une semaine.

## Décision 5 — Les quantités suivent l'aliment

Valeurs stockées **pour 100 g**, ou **par unité** pour ce qui se compte (un œuf,
une tranche, une cuillère).

Les unités proposées dépendent de l'aliment, et seules les unités cohérentes
sont offertes : pas de kilogrammes pour les épices, pas de « tranches » pour
l'huile. Le but est de coller à la façon dont chacun mesure réellement, sans
transformer un choix d'unité en casse-tête.

Le recalcul dynamique pendant la saisie (voir les macros bouger quand on change
la quantité) est souhaitable mais **relève du polissage** — pas du premier jet.

## Ce que ça donne à l'écran

Quatre moments repliés — matin, midi, soir, à côté. On ouvre celui qu'on veut,
on tape trois lettres, on choisit une quantité. Le total du jour est en haut,
avec les cibles à côté **en gris** : un repère, jamais une note.

Deux détails qui ont demandé une correction en cours de route, tous deux
trouvés par le test de bout en bout :

- **le formulaire de quantité n'appartient qu'à un seul moment.** Il s'affichait
  dans les quatre à la fois, donc quatre fois le même identifiant dans la page —
  ce qui casse l'association libellé/champ et l'annonce aux lecteurs d'écran ;
- **le bouton « Ajouter » suit la saisie.** Il ne se réactivait qu'au redessin
  complet, et redessiner à chaque frappe fait perdre le focus au bout d'un
  caractère. Le bouton et l'aperçu se mettent donc à jour seuls, sans reconstruire
  le bloc.

Sans recherche, seuls **ses propres aliments** sont proposés. Dérouler huit
entrées de la base livrée sans rapport avec la personne remplissait l'écran de
bruit.

## Ce qui est écrit

`src/core/nutrition.js` (22 tests) et `src/core/foods.js` (21 tests).

Quatre garde-fous côté énergie :

1. **La cible ne descend jamais sous le métabolisme de base**, quelle que soit
   la vitesse choisie. Le déficit est plafonné à 500 kcal dans les deux sens.
2. **Aucun chiffre sans les données pour le produire** — ce qui manque est
   nommé, pour que l'écran puisse le demander.
3. **Aucune valeur par défaut inventée.** « 1,6 g/kg de protéines » n'est pas
   une vérité universelle.
4. **Les faits l'emportent sur la formule** : si le poids évolue autrement que
   prévu sur six semaines, c'est l'estimation qui se recale.

Le niveau d'activité est demandé **séparément de la mobilité** et jamais déduit
d'elle : une personne en fauteuil peut être sportive de haut niveau.

Et côté aliments, deux règles vérifiées par les tests :

- **la table livrée est contrôlée** : pas de doublon, pas d'unité incohérente, et
  l'énergie annoncée doit rester cohérente avec les macronutriments — sauf pour
  l'alcool, dont l'éthanol apporte 7 kcal/g sans être un macronutriment ;
- **la recherche ignore casse, accents et ligatures.** Taper « oeuf » doit
  trouver « Œuf » : `NFD` ne décompose pas la ligature, et le cas est fréquent en
  français (œuf, bœuf, cœur, sœur).

## Ce qui reste

- **Recalcul dynamique** pendant la saisie de la quantité : l'aperçu existe, mais
  les unités demandent encore un aller-retour. Relève du polissage.
- **Suivi du poids au jour le jour**, qui viendra avec le module santé — et qui
  branchera le recalage automatique de l'estimation sur les faits observés.
- **Mode détaillé et micronutriments.**

Le mode détaillé et les micronutriments viennent après, et les seuils de
micronutriments sont rattachés à la physiologie et non au genre déclaré — le fer
au module cycle, par exemple. Voir
[calculs-metaboliques.md](calculs-metaboliques.md).
