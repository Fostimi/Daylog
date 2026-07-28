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
  await put('capabilities', {
    cycle: 'irregular',
    wearable: 'garmin',
    mobility: 'walking',
    treatment: true,
    // Toutes les mesures a la fois : le pire cas d'encombrement de l'ecran,
    // celui que personne ne choisira mais qui doit tenir quand meme.
    healthTracks: ['weight', 'bodyFat', 'temp', 'bp', 'spo2', 'bpmRest', 'bpmMin', 'bpmMax'],
  });
  await put('modules', {
    sleep: true,
    habits: true,
    hydration: true,
    nutrition: true,
    cycle: true,
    health: true,
    activity: true,
    money: true,
  });
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-meal-slot]');
await page.waitForSelector('#health-m-weight');
await auditScreen('journee, tous modules actifs');
ok('tous les modules cohabitent sur la meme journee');

// ══════════════════════════════════════════════ 2 bis. saisies de sante

/*
 * Ce que cherche cette section : une mesure refusee qui laisse malgre tout une
 * trace enregistree, et un libelle saisi a la main qui casse la mise en page.
 *
 * Les deux sont passes tres pres. Un nom de traitement est du texte libre :
 * « Hydroxychloroquine » n'offre aucun point de coupure, et un mot plus long
 * que la ligne deborde sans qu'aucun ELEMENT ne depasse -- un defilement
 * horizontal dont le controle habituel ne trouve jamais le coupable.
 */
async function fill(selector, value) {
  await page.locator(selector).fill(value);
  await page.locator(selector).blur();
  await page.waitForTimeout(150);
}

// Des virgules oubliees, une tension a l'envers, des zeros.
await fill('#health-m-temp', '370');
await fill('#health-m-weight', '0');
await fill('#health-bp-sys', '80');
await fill('#health-bp-dia', '120');
await auditScreen('sante apres saisies refusees');

// Puis les memes, correctes.
await fill('#health-m-temp', '37.2');
await fill('#health-m-weight', '72.4');
await fill('#health-bp-sys', '118');
await fill('#health-bp-dia', '76');

const refuses = await page.locator('.field-error').count();
if (refuses) found('sante', `${refuses} refus persiste apres correction`);
else ok('un refus de saisie disparait des que la valeur devient correcte');

// Un nom de traitement volontairement long et insecable.
await page.locator('summary:has-text("Ajouter un traitement")').click();
await page.waitForTimeout(150);
await page.locator('#health-trt-name').fill('Hydroxychloroquine');
await page.locator('#health-trt-dose').fill('200');
await page.locator('.btn-primary:has-text("Ajouter le traitement")').click();
await page.waitForTimeout(400);
await page.locator('input[id^="health-take-"]').first().check();
await page.waitForTimeout(200);
await auditScreen('sante avec un traitement au nom interminable');

await page.waitForTimeout(2400);
const santeJour = (await readDays())[0]?.modules?.health || {};
if (santeJour.temp === 370 || santeJour.weight === 0) {
  found('sante', 'une mesure refusee a quand meme ete enregistree');
} else if (santeJour.temp !== 37.2 || santeJour.weight !== 72.4) {
  found('sante', `les mesures corrigees n ont pas ete enregistrees : ${JSON.stringify(santeJour)}`);
} else {
  ok('une mesure refusee ne laisse aucune trace, la correction est enregistree');
}

// La prise porte ses valeurs figees : sans elles, un extrait partage ne
// contiendrait que des identifiants illisibles.
const prise = santeJour.doses?.[0];
if (!prise?.label || prise.dose !== 200) {
  found('sante', `la prise ne porte pas ses valeurs figees : ${JSON.stringify(prise)}`);
} else {
  ok('une prise de traitement fige son libelle et sa dose');
}

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

// ══════════════════════════════════════ 3 ter. activite physique

/*
 * Ce que cherche cette section : un formulaire qui se referme sous les doigts.
 *
 * Les champs proposes dependent de l'activite choisie -- une seance de natation
 * n'a pas de denivele -- donc choisir une activite redessine la carte. La
 * premiere version refermait le formulaire et effacait la duree deja tapee,
 * juste avant de demander les series et les repetitions.
 */
await page.locator('summary:has-text("Ajouter une séance")').click();
await page.waitForTimeout(150);
await page.locator('#activity-new-min').fill('45');
await page.selectOption('#activity-new-kind', 'strength');
await page.waitForTimeout(250);

