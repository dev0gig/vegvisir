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
const homeFav = document.getElementById("homeFav");
const sheetsRoot = document.getElementById("sheets");
const searchbar = document.getElementById("searchbar");

/* Alphabetisch nach Anzeigename (ersatzweise URL), deutsch & ohne
   Groß/Klein-Unterschied, damit z.B. "Über" richtig einsortiert wird. */
const byName = (a, b) =>
  String(a.name || a.url || "").localeCompare(
    String(b.name || b.url || ""), "de", { sensitivity: "base" }
  );

export function render() {
  const data = loadData();
  const folders = (data && data.folders) || [];
  const roots = (data && data.bookmarks) || [];
  const empty = folders.length === 0 && roots.length === 0;

  // Suchleiste nur zeigen, wenn ueberhaupt Bookmarks da sind.
  searchbar.classList.toggle("hidden", empty);

  if (empty) {
    sheetsRoot.innerHTML = "";
    homeFav.innerHTML = "";
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

  // Beginnt die Eingabe mit "/", ist es ein Slash-Befehl (Palette liegt über
  // der Ansicht) — dann NICHT die Bookmarks filtern, Normalansicht behalten.
  if (q && !q.startsWith("/")) {
    // Suchmodus: flache, gefilterte Trefferliste, keine Ordner.
    sheetsRoot.innerHTML = "";
    homeFav.innerHTML = "";
    const hits = allBookmarks(data).filter((bm) => matchesQuery(bm, q)).sort(byName);
    homeGrid.innerHTML = hits.length
      ? `<div class="home-grid">${hits.map(tileHTML).join("")}</div>`
      : `<div class="empty-home"><i data-lucide="search-x" class="eh-ico"></i>
           <p>Nichts gefunden für „${esc(getQuery().trim())}".</p></div>`;
    if (window.lucide) lucide.createIcons();
    return;
  }

  // Normalansicht: Favoriten ganz oben (Schnellzugriff), darunter die Ordner
  // und die losen Bookmarks (Apps) — jeweils alphabetisch sortiert und mit
  // eigener Überschrift, die nur erscheint, wenn es Einträge dafür gibt.
  // Favoriten sind die in Toride mit dem Stern markierten Bookmarks
  // (Feld `isFavorite`), egal ob sie sonst in einem Ordner stecken.
  const favorites = allBookmarks(data).filter((bm) => bm.isFavorite).sort(byName);
  homeFav.innerHTML = favorites.length
    ? `<h3 class="sheet-sub home-fav-title">Favoriten</h3><div class="home-grid">${favorites.map(tileHTML).join("")}</div>`
    : "";

  // Ordner alphabetisch, auch ihre Links innen alphabetisch.
  const sortedFolders = [...folders]
    .map((f) => ({ ...f, bookmarks: [...(f.bookmarks || [])].sort(byName) }))
    .sort(byName);
  const sortedRoots = [...roots].sort(byName);

  let html = "";
  if (sortedFolders.length) {
    html += `<h3 class="sheet-sub section-title">Ordner</h3>`;
    html += `<div class="home-grid">${sortedFolders.map(folderTileHTML).join("")}</div>`;
  }
  if (sortedRoots.length) {
    html += `<h3 class="sheet-sub section-title">Apps</h3>`;
    html += `<div class="home-grid">${sortedRoots.map(tileHTML).join("")}</div>`;
  }
  homeGrid.innerHTML = html;
  sheetsRoot.innerHTML = sortedFolders.map(sheetHTML).join("");

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
