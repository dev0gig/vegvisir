/* ============ RENDER ============ */
/* Baut die sichtbare Oberfläche aus den gespeicherten Daten: leere Seite,
   Suchtreffer oder Normalansicht (Ordner + lose Bookmarks). */

import { esc } from "./dom.js";
import { loadData, allBookmarks } from "./data.js";
import { tileHTML, folderTileHTML, sheetHTML, matchesQuery } from "./templates.js";
import { openSheet, closeSheet, attachDrag } from "./sheet.js";
import { getQuery } from "./search.js";
import { pickFile } from "./import.js";

const homeGrid = document.getElementById("homeGrid");
const sheetsRoot = document.getElementById("sheets");
const searchbar = document.getElementById("searchbar");

export function render() {
  const data = loadData();
  const folders = (data && data.folders) || [];
  const roots = (data && data.bookmarks) || [];
  const empty = folders.length === 0 && roots.length === 0;

  // Suchleiste nur zeigen, wenn ueberhaupt Bookmarks da sind.
  searchbar.classList.toggle("hidden", empty);

  if (empty) {
    sheetsRoot.innerHTML = "";
    homeGrid.innerHTML = `
      <div class="empty-home">
        <i data-lucide="compass" class="eh-ico"></i>
        <p>Noch keine Bookmarks. Importiere deinen <strong>Toride-Export</strong> (JSON),
           dann erscheinen hier deine Ordner und Links.</p>
        <button class="btn-import" id="emptyImport"><i data-lucide="upload"></i> JSON importieren</button>
      </div>`;
    if (window.lucide) lucide.createIcons();
    document.getElementById("emptyImport").addEventListener("click", pickFile);
    return;
  }

  const q = getQuery().trim().toLowerCase();

  if (q) {
    // Suchmodus: flache, gefilterte Trefferliste, keine Ordner.
    sheetsRoot.innerHTML = "";
    const hits = allBookmarks(data).filter((bm) => matchesQuery(bm, q));
    homeGrid.innerHTML = hits.length
      ? hits.map(tileHTML).join("")
      : `<div class="empty-home"><i data-lucide="search-x" class="eh-ico"></i>
           <p>Nichts gefunden für „${esc(getQuery().trim())}".</p></div>`;
    if (window.lucide) lucide.createIcons();
    return;
  }

  // Normalansicht: Ordner zuerst, dann lose Bookmarks.
  homeGrid.innerHTML = folders.map(folderTileHTML).join("") + roots.map(tileHTML).join("");
  sheetsRoot.innerHTML = folders.map(sheetHTML).join("");

  homeGrid.querySelectorAll(".folder-tile").forEach((btn) => {
    const sheet = document.getElementById("sheet-" + btn.dataset.sheet);
    btn.addEventListener("click", () => openSheet(sheet));
  });
  sheetsRoot.querySelectorAll(".sheet").forEach((sheet) => {
    sheet.querySelector(".sheet-close").addEventListener("click", closeSheet);
    attachDrag(sheet);
  });

  if (window.lucide) lucide.createIcons();
}
