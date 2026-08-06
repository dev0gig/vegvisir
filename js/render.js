/* ============ RENDER ============ */
/* Baut die sichtbare Oberfläche aus den gespeicherten Daten: leere Seite,
   Suchtreffer oder die Kachelwand. Ordner klappen an Ort und Stelle auf —
   das Feld spannt sich über alle Spalten und landet dadurch von selbst in der
   Zeile unter der Ordner-Kachel. */

import { esc } from "./dom.js";
import { getData, allBookmarks, daysSinceExport } from "./store.js";
import { tileHTML, folderTileHTML, folderPanelHTML, leafTileHTML, matchesQuery } from "./templates.js";
import { getQuery } from "./search.js";
import { attachDrag } from "./dragdrop.js";
import { openBookmarkEditor, openTileMenu } from "./editor.js";
import { openToolById } from "./toolwindows.js";
import { pickFile, exportData } from "./importexport.js";

const homeGrid = document.getElementById("homeGrid");
const homeNote = document.getElementById("homeNote");
const searchbar = document.getElementById("searchbar");

/* Welcher Ordner ist gerade aufgeklappt? (null = keiner) */
let openFolderId = null;
let closeTimer = null;   // läuft, während die Zuklapp-Bewegung spielt

export function getOpenFolderId() { return openFolderId; }

/* Zuklappen spielt dieselbe Bewegung wie das Aufklappen, nur rückwärts:
   erst die Animation (CSS-Klasse), danach erst neu zeichnen. */
export function closeFolder() {
  if (!openFolderId || closeTimer) return false;
  const panel = homeGrid.querySelector(".folder-panel");
  if (!panel) { openFolderId = null; render(); return true; }
  panel.classList.add("is-closing");
  homeGrid.querySelector(".tile.folder.is-open")?.classList.remove("is-open");
  closeTimer = setTimeout(() => {
    closeTimer = null;
    openFolderId = null;
    render();
  }, 240);
  return true;
}

export function openFolder(id) {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  openFolderId = id;
  render();
}

/* Nach jedem Verschieben/Ändern aufrufen. Ist der offene Ordner inzwischen
   verschwunden (aufgelöst/gelöscht), wird einfach zugeklappt. */
export function render() {
  const data = getData();
  const items = data.items;
  // Werkzeug-Kacheln stehen immer da — sie allein machen die Wand nicht „voll".
  const empty = !items.some((it) => it.type !== "tool");

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
    html += it.type === "folder" ? folderTileHTML(it) : leafTileHTML(it);
    if (it.type === "folder" && it.id === openFolderId) html += folderPanelHTML(it);
  });

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
  grid.addEventListener("click", (e) => {
    // Während oder direkt nach dem Ziehen keine Klicks auswerten.
    if (grid.classList.contains("dragging") || grid.dataset.justDragged === "1") {
      e.preventDefault();
      return;
    }

    const tile = e.target.closest(".tile");
    if (!tile) return;

    if (tile.dataset.type === "folder") {
      e.preventDefault();
      if (openFolderId === tile.dataset.id) closeFolder();
      else openFolder(tile.dataset.id);
    } else if (tile.dataset.type === "tool") {
      e.preventDefault();
      openToolById(tile.dataset.tool);
    }
    // Bookmarks sind echte Links — der Browser öffnet sie selbst im neuen Tab.
  });

  // Rechtsklick (Maus) öffnet das Kachelmenü. Der lange Druck auf dem Handy
  // läuft über die Ziehschicht, die dafür openTileMenu aufruft.
  grid.addEventListener("contextmenu", (e) => {
    const tile = e.target.closest(".tile");
    if (!tile) return;
    e.preventDefault();
    openTileMenu(tile.dataset.id, e.clientX, e.clientY);
  });
}
