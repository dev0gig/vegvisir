/* ============ EINSTIEGSPUNKT ============ */
/* Verbindet die Module und startet die App. Es gibt keinen Login und keinen
   Server mehr — die Bookmarks liegen ausschließlich im Browser (localStorage),
   deshalb kann sofort gezeichnet werden.

   Hier hängen außerdem die übergreifenden Schließen-Gesten: Klick neben einen
   aufgeklappten Ordner und die Escape-Taste. */

import { getQuery, resetSearch, initSearch } from "./search.js";
import { initImport } from "./importexport.js";
import { getTools, closeTopToolWindow } from "./toolwindows.js";
import { render, closeFolder, getOpenFolderId } from "./render.js";
import { ensureColors, ensureToolTiles } from "./store.js";

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
initImport();
/* Zu jedem Werkzeug aus tools.js gehört eine Kachel auf der Wand. */
ensureToolTiles(getTools());
render();
if (window.lucide) lucide.createIcons();

/* Kachelfarben aus den Favicons nachrechnen — passiert nur einmal je Kachel,
   danach steht die Farbe in den Daten. Beim ersten Start nach dem Import
   tauchen die Farben dadurch nach und nach auf. */
ensureColors(render);

/* Service Worker anmelden: macht Vegvisir installierbar und offline nutzbar.
   Läuft nur über http(s) — beim Öffnen per file:// gibt es ihn nicht. */
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) =>
      console.warn("Service Worker nicht angemeldet:", err)
    );
  });
}
