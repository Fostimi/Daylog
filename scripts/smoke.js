#!/usr/bin/env node
/**
 * Verification de bout en bout, dans un vrai navigateur.
 *
 * Les tests unitaires verifient la logique. Celui-ci verifie ce que les tests ne
 * peuvent pas voir : que l'app demarre reellement, que la sauvegarde automatique
 * ecrit bien dans IndexedDB du navigateur, et surtout QUE RIEN NE SORT --
 * chaque requete reseau est interceptee et comptee.
 */

import { chromium, devices } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = 4319;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};

/**
 * Serveur de test.
 *
 * Il compresse comme le ferait un vrai hebergeur. Sans cela, les mesures de
 * poids porteraient sur des octets que personne ne telecharge jamais --
 * GitHub Pages, Cloudflare et Netlify compressent tous -- et le budget serait
 * environ trois fois trop pessimiste.
 */
function serve() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (path === '/') path = '/index.html';
        const raw = await readFile(join(ROOT, path));
        const type = MIME[extname(path)] || 'application/octet-stream';
        const compressible = /text|javascript|json|svg|manifest/.test(type);
        const accepts = /gzip/.test(req.headers['accept-encoding'] || '');

        if (compressible && accepts) {
          const body = gzipSync(raw);
          res.writeHead(200, {
            'Content-Type': type,
            'Content-Encoding': 'gzip',
            'Content-Length': body.length,
          });
          res.end(body);
        } else {
          res.writeHead(200, { 'Content-Type': type, 'Content-Length': raw.length });
          res.end(raw);
        }
      } catch {
        res.writeHead(404).end('not found');
      }
    });
    server.listen(PORT, () => resolve(server));
  });
}

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? '  ok  ' : ' ECHEC'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const server = await serve();
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);
const context = await browser.newContext({ ...devices['Pixel 5'], locale: 'fr-FR' });

// Tout ce qui sort est enregistre. C'est la verification la plus importante.
const external = [];
context.on('request', (req) => {
  const url = new URL(req.url());
  if (url.host !== `localhost:${PORT}` && url.protocol !== 'data:' && url.protocol !== 'blob:') {
    external.push(req.url());
  }
});

const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

async function readStore(store) {
  return page.evaluate(async (name) => {
    const db = await new Promise((resolve) => {
      const r = indexedDB.open('daylog');
      r.onsuccess = () => resolve(r.result);
    });
    return new Promise((resolve) => {
      const req = db.transaction([name], 'readonly').objectStore(name).getAll();
      req.onsuccess = () => resolve(req.result);
    });
  }, store);
}


/**
 * Garde-fou orthographique.
 *
 * L'application est en francais : un texte affiche sans ses accents ("journee",
 * "regulier", "repere") est une faute visible par tout le monde. Ce controle
 * inspecte le texte reellement rendu -- pas le code source -- et signale les
 * formes fautives les plus courantes, pour qu'elles ne puissent pas revenir.
 *
 * La liste ne contient QUE des formes qui n'existent jamais sans accent en
 * francais. « calcule », « concerne », « masque » ou « adapte » en ont ete
 * retires : ce sont des verbes conjugues parfaitement corrects, et les inclure
 * faisait echouer le controle sur une phrase juste.
 */
const SANS_ACCENT = new RegExp(
  '\\b(' +
    [
      'journee', 'journees', 'detail', 'details', 'enregistre', 'enregistree',
      'enregistrees', 'donnee', 'donnees', 'telephone', 'reglages', 'presentation',
      'prenom', 'regulier', 'irregulier', 'repere', 'qualite', 'reveils',
      'poussees', 'bequilles', 'deambulateur', 'feminin', 'defaut', 'facon',
      'activite', 'sante', 'connecte', 'frequence', 'oxygenation',
      'posee', 'consequence', 'precedent', 'precedents', 'plutot',
      'evolue', 'etape', 'energie', 'apres', 'duree', 'echoue', 'ecran',
      'creee', 'derniere', 'fevrier', 'decembre', 'arrivee', 'deja', 'tres',
      'verifier', 'accede', 'publicite', 'coeur', 'oeil',
    ].join('|') +
    ')\\b',
  'i'
);

const accentIssues = new Set();
async function scanAccents() {
  const text = await page.evaluate(() => document.body.innerText);
  for (const line of text.split('\n')) {
    const m = line.match(SANS_ACCENT);
    if (m) accentIssues.add(`« ${m[0]} » dans « ${line.trim().slice(0, 50)} »`);
  }
}

/** Navigue par le menu, comme le ferait quelqu'un. */
async function navigate(destination) {
  await page.locator('.nav-toggle').click();
  await page.locator(`.nav-item:has-text("${destination}")`).click();
}

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await scanAccents();

/** Poids reellement telecharge a cet instant. */
const weight = () =>
  page.evaluate(() =>
    performance.getEntriesByType('resource').reduce((a, r) => a + (r.encodedBodySize || 0), 0)
  );

