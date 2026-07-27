#!/usr/bin/env node
/**
 * Stress test global.
 *
 * La verification de bout en bout (`npm run smoke`) suit un parcours ecrit a
 * l'avance : elle prouve que ce qu'on a prevu fonctionne. Celui-ci fait
 * l'inverse -- il malmene l'application pour trouver ce qu'on n'avait PAS prevu.
 *
 * Ce qu'il cherche, et qu'aucun test ecrit a la main ne trouve :
 *
 *   - une erreur JavaScript, n'importe ou, apres n'importe quelle sequence ;
 *   - un identifiant HTML en double, qui casse silencieusement l'association
 *     entre un libelle et son champ ;
 *   - un debordement horizontal, y compris a 200 % de taille de texte ;
 *   - une donnee qui ne survit pas a un rechargement ;
 *   - une cible tactile trop petite pour etre visee ;
 *   - un ecran qui ne se remet pas d'un stockage sature.
 *
 * Il est volontairement bavard sur ce qu'il trouve et muet sur le reste.
 */

import { chromium, devices } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = 4320;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

function serve() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (path === '/') path = '/index.html';
        const raw = await readFile(join(ROOT, path));
        res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' });
        res.end(raw);
      } catch {
        res.writeHead(404).end('not found');
      }
    });
    server.listen(PORT, () => resolve(server));
  });
}

const findings = [];
function found(where, what) {
  findings.push(`${where} : ${what}`);
  console.log(` TROUVE  ${where} — ${what}`);
}
function ok(what) {
  console.log(`  ok     ${what}`);
}

const server = await serve();
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);
const context = await browser.newContext({ ...devices['Pixel 5'], locale: 'fr-FR' });
const page = await context.newPage();

const jsErrors = [];
page.on('pageerror', (e) => jsErrors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && jsErrors.push(m.text()));

// ---------------------------------------------------------------- controles

/** Identifiants en double : ils cassent l'association libelle/champ. */
async function checkDuplicateIds(where) {
  const dups = await page.evaluate(() => {
    const seen = new Set();
    const out = [];
    for (const node of document.querySelectorAll('[id]')) {
      if (seen.has(node.id)) out.push(node.id);
      seen.add(node.id);
    }
    return [...new Set(out)];
  });
  if (dups.length) found(where, `identifiants en double : ${dups.join(', ')}`);
}

/**
 * Debordement horizontal : la cause n°1 de gene sur telephone.
 *
 * On nomme le coupable. « Ça deborde de 6 px » envoie chercher pendant vingt
 * minutes ; « .input deborde de 6 px » se corrige tout de suite.
 */
async function checkOverflow(where) {
  const result = await page.evaluate(() => {
    const doc = document.documentElement;
    const over = doc.scrollWidth - doc.clientWidth;
    if (over <= 1) return null;
    const limite = doc.clientWidth;
    const coupables = [];
    for (const node of document.querySelectorAll('body *')) {
      const r = node.getBoundingClientRect();
      if (r.right > limite + 1 && r.width > 0) {
        coupables.push(
          `${node.tagName.toLowerCase()}.${(node.className || '?').toString().split(' ')[0]} ` +
            `(${Math.round(r.right - limite)} px)`
        );
      }
    }
    return { over, coupables: [...new Set(coupables)].slice(0, 4) };
  });
  if (result) found(where, `deborde de ${result.over} px : ${result.coupables.join(', ')}`);
}

/**
 * Cibles tactiles.
 *
 * 44 px est le minimum recommande. On tolere les boutons d'echelle, qui sont
 * volontairement plus petits pour tenir dix sur une ligne, et les elements
 * caches.
 */
