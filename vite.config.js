import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/*
 * Le numero de version.
 *
 * `0.MINEUR.CORRECTIF` ou le correctif est le NOMBRE REEL DE MODIFICATIONS du
 * depot -- pas un compteur decoratif qu'on incremente au juge. Deux versions
 * differentes signifient donc qu'il s'est reellement passe quelque chose entre
 * les deux, et l'ecart entre deux numeros dit combien.
 *
 * Le mineur, lui, reste dans package.json et se leve a la main aux etapes qui
 * comptent : un module qui arrive, un changement de forme des donnees.
 *
 * Repli sur le seul package.json si git n'est pas disponible -- une archive
 * telechargee, par exemple. Mieux vaut un numero incomplet qu'une construction
 * qui echoue.
 */
const { version: declared } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

function buildVersion() {
  try {
    const commits = execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim();
    const [major, minor] = declared.split('.');
    return `${major}.${minor}.${commits}`;
  } catch {
    return declared;
  }
}

const version = buildVersion();

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },

  // Chemins relatifs : l'app fonctionne aussi bien a la racine d'un domaine que
  // dans un sous-dossier (GitHub Pages, par exemple), sans reconfiguration.
  base: './',

  server: {
    host: true, // accessible depuis le telephone sur le meme reseau
    port: 5173,
  },

  build: {
    target: 'es2022',
    // Le budget est volontairement bas : l'app doit rester utilisable sur un
    // telephone ancien ou presque plein. Tout depassement doit etre justifie.
    chunkSizeWarningLimit: 120,
    rollupOptions: {
      output: {
        // Noms stables pour que le cache du navigateur travaille bien.
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
