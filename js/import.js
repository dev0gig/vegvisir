/* ============ IMPORT (Toride-JSON) ============ */
/* Import ist nur auf der leeren Seite möglich. Für Änderungen muss der
   localStorage geleert werden. Eine JSON-Datei kann per Knopf gewählt oder
   einfach auf die Seite gezogen werden. */

import { saveData, isEmptyData } from "./data.js";
import { closeSheet } from "./sheet.js";
import { render } from "./render.js";

const importFile = document.getElementById("importFile");

export function pickFile() { importFile.click(); }

function ingestJson(text) {
  let data;
  try { data = JSON.parse(text); } catch { return false; }
  if (!data || typeof data !== "object") return false;
  const folders = Array.isArray(data.folders) ? data.folders : [];
  const bookmarks = Array.isArray(data.bookmarks) ? data.bookmarks : [];
  if (folders.length === 0 && bookmarks.length === 0) return false;
  saveData({ version: 1, importedAt: new Date().toISOString(), folders, bookmarks });
  closeSheet();
  render();
  return true;
}

/* Hängt Datei-Auswahl und Drag&Drop an (einmalig beim Start aufgerufen). */
export function initImport() {
  importFile.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { if (!ingestJson(String(reader.result))) alert("Keine gültige Toride-JSON-Datei."); };
    reader.readAsText(file);
    e.target.value = "";
  });

  /* ---- Eine .json-Datei irgendwo auf die Seite ziehen (nur wenn leer) ---- */
  let dragDepth = 0;
  window.addEventListener("dragenter", (e) => {
    if (!isEmptyData()) return;
    if (e.dataTransfer && [...e.dataTransfer.items].some((i) => i.kind === "file")) {
      e.preventDefault(); dragDepth++; document.body.classList.add("dropping");
    }
  });
  window.addEventListener("dragover", (e) => { if (document.body.classList.contains("dropping")) e.preventDefault(); });
  window.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove("dropping"); } });
  window.addEventListener("drop", (e) => {
    dragDepth = 0; document.body.classList.remove("dropping");
    if (!isEmptyData()) return;
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    e.preventDefault();
    const reader = new FileReader();
    reader.onload = () => { if (!ingestJson(String(reader.result))) alert("Keine gültige Toride-JSON-Datei."); };
    reader.readAsText(file);
  });
}
