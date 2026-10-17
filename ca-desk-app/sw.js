/* CA Desk service worker: offline shell + receive files shared from other apps (Android) */
const CACHE = 'cadesk-v3';
const SHELL = ['./', './index.html', './styles.css', './app.js', './config.js', './lib/xlsx.full.min.js', './lib/pdf.min.js', './lib/pdf.worker.min.js', './lib/supabase.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('cadesk', 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function stashShared(files) {
  const db = await idb();
  const prev = await new Promise(res => { const q = db.transaction('kv').objectStore('kv').get('shared'); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); });
  const add = await Promise.all(files.map(async f => ({ name: f.name || 'shared-file', type: f.type || '', blob: new Blob([await f.arrayBuffer()], { type: f.type || '' }) })));
  await new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(prev.concat(add), 'shared'); t.oncomplete = res; t.onerror = () => rej(t.error); });
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try { const fd = await e.request.formData(); await stashShared(fd.getAll('files').filter(f => f && f.size)); } catch (err) { /* ignore */ }
      return Response.redirect('./#/docs', 303);
    })());
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // network first for the app itself, so updates arrive; cache as fallback offline
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(m => m || caches.match('./index.html'))));
});
