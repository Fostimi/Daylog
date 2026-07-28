# Où en est Daylog

Point d'entrée pour reprendre le projet — d'une session à l'autre, ou pour
quelqu'un qui arrive. À lire avec le PDF de cahier des charges.

**Version : `0.2.x`** (le correctif est le nombre réel de commits).
**Branche par défaut : `claude/daylog-app-brainstorm-8g8ktn`.** C'est elle qui
est déployée sur https://fostimi.github.io/Daylog/.

## Ce qui marche aujourd'hui

| | |
|---|---|
| ✅ | Socle : IndexedDB, sauvegarde automatique, schéma versionné, migrations |
| ✅ | Première ouverture : les modules se choisissent par questions, pas par cases |
| ✅ | Écran du jour : trois check-ins, sommeil, journal, habitudes, hydratation |
| ✅ | Cycle menstruel : flux, symptômes, repère de prochaines règles, retard |
| ✅ | Alimentation : 130 aliments livrés, aliments et repas à soi, cibles |
| ✅ | Profil complet : corps, genre, activité, objectif |
| ✅ | Santé : mesures choisies, douleur, digestion, symptômes, traitements |
| ✅ | Activité : catalogue trié par mobilité, distance, séances, jour de repos |
| ✅ | Recalage de l'estimation énergétique sur les pesées et les repas notés |
| ✅ | Argent : dépenses, revenus, virements, balance en centimes entiers |
| ✅ | Vue hebdomadaire : récap, comparaison, accès à chaque journée |
| ✅ | Bilan : graphiques, moyennes, phrases de synthèse |
| ✅ | « Comment ça marche » : ce que l'app calcule et ce qu'elle refuse |
| ✅ | Sauvegarde, restauration, partage sélectif par module |
| ⬜ | Apprentissage, productivité |
| ⬜ | Verrouillage par code, notifications, publication sur les stores |

**Poids** : 19,1 Ko à l'ouverture quotidienne, 25,8 Ko à la première ouverture,
78 Ko cumulés. Le budget est fixé à **5 Mo** : ce qui reste vérifié n'est plus
un plafond mais un détecteur d'accident (une dépendance entraînée par mégarde,
la base d'aliments dupliquée dans le noyau, un module qui cesse d'être
découpé). Ne plus relever ces chiffres à chaque livraison.

**Vérifications** : 289 tests unitaires, 10 fuseaux horaires, 165 vérifications
navigateur (168), plus un stress test qui cherche ce qu'on n'avait pas prévu.
`npm run verify` enchaîne le tout.

**Rappel d'environnement** : `npm install` puis, si Playwright ne trouve pas son
navigateur, `CHROME_PATH=/opt/pw-browsers/chromium-*/chrome-linux/chrome`. Les
deux scripts navigateur lisent cette variable.

## Les décisions à ne pas défaire

Elles ont toutes coûté une discussion. Les rouvrir demande un argument neuf.

1. **Rien ne sort de l'appareil.** Aucune requête réseau, et un test échoue s'il
   en sort une seule. Toute fonctionnalité qui exigerait un serveur doit
   d'abord chercher une solution sans serveur.
2. **`null` n'est pas zéro.** Un champ non renseigné est un trou, jamais une
   valeur moyenne ou nulle. C'est le défaut n°1 du prototype v5.
3. **L'historique est immuable.** Une entrée d'alimentation porte la référence à
   l'aliment *et* les valeurs figées à la saisie. Une habitude est reliée par
   identifiant, jamais par libellé. Corriger aujourd'hui ne réécrit jamais mars.
4. **Aucune fenêtre de fertilité, aucune phase clinique nommée.** Un test échoue
   si ce vocabulaire réapparaît à l'écran. Voir [cycle.md](cycle.md).
5. **La cible calorique ne descend jamais sous le métabolisme de base.** Déficit
   plafonné à 500 kcal. Voir [calculs-metaboliques.md](calculs-metaboliques.md).
6. **Le genre entre dans un calcul, et un seul.** La référence des formules de
   dépense au repos, déduite automatiquement — sauf pour les personnes trans qui
   choisissent. Nulle part ailleurs.
7. **On ne culpabilise personne.** Pas de série qui se casse, pas d'objectif
   manqué en rouge, pas d'alerte rouge sur un retard de cycle.
8. **Les écrans restent factuels.** Ce qui doit être expliqué va derrière un
   « i » ou dans « Comment ça marche ». Un texte répété cesse d'être lu.
9. **Le recalage énergétique part de ce qui a été mangé**, jamais de
   l'estimation de la formule. Comparer la variation de poids à zéro conclurait
   qu'un déficit volontaire prouve une dépense plus basse, et la cible
   descendrait à chaque recalage. Voir
   [calculs-metaboliques.md](calculs-metaboliques.md).
10. **Aucun chiffre de santé n'est qualifié.** Ni « normal », ni « élevé », ni
    couleur d'alerte. Les bornes de saisie disent ce que Daylog sait
    enregistrer, pas ce qu'un corps a le droit d'afficher. Voir
    [sante.md](sante.md).