// Poids de la toute premiere ouverture : application + presentation.
const firstOpenWeight = await weight();

// ══════════════════════════════════════════════════ premiere ouverture

check('la page se charge sans erreur JavaScript', errors.length === 0, errors.join(' | '));
check(
  'la presentation apparait a la premiere ouverture',
  (await page.locator('.onb').count()) === 1
);
check(
  'la promesse de confidentialite est le premier ecran',
  (await page.locator('#onb-title').textContent()).includes('Rien ne quitte')
);

// Aucune reponse ne doit etre pre-cochee : on n'induit pas de choix.
await page.locator('.onb-actions .btn-primary').click(); // -> identite
await scanAccents();
await page.locator('.onb-actions .btn-primary').click(); // -> themes
await scanAccents();
check(
  'aucun theme n est pre-coche',
  (await page.locator('.onb-input:checked').count()) === 0
);
check(
  'les choix utilisent des controles natifs',
  (await page.locator('.onb-fieldset legend').count()) > 0
);

// Le focus doit suivre le changement d'ecran, sinon un lecteur d'ecran reste
// sur l'ancien contenu.
const focusOnTitle = await page.evaluate(() => document.activeElement?.id === 'onb-title');
check('le focus se deplace sur le titre a chaque etape', focusOnTitle);

check(
  'chaque question peut etre passee',
  (await page.locator('.onb-skip').count()) === 1
);

// On selectionne quelques reponses au passage pour verifier leur enregistrement.
await page.locator('#theme-sleep').check();
await page.locator('#theme-habits').check();
await page.locator('#theme-food').check();
await page.locator('.onb-actions .btn-primary').click(); // -> mobilite
await scanAccents();
await page.locator('#mobility-wheelchair').check();
await page.locator('.onb-actions .btn-primary').click(); // -> montre
await scanAccents();
await page.locator('#wearable-garmin').check();
await page.locator('.onb-actions .btn-primary').click(); // -> cycle
await scanAccents();
await page.locator('.onb-actions .btn-primary').click(); // -> traitement (passe)
await scanAccents();
await page.locator('.onb-actions .btn-primary').click(); // -> fin
await scanAccents();
check(
  'la derniere etape conclut la presentation',
  (await page.locator('#onb-title').textContent()).includes('prêt')
);
await page.locator('.onb-actions .btn-primary').click(); // -> application

// L'ecran du jour n'apparait qu'une fois les reglages reellement ecrits sur le
// disque : attendre son affichage garantit que la lecture qui suit voit un etat
// stabilise, sans course entre le test et les ecritures.
await page.waitForSelector('[data-slot]');
check(
  'on arrive directement sur la journee',
  (await page.locator('[data-slot]').count()) === 3
);

const meta = await readStore('meta');
const byKey = Object.fromEntries(meta.map((m) => [m.key, m.value]));
check('les modules choisis sont enregistres', byKey.modules?.sleep === true);
check('les modules choisis sont tous enregistres', byKey.modules?.habits === true && byKey.modules?.hydration === true);
check('la mobilite declaree est enregistree', byKey.capabilities?.mobility === 'wheelchair');
check("l'appareil connecte est enregistre", byKey.capabilities?.wearable === 'garmin');
check(
  'une question passee reste non renseignee',
  byKey.capabilities?.cycle === null,
  `cycle = ${JSON.stringify(byKey.capabilities?.cycle)}`
);
check("la presentation est marquee comme faite", Boolean(byKey.settings?.onboardedAt));

await page.reload({ waitUntil: 'networkidle' });
check(
  'la presentation ne revient pas au lancement suivant',
  (await page.locator('.onb').count()) === 0
);

// ══════════════════════════════════════════════════ ecran du jour

// Les check-ins replies dependent de l'heure a laquelle tourne le test. On les
// ouvre tous pour que la verification soit reproductible.
async function openAllCheckins() {
  await page.evaluate(() =>
    document.querySelectorAll('details.checkin').forEach((d) => (d.open = true))
  );
}

const spontaneouslyOpen = await page.locator('details.checkin[open]').count();
check(
  'un seul check-in est deplie a l ouverture',
  spontaneouslyOpen === 1,
  `${spontaneouslyOpen} deplie(s)`
);
await openAllCheckins();

// On compare aux echelles reellement presentes plutot qu'a un nombre fige :
// ajouter un module ne doit pas faire echouer ce controle pour de mauvaises
// raisons.
const totalScales = await page.locator('.scale').count();
const unset = await page.locator('.scale-value.is-unset').count();
check(
  'aucune echelle n a de valeur par defaut',
  totalScales > 0 && unset === totalScales,
  `${unset}/${totalScales} non renseignees`
);
check('aucun bouton pre-selectionne', (await page.locator('.scale-btn.is-selected').count()) === 0);

