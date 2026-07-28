# Regards sur Daylog

Point d'étape écrit à la fin de plusieurs jours de développement, à la demande
explicite de son auteur : non pas sur le produit fini — il ne l'est pas, ce n'est
pas beau, tout ne s'enchaîne pas — mais sur **la direction, les idées, la
viabilité**. Avec les craintes, et sans complaisance.

Ce document a vocation à être relu et contesté. Il n'a pas le statut des
décisions de [passation.md](passation.md) : c'est un avis, pas une règle.

---

## 1. Ce qui est solide, et pourquoi

### `null` n'est pas zéro

Ce n'est pas un détail d'implémentation, c'est ce qui rend chaque moyenne
honnête. La plupart des applications de suivi se trompent là-dessus, et la
plupart de leurs utilisateurs ne le savent pas. Le prototype v5 enregistrait
« anxiété 3, motivation 5 » sur toute journée sauvegardée : au bout de trois
mois, les moyennes décrivaient quelqu'un qui n'existait pas.

Une application qui affiche des moyennes fausses est pire qu'une application qui
n'affiche rien, parce qu'on la croit.

### Le refus de juger, tenu partout

Pas de série qui se casse. Pas d'objectif manqué en rouge. Pas de « tension
élevée ». Pas d'alerte de dépassement de budget. Pas de « il te manque
2 000 pas ».

Ce qui donne sa force à ce parti pris, ce n'est pas l'idée — beaucoup
d'applications s'en réclament — c'est qu'il est **appliqué sans exception**, y
compris là où c'était coûteux : refuser d'afficher les calories d'une séance sur
chaque ligne, refuser un compteur de doses manquées, refuser une couleur sur une
tension. Une seule entorse suffirait à décrédibiliser tout le reste.

### La promesse de confidentialité est vérifiable

« Aucune donnée ne sort » est une phrase que tout le monde écrit. Ici, un test
automatique intercepte chaque requête réseau et échoue s'il en part une. Le code
est ouvert.

C'est la différence entre une promesse et une preuve. Très peu d'applications de
santé peuvent en dire autant, et plusieurs de celles qui le prétendaient ont été
prises en défaut.

### L'architecture par modules

Un module = une déclaration. L'écran du jour, l'export, le partage, les réglages
et le bilan s'en dérivent tous. Il n'existe nulle part de `if (module actif)`.

C'est la raison technique pour laquelle cinq modules ont pu sortir en une
journée sans que rien ne casse. C'est aussi ce qui garde l'ouverture quotidienne
à 19 Ko alors que le cumul dépasse 78 Ko : ce qu'on n'utilise pas n'est jamais
téléchargé.

### L'inclusion est structurelle, pas décorative

La mobilité **trie** le catalogue d'activités, elle ne le filtre jamais — une
personne en fauteuil garde accès à l'escalade. Le module cycle ne dit jamais
« femme ». Le genre entre dans exactement un calcul, et la question n'est posée
que si elle sert. La distance en fauteuil ne s'affiche pas en « poussées », parce
qu'aucune formule honnête ne les calcule.

Ce sont des décisions qui coûtent, et qui ne se voient que par ceux qu'elles
concernent. C'est précisément ce qui fait qu'elles comptent.

---

## 2. Ce qui m'inquiète

### La largeur, et c'est ma crainte principale

Le cahier des charges couvre neuf domaines : humeur, sommeil, alimentation,
cycle, santé, activité, argent, apprentissage, productivité. Chacun bien fait est
un produit à lui seul.

Le risque n'est pas technique, il est d'identité. **Une application qui fait tout
n'est choisie pour rien.** Quand quelqu'un raconte Daylog à un ami, il doit
pouvoir finir sa phrase en dix mots. Aujourd'hui, je ne saurais pas le faire.

La question à trancher, et elle vaut plus que toutes les fonctionnalités
restantes : **pour quoi ouvre-t-on Daylog ?** Le reste peut être là, activable,
excellent — mais il faut une porte d'entrée.

Mon candidat, argumenté plus bas : le suivi de traitement et de symptômes, avec
un extrait lisible par un médecin.

### La charge de saisie

C'est le tueur d'applications de suivi. Le secteur perd typiquement 70 à 80 % de
ses utilisateurs dans le premier mois, et le gagnant est presque toujours celui
qui demande le moins.

