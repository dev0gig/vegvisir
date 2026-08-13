/* ============ EINSTIEGSPUNKT ============ */
/* Verbindet die Module und startet die App. Es gibt keinen Login und keinen
   Server — die Favoriten liegen ausschließlich im Browser (localStorage),
   deshalb kann sofort gezeichnet werden.

   Hier hängen außerdem die übergreifenden Schließen-Gesten: Klick neben einen
   aufgeklappten Ordner und die Escape-Taste. */

import { getQuery, resetSearch, initSearch } from "./search.js";
import { closeTopToolWindow } from "./toolwindows.js";
import { render, closeFolder, getOpenFolderId } from "./render.js";
import { ensureColors } from "./store.js";

/* Klick irgendwo daneben klappt den offenen Ordner wieder zu. Ausgenommen sind
   der Ordner selbst, seine Kachel, Menüs/Dialoge, offene Werkzeug-Fenster und
   die Suchleiste — dort klickt man aus einem anderen Grund. */
const KEEP_OPEN = ".folder-panel, .tile.folder, .tile-menu, dialog, .tool-window, .bottombar, #cmdLayer";
document.addEventListener("click", (e) => {
  if (!getOpenFolderId()) return;
  if (e.target.closest(KEEP_OPEN)) return;
  closeFolder();
});

/* Escape schließt der Reihe nach: oberstes Werkzeug-Fenster → offener Ordner →
   Suche. (Dialoge und das Kachelmenü fangen Escape selbst ab, bevor es hier
   ankommt.) */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (closeTopToolWindow()) return;
  if (closeFolder()) return;
  if (getQuery()) resetSearch();
});

initSearch();
render();
if (window.lucide) lucide.createIcons();

/* Kachelfarben aus den Favicons nachrechnen — passiert nur einmal je Kachel,
   danach steht die Farbe in den Daten. Beim ersten Start nach dem Anlegen
   tauchen die Farben dadurch nach und nach auf. */
ensureColors(render);

/* AUFRÄUMEN: Vegvisir war früher eine Offline-App (PWA) mit Service Worker.
   Der alte Worker steckt bei Besuchern noch im Browser und würde sonst für
   immer die alte, zwischengespeicherte Version ausliefern. Deshalb wird er
   hier abgemeldet und seine Caches werden geleert. Diese Zeilen müssen so
   lange bleiben, wie jemand die alte Version installiert haben könnte. */
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.getRegistrations()
    .then((regs) => regs.forEach((r) => r.unregister()))
    .catch(() => {});
  if (window.caches && caches.keys) {
    caches.keys().then((names) => names.forEach((n) => caches.delete(n))).catch(() => {});
  }
}