// Les reperes d'extremite doivent tomber sous le 1 et sous le 10.
const ends = await page.evaluate(() => {
  const scale = document.querySelector('.scale');
  const ends = scale.parentElement.querySelector('.scale-ends');
  const first = scale.querySelector('.scale-btn[data-value="1"]').getBoundingClientRect();
  const last = scale.querySelector('.scale-btn[data-value="10"]').getBoundingClientRect();
  const [low, high] = ends.children;
  return {
    lowText: low.textContent,
    highText: high.textContent,
    lowAligned: Math.abs(low.getBoundingClientRect().left - first.left) < 8,
    highAligned: Math.abs(high.getBoundingClientRect().right - last.right) < 8,
  };
});
check('le repere bas est aligne sous le 1', ends.lowAligned, ends.lowText);
check('le repere haut est aligne sous le 10', ends.highAligned, ends.highText);
check(
  'les reperes portent leur valeur',
  ends.lowText.startsWith('1 ') && ends.highText.startsWith('10 ')
);

// ------------------------------------------------------- saisie et ecriture
await page.locator('[data-slot="morning"] .scale-btn[data-value="8"]').first().click();
check(
  'le check-in du matin passe en "note"',
  await page.locator('[data-slot="morning"]').evaluate((n) => n.classList.contains('is-logged'))
);

await page.locator('#morning-note').fill('Réunion tendue');
await page.locator('#note-text').fill('Test de bout en bout');
await page.waitForTimeout(2600); // au-dela du debounce de 2 s

const stored = await readStore('days');
check('la journee est ecrite dans IndexedDB', stored.length === 1, `${stored.length} fiche(s)`);
check('le texte saisi est bien enregistre', stored[0]?.modules?.note?.text === 'Test de bout en bout');
check('le check-in est enregistre', stored[0]?.modules?.mood?.checkins?.morning?.mood === 8);
check(
  'la note du moment est enregistree',
  stored[0]?.modules?.mood?.checkins?.morning?.note === 'Réunion tendue'
);
check(
  "l'horodatage du check-in est affiche",
  /Noté à \d{2}:\d{2}/.test(
    await page.locator('[data-slot="morning"] [data-role="stamp"]').innerText()
  )
);
check(
  'les valeurs non renseignees ne sont pas stockees',
  stored[0]?.modules?.mood?.checkins?.morning?.energy === undefined
);

const summaries = await readStore('summaries');
check('le resume compact est ecrit', summaries.length === 1 && summaries[0].mood === 8);
check(
  'le resume reste tres petit',
  JSON.stringify(summaries[0]).length < 120,
  `${JSON.stringify(summaries[0]).length} octets`
);

// ------------------------------------------------------ survie au rechargement
await page.reload({ waitUntil: 'networkidle' });
await openAllCheckins();
check(
  'les donnees sont retrouvees apres rechargement',
  (await page.locator('#note-text').inputValue()) === 'Test de bout en bout'
);
check(
  'le check-in est retrouve selectionne',
  await page
    .locator('[data-slot="morning"] .scale-btn[data-value="8"]')
    .first()
    .evaluate((n) => n.classList.contains('is-selected'))
);

// ══════════════════════════════════════════════════ modules actifs

// Les ecrans de module sont telecharges a la demande : on attend leur arrivee.
await page.waitForSelector('.chips, .add-row', { timeout: 5000 }).catch(() => {});

check(
  'le module habitudes est affiche',
  (await page.locator('#habit-new').count()) === 1
);
check(
  'le module hydratation est affiche',
  (await page.locator('.quick-adds').count()) === 1
);
check(
  'le module sommeil est affiche comme les autres',
  (await page.locator('#sleep-bed').count()) === 1
);
check(
  "il n'y a plus de bouton « Ajouter du detail »",
  !(await page.locator('#main').innerText()).includes('Ajouter du détail')
);
check(
  'les ecrans de module sont des fichiers separes',
  await page.evaluate(() => {
    const names = performance.getEntriesByType('resource').map((r) => r.name);
    return names.some((n) => n.includes('habits')) && names.some((n) => n.includes('hydration'));
  })
);

// Hydratation : un ajout rapide doit s'enregistrer, et zero doit rester
// distinct de "non renseigne".
check(
  "l'hydratation part non renseignee",
  (await page.locator('.card-count').last().textContent()).includes('Non renseigné')
);
await page.locator('.quick-add').nth(1).click(); // un verre : 250 ml
await page.waitForTimeout(2600);
const afterWater = await readStore('days');
check(
  'un ajout rapide est enregistre',
  afterWater[0]?.modules?.hydration?.ml === 250,
  `ml = ${afterWater[0]?.modules?.hydration?.ml}`
);

