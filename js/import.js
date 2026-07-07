/* ============ IMPORT (Datei-Router: JSON = Bookmarks, ICS = Dienstplan) ============ */
/* Eine Datei kann per Knopf gewählt, per Slash-Befehl /import geöffnet oder
   einfach irgendwo auf die Seite gezogen werden. Anhand der Endung wird
   entschieden:
     .json → Bookmark-Aktualisierung (Überschreiben + Sicherung fürs Undo)
     .ics  → Dienstplan-Import (öffnet das Dienstplan-Werkzeug mit Dialog)
   Passt eine JSON-Datei nicht ins Schema, kommt eine wegklickbare Warnung und
   es wird nichts überschrieben. */

import { saveData, isEmptyData, loadData, pushToSupabase } from "./data.js";
import { logImport } from "./backup.js";
import { openToolById } from "./toolwindows.js";
import { closeSheet } from "./sheet.js";
import { render } from "./render.js";

const importFile = document.getElementById("importFile");

/* Öffnet den Datei-Auswahldialog (JSON oder ICS). */
export function pickFile() { importFile.click(); }

/* Text einlesen und prüfen. Gibt den fertigen Datensatz zurück oder null,
   wenn die Datei kein gültiger Toride-Export ist. */
function parseJson(text) {
  let data;
  try { data = JSON.parse(text); } catch { return null; }
  if (!data || typeof data !== "object") return null;
  const folders = Array.isArray(data.folders) ? data.folders : [];
  const bookmarks = Array.isArray(data.bookmarks) ? data.bookmarks : [];
  if (folders.length === 0 && bookmarks.length === 0) return null;
  return { version: 1, importedAt: new Date().toISOString(), folders, bookmarks };
}

/* Datensatz lokal speichern, in die Cloud spiegeln und neu zeichnen. */
function commit(payload) {
  saveData(payload);
  pushToSupabase(payload); // Hintergrund, fehlertolerant
  closeSheet();
  render();
}

/* Endung einer Datei in Kleinbuchstaben ("json" | "ics" | ""). */
function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || ""));
  return m ? m[1].toLowerCase() : "";
}

/* Bookmarks-JSON: prüfen, ggf. nachfragen, Sicherung protokollieren, übernehmen. */
function handleJson(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    const payload = parseJson(String(reader.result));
    if (!payload) {
      alert("Das ist kein gültiger Toride-Export: erwartet wird eine JSON-Datei mit Ordnern (folders) oder Bookmarks. Es wurde nichts geändert.");
      return;
    }
    const n = payload.folders.length + payload.bookmarks.length;
    // Nur nachfragen, wenn dadurch bestehende Bookmarks ersetzt würden.
    if (!isEmptyData() &&
        !confirm(`${n} Einträge importieren und deine bestehenden Bookmarks damit ersetzen?`)) {
      return;
    }
    // Vor dem Überschreiben den bisherigen Stand als Sicherung protokollieren
    // (Basis fürs Undo; fehlertolerant, blockiert den Import nicht).
    try {
      await logImport({ kind: "json", filename: file.name, eventCount: n, prevSnapshot: loadData() });
    } catch {}
    commit(payload);
  };
  reader.readAsText(file);
}

/* Zentraler Datei-Router: entscheidet anhand der Endung, was passiert. */
export function importAnyFile(file) {
  if (!file) return;
  const ext = extOf(file.name);
  if (ext === "ics") {
    // Dienstplan-Werkzeug öffnen und die Datei dort mit Bestätigungs-Dialog
    // importieren lassen (die Logik lebt in js/dienstplan.js).
    import("./dienstplan.js").then((m) => m.importIcsFile(file)).catch(() => {});
    openToolById("dienstplan");
    return;
  }
  if (ext === "json") { handleJson(file); return; }
  alert("Diese Datei wird nicht unterstützt. Erlaubt sind .json (Bookmarks) und .ics (Dienstplan).");
}

/* Hängt Datei-Auswahl und Drag&Drop an (einmalig beim Start aufgerufen). */
export function initImport() {
  importFile.addEventListener("change", (e) => {
    importAnyFile(e.target.files && e.target.files[0]);
    e.target.value = "";
  });

  /* ---- Eine Datei irgendwo auf die Seite ziehen (immer möglich) ---- */
  let dragDepth = 0;
  window.addEventListener("dragenter", (e) => {
    if (e.dataTransfer && [...e.dataTransfer.items].some((i) => i.kind === "file")) {
      e.preventDefault(); dragDepth++; document.body.classList.add("dropping");
    }
  });
  window.addEventListener("dragover", (e) => { if (document.body.classList.contains("dropping")) e.preventDefault(); });
  window.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove("dropping"); } });
  window.addEventListener("drop", (e) => {
    dragDepth = 0; document.body.classList.remove("dropping");
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    e.preventDefault();
    importAnyFile(file);
  });
}
