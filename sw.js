const CACHE = "pf-app-v27";
const FILES = ["./", "./index.html", "./config.js", "./css/app.css", "./js/main.js", "./js/screens.js", "./js/ui.js", "./js/auth.js", "./js/graph.js", "./js/md.js", "./js/collections.js", "./js/icons.js", "./js/colors.js", "./js/jouer.js", "./js/voies.js", "./js/controle.js", "./js/pages.js", "./js/forms.js", "./js/photo.js", "./js/recap.js", "./js/banner.js", "./js/potions.js", "./lib/msal-browser.min.js", "./manifest.webmanifest", "./img/avatar.png", "./icon-180.png", "./icon-192.png", "./icon-512.png", "./fonts/fredoka-latin-500-normal.woff2", "./fonts/fredoka-latin-600-normal.woff2", "./fonts/nunito-latin-600-normal.woff2", "./fonts/nunito-latin-700-normal.woff2", "./fonts/nunito-latin-800-normal.woff2"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, {cache: "reload"})))).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// Réseau d'abord (mises à jour immédiates) ; si le réseau met plus de 1,5 s à répondre, on sert la copie du cache pendant qu'il continue.
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== "GET") return;
  e.respondWith((async () => {
    const cached = () => caches.match(e.request, {ignoreSearch: true});
    const net = fetch(e.request, {cache: "no-cache"}).then(r => { const copy = r.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {})); return r; });
    try {
      const first = await Promise.race([net.catch(() => null), new Promise(res => setTimeout(() => res(null), 1500))]);
      if (first) return first;
      const c = await cached();
      if (c) return c;
      return await net;
    } catch { return (await cached()) || Response.error(); }
  })());
});
