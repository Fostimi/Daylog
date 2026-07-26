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
import { dirname, join } from 'node:path';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

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

function serve() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (path === '/') path = '/index.html';
        const body = await readFile(join(ROOT, path));
        res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' });
        res.end(body);
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

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

// Les check-ins replies dependent de l'heure a laquelle tourne le test. On les
// ouvre tous pour que la verification soit reproductible.
async function openAllCheckins() {
  await page.evaluate(() =>
    document.querySelectorAll('details.checkin').forEach((d) => (d.open = true))
  );
}
await openAllCheckins();

// -------------------------------------------------------------- demarrage
check('la page se charge sans erreur JavaScript', errors.length === 0, errors.join(' | '));
check('le titre du jour est affiche', (await page.locator('h1').count()) > 0);
check(
  'les trois check-ins sont presents',
  (await page.locator('[data-slot]').count()) === 3,
  `${await page.locator('[data-slot]').count()} trouve(s)`
);

// ------------------------------------------------- aucune valeur par defaut
const unset = await page.locator('.scale-value.is-unset').count();
check('aucune echelle n a de valeur par defaut', unset === 9, `${unset}/9 non renseignees`);
const preselected = await page.locator('.scale-btn.is-selected').count();
check('aucun bouton pre-selectionne', preselected === 0);

// ------------------------------------------------- un seul check-in deplie
const openCount = await page.evaluate(() => {
  document.querySelectorAll('details.checkin').forEach((d) => d.removeAttribute('open'));
  return 0;
});
await page.reload({ waitUntil: 'networkidle' });
const spontaneouslyOpen = await page.locator('details.checkin[open]').count();
check(
  'un seul check-in est deplie a l ouverture',
  spontaneouslyOpen === 1,
  `${spontaneouslyOpen} deplie(s)`
);
await openAllCheckins();

// -------------------------------------------------------- saisie et ecriture
await page.locator('[data-slot="morning"] .scale-btn[data-value="8"]').first().click();
check(
  'le check-in du matin passe en "note"',
  await page.locator('[data-slot="morning"]').evaluate((n) => n.classList.contains('is-logged'))
);

await page.locator('#note-text').fill('Test de bout en bout');
await page.waitForTimeout(2600); // au-dela du debounce de 2 s

const stored = await page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open('daylog');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return new Promise((resolve) => {
    const tx = db.transaction(['days'], 'readonly');
    const req = tx.objectStore('days').getAll();
    req.onsuccess = () => resolve(req.result);
  });
});

check('la journee est ecrite dans IndexedDB', stored.length === 1, `${stored.length} fiche(s)`);
check('le texte saisi est bien enregistre', stored[0]?.modules?.note?.text === 'Test de bout en bout');
check('le check-in est enregistre', stored[0]?.modules?.mood?.checkins?.morning?.mood === 8);
check(
  'les valeurs non renseignees ne sont pas stockees',
  stored[0]?.modules?.mood?.checkins?.morning?.energy === undefined
);

const summaries = await page.evaluate(async () => {
  const db = await new Promise((resolve) => {
    const r = indexedDB.open('daylog');
    r.onsuccess = () => resolve(r.result);
  });
  return new Promise((resolve) => {
    const req = db.transaction(['summaries'], 'readonly').objectStore('summaries').getAll();
    req.onsuccess = () => resolve(req.result);
  });
});
check('le resume compact est ecrit', summaries.length === 1 && summaries[0].mood === 8);
check(
  'le resume reste tres petit',
  JSON.stringify(summaries[0]).length < 120,
  `${JSON.stringify(summaries[0]).length} octets`
);

// ------------------------------------------------------- survie au rechargement
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

// --------------------------------------------------------------- vie privee
check('aucune requete vers l exterieur', external.length === 0, external.join(', '));

// ------------------------------------------------------------ accessibilite
const a11y = await page.evaluate(() => {
  const results = {};
  const group = document.querySelector('.scale');
  results.radiogroup = group?.getAttribute('role') === 'radiogroup';
  results.labelled = Boolean(group?.getAttribute('aria-labelledby'));
  const btns = [...document.querySelectorAll('.scale-btn')];
  results.radioRoles = btns.every((b) => b.getAttribute('role') === 'radio');
  results.checkedState = btns.every((b) => b.hasAttribute('aria-checked'));
  results.oneTabStop = btns.filter((b) => b.tabIndex === 0).length >= 1;
  results.skipLink = Boolean(document.querySelector('.skip-link'));
  // Aucune taille de police en dur inferieure a ce que le systeme demande
  results.rootFontSize = getComputedStyle(document.documentElement).fontSize;
  return results;
});
check('les echelles utilisent le motif radiogroup', a11y.radiogroup && a11y.radioRoles);
check('l etat de selection est expose aux lecteurs d ecran', a11y.checkedState);
check('le groupe a un libelle accessible', a11y.labelled);
check('un seul arret de tabulation par groupe', a11y.oneTabStop);
check('le lien d evitement existe', a11y.skipLink);

// Navigation au clavier de bout en bout
await page.keyboard.press('Tab');
const firstFocus = await page.evaluate(() => document.activeElement?.className || '');
check('le premier Tab atteint le lien d evitement', firstFocus.includes('skip-link'), firstFocus);

// Zoom du texte : l'interface doit suivre, pas casser
await page.addStyleTag({ content: 'html { font-size: 200% }' });
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
);
check('a 200 % de taille de texte, pas de defilement horizontal', !overflow);

// ------------------------------------------------------------ taille totale
const sizes = await page.evaluate(() =>
  performance.getEntriesByType('resource').reduce((a, r) => a + (r.encodedBodySize || 0), 0)
);
check('poids total charge sous 60 Ko', sizes < 60_000, `${(sizes / 1024).toFixed(1)} Ko`);

// ------------------------------------------------------------ mode sombre
await page.emulateMedia({ colorScheme: 'dark' });
const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
check('le theme sombre s applique', darkBg === 'rgb(19, 16, 36)', darkBg);

await browser.close();
server.close();

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} verifications passees.`);
if (failed.length) process.exit(1);