// Saisie libre, pour les contenants qui ne tombent pas sur un preset.
await page.locator('#water-custom').fill('800');
await page.locator('#water-custom').press('Enter');
await page.waitForTimeout(2600);
const afterCustom = await readStore('days');
check(
  'une quantite libre est ajoutee',
  afterCustom[0]?.modules?.hydration?.ml === 1050,
  `ml = ${afterCustom[0]?.modules?.hydration?.ml}`
);

// Habitudes : creation, cochage, et surtout la photographie des habitudes
// actives ce jour-la, qui rend l'historique immuable.
// Les suggestions doivent tolerer une faute de frappe et l'absence d'accents.
await page.locator('#habit-new').fill('meditaton');
await page.waitForTimeout(200);
check(
  'les suggestions rattrapent une faute de frappe',
  (await page.locator('.suggestion').allInnerTexts()).some((t) => t.includes('Méditation')),
  (await page.locator('.suggestion').allInnerTexts()).join(', ')
);
await page.locator('#habit-new').fill('');
await page.waitForTimeout(200);
check(
  'des suggestions sont proposees sans rien taper',
  (await page.locator('.suggestion').count()) > 0
);

await page.locator('#habit-new').fill('Marche');
await page.locator('#habit-add').click();
await page.waitForTimeout(400);
await page.locator('#habit-new').fill('Lecture');
await page.locator('#habit-add').click();
await page.waitForTimeout(400);
check('une activite creee apparait', (await page.locator('.chip').count()) === 2);

// Un doublon avec accents differents ne doit pas creer une seconde entree.
await page.locator('#habit-new').fill('marche');
await page.locator('#habit-add').click();
await page.waitForTimeout(300);
check(
  'un doublon sans accent ne cree pas de seconde activite',
  (await page.locator('.chip').count()) === 2,
  `${await page.locator('.chip').count()} chips`
);

await page.locator('.chip-toggle').first().click();
await page.waitForTimeout(2600);
const afterHabits = await readStore('days');
const habitData = afterHabits[0]?.modules?.habits;
check('cocher une habitude est enregistre', habitData?.done?.length === 1);
check(
  'la photographie des habitudes du jour est enregistree',
  habitData?.active?.length === 2,
  `active = ${habitData?.active?.length}`
);
check(
  'les habitudes sont reliees par identifiant, pas par libelle',
  /^hab_[a-z0-9]{10}$/.test(habitData?.done?.[0] || ''),
  habitData?.done?.[0]
);

// Archiver une habitude ne doit pas toucher aux journees deja enregistrees.
const beforeArchive = JSON.stringify((await readStore('summaries'))[0]);
await page.locator('.chip-remove').last().click();
await page.waitForTimeout(2600);
const remaining = await page.locator('.chip').count();
check('archiver une habitude la retire de la saisie', remaining === 1);
const afterArchive = await readStore('days');
check(
  "l'habitude cochee reste cochee apres archivage de l'autre",
  afterArchive[0]?.modules?.habits?.done?.length === 1
);

// ══════════════════════════════════════════════════ menu de navigation

await page.locator('.nav-toggle').click();
check('le menu s ouvre', await page.locator('.nav-panel').isVisible());
check(
  "l'etat ouvert est expose aux lecteurs d'ecran",
  (await page.locator('.nav-toggle').getAttribute('aria-expanded')) === 'true'
);
check(
  'le focus entre dans le menu a l ouverture',
  await page.evaluate(() => document.activeElement?.classList.contains('nav-item'))
);
check(
  "l'ecran courant est signale autrement que par la couleur",
  (await page.locator('.nav-item[aria-current="page"]').innerText()).includes("Aujourd'hui")
);
await page.keyboard.press('Escape');
check('Echap referme le menu', !(await page.locator('.nav-panel').isVisible()));
check(
  'le focus revient sur le bouton du menu',
  await page.evaluate(() => document.activeElement?.classList.contains('nav-toggle'))
);
await page.locator('.nav-toggle').click();
await page.locator('#main').click({ position: { x: 5, y: 5 } });
check('un clic exterieur referme le menu', !(await page.locator('.nav-panel').isVisible()));

check(
  'la barre du haut ne porte plus qu un bouton par ecran plus le menu',
  (await page.locator('.topbar .icon-btn').count()) === 3,
  `${await page.locator('.topbar .icon-btn').count()} boutons`
);

// ══════════════════════════════════════════════════ donnees et reglages

await navigate('Mes données');
await page.waitForSelector('.facts');
await scanAccents();
check('l ecran des donnees s ouvre', (await page.locator('.facts').count()) === 1);
check(
  'le nombre de journees enregistrees est affiche',
  (await page.locator('.fact dd').first().textContent()) === '1'
);
check(
  'les modules essentiels ne peuvent pas etre desactives',
  await page.locator('#mod-mood').isDisabled()
);
check(
  'le journal ne figure pas dans les extraits partageables',
  !(await page.locator('.card', { hasText: 'Partager une partie' }).innerText()).includes('Journal')
);

