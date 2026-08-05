/* ============ EINSTIEGSPUNKT ============ */
/* Verbindet die Module und startet die App. Es gibt keinen Login und keinen
   Server mehr — die Bookmarks liegen ausschließlich im Browser (localStorage),
   deshalb kann sofort gezeichnet werden.

   Hier hängen außerdem die übergreifenden Schließen-Gesten: Klick auf den
   abgedunkelten Hintergrund und die Escape-Taste. */

import { getQuery, resetSearch, initSearch } from "./search.js";
import { initImport } from "./importexport.js";
import { buildDock, getSheetToolId, closeToolWindow } from "./toolwindows.js";
import { render, closeFolder, getOpenFolderId } from "./render.js";
import { ensureColors } from "./store.js";

const backdrop = document.getElementById("backdrop");

/* Der abgedunkelte Hintergrund gehört nur noch den Werkzeug-Sheets —
   Ordner klappen im Raster auf und brauchen ihn nicht. */
backdrop.addEventListener("click", () => {
  if (getSheetToolId()) closeToolWindow(getSheetToolId());
});

/* Escape schließt der Reihe nach: Werkzeug-Sheet → offener Ordner → Suche.
   (Dialoge und das Kachelmenü fangen Escape selbst ab, bevor es hier ankommt.) */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (getSheetToolId()) closeToolWindow(getSheetToolId());
  else if (getOpenFolderId()) closeFolder();
  else if (getQuery()) resetSearch();
});

initSearch();
initImport();
buildDock();
render();
if (window.lucide) lucide.createIcons();

/* Kachelfarben aus den Favicons nachrechnen — passiert nur einmal je Kachel,
   danach steht die Farbe in den Daten. Beim ersten Start nach dem Import
   tauchen die Farben dadurch nach und nach auf. */
ensureColors(render);
