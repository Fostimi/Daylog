import { defineConfig } from 'vite';

export default defineConfig({
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