const dureeGardee = await page.locator('#activity-new-min').inputValue().catch(() => '');
const champVisible = await page.locator('#activity-new-min').isVisible().catch(() => false);
if (!champVisible) found('activite', 'changer d activite referme le formulaire en cours de saisie');
else if (dureeGardee !== '45') found('activite', `la duree deja tapee est perdue : « ${dureeGardee} »`);
else ok('changer d activite ne referme pas le formulaire ni n efface la saisie');

await page.locator('#activity-new-sets').fill('4');
await page.locator('#activity-new-reps').fill('10');
await page.locator('.btn-primary:has-text("Ajouter la séance")').click();
await page.waitForTimeout(400);

await fill('#activity-move', '4.2');
await auditScreen('activite avec une seance');

// Une duree impossible ne doit rien enregistrer.
await page.locator('#activity-new-min').fill('99999');
await page.locator('.btn-primary:has-text("Ajouter la séance")').click();
await page.waitForTimeout(300);

await page.waitForTimeout(2400);
const bouge = (await readDays())[0]?.modules?.activity || {};
if ((bouge.sessions || []).length !== 1) {
  found('activite', `${(bouge.sessions || []).length} seance(s) enregistree(s) au lieu d une`);
} else if (bouge.meters !== 4200) {
  found('activite', `distance enregistree : ${bouge.meters} au lieu de 4200 m`);
} else {
  ok('une seance impossible n est pas enregistree, la distance l est');
}

// ══════════════════════════════════════════ 3 quater. argent

/*
 * Ce que cherche cette section : une balance qui ne tombe pas juste, et un
 * virement compte comme un revenu.
 *
 * Les deux se voient tout de suite a l'ecran et jamais dans un test unitaire
 * ecrit apres coup : le premier parce qu'il faut plusieurs saisies pour que la
 * virgule flottante derape, le second parce qu'il demande de lire trois
 * chiffres a la fois.
 */
await page.locator('#money-amount').fill('12,50');
await page.locator('.btn-primary:has-text("Ajouter la ligne")').click();
await page.waitForTimeout(250);

// Un remboursement recu : il doit bouger la balance sans devenir un revenu.
await page.locator('.flow-btn:has-text("Virement")').click();
await page.waitForTimeout(200);
await page.locator('#money-amount').fill('5');
await page.locator('#money-dir-in').check();
await page.locator('.btn-primary:has-text("Ajouter la ligne")').click();
await page.waitForTimeout(250);

// Une saisie impossible ne doit rien ajouter.
await page.locator('.flow-btn:has-text("Dépense")').click();
await page.waitForTimeout(200);
await page.locator('#money-amount').fill('0');
await page.locator('.btn-primary:has-text("Ajouter la ligne")').click();
await page.waitForTimeout(250);

await auditScreen('argent apres trois saisies');

const chiffres = await page.evaluate(() => {
  const lire = (nom) => {
    for (const f of document.querySelectorAll('.fact')) {
      if (f.querySelector('dt')?.textContent.trim() === nom) {
        return f.querySelector('dd')?.textContent.trim() || null;
      }
    }
    return null;
  };
  return { depense: lire('Dépensé'), recu: lire('Reçu'), balance: lire('Balance') };
});

// 12,50 depenses, 5 rembourses : depense 12,50, recu 0, balance -7,50.
const attenduArgent = { depense: '12,50', recu: '0,00', balance: '−7,50' };
for (const [cle, valeur] of Object.entries(attenduArgent)) {
  const lu = (chiffres[cle] || '').replace(/[^\d,−+-]/g, '');
  if (lu !== valeur) {
    found('argent', `${cle} affiche « ${chiffres[cle]} », attendu « ${valeur} »`);
  }
}
if (chiffres.recu && /5,00/.test(chiffres.recu)) {
  found('argent', 'un remboursement recu a ete compte comme un revenu');
}

await page.waitForTimeout(2400);
const sous = (await readDays())[0]?.modules?.money || {};
if ((sous.entries || []).length !== 2) {
  found('argent', `${(sous.entries || []).length} ligne(s) enregistree(s) au lieu de deux`);
} else if (sous.entries[0].amount !== 1250) {
  found('argent', `montant enregistre : ${sous.entries[0].amount} au lieu de 1250 centimes`);
} else {
  ok('les montants sont stockes en centimes entiers, un zero n est pas enregistre');
}

