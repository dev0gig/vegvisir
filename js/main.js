/* ============ EINSTIEGSPUNKT ============ */
/* Verbindet die Module: erst das Login-Gate (auth.js), danach — nach
   erfolgreichem, erlaubtem Login — die eigentliche App. Hängt außerdem die
   übergreifenden Schließen-Gesten an (Klick auf den dunklen Hintergrund,
   Escape-Taste). */

import { getActiveSheet, closeSheet } from "./sheet.js";
import { getQuery, resetSearch, initSearch } from "./search.js";
import { initImport } from "./import.js";
import { buildDock, getSheetToolId, closeToolWindow } from "./toolwindows.js";
import { render } from "./render.js";
import { loadData, saveData, pullFromSupabase } from "./data.js";
import { initAuth } from "./auth.js";
import { handleGoogleRedirect } from "./google-sync.js";
import { flash } from "./commands.js";

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

/* App genau einmal starten (auth.js kann onAuthed mehrfach melden). */
let appStarted = false;
function startApp() {
  if (appStarted) return;
  appStarted = true;

  initSearch();
  initImport();
  buildDock();
  render();
  if (window.lucide) lucide.createIcons();

  // Sofort ist der localStorage gerendert; nun im Hintergrund die Cloud prüfen.
  syncFromCloud();

  // Kommt der Aufruf gerade von der Google-Zustimmungsseite zurück (Adresse
  // enthält code+state aus /google verbinden), die Verbindung abschließen.
  handleGoogleRedirect()
    .then((r) => { if (r) flash(`Google-Kalender „${r.kalender}“ verbunden.`, "ok"); })
    .catch((err) => flash("Google-Verbindung fehlgeschlagen: " + (err.message || ""), "warn"));
}

/* Holt die Cloud-Version und übernimmt sie lokal, wenn sie neuer ist als der
   lokale Stand. Als Zeitstempel dient importedAt (wandert im Datensatz mit und
   ändert sich genau beim Import); ersatzweise updated_at der Cloud-Zeile. */
async function syncFromCloud() {
  const row = await pullFromSupabase();
  if (!row || !row.data) return;

  const local = loadData();
  const localTime = local && local.importedAt ? Date.parse(local.importedAt) : 0;
  const remoteTime = row.data.importedAt
    ? Date.parse(row.data.importedAt)
    : (row.updated_at ? Date.parse(row.updated_at) : 0);

  if (remoteTime > localTime) {
    saveData(row.data);
    render(); // render() zeichnet die Lucide-Icons selbst neu
  }
}

/* Icons des Login-Gates sofort zeichnen (die App-Icons folgen in startApp). */
if (window.lucide) lucide.createIcons();

/* Login-Gate starten; bei Erfolg wird startApp aufgerufen. */
initAuth(startApp);

/* Alte Service-Worker + Caches einer früheren PWA-Version entfernen. */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
}
if (window.caches) {
  caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
}