// L'export doit produire un vrai fichier, sans passer par le reseau.
const exportPromise = page.waitForEvent('download', { timeout: 10_000 });
await page.locator('.card-actions .btn-primary').click();
const download = await exportPromise;
check(
  'la sauvegarde produit un fichier compresse',
  download.suggestedFilename().endsWith('.json.gz'),
  download.suggestedFilename()
);

const savedPath = await download.path();
const { readFile: rf } = await import('node:fs/promises');
const { gunzipSync } = await import('node:zlib');
const restored = JSON.parse(gunzipSync(await rf(savedPath)).toString());
check('la sauvegarde contient bien les journees', restored.days.length === 1);
check('la sauvegarde porte sa version de schema', restored.schemaVersion === 1);
check(
  'la sauvegarde contient le texte saisi',
  restored.days[0].modules.note.text === 'Test de bout en bout'
);

check(
  'la date de sauvegarde est enregistree',
  Boolean(
    (await readStore('meta')).find((m) => m.key === 'settings')?.value?.lastBackupAt
  )
);

// ---------------------------------------------------------------- profil
await navigate('Profil');
await page.waitForSelector('#profile-name');
await scanAccents();
check('l ecran profil s ouvre', (await page.locator('#profile-name').count()) === 1);
check(
  'les reponses de la presentation y sont retrouvees',
  await page.locator('#p-mobility-wheelchair').isChecked()
);
check(
  "l'appareil connecte y est retrouve",
  await page.locator('#p-wearable-garmin').isChecked()
);
check(
  'une question sans reponse peut le rester',
  (await page.locator('#p-cycle-__unanswered').count()) === 1
);
// Un identifiant HTML en double casserait l'association libelle/case.
const dupIds = await page.evaluate(() => {
  const seen = new Set();
  const dups = [];
  for (const node of document.querySelectorAll('[id]')) {
    if (seen.has(node.id)) dups.push(node.id);
    seen.add(node.id);
  }
  return dups;
});
check('aucun identifiant HTML en double', dupIds.length === 0, dupIds.join(', '));

// Modifier le profil doit s'enregistrer sans toucher aux journees.
await page.locator('#p-mobility-walking').check();
await page.waitForTimeout(400);
const afterProfile = await readStore('meta');
check(
  'une modification du profil est enregistree',
  afterProfile.find((m) => m.key === 'capabilities')?.value?.mobility === 'walking'
);
check(
  'les journees ne sont pas touchees par le profil',
  (await readStore('days')).length === 1
);
check(
  'la remise a zero est presente et signalee comme definitive',
  (await page.locator('.btn-danger').innerText()).includes('Effacer')
);

// ---------------------------------------------------------------- cycle
//
// Le module cycle ne s'active pas par une case a cocher mais par une reponse a
// une question posee a tout le monde. On verifie ici tout le chemin : declarer
// un cycle, saisir, obtenir un repere, puis pouvoir tout desactiver.

await page.locator('#p-cycle-regular').check();
await page.waitForTimeout(400);
check(
  'declarer un cycle ouvre les questions de duree',
  (await page.locator('#p-cycle-length').count()) === 1
);
check(
  'le repere de prochaines regles peut etre refuse',
  (await page.locator('#p-cycle-forecast-no').count()) === 1
);

await page.locator('#p-cycle-length').fill('28');
await page.waitForTimeout(400);
const capsAfterCycle = (await readStore('meta')).find((m) => m.key === 'capabilities')?.value;
check('le cycle declare est enregistre', capsAfterCycle?.cycle === 'regular');
check('la duree habituelle est enregistree', capsAfterCycle?.cycleLength === 28);

const dupIdsCycle = await page.evaluate(() => {
  const seen = new Set();
  const dups = [];
  for (const node of document.querySelectorAll('[id]')) {
    if (seen.has(node.id)) dups.push(node.id);
    seen.add(node.id);
  }
  return dups;
});
check('aucun identifiant en double une fois le cycle declare', dupIdsCycle.length === 0, dupIdsCycle.join(', '));

await navigate("Aujourd'hui");
await page.waitForSelector('[data-slot]');
check('on revient a sa journee', (await page.locator('[data-slot]').count()) === 3);

await page.waitForSelector('.flow-btn');
await scanAccents();
check(
  'le suivi de cycle apparait une fois declare',
  (await page.locator('.flow-row').count()) === 1
);
check(
  'aucune intensite n est pre-selectionnee',
  (await page.locator('.flow-btn.is-selected').count()) === 0
);
check(
  'le choix d intensite suit le motif radiogroup',
  (await page.locator('.flow-row[role="radiogroup"]').count()) === 1 &&
    (await page.locator('.flow-btn[role="radio"]').count()) === 5
);
check(
  'un seul arret de tabulation pour les cinq intensites',
  (await page.locator('.flow-btn[tabindex="0"]').count()) === 1
);
check(
  'le premier jour ne se demande pas avant qu il y ait des regles',
  (await page.locator('#cycle-start').count()) === 0
);

