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

**Poids de l'application** : 19,1 Ko à l'ouverture quotidienne, 25,8 Ko à la
première ouverture, 78 Ko cumulés. Le budget est fixé à **5 Mo** : ce qui reste
vérifié n'est plus un plafond mais un détecteur d'accident (une dépendance
entraînée par mégarde, la base d'aliments dupliquée dans le noyau, un module qui
cesse d'être découpé). Ne plus relever ces chiffres à chaque livraison.

**Poids des données** — mesuré, parce qu'une extrapolation à la louche donnait
60 Mo par an et faisait peur pour rien :

| | |
|---|---|
| Journée légère (humeur + note) | 153 octets |
| Journée **très** chargée, tous modules remplis | 3,6 Ko |
| Un an de ce régime maximal | ~1,3 Mo brut, ~130 Ko compressé |

Le stockage n'est donc pas un sujet, et ne le sera pas. Si une sauvegarde paraît
énorme, chercher ailleurs : l'export JSON *lisible* est indenté (deux à trois
fois plus gros), et les listes accumulées pendant les essais ne se voient pas
dans le compteur de journées.

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

## Questions ouvertes

- **L'invitation à consulter un professionnel de santé** est aujourd'hui une
  phrase permanente dans « Comment ça marche », jamais déclenchée par un seuil.
  À rouvrir aux essais, avec l'avis des personnes concernées.
- **Le « i »** est de retour sur tous les écrans, dès le premier jour. Reste à
  savoir s'il est compris. À réévaluer aux essais.
- **Le modèle économique.** Le cahier des charges évoque des publicités légères
  et un achat unique. Voir [regards.md](regards.md) : la partie publicitaire
  entre en contradiction directe avec la promesse « aucune requête réseau », et
  mérite d'être tranchée avant d'écrire la moindre ligne à ce sujet.
- **La distribution.** L'application est une PWA. Android l'accepte telle
  quelle ; iOS demande un emballage natif. Rien n'est commencé.

## Ce qui a été tranché et attend d'être écrit

Décisions prises, direction documentée, code à faire. Par ordre de valeur :

1. **Les traitements au check-in.** Valider une prise matin / midi / soir depuis
   le check-in, avec une **heure de prise modifiable** (pré-remplie à l'heure du
   clic). L'export porte les prises et leurs doses figées — pas le journal des
   corrections, voir [sante.md](sante.md) pour pourquoi.
2. **Le mode de recalage, branché.** À la première ouverture *si et seulement si*
   le suivi alimentaire est coché, et dans le profil pour en changer. Le noyau
   existe (`CALIBRATION_MODES`), il n'a pas d'écran.
3. **Les exercices personnels**, sur le modèle des repas fréquents : mémoire des
   dernières séries / répétitions / charges. Voir [activite.md](activite.md), et
   surtout le non-objectif qui l'accompagne.
4. **La table calorique par activité**, en deux étages : masse grasse mesurée si
   elle existe, sinon `body.calcBasis`. Jamais `identity.gender`. Voir
   [calculs-metaboliques.md](calculs-metaboliques.md).
5. **Apprentissage et productivité** — les deux dernières sections du cahier des
   charges sans code.
6. **Historique navigable, la suite** — calendrier mensuel et recherche. La vue
   hebdomadaire ouvre déjà n'importe quelle journée.

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
- [regards.md](regards.md) — le point après plusieurs jours : direction, forces,
  craintes, comparaison au marché, viabilité
- [deploiement.md](deploiement.md) — mise en ligne
