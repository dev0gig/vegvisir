/* ============ SERVICE WORKER ============ */
/* Macht Vegvisir installierbar und offline benutzbar. Die Bookmarks liegen
   ohnehin im localStorage — fehlt nur noch die App selbst, und genau die legt
   dieser Worker in einen Cache.

   Zwei Regeln:
   1. Seitenaufruf (navigate): erst Netz, sonst die gespeicherte index.html.
      So merkt man eine neue Version sofort, wenn man online ist.
   2. Alles andere (CSS, JS, Schriften, Icons): sofort aus dem Cache ausliefern
      und im Hintergrund erneuern. Beim nächsten Start ist der neue Stand da.

   ⚠️ Bei größeren Umbauten CACHE hochzählen — dann wird alles Alte verworfen. */

const CACHE = "vegvisir-v1";

/* Das Grundgerüst, das die App zum Starten braucht. */
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./tools.js",
  "./manifest.webmanifest",
  "./js/main.js",
  "./js/color.js",
  "./js/commands.js",
  "./js/dom.js",
  "./js/dragdrop.js",
  "./js/editor.js",
  "./js/importexport.js",
  "./js/pdfDuplexFixer.js",
  "./js/pdfduplex.js",
  "./js/render.js",
  "./js/search.js",
  "./js/store.js",
  "./js/templates.js",
  "./js/toolwindows.js",
  "./js/vendor/lucide.min.js",
  "./js/vendor/pdf-lib.esm.min.js",
  "./assets/favicon.png",
  "./assets/favicon.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon-maskable-512.png",
  "./assets/apple-touch-icon.png",
  "./assets/fonts/cinzel-latin-500.woff2",
  "./assets/fonts/cinzel-latin-600.woff2",
  "./assets/fonts/cinzel-latin-700.woff2",
  "./assets/fonts/manrope-latin-400.woff2",
  "./assets/fonts/manrope-latin-500.woff2",
  "./assets/fonts/manrope-latin-600.woff2",
  "./assets/fonts/manrope-latin-700.woff2",
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    /* Einzeln ablegen: fehlt eine Datei, soll nicht die ganze Installation
       scheitern. cache:"reload" umgeht den normalen Browser-Cache. */
    await Promise.all(SHELL.map((url) =>
      cache.add(new Request(url, { cache: "reload" })).catch(() => {})
    ));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  /* Fremde Adressen (Favicons der Bookmarks, PDF-Downloads …) gehen den
     normalen Weg — die gehören nicht in den App-Cache. */
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put("./index.html", fresh.clone());
        return fresh;
      } catch {
        return (await caches.match("./index.html")) || Response.error();
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    const network = fetch(req).then((res) => {
      if (res && res.ok && res.type === "basic") cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return hit || (await network) || Response.error();
  })());
});