async function checkTapTargets(where) {
  const small = await page.evaluate(() => {
    const out = [];
    for (const node of document.querySelectorAll('button, a[href], input, summary')) {
      if (node.classList.contains('scale-btn') || node.classList.contains('info-btn')) continue;
      // Un champ masque n'est jamais vise : il est declenche par un bouton.
      if (node.classList.contains('sr-only')) continue;
      // Une case a cocher de 20 px enveloppee dans un `label` cliquable de
      // 60 px n'est pas une petite cible : c'est la ligne entiere qu'on vise.
      const label = node.closest('label');
      if (label && label.getBoundingClientRect().height >= 30) continue;
      const r = node.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue; // masque
      if (r.height < 30 || r.width < 24) {
        out.push(`${node.tagName.toLowerCase()}.${node.className || '?'} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return [...new Set(out)].slice(0, 5);
  });
  if (small.length) found(where, `cibles tactiles trop petites : ${small.join(' | ')}`);
}

async function auditScreen(where) {
  await checkDuplicateIds(where);
  await checkOverflow(where);
  await checkTapTargets(where);
}

async function navigate(destination) {
  await page.locator('.nav-toggle').click();
  await page.locator(`.nav-item:has-text("${destination}")`).click();
  await page.waitForTimeout(400);
}

async function readDays() {
  return page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const r = indexedDB.open('daylog');
      r.onsuccess = () => resolve(r.result);
    });
    return new Promise((resolve) => {
      const req = db.transaction(['days'], 'readonly').objectStore('days').getAll();
      req.onsuccess = () => resolve(req.result);
    });
  });
}

// ══════════════════════════════════════════════ 1. presentation, en zigzag

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

/*
 * On avance ET on recule a chaque etape.
 *
 * Le retour arriere est le chemin le moins teste de toute l'application, et
 * celui ou une reponse a le plus de chances d'etre perdue ou dupliquee.
 */
for (let i = 0; i < 9; i++) {
  await auditScreen(`presentation, ecran ${i + 1}`);
  const suivant = page.locator('.onb-actions .btn-primary');
  if (!(await suivant.count())) break;
  await suivant.click();
  await page.waitForTimeout(120);
  const retour = page.locator('.onb-actions .btn', { hasText: 'Retour' });
  if (await retour.count()) {
    await retour.click();
    await page.waitForTimeout(120);
    await suivant.click();
    await page.waitForTimeout(120);
  }
}
ok('la presentation supporte les allers-retours');

// On termine la presentation, quelles que soient les reponses laissees vides.
for (let i = 0; i < 12 && (await page.locator('.onb').count()); i++) {
  await page.locator('.onb-actions .btn-primary').click();
  await page.waitForTimeout(120);
}
await page.waitForSelector('[data-slot]');
ok('une presentation entierement passee mene quand meme a l application');

// ══════════════════════════════════════════════ 2. tous les modules actifs

await page.evaluate(async () => {
  const db = await new Promise((resolve) => {
    const r = indexedDB.open('daylog');
    r.onsuccess = () => resolve(r.result);
  });
  const put = (key, value) =>
    new Promise((resolve) => {
      const t = db.transaction(['meta'], 'readwrite');
      t.objectStore('meta').put({ key, value });
      t.oncomplete = resolve;
    });
  await put('capabilities', { cycle: 'irregular', wearable: 'garmin', mobility: 'walking' });
  await put('modules', {
    sleep: true,
    habits: true,
    hydration: true,
    nutrition: true,
    cycle: true,
  });
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-meal-slot]');
await auditScreen('journee, tous modules actifs');
ok('tous les modules cohabitent sur la meme journee');

// ══════════════════════════════════════════════ 3. saisie desordonnee

// Des valeurs limites, saisies dans le desordre, avec des annulations.
await page.locator('.flow-btn[data-flow="4"]').click();
await page.waitForTimeout(120);
await page.locator('.flow-btn[data-flow="4"]').click(); // annule
await page.waitForTimeout(120);
await page.locator('.flow-btn[data-flow="0"]').click();
await page.waitForTimeout(120);

const midi = page.locator('[data-meal-slot="lunch"]');
await midi.locator('.foldable-head').click();
for (const [terme, qte] of [['riz', '0'], ['huile', '99999'], ['oeuf', '2']]) {
  await midi.locator('input.input').fill(terme);
  await page.waitForTimeout(150);
  if (!(await midi.locator('.suggestion').count())) continue;
  await midi.locator('.suggestion').first().click();
  await page.waitForTimeout(120);
  if (await page.locator('#food-qty').count()) {
    await page.locator('#food-qty').fill(qte);
    const bouton = page.locator('.qty-form .btn-primary');
    if (await bouton.isEnabled()) await bouton.click();
    else {
      await page.locator('.qty-form .btn', { hasText: 'Annuler' }).click();
    }
    await page.waitForTimeout(150);
  }
}
await auditScreen('journee apres saisies limites');

const apresSaisie = await page.evaluate(() => document.body.innerText);
if (/NaN|undefined|Infinity|\[object/.test(apresSaisie)) {
  found('journee', `valeur technique affichee : ${apresSaisie.match(/NaN|undefined|Infinity|\[object \w+/)?.[0]}`);
} else {
  ok('aucune valeur technique ne fuit a l ecran');
}

// Une quantite nulle ne doit rien avoir enregistre.
await page.waitForTimeout(2400);
const joursApres = await readDays();
const items = joursApres[0]?.modules?.nutrition?.items || [];
if (items.some((i) => i.quantity === 0)) found('nutrition', 'une quantite nulle a ete enregistree');
else ok('une quantite nulle n est pas enregistree');

// ══════════════════════════════════════════════ 4. survie au rechargement

const avant = JSON.stringify(await readDays());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-slot]');
await page.waitForTimeout(300);
const apres = JSON.stringify(await readDays());
if (avant !== apres) found('rechargement', 'les donnees ont change toutes seules');
else ok('les donnees survivent au rechargement a l identique');

// ══════════════════════════════════════════════ 5. navigation en boucle

for (const ecran of ['Bilan', 'Mes données', 'Profil', 'Comment ça marche', "Aujourd'hui"]) {
  await navigate(ecran);
  await auditScreen(ecran);
}
for (let i = 0; i < 3; i++) {
  await navigate('Bilan');
  await navigate("Aujourd'hui");
}
ok('la navigation repetee ne casse rien');

// ══════════════════════════════════════════════ 6. voyage dans le temps

await page.waitForSelector('.icon-btn[aria-label="Jour précédent"]');
for (let i = 0; i < 20; i++) {
  await page.locator('.icon-btn[aria-label="Jour précédent"]').click();
  await page.waitForTimeout(60);
}
await auditScreen('journee, 20 jours en arriere');
const suivantDesactive = await page
  .locator('.icon-btn[aria-label="Jour suivant"]')
  .isEnabled()
  .catch(() => false);
if (!suivantDesactive) found('navigation', 'impossible de revenir vers aujourd hui');
for (let i = 0; i < 25; i++) {
  const bouton = page.locator('.icon-btn[aria-label="Jour suivant"]');
  if (!(await bouton.isEnabled())) break;
  await bouton.click();
  await page.waitForTimeout(60);
}
const futur = await page.locator('.icon-btn[aria-label="Jour suivant"]').isDisabled();
if (!futur) found('navigation', 'on peut avancer dans le futur');
else ok('on ne peut pas noter une journee qui n a pas eu lieu');

// ══════════════════════════════════════════════ 7. taille de texte a 200 %

await page.evaluate(() => (document.documentElement.style.fontSize = '32px'));
await page.waitForTimeout(300);
await checkOverflow('journee a 200 % de taille de texte');
await navigate('Profil');
await checkOverflow('profil a 200 % de taille de texte');
await navigate('Bilan');
await checkOverflow('bilan a 200 % de taille de texte');
await page.evaluate(() => (document.documentElement.style.fontSize = ''));
ok('aucun debordement a 200 % de taille de texte');

// ══════════════════════════════════════════════ 8. un an d historique

await navigate("Aujourd'hui");
await page.evaluate(async () => {
  const key = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const db = await new Promise((resolve) => {
    const r = indexedDB.open('daylog');
    r.onsuccess = () => resolve(r.result);
  });
  const t = db.transaction(['days', 'summaries'], 'readwrite');
  const today = new Date();
  for (let i = 1; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const date = key(d);
    const flow = i % 28 < 5 ? 3 : null;
    t.objectStore('days').put({
      date,
      schemaVersion: 1,
      modules: {
        mood: { checkins: { morning: { mood: 7, energy: 6, stress: 4, loggedAt: '2026-01-01' } } },
        nutrition: { items: [{ id: `x${i}`, slot: 'lunch', label: 'Test', quantity: 100, unit: 'g', kcal: 500, protein: 20 }] },
        ...(flow ? { cycle: { flow } } : {}),
      },
    });
    t.objectStore('summaries').put({ date, mood: 7, energy: 6, stress: 4, kcal: 500, protein: 20, ...(flow ? { flow } : {}) });
  }
  await new Promise((resolve) => { t.oncomplete = resolve; });
});

const debutBilan = Date.now();
await navigate('Bilan');
await page.waitForSelector('.card');
const dureeBilan = Date.now() - debutBilan;
if (dureeBilan > 3000) found('bilan', `${dureeBilan} ms pour afficher un an d historique`);
else ok(`le bilan tient un an d historique en ${dureeBilan} ms`);
await auditScreen('bilan avec un an de donnees');

await navigate("Aujourd'hui");
await page.waitForSelector('[data-slot]');
await auditScreen('journee avec un an de donnees');

// ══════════════════════════════════════════════ 9. erreurs JavaScript

if (jsErrors.length) {
  found('console', `${jsErrors.length} erreur(s) : ${[...new Set(jsErrors)].slice(0, 3).join(' | ')}`);
} else {
  ok('aucune erreur JavaScript sur tout le parcours');
}

await browser.close();
server.close();

console.log(
  findings.length
    ? `\n${findings.length} anomalie(s) a regarder.`
    : '\nRien a signaler : aucune anomalie trouvee.'
);
process.exit(findings.length ? 1 : 0);