Beaucoup a été fait : mode express, choix de ce qu'on suit, mesures optionnelles,
une seule question par écran à l'installation. Mais une journée complète —
trois check-ins, repas, séance avec exercices, mesures, dépenses — reste très
longue. Il faudra un jour mesurer ça honnêtement : combien de secondes pour une
journée « normale » ?

### Perdre le téléphone, c'est tout perdre

Le local-first est le cœur de la promesse, et c'est aussi son coût. Le rappel de
sauvegarde est bien fait, mais « exporte un fichier et range-le sur Drive » est
une UX de 2010, et personne ne le fera régulièrement.

Ce sera la première déception réelle d'un utilisateur, et elle sera irréversible.
Des pistes existent sans serveur (sauvegarde chiffrée déposée dans le dossier
iCloud/Drive du téléphone par le système lui-même, transfert direct d'appareil à
appareil). Aucune n'est simple. C'est le problème le plus important qui reste
non résolu.

### Le bilan est mince au regard de ce qu'on demande

C'est là que la contrepartie se joue : on saisit pendant des mois, et on reçoit
des moyennes et deux corrélations. C'est honnête, c'est prudent, et c'est peu.

Sans un retour plus riche, la question « pourquoi je remplis tout ça ? » finira
par arriver. Et la réponse ne peut pas être « pour avoir des jolies courbes ».

### Rien ne vient des montres

Pour qui a une montre, taper à la main sa fréquence cardiaque de repos est un
non-départ. Le bloc de saisie manuelle est un pansement honnête, pas une
solution. Health Connect (Android) et HealthKit (iOS) sont des ponts **locaux** —
ils ne contredisent pas la promesse — mais ils demandent un emballage natif.

### L'esthétique

Sobre est le bon choix. Aujourd'hui, c'est encore un peu administratif. Le cahier
des charges demande « une personnalité, pas quelque chose de clinique » : elle
n'y est pas encore. Ce n'est pas urgent, mais ça compte le jour de la
publication — les gens jugent une application de santé sur sa première capture
d'écran.

---

## 3. Face au marché, sans ménagement

| Concurrent | Sa force | Où Daylog perd | Où Daylog gagne |
|---|---|---|---|
| **Bearable** | Symptômes + humeur + traitements, corrélations riches, communauté | Antériorité, finesse des corrélations, notifications | Pas de cloud, pas d'abonnement, écrans moins chargés |
| **Daylio** | Saisie en 5 secondes, 10 M+ installations | **La saisie de Daylog est plus lourde** | Profondeur, tout ce qui dépasse l'humeur |
| **MyFitnessPal** | Base de millions d'aliments, code-barres | **Perdu d'avance**, 130 aliments contre des millions | Honnêteté du calcul énergétique, aucun mur payant sur l'export |
| **Cronometer** | Micronutriments sérieux, données de qualité | Rigueur nutritionnelle | Ne demande pas de compte |
| **Hevy / Strong** | Programmes, minuteurs, records | **Terrain volontairement abandonné** | — |
| **Clue / Flo** | Notoriété, design | Antériorité, moyens | **Ne transmet rien, et le prouve** |
| **Apple Health / Health Connect** | Gratuit, préinstallé, automatique | L'automatisme, imbattable | Le sens : ils agrègent, ils n'interprètent pas |
| **Notion / Obsidian** | Souplesse totale | — | Ne demande pas de construire son outil soi-même |

**Le point le plus dur à entendre** : sur la nutrition et la musculation, Daylog
ne peut pas gagner et ne doit pas essayer. Une base d'aliments avec code-barres
demande des années et une équipe ; une application d'entraînement demande une
bibliothèque d'exercices et tout ce qui va avec. Ces deux modules doivent rester
ce qu'ils sont — un suivi honnête pour qui ne veut pas de plus — et ne jamais
devenir des arguments de vente.

**Le point le plus encourageant** : sur le cycle, l'ouverture est réelle. Flo a
été rattrapée par la FTC pour partage de données de santé. Dans un contexte où
les données menstruelles sont devenues un risque juridique réel dans certains
pays, un traqueur qui **prouve** qu'il n'envoie rien n'est pas un argument
marketing — c'est un besoin. Et Daylog y ajoute quelque chose que presque aucun
concurrent ne fait : il refuse d'estimer la fertilité, donc il ne peut pas se
tromper là-dessus.

---

## 4. Viabilité

### Le modèle économique tel qu'il est envisagé pose un problème