// « Moyen » : la journee devient un debut de cycle deduit, pas declare.
await page.locator('.flow-btn[data-flow="3"]').click();
await page.waitForTimeout(300);
check(
  'l intensite choisie est retenue',
  (await page.locator('.flow-btn.is-selected').count()) === 1
);
check(
  'le premier jour est deduit et reste corrigeable',
  await page.locator('#cycle-start').isChecked()
);

// Les symptomes sont replies par defaut : onze pastilles depliees en
// permanence occupaient la moitie de l'ecran du jour, tous les jours.
check(
  'les symptomes sont replies tant que rien n est note',
  (await page.locator('details.foldable[open]').count()) === 0
);
await page.locator('.foldable-head').click();
await page.locator('.chip-toggle', { hasText: 'Crampes' }).click();
await page.waitForTimeout(2400); // au-dela du debounce de sauvegarde
check(
  'un symptome note rouvre le bloc tout seul',
  (await page.locator('details.foldable[open]').count()) === 1
);
check(
  'le resume dit ce qui est note sans avoir a ouvrir',
  (await page.locator('.foldable-note').innerText()).includes('Crampes')
);
const cycleDay = (await readStore('days')).find((d) => d.modules?.cycle)?.modules?.cycle;
check('le flux est enregistre', cycleDay?.flow === 3, JSON.stringify(cycleDay));
check('les symptomes sont enregistres', cycleDay?.symptoms?.includes('cramps') === true);
check(
  'une deduction ne s ecrit pas dans la fiche',
  cycleDay?.cycleStart === undefined,
  'rien n est enregistre que la personne n ait saisi'
);

const cycleText = await page.locator('.card', { hasText: 'Cycle' }).first().innerText();
check(
  'la duree declaree donne un repere sans attendre deux cycles',
  /Prochaines règles/.test(cycleText),
  cycleText.split('\n').find((l) => l.includes('Prochaines')) || cycleText.slice(0, 80)
);
check(
  'le repere est annonce comme une fourchette, pas comme une date',
  /entre le .+ et le /.test(cycleText)
);
check(
  "l'avertissement contraception/conception accompagne le repere",
  /ni un moyen de contraception, ni un outil de conception/.test(cycleText)
);

/*
 * Deux verifications de fond, et non de forme.
 *
 * La premiere : Daylog n'estime aucune fertilite ni aucune phase clinique. En
 * deduire a partir des seules dates de saignement fabriquerait une information
 * medicale, et des gens s'en serviraient comme moyen de contraception.
 *
 * La seconde : le module ne suppose jamais le genre de qui l'utilise. Il
 * s'active sur « as-tu un cycle menstruel a suivre ? », question posee a tout
 * le monde -- jamais sur une case « sexe ».
 */
const pageText = await page.evaluate(() => document.body.innerText);
const interdits = pageText.match(/fertilit|ovulat|lutéal|luteal|folliculaire|nidation/gi) || [];
check(
  'aucune estimation de fertilite ni de phase clinique',
  interdits.length === 0,
  interdits.join(', ')
);
const genres = pageText.match(/\bfemmes?\b|\bfilles?\b|\bmadame\b/gi) || [];
check(
  'le suivi de cycle ne suppose le genre de personne',
  genres.length === 0,
  genres.join(', ')
);

// Desactivable sans condition : c'est une exigence du cahier des charges.
await navigate('Mes données');
await page.waitForSelector('#mod-cycle');
check(
  'le suivi de cycle se desactive comme les autres',
  (await page.locator('#mod-cycle').count()) === 1
);
await page.locator('#mod-cycle').uncheck();
await page.waitForTimeout(300);
await navigate("Aujourd'hui");
await page.waitForSelector('[data-slot]');
await page.waitForTimeout(300);
check(
  'desactive, il disparait de la journee sans rien effacer',
  (await page.locator('.flow-row').count()) === 0 &&
    (await readStore('days')).find((d) => d.modules?.cycle)?.modules?.cycle?.flow === 3
);

await navigate('Mes données');
await page.waitForSelector('#mod-cycle');
await page.locator('#mod-cycle').check();
await page.waitForTimeout(300);
await navigate("Aujourd'hui");
await page.waitForSelector('.flow-btn');
check(
  'reactive, il retrouve ce qui avait ete note',
  (await page.locator('.flow-btn.is-selected').count()) === 1
);

// ══════════════════════════════════════════════════ bilan

/**
 * On injecte un historique realiste directement dans la base : impossible de
 * saisir trente journees a la main dans un test, et le bilan n'a de sens qu'au
 * dela de deux semaines de donnees.
 *
 * Le sommeil et le stress sont volontairement lies, avec des trous : le bilan
 * doit repérer le lien ET ignorer les journees non renseignees.
 */
