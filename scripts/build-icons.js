#!/usr/bin/env node
/**
 * Genere les icones PNG a partir de public/icon.svg.
 *
 * Le manifeste et l'index reclament des PNG : Android en a besoin pour
 * l'installation sur l'ecran d'accueil, et iOS n'accepte pas de SVG comme icone
 * de raccourci. Sans elles, "Ajouter a l'ecran d'accueil" donne une icone vide
 * ou une capture de la page.
 *
 * Aucun convertisseur d'images n'est installe, et on ne va pas en ajouter un
 * pour quatre fichiers : le navigateur deja present pour les tests sait rendre
 * du SVG, on le laisse faire.
 *
 * A relancer apres toute modification du logo :  npm run icons
 */

import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SVG = join(ROOT, 'public', 'icon.svg');

const SIZES = [
  { file: 'icon-180.png', size: 180, inset: 0 }, // apple-touch-icon
  { file: 'icon-192.png', size: 192, inset: 0 },
  { file: 'icon-512.png', size: 512, inset: 0 },
  // Icone « maskable » : Android la recadre en cercle, en losange ou en
  // « squircle » selon le constructeur. Le contenu doit tenir dans les 80 %
  // centraux, sinon il se fait rogner. On le reduit donc, sur un fond plein.
  { file: 'icon-maskable.png', size: 512, inset: 0.2 },
];

const BACKGROUND = '#5b4bc4';

const svg = await readFile(SVG, 'utf-8');
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);

for (const { file, size, inset } of SIZES) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });

  const scale = 1 - inset;
  await page.setContent(
    `<!doctype html><meta charset="utf-8">
     <style>
       html, body { margin: 0; padding: 0; width: ${size}px; height: ${size}px; }
       body { background: ${BACKGROUND}; display: grid; place-items: center; }
       .wrap { width: ${Math.round(size * scale)}px; height: ${Math.round(size * scale)}px; }
       svg { width: 100%; height: 100%; display: block; }
       ${inset ? '.wrap svg rect:first-of-type { display: none; }' : ''}
     </style>
     <div class="wrap">${svg}</div>`,
    { waitUntil: 'load' }
  );

  const png = await page.screenshot({ omitBackground: false });
  await writeFile(join(ROOT, 'public', file), png);
  await page.close();
  console.log(`  ${file.padEnd(20)} ${size}×${size}${inset ? '  (zone sûre 80 %)' : ''}`);
}

await browser.close();
console.log(`\n${SIZES.length} icônes générées dans public/.`);
