/* ============ RENDER ============ */
/* Baut die sichtbare Oberfläche aus den gespeicherten Daten: leere Seite,
   Suchtreffer oder die Kachelwand. Ordner klappen an Ort und Stelle auf —
   das Feld spannt sich über alle Spalten und landet dadurch von selbst in der
   Zeile unter der Ordner-Kachel. */

import { esc } from "./dom.js";
import { getData, allBookmarks, findItem, daysSinceExport } from "./store.js";
import { tileHTML, folderTileHTML, folderPanelHTML, matchesQuery } from "./templates.js";
import { getQuery } from "./search.js";
import { attachDrag } from "./dragdrop.js";
import { openBookmarkEditor, openFolderEditor, openTileMenu, dissolveFolderAsked } from "./editor.js";
import { pickFile, exportData } from "./importexport.js";

const homeGrid = document.getElementById("homeGrid");
const homeNote = document.getElementById("homeNote");
const searchbar = document.getElementById("searchbar");

/* Welcher Ordner ist gerade aufgeklappt? (null = keiner) */
let openFolderId = null;

export function getOpenFolderId() { return openFolderId; }

export function closeFolder() {
  if (!openFolderId) return false;
  openFolderId = null;
  render();
  return true;
}

export function openFolder(id) {
  openFolderId = id;
  render();
}

/* Nach jedem Verschieben/Ändern aufrufen. Ist der offene Ordner inzwischen
   verschwunden (aufgelöst/gelöscht), wird einfach zugeklappt. */
export function render() {
  const data = getData();
  const items = data.items;
  const empty = items.length === 0;

  if (openFolderId && !items.some((it) => it.id === openFolderId && it.type === "folder")) {
    openFolderId = null;
  }

  searchbar.classList.toggle("hidden", empty);
  renderNote(empty);

  if (empty) {
    homeGrid.innerHTML = `
      <div class="empty-home">
        <i data-lucide="compass" class="eh-ico"></i>
        <p>Noch keine Bookmarks. Lege eins von Hand an oder importiere deinen
           <strong>Toride-Export</strong> (JSON).</p>
        <div class="eh-actions">
          <button class="btn-import" id="emptyAdd"><i data-lucide="plus"></i> Bookmark anlegen</button>
          <button class="btn-import ghost" id="emptyImport"><i data-lucide="upload"></i> JSON importieren</button>
        </div>
      </div>`;
    icons();
    document.getElementById("emptyAdd").addEventListener("click", () => openBookmarkEditor(null, null));
    document.getElementById("emptyImport").addEventListener("click", pickFile);
    return;
  }

  const q = getQuery().trim().toLowerCase();

  // Beginnt die Eingabe mit "/", ist es ein Slash-Befehl (die Palette liegt
  // über der Ansicht) — dann NICHT filtern, die Kachelwand bleibt stehen.
  if (q && !q.startsWith("/")) {
    const hits = allBookmarks()
      .filter((bm) => matchesQuery(bm, q))
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "de", { sensitivity: "base" }));
    homeGrid.innerHTML = hits.length
      ? `<div class="tile-grid searching">${hits.map((b) => tileHTML({ ...b, size: "s" })).join("")}</div>`
      : `<div class="empty-home"><i data-lucide="search-x" class="eh-ico"></i>
           <p>Nichts gefunden für „${esc(getQuery().trim())}".</p></div>`;
    icons();
    return; // im Suchmodus kein Ziehen, kein Menü — nur ansehen und anklicken
  }

  // ---- Kachelwand ----
  let html = "";
  items.forEach((it) => {
    html += it.type === "folder" ? folderTileHTML(it) : tileHTML(it);
    if (it.type === "folder" && it.id === openFolderId) html += folderPanelHTML(it);
  });
  html += `<button class="tile add-tile size-s" id="addTile" title="Neu anlegen">
             <span class="tile-face"><i data-lucide="plus"></i></span>
           </button>`;

  homeGrid.innerHTML = `<div class="tile-grid" id="tileGrid">${html}</div>`;
  icons();

  const grid = document.getElementById("tileGrid");
  if (openFolderId) grid.querySelector(`.tile[data-id="${cssId(openFolderId)}"]`)?.classList.add("is-open");

  wire(grid);
  attachDrag(grid);
}

/* Hinweis-Leiste über der Kachelwand: erinnert an die Sicherung, weil die
   Daten nur in diesem Browser liegen. */
function renderNote(empty) {
  if (!homeNote) return;
  if (empty) { homeNote.innerHTML = ""; return; }
  const days = daysSinceExport();
  const overdue = days === null || days >= 14;
  if (!overdue) { homeNote.innerHTML = ""; return; }
  homeNote.innerHTML = `
    <div class="save-note">
      <i data-lucide="hard-drive-download"></i>
      <span>${days === null
        ? "Deine Bookmarks liegen nur in diesem Browser — es gibt noch keine Sicherung."
        : `Letzte Sicherung vor ${days} Tagen.`}</span>
      <button class="save-note-btn" id="noteExport">Jetzt sichern</button>
    </div>`;
  icons();
  document.getElementById("noteExport").addEventListener("click", exportData);
}

/* IDs bestehen aus Buchstaben/Ziffern (siehe uid()), trotzdem defensiv
   maskieren, bevor sie in einen CSS-Selektor wandern. */
function cssId(id) {
  return window.CSS && CSS.escape ? CSS.escape(id) : String(id).replace(/["\\]/g, "\\$&");
}

function icons() { if (window.lucide) lucide.createIcons(); }

/* ---- Klicks / Menüs ---- */
function wire(grid) {
  document.getElementById("addTile").addEventListener("click", () => openBookmarkEditor(null, null));

  grid.addEventListener("click", (e) => {
    // Während oder direkt nach dem Ziehen keine Klicks auswerten.
    if (grid.classList.contains("dragging") || grid.dataset.justDragged === "1") {
      e.preventDefault();
      return;
    }

    const fpBtn = e.target.closest("[data-fp-action]");
    if (fpBtn) {
      e.preventDefault();
      handleFolderAction(fpBtn.dataset.fpAction, fpBtn.closest(".folder-panel").dataset.panel);
      return;
    }

    const tile = e.target.closest(".tile");
    if (!tile || tile.classList.contains("add-tile")) return;

    if (tile.dataset.type === "folder") {
      e.preventDefault();
      if (openFolderId === tile.dataset.id) closeFolder();
      else openFolder(tile.dataset.id);
    }
    // Bookmarks sind echte Links — der Browser öffnet sie selbst im neuen Tab.
  });

  // Rechtsklick (Maus) öffnet das Kachelmenü. Der lange Druck auf dem Handy
  // läuft über die Ziehschicht, die dafür openTileMenu aufruft.
  grid.addEventListener("contextmenu", (e) => {
    const tile = e.target.closest(".tile");
    if (!tile || tile.classList.contains("add-tile")) return;
    e.preventDefault();
    openTileMenu(tile.dataset.id, e.clientX, e.clientY);
  });
}

function handleFolderAction(action, folderId) {
  const found = findItem(folderId);
  if (!found) return;
  if (action === "close") closeFolder();
  else if (action === "add") openBookmarkEditor(null, folderId);
  else if (action === "rename") openFolderEditor(folderId);
  else if (action === "dissolve") dissolveFolderAsked(folderId);
}