Le cahier des charges parle de publicités légères, en bandeau, sans transmission
de données. **Techniquement, ça n'existe pas.** Une régie publicitaire est un
appel réseau, un identifiant, et un tiers dans la boucle. La première bannière
ferait échouer le test qui garantit qu'aucune requête ne sort — et ce test est ce
qui rend la promesse crédible.

Mon avis, tranché : **abandonner la publicité.** Elle rapporterait peu et
coûterait exactement ce qui fait la valeur du produit. Une application de vie
privée avec des pubs est une contradiction que les gens repèrent immédiatement,
et c'est le genre de détail qui se retrouve en tête d'un fil de discussion.

Alternatives cohérentes, par ordre de préférence :

1. **Gratuit et complet, avec un achat « soutenir » facultatif.** Rien n'est
   verrouillé. C'est le modèle qui colle à l'objectif déclaré — « le but n'est
   pas de faire de l'argent » — et celui qui produit le plus de bouche-à-oreille.
2. **Payant d'emblée, 3 à 5 €.** Filtre les curieux, finance la maintenance,
   aucune ambiguïté. Réduit fortement l'audience.
3. **Gratuit avec fonctions avancées payantes.** Attention : l'export doit rester
   gratuit, complet et sans limite. C'est écrit dans le code et dans les
   principes ; le cahier des charges suggérait de limiter l'export à six mois en
   version gratuite, et **c'est la seule idée du document que je conteste
   franchement**. Faire payer l'accès à ses propres données, sur une application
   dont l'argument est qu'elles n'appartiennent qu'à vous, se sent
   immédiatement.

1,99 € à vie ne finance pas la maintenance d'une application de santé. Si l'objet
est un outil utile plutôt qu'un revenu, autant l'assumer complètement.

### Qui l'installerait, honnêtement

- **Les personnes sous traitement au long cours**, en particulier TDAH — le suivi
  de dosage évolutif avec historique immuable et extrait lisible par un médecin
  n'existe presque nulle part, et le besoin est réel.
- **Les maladies chroniques** — douleur, symptômes, corrélations, extrait pour
  la consultation.
- **Les gens qui ont quitté Flo ou Clue** pour des raisons de vie privée.
- **Le milieu neuroatypique et auto-traqueur**, qui bricole aujourd'hui sur
  Notion.
- **Les personnes que les applications de sport et de régime ont blessées.** Une
  application qui refuse de juger a un public, et il est plus large qu'on ne
  croit.

Ce n'est pas un public de masse. C'est un public **fidèle**, qui parle, et qui
reste des années.

### Projection, si tout ce qui reste est livré

Une application très bien faite, que quelques milliers de personnes aimeraient
sincèrement, et qui ne deviendrait jamais un succès de masse — **sauf si un
module devient la raison d'installer.**

Mon pari : **le suivi de traitement et de symptômes.** C'est là que le besoin est
le plus mal servi, que l'immutabilité de l'historique fait une vraie différence,
et que l'extrait partageable a une valeur concrète le jour du rendez-vous. Le
reste devient alors le bonus qui fait rester.

Se vendrait-elle ? Au sens strict, peu. Trouverait-elle son public ? Oui, si elle
se présente par une porte et non par un catalogue.

---

## 5. Ce que je ferais, dans l'ordre

1. **Choisir la porte d'entrée**, et réécrire la première ouverture autour
   d'elle. Le reste reste activable.
2. **Régler la sauvegarde.** C'est la première déception irréversible qui guette.
3. **Enrichir le bilan.** C'est la contrepartie de tout ce qu'on demande.
4. **Mesurer le temps de saisie** d'une journée normale, et le réduire jusqu'à ce
   qu'il ne fasse plus peur.
5. Puis seulement : apprentissage, productivité, thèmes, publication.

---

## 6. Une chose qui mérite d'être dite

Ce projet a une qualité rare : **il sait ce qu'il refuse de faire.** Pas de
fertilité estimée, pas de seuil médical, pas de série qui culpabilise, pas de
crédit calorique, pas de budget qui gronde, pas de bibliothèque d'exercices, pas
de base d'aliments concurrente.

Chacun de ces refus a été argumenté, écrit, et protégé par un test. C'est
beaucoup plus difficile que d'ajouter des fonctionnalités, et c'est ce qui fait
qu'après cinq modules ajoutés en quelques jours, l'application n'a pas dérivé.

Si Daylog échoue, ce ne sera pas par manque de rigueur. Ce sera parce qu'il n'a
pas su dire en une phrase à qui il s'adresse.
