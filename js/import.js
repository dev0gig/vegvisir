/* ============ IMPORT (Toride-JSON) ============ */
/* Eine JSON-Datei kann per Knopf gewählt oder einfach irgendwo auf die Seite
   gezogen werden. Sind schon Bookmarks vorhanden, wird vor dem Ersetzen kurz
   nachgefragt. Passt die Datei nicht ins Schema, kommt eine wegklickbare
   Warnung und es wird nichts überschrieben. */

import { saveData, isEmptyData, pushToSupabase } from "./data.js";
import { closeSheet } from "./sheet.js";
import { render } from "./render.js";

const importFile = document.getElementById("importFile");

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

/* Gemeinsamer Weg für Datei-Knopf und Drag&Drop: prüfen, ggf. nachfragen,
   dann übernehmen. */
function handleFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
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
    commit(payload);
  };
  reader.readAsText(file);
}

/* Hängt Datei-Auswahl und Drag&Drop an (einmalig beim Start aufgerufen). */
export function initImport() {
  importFile.addEventListener("change", (e) => {
    handleFile(e.target.files && e.target.files[0]);
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
    handleFile(file);
  });
}