// ══════════════════════════════════════════════ 4. survie au rechargement

const avant = JSON.stringify(await readDays());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-slot]');
await page.waitForTimeout(300);
const apres = JSON.stringify(await readDays());
if (avant !== apres) found('rechargement', 'les donnees ont change toutes seules');
else ok('les donnees survivent au rechargement a l identique');

// ══════════════════════════════════════════════ 5. navigation en boucle

for (const ecran of ['Semaine', 'Bilan', 'Mes données', 'Profil', 'Comment ça marche', "Aujourd'hui"]) {
  await navigate(ecran);
  await auditScreen(ecran);
}

// ══════════════════════════════════════ 5 bis. la semaine et ses journees

/*
 * Ce que cherche cette section : une bande de sept jours qui n'ouvre pas la
 * bonne journee, et une semaine future accessible.
 *
 * Ouvrir une journee depuis la semaine est le premier morceau d'historique
 * navigable de l'application. S'il se trompe de jour, on ecrit dans la fiche
 * de quelqu'un d'autre -- au sens propre : dans une autre journee que celle
 * qu'on croit avoir sous les yeux.
 */
await navigate('Semaine');
await page.waitForSelector('.week-strip');

const suivanteBloquee = await page
  .locator('.icon-btn[aria-label="Semaine suivante"]')
  .isDisabled()
  .catch(() => false);
if (!suivanteBloquee) found('semaine', 'on peut avancer vers une semaine qui n a pas eu lieu');
else ok('on ne peut pas ouvrir une semaine a venir');

// Les journees a venir de la semaine en cours ne sont pas des boutons.
const futursCliquables = await page.locator('button.week-day.is-future').count();
if (futursCliquables) found('semaine', `${futursCliquables} journee(s) a venir restent cliquables`);

// Reculer, puis ouvrir la premiere journee proposee : elle doit mener a ce
// lundi-la, et pas a aujourd'hui.
await page.locator('.icon-btn[aria-label="Semaine précédente"]').click();
await page.waitForTimeout(400);
const vise = await page.locator('button.week-day').first().getAttribute('aria-label');
await page.locator('button.week-day').first().click();
await page.waitForTimeout(600);

const ouverte = await page.evaluate(() => document.querySelector('.topbar h1')?.textContent || '');
// « Ouvrir lundi 6 juillet » -> on retrouve « 6 juillet » dans le titre du jour.
const attendu = (vise || '').replace(/^Ouvrir \w+ /, '').trim();
if (!attendu || !ouverte.includes(attendu)) {
  found('semaine', `ouvrir « ${vise} » a mene a « ${ouverte} »`);
} else {
  ok('ouvrir une journee depuis la semaine mene bien a cette journee-la');
}
await auditScreen('journee ouverte depuis la semaine');
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
// On revient jusqu'a ce que la fleche se desactive d'elle-meme, sans supposer
// de combien de jours on etait parti : les sections precedentes ouvrent
// desormais des journees quelconques depuis la vue hebdomadaire, et une borne
// fixe ferait echouer ce controle pour une raison qui n'a rien a voir avec lui.
let retours = 0;
for (; retours < 80; retours++) {
  const bouton = page.locator('.icon-btn[aria-label="Jour suivant"]');
  if (!(await bouton.isEnabled())) break;
  await bouton.click();
  await page.waitForTimeout(60);
}
const futur = await page.locator('.icon-btn[aria-label="Jour suivant"]').isDisabled();
if (!futur) found('navigation', `on peut avancer dans le futur (apres ${retours} pas)`);
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
  const t = db.transaction(['days', 'summaries', 'meta'], 'readwrite');
  const today = new Date();
  for (let i = 1; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const date = key(d);
    const flow = i % 28 < 5 ? 3 : null;
    // Une pesee deux jours sur trois, avec le bruit qu'ont les vraies balances :
    // c'est ce qui fait travailler le lissage de la tendance de poids.
    const weight = i % 3 ? Math.round((72 + i * 0.005 + ((i * 7) % 11) * 0.1) * 10) / 10 : null;
    t.objectStore('days').put({
      date,
      schemaVersion: 1,
      modules: {
        mood: { checkins: { morning: { mood: 7, energy: 6, stress: 4, loggedAt: '2026-01-01' } } },
        nutrition: { items: [{ id: `x${i}`, slot: 'lunch', label: 'Test', quantity: 100, unit: 'g', kcal: 2600, protein: 20 }] },
        ...(flow ? { cycle: { flow } } : {}),
        ...(weight ? { health: { weight, bpmRest: 54 } } : {}),
      },
    });
    t.objectStore('summaries').put({
      date, mood: 7, energy: 6, stress: 4, kcal: 2600, protein: 20,
      ...(flow ? { flow } : {}),
      ...(weight ? { weightKg: weight, bpmRest: 54 } : {}),
    });
  }
  // Un profil complet : sans lui, aucun besoin energetique n'est calculable, et
  // le recalage sur les faits ne serait jamais traverse.
  t.objectStore('meta').put({
    key: 'profile',
    value: {
      identity: { name: null, address: 'neutral', gender: 'man' },
      body: { birthYear: new Date().getFullYear() - 30, heightCm: 175, weightKg: 72, calcBasis: 'a' },
      goals: { hasGoal: true, weight: 'lose-slow', activity: 'moderate' },
    },
  });
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

