# Essayer Daylog sur son téléphone

Trois façons, de la plus simple à la plus technique.

---

## Option 1 — GitHub Pages (recommandée, mais une condition)

Une adresse permanente, mise à jour toute seule à chaque modification. On
l'ouvre sur son téléphone et on l'ajoute à l'écran d'accueil : elle se comporte
alors comme une vraie application, y compris sans connexion.

Le fichier [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) est
déjà en place et le dépôt est public. Il reste **un seul geste, une seule
fois** :

> **Dépôt → Settings → Pages → Source : « GitHub Actions »**

L'adresse devient `https://fostimi.github.io/Daylog/`, disponible environ une
minute après le push suivant, et se met à jour toute seule ensuite.

### Pourquoi ce geste ne peut pas être automatisé

L'activation automatique a été tentée (`enablement: true`) puis retirée : le
jeton fourni aux workflows GitHub n'a pas le droit de *créer* un site Pages, et
l'appel échouait avec un message trompeur. C'est une limite volontaire de
GitHub — activer la publication d'un site est une décision qui doit venir d'une
personne, pas d'un script.

Tant que Pages n'est pas activé, seul le job « Publication » échoue. Les tests
et la construction, eux, restent verts : la santé du code et la configuration
du déploiement sont deux choses distinctes.

---

## Option 2 — Cloudflare Pages ou Netlify (dépôt privé, gratuit)

Ces deux hébergeurs publient un dépôt **privé** sans rien faire payer. Compter
cinq minutes, une seule fois.

1. Créer un compte sur [Cloudflare Pages](https://pages.cloudflare.com) ou
   [Netlify](https://netlify.com), au choix.
2. Connecter le compte GitHub et choisir le dépôt `Daylog`.
3. Renseigner deux champs :
   - commande de construction : `npm run build`
   - dossier à publier : `dist`

Chaque push met le site à jour automatiquement, comme avec Pages.

---

## Option 3 — En local, sur son ordinateur

Utile pour développer ; nécessite [Node.js](https://nodejs.org) (version 20 ou
plus).

```bash
git clone https://github.com/Fostimi/Daylog.git
cd Daylog
npm install
npm run dev
```

Deux adresses s'affichent. La seconde, en `192.168.x.x`, s'ouvre **directement
depuis un téléphone connecté au même Wi-Fi**.

---

## Installer l'application sur l'écran d'accueil

Une fois l'adresse ouverte dans le navigateur du téléphone :

- **Android / Chrome** — menu `⋮` → « Installer l'application »
- **iPhone / Safari** — bouton Partager → « Sur l'écran d'accueil »

L'icône rejoint les autres applications, l'écran s'ouvre sans barre d'adresse,
et tout fonctionne hors connexion.

---

## Un point important sur les données

Les notes sont stockées par le **navigateur**, pour une **adresse donnée**.
Conséquences concrètes :

- Changer d'hébergeur (de Pages vers Cloudflare, par exemple) revient à changer
  d'adresse : les données ne suivent pas. Il faut les exporter avant, les
  réimporter après.
- Effacer les données de navigation efface aussi celles de Daylog.
- Le mode navigation privée ne conserve rien.

C'est la contrepartie du choix « tout reste sur l'appareil ». C'est aussi
pourquoi l'export est gratuit, complet, et rappelé régulièrement.