11. **Les calories d'une séance n'ouvrent aucun crédit.** Le facteur d'activité
    du profil les compte déjà ; les ajouter à une cible ferait manger deux fois
    la même séance. Voir [activite.md](activite.md).
12. **Les montants sont des entiers de centimes.** Additionner des flottants
    fait afficher une balance à −0,00999999 € au bout de trente saisies, et
    aucun arrondi d'affichage ne le répare. Voir [argent.md](argent.md).
13. **Un virement n'est ni une dépense ni un revenu.** Il bouge la balance et
    reste hors des deux totaux, sans quoi les catégories ne veulent plus rien
    dire. Voir [argent.md](argent.md).
14. **Rien n'est interdit de partage.** C'est la personne qui choisit ce qu'elle
    montre, section par section — journal et humeur compris. Ce qui protège,
    c'est qu'aucun extrait ne parte sans un geste explicite, pas une
    interdiction posée d'avance. La santé se découpe en trois parts.
15. **Les calories d'une séance ne s'affichent qu'une fois**, dans un compteur.
    Répétées ligne par ligne, elles donnent à un ordre de grandeur l'allure
    d'une mesure. Une mesure de montre prime toujours sur l'estimation.

## Là où il faut faire attention

- **`src/core/` ne connaît rien de l'affichage.** Il est testable sans
  navigateur, et doit le rester.
- **Un module = une déclaration** dans `src/modules/index.js`. L'écran du jour,
  l'export, le partage et les réglages s'en dérivent. Il n'y a nulle part
  ailleurs de `if (module actif)`.
- **Un module désactivé ne coûte rien.** Son écran est un fichier à part,
  téléchargé seulement s'il sert. Vérifier après chaque ajout que l'ouverture
  quotidienne n'a pas bougé.
- **Les textes affichés portent leurs accents.** Un contrôle inspecte le texte
  réellement rendu. Il ne liste que des formes qui n'existent jamais sans accent
  — y ajouter un verbe conjugué le ferait échouer sur une phrase juste.
- **Aucun identifiant HTML en double.** Ça casse silencieusement l'association
  entre un libellé et son champ. Le stress test le contrôle à chaque écran.

## La suite, dans l'ordre suggéré

1. **Historique navigable, la suite** — la vue hebdomadaire ouvre déjà
   n'importe quelle journée de la semaine affichée, et on remonte de semaine en
   semaine. Restent un calendrier mensuel et une recherche.
2. **Apprentissage et productivité** — sessions, lectures, heures de travail.
   Ce sont les deux dernières sections du cahier des charges sans code.
3. **Polissage** — thèmes de couleur, recalcul dynamique des quantités,
   réévaluation du « i » (est-il compris de tout le monde ?).

## Questions ouvertes

- **La table calorique par profil de référence.** Demandée, pas construite : il
  faut d'abord trancher *quelle variable* l'alimente. Le calcul actuel
  (`(MET − 1) × poids × heures`) tient déjà compte de la masse déplacée. Ajouter
  une différence de composition corporelle est légitime, mais elle doit passer
  par `body.calcBasis` — la variable physiologique déjà choisie explicitement,
  qui gère non-binaire et transition — et non par `identity.gender`. Sinon la
  décision n°6 tombe. À valider avant de bâtir la table.
- **Les traitements au check-in.** Demandé : pouvoir valider une prise
  matin/midi/soir directement depuis le check-in, avec un horodatage juste (ou
  un champ « pris à telle heure ») pour que le suivi partagé reste exact. Pas
  encore fait.
- **L'invitation à consulter un professionnel de santé** est aujourd'hui une
  phrase permanente dans « Comment ça marche », jamais déclenchée par un seuil.
  À rouvrir aux essais, avec l'avis des personnes concernées.
- **Le « i » était invisible**, et c'est corrigé : il n'en existait aucun sur une
  installation neuve, tous étant conditionnés à des données accumulées. Reste à
  savoir si, maintenant qu'il est là dès le premier jour, il est compris.
- **Le modèle économique** (achat unique, publicités légères) n'est pas commencé
  et n'a aucune trace dans le code. Volontaire.

## Documentation

- [architecture.md](architecture.md) — 24 décisions structurantes et ce qui les
  a motivées
- [calculs-metaboliques.md](calculs-metaboliques.md) — les formules, et où le
  genre entre en jeu
- [cycle.md](cycle.md) — les calculs de cycle, et ce que Daylog refuse de
  calculer
- [nutrition.md](nutrition.md) — les arbitrages du suivi alimentaire
- [sante.md](sante.md) — les bornes de saisie, les doses figées, le poids comme
  série
- [activite.md](activite.md) — pourquoi les calories d'une séance n'ouvrent
  aucun crédit
- [argent.md](argent.md) — les centimes entiers, et pourquoi un virement n'est
  ni une dépense ni un revenu
- [deploiement.md](deploiement.md) — mise en ligne