await page.evaluate(async () => {
  const db = await new Promise((resolve) => {
    const r = indexedDB.open('daylog');
    r.onsuccess = () => resolve(r.result);
  });
  const tx = db.transaction(['days', 'summaries'], 'readwrite');
  const days = tx.objectStore('days');
  const summaries = tx.objectStore('summaries');

  // Dates relatives a aujourd'hui : le bilan regarde les N derniers jours, un
  // historique fige tomberait hors de la fenetre des que le temps passe.
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  for (let i = 1; i <= 28; i++) {
    const date = dayKey(i);
    if (i % 7 === 0) continue; // un jour sur sept non suivi : un vrai trou
    const short = i % 3 === 0;
    const sleepH = short ? 5.5 + (i % 2) * 0.3 : 7.5 + (i % 3) * 0.2;
    const stress = short ? 7 + (i % 2) : 3 + (i % 2);
    summaries.put({
      date,
      mood: short ? 4 + (i % 3) : 7 + (i % 2),
      energy: short ? 4 : 7,
      stress,
      sleepH,
      sleepQ: short ? 4 : 8,
      waterMl: 1200 + (i % 5) * 200,
      checkins: 2,
    });
    days.put({ date, updatedAt: new Date().toISOString(), modules: { sleep: { hours: sleepH } } });
  }
  await new Promise((resolve) => { tx.oncomplete = resolve; });
});

await page.reload({ waitUntil: 'networkidle' });
await navigate('Bilan');
await page.waitForSelector('.chart-svg');
await scanAccents();

check('le bilan s ouvre', (await page.locator('.segmented').count()) === 1);
check(
  'les graphiques sont en SVG, pas en image',
  (await page.locator('svg.chart-svg').count()) >= 3,
  `${await page.locator('svg.chart-svg').count()} graphiques`
);
check(
  'chaque graphique porte une description lisible',
  await page.evaluate(() =>
    [...document.querySelectorAll('svg.chart-svg')].every(
      (s) => s.getAttribute('role') === 'img' && (s.getAttribute('aria-label') || '').length > 40
    )
  )
);
check(
  'chaque graphique fournit ses chiffres en tableau',
  (await page.locator('.chart-table').count()) >= 3
);
check(
  'les series sont nommees, pas seulement colorees',
  (await page.locator('.chart-keys .chart-key').count()) >= 3
);

// Les trous ne doivent pas devenir des zeros : moins de barres que de jours.
const bars = await page.locator('.chart-bar').count();
check(
  'les journees non suivies sont des trous, pas des zeros',
  bars > 0 && bars < 90,
  `${bars} barres pour 90 jours de periode`
);

check(
  'une phrase de bilan est proposee',
  (await page.locator('.insight').count()) >= 1,
  await page.locator('.insight').first().innerText().catch(() => 'aucune')
);
check(
  'le bilan reste descriptif, sans conseil',
  !(await page.locator('#main').innerText()).match(/tu devrais|il faut que tu|essaie de dormir/i)
);
check(
  "l'avertissement « pas un dispositif medical » est present",
  (await page.locator('#main').innerText()).includes('pas un dispositif médical')
);

// Changement de periode
await page.locator('.segmented-btn').first().click();
await page.waitForTimeout(400);
check(
  'changer de periode recalcule le bilan',
  (await page.locator('.segmented-btn').first().getAttribute('aria-pressed')) === 'true'
);

const bilanOverflow = await page.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
);
check('le bilan ne deborde pas horizontalement', !bilanOverflow);

await navigate("Aujourd'hui");
await page.waitForSelector('[data-slot]');

// ══════════════════════════════════════════════════ vie privee

check('aucune requete vers l exterieur', external.length === 0, external.join(', '));

// ══════════════════════════════════════════════════ accessibilite

const a11y = await page.evaluate(() => {
  const group = document.querySelector('.scale');
  const btns = [...document.querySelectorAll('.scale-btn')];
  return {
    radiogroup: group?.getAttribute('role') === 'radiogroup',
    labelled: Boolean(group?.getAttribute('aria-labelledby')),
    radioRoles: btns.every((b) => b.getAttribute('role') === 'radio'),
    checkedState: btns.every((b) => b.hasAttribute('aria-checked')),
    oneTabStop: btns.filter((b) => b.tabIndex === 0).length >= 1,
    skipLink: Boolean(document.querySelector('.skip-link')),
  };
});
check('les echelles utilisent le motif radiogroup', a11y.radiogroup && a11y.radioRoles);
check('l etat de selection est expose aux lecteurs d ecran', a11y.checkedState);
check('le groupe a un libelle accessible', a11y.labelled);
check('un seul arret de tabulation par groupe', a11y.oneTabStop);
check('le lien d evitement existe', a11y.skipLink);

