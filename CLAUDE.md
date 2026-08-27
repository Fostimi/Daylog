Log mistakes in MISTAKES.md (what happened, root cause, prevention). 

## Quel modèle fait quoi

**Par défaut, Opus 4.8 orchestre, réfléchit et fait le travail lui-même** — le fil de la session,
le jugement et l'écriture restent dans le contexte principal.

**Des agents Claude Opus 5 ne sont mobilisés qu'au besoin, jamais par réflexe** : quand le travail
est trop gros pour tenir dans un seul contexte, ou quand l'utilisation le justifie (beaucoup à lire
pour rendre peu, tâches bornées et parallélisables). Un agent démarre froid et exécute une tâche
cadrée ; il ne juge pas.

⚠️ Un lancement multi-agents consomme ~10× le régime habituel : il se décide en regardant
l'utilisation *avant*, et se traite comme un gros chantier, pas comme un outil de confort.
