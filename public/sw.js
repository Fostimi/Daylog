/**
 * Service worker.
 *
 * Son unique role est de rendre l'application utilisable hors connexion, en
 * mettant en cache ses propres fichiers (HTML, CSS, JavaScript).
 *
 * Il ne voit AUCUNE donnee personnelle : les notes sont dans IndexedDB, a
 * laquelle ce fichier ne touche pas, et l'application n'emet aucune requete
 * reseau vers un serveur. Le seul trafic possible est le telechargement de
 * l'app elle-meme.
 *
 * Strategie : le reseau d'abord, le cache en secours. Ainsi une mise a jour est
 * prise en compte des qu'elle est disponible, et l'app continue de fonctionner
 * dans le metro.
 */

const CACHE = 'daylog-v1';

self.addEventListener('install', (event) => {
  // La nouvelle version prend la main sans attendre la fermeture des onglets.
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // On ne s'occupe que de la lecture de nos propres fichiers.
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response && response.status === 200 && response.type === 'basic') {
          const cache = await caches.open(CACHE);
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        // Navigation hors ligne vers une URL jamais visitee : on sert l'app.
        if (request.mode === 'navigate') {
          const fallback = await caches.match('./index.html');
          if (fallback) return fallback;
        }
        throw new Error('Hors ligne et absent du cache');
      }
    })()
  );
});
