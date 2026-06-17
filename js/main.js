/* ============ EINSTIEGSPUNKT ============ */
/* Verbindet die Module: hängt die übergreifenden Schließen-Gesten an
   (Klick auf den dunklen Hintergrund, Escape-Taste) und startet die App. */

import { getActiveSheet, closeSheet } from "./sheet.js";
import { getQuery, resetSearch, initSearch } from "./search.js";
import { initImport } from "./import.js";
import { buildDock, getSheetToolId, closeToolWindow } from "./toolwindows.js";
import { initFavorites } from "./favorites.js";
import { render } from "./render.js";

const backdrop = document.getElementById("backdrop");

/* Klick auf den abgedunkelten Hintergrund schließt, was gerade offen ist:
   zuerst ein Ordner-Sheet, sonst ein Werkzeug-Sheet. */
backdrop.addEventListener("click", () => {
  if (getActiveSheet()) closeSheet();
  else if (getSheetToolId()) closeToolWindow(getSheetToolId());
});

/* Escape schließt der Reihe nach: Ordner-Sheet → Werkzeug-Sheet → Suche. */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (getActiveSheet()) closeSheet();
  else if (getSheetToolId()) closeToolWindow(getSheetToolId());
  else if (getQuery()) resetSearch();
});

/* Ereignisse anhängen und App aufbauen. */
initSearch();
initImport();
initFavorites();   // muss vor buildDock() laufen: registriert den Favoriten-Knopf
buildDock();
render();
if (window.lucide) lucide.createIcons();

/* Alte Service-Worker + Caches einer früheren PWA-Version entfernen. */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
}
if (window.caches) {
  caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
}