// ══════════════════════════════════════════ 8 bis. recalage sur les faits

/*
 * Le profil vient d'etre ecrit directement dans la base : il faut recharger
 * pour que l'application le lise.
 *
 * Ce que cherche cette section : un recalage qui produirait un chiffre absurde,
 * ou qui changerait la cible sans que rien ne l'explique a l'ecran. Une cible
 * calorique qui bouge toute seule ressemble a un bug, et c'est le genre de
 * chiffre qu'on ne peut pas se permettre de laisser deriver en silence.
 */
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-slot]');
await navigate('Profil');
await page.waitForSelector('.card');
await page.waitForTimeout(400);

const fenetre = await page.evaluate(async () => {
  const db = await new Promise((resolve) => {
    const r = indexedDB.open('daylog');
    r.onsuccess = () => resolve(r.result);
  });
  const rows = await new Promise((resolve) => {
    const q = db.transaction(['summaries'], 'readonly').objectStore('summaries').getAll();
    q.onsuccess = () => resolve(q.result);
  });
  const recents = rows.slice(-120);
  return {
    total: rows.length,
    pesees: recents.filter((r) => typeof r.weightKg === 'number').length,
    repas: recents.filter((r) => typeof r.kcal === 'number').length,
  };
});

const besoins = await page.evaluate(() => {
  const lire = (nom) => {
    for (const f of document.querySelectorAll('.fact')) {
      if (f.querySelector('dt')?.textContent.trim() === nom) {
        return Number(f.querySelector('dd')?.textContent.replace(/[^\d]/g, '')) || null;
      }
    }
    return null;
  };
  return {
    repos: lire('Au repos'),
    depense: lire('Dépense estimée'),
    cible: lire('Cible'),
    note: document.querySelector('.health-trend-main')?.textContent || null,
    // Ce que l'ecran dit quand il ne recale pas : c'est la seule chose qui
    // permette de savoir POURQUOI sans rouvrir le navigateur a la main.
    manque: [...document.querySelectorAll('.card-hint')]
      .map((h) => h.textContent)
      .find((t) => /recalage|pesées|journal/i.test(t)) || null,
    texte: document.body.innerText,
  };
});

if (!besoins.note || !besoins.note.includes('Recalé')) {
  found(
    'recalage',
    `aucune mention du recalage : note=${JSON.stringify(besoins.note)} ` +
      `repos=${besoins.repos} depense=${besoins.depense} cible=${besoins.cible} ` +
      `manque=${JSON.stringify(besoins.manque)} fenetre=${JSON.stringify(fenetre)}`
  );
} else if (!besoins.depense || besoins.depense < 1200 || besoins.depense > 5000) {
  found('recalage', `depense recalee invraisemblable : ${besoins.depense} kcal`);
} else if (besoins.cible && besoins.cible < besoins.repos) {
  found('recalage', `cible ${besoins.cible} sous le metabolisme de base ${besoins.repos}`);
} else {
  ok(`le recalage sur les faits tient : ${besoins.depense} kcal, cible ${besoins.cible}`);
}

if (/NaN|undefined|Infinity|\[object/.test(besoins.texte)) {
  found('recalage', `valeur technique affichee : ${besoins.texte.match(/NaN|undefined|Infinity|\[object \w+/)?.[0]}`);
}
await auditScreen('profil avec un recalage actif');

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
