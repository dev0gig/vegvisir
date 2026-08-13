/* ============ RENDER ============ */
/* Baut die sichtbare Oberfläche aus den Daten: zwei Gruppen untereinander.
 *
 *   FAVORITEN  — die Bookmarks aus dem localStorage, frei sortierbar,
 *                mit Ordnern, Ziehen und Kachelmenü.
 *   WERKZEUGE  — fest aus tools.js, immer gleich, ohne Ziehen und ohne Menü.
 *                Fenster-Werkzeuge öffnen ein Fenster, Seiten-Werkzeuge
 *                (CardCrop, MTG-Suche) sind Links auf ihre Unterseite.
 *
 * Ordner klappen an Ort und Stelle auf — das Feld spannt sich über alle
 * Spalten und landet dadurch von selbst in der Zeile unter der Kachel. */

import { esc } from "./dom.js";
import { getData, allBookmarks } from "./store.js";
import { tileHTML, toolTileHTML, folderTileHTML, folderPanelHTML, matchesQuery } from "./templates.js";
import { getQuery } from "./search.js";
import { attachDrag } from "./dragdrop.js";
import { openBookmarkEditor, openTileMenu } from "./editor.js";
import { getTools, openToolById } from "./toolwindows.js";

const homeGrid = document.getElementById("homeGrid");

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

/* Die Werkzeug-Gruppe ist immer gleich — einmal bauen reicht. */
function toolsSectionHTML() {
  return `
    <h2 class="section-title">Werkzeuge</h2>
    <div class="tile-grid tools-grid" id="toolsGrid">
      ${getTools().map(toolTileHTML).join("")}
    </div>`;
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

  // ---- Favoriten ----
  let favHtml;
  if (empty) {
    favHtml = `
      <div class="empty-home">
        <i data-lucide="compass" class="eh-ico"></i>
        <p>Noch keine Favoriten.</p>
        <div class="eh-actions">
          <button class="btn-import" id="emptyAdd"><i data-lucide="plus"></i> Bookmark anlegen</button>
        </div>
      </div>`;
  } else {
    let tiles = "";
    items.forEach((it) => {
      tiles += it.type === "folder" ? folderTileHTML(it) : tileHTML(it);
      if (it.type === "folder" && it.id === openFolderId) tiles += folderPanelHTML(it);
    });
    favHtml = `<div class="tile-grid" id="tileGrid">${tiles}</div>`;
  }

  homeGrid.innerHTML = `
    <h2 class="section-title">Favoriten</h2>
    ${favHtml}
    ${toolsSectionHTML()}`;
  icons();

  if (empty) {
    document.getElementById("emptyAdd").addEventListener("click", () => openBookmarkEditor(null, null));
  } else {
    const grid = document.getElementById("tileGrid");
    if (openFolderId) grid.querySelector(`.tile[data-id="${cssId(openFolderId)}"]`)?.classList.add("is-open");
    wire(grid);
    attachDrag(grid);
  }

  wireTools(document.getElementById("toolsGrid"));
}

/* IDs bestehen aus Buchstaben/Ziffern (siehe uid()), trotzdem defensiv
   maskieren, bevor sie in einen CSS-Selektor wandern. */
function cssId(id) {
  return window.CSS && CSS.escape ? CSS.escape(id) : String(id).replace(/["\\]/g, "\\$&");
}

function icons() { if (window.lucide) lucide.createIcons(); }

/* ---- Klicks / Menüs (Favoriten) ---- */
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

/* ---- Klicks (Werkzeuge) ---- */
/* Bewusst schlicht: kein Ziehen, kein Kachelmenü. Fenster-Werkzeuge öffnen
   ihr Fenster, Seiten-Werkzeuge sind normale Links (der Browser übernimmt). */
function wireTools(grid) {
  if (!grid) return;
  grid.addEventListener("click", (e) => {
    const tile = e.target.closest(".tile[data-type='tool']");
    if (tile) openToolById(tile.dataset.tool);
  });
}