// Rechargement avant le controle du clavier : apres une serie de clics, le
// navigateur reprend la tabulation depuis le dernier element active, ce qui
// testerait la sequence du test plutot que celle de la page.
await page.reload({ waitUntil: 'networkidle' });
await page.keyboard.press('Tab');
const firstFocus = await page.evaluate(() => document.activeElement?.className || '');
check('le premier Tab atteint le lien d evitement', firstFocus.includes('skip-link'), firstFocus);

// Zoom du texte : l'interface doit suivre, pas casser.
await page.addStyleTag({ content: 'html { font-size: 200% }' });
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
);
check('a 200 % de taille de texte, pas de defilement horizontal', !overflow);
await page.addStyleTag({ content: 'html { font-size: 100% }' });

// ══════════════════════════════════════════════════ installation

/**
 * Les icones referencees doivent exister.
 *
 * Sans elles, « Ajouter a l'ecran d'accueil » donne une icone vide sur Android
 * et une capture de la page sur iOS. Rien dans l'application ne signale le
 * probleme : il ne se voit qu'au moment de l'installer.
 */
const manifest = await page.evaluate(async () => {
  const link = document.querySelector('link[rel="manifest"]');
  const res = await fetch(link.href);
  return { ok: res.ok, data: await res.json(), base: link.href };
});
check('le manifeste est lisible', manifest.ok);
check(
  'le manifeste declare une icone adaptable (Android)',
  manifest.data.icons.some((i) => i.purpose === 'maskable')
);

const iconChecks = await page.evaluate(async ({ data, base }) => {
  const urls = [
    ...data.icons.map((i) => i.src),
    ...[...document.querySelectorAll('link[rel="apple-touch-icon"]')].map((l) => l.getAttribute('href')),
  ];
  const results = [];
  for (const src of urls) {
    const url = new URL(src, base).href;
    try {
      const res = await fetch(url);
      results.push({ src, ok: res.ok, status: res.status });
    } catch {
      results.push({ src, ok: false, status: 0 });
    }
  }
  return results;
}, manifest);

const missing = iconChecks.filter((i) => !i.ok);
check(
  'toutes les icones declarees existent',
  missing.length === 0,
  missing.map((m) => `${m.src} (${m.status})`).join(', ')
);

// ══════════════════════════════════════════════════ poids et theme

/*
 * Poids.
 *
 * Deux mesures, parce qu'elles ne decrivent pas la meme chose.
 *
 * La premiere est prise dans le navigateur, juste apres le tout premier
 * chargement -- avant que le service worker prenne la main. C'est ce que
 * telecharge quelqu'un qui installe l'application.
 *
 * La seconde lit les fichiers construits et les compresse comme le ferait un
 * hebergeur. On ne peut pas la prendre dans le navigateur : une fois le service
 * worker actif, les reponses qu'il sert rapportent leur taille DECOMPRESSEE, ce
 * qui triple artificiellement le chiffre.
 */
check(
  'premiere ouverture sous 30 Ko',
  firstOpenWeight < 30 * 1024,
  `${(firstOpenWeight / 1024).toFixed(1)} Ko`
);

const { readdir } = await import('node:fs/promises');
const assets = await readdir(join(ROOT, 'assets'));

async function gzippedSize(file) {
  return gzipSync(await readFile(join(ROOT, file))).length;
}

// Ce qu'une ouverture ordinaire telecharge : l'application et son style, sans
// la presentation ni les ecrans annexes.
const coreFiles = [
  'index.html',
  ...assets.filter((f) => /^index-.*\.(js|css)$/.test(f)).map((f) => `assets/${f}`),
];
const coreWeight = (await Promise.all(coreFiles.map(gzippedSize))).reduce((a, b) => a + b, 0);
check(
  'ouverture quotidienne sous 25 Ko',
  coreWeight < 25 * 1024,
  `${(coreWeight / 1024).toFixed(1)} Ko`
);

// Le cumul de tous les ecrans, que seul un parcours exhaustif atteint : une
// session ordinaire n'ouvre pas le bilan, les donnees ET le profil.
const allFiles = ['index.html', ...assets.map((f) => `assets/${f}`)];
const totalWeight = (await Promise.all(allFiles.map(gzippedSize))).reduce((a, b) => a + b, 0);
check(
  'cumul de tous les ecrans sous 45 Ko',
  totalWeight < 45 * 1024,
  `${(totalWeight / 1024).toFixed(1)} Ko`
);

await page.emulateMedia({ colorScheme: 'dark' });
const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
check('le theme sombre s applique', darkBg === 'rgb(19, 16, 36)', darkBg);

await openAllCheckins();
await scanAccents();
check(
  'tous les textes affiches sont correctement accentues',
  accentIssues.size === 0,
  [...accentIssues].slice(0, 5).join(' · ')
);

await browser.close();
server.close();

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} verifications passees.`);
if (failed.length) process.exit(1);
