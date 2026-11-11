import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { defineConfig, type Plugin } from 'vite';

// Erzeugt beim Build einen Service Worker, der alle Dateien vorab speichert –
// danach läuft das Spiel auch ohne Internet vom Home-Bildschirm.
function serviceWorker(): Plugin {
  return {
    name: 'garage-kings-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = [
        './',
        './index.html',
        './manifest.webmanifest',
        './icons/icon-192.png',
        './icons/icon-512.png',
        './icons/apple-touch-icon.png',
        ...Object.keys(bundle).map((f) => `./${f}`),
      ];
      const version = createHash('sha1').update(files.join('|')).digest('hex').slice(0, 10);
      const source = `const CACHE = 'garage-kings-${version}';
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // Seite: erst Netz (für Updates), offline aus dem Speicher.
    e.respondWith(fetch(req).catch(() => caches.match('./index.html', { ignoreVary: true })));
    return;
  }
  e.respondWith(caches.match(req.url, { ignoreVary: true }).then((hit) => hit || fetch(req)));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  // Relative Pfade: funktioniert in jedem Unterordner (GitHub Pages, Netlify, …).
  base: './',
  plugins: [react(), serviceWorker()],
  build: { chunkSizeWarningLimit: 1500 },
});
