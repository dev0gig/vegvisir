/* ============ TEMPLATES (HTML-Bausteine) ============ */
/* Erzeugen nur HTML-Strings aus Daten — kein DOM, kein State.
   Die Kacheln sind im Windows-Metro-Stil: farbige Fläche, Favicon in der
   Mitte, Name klein in der unteren Ecke. Die Farbe kommt aus dem Favicon
   (siehe js/color.js) und steht fertig in den Daten. */

import { esc, escAttr, hostOf, hrefOf, initial, isImg } from "./dom.js";
import { DEFAULT_TILE_COLOR } from "./color.js";

const sizeClass = (s) => "size-" + (["s", "w", "l"].includes(s) ? s : "s");

/* ---- Kachel (einzelnes Bookmark) ---- */
export function tileHTML(bm) {
  const name = bm.name || hostOf(bm.url);
  const color = bm.color || DEFAULT_TILE_COLOR;
  const face = isImg(bm.imageUrl)
    ? `<img class="tile-img" src="${escAttr(bm.imageUrl)}" alt="" loading="lazy"
            onerror="this.classList.add('broken')" />`
    : `<span class="tile-mono">${esc(initial(name))}</span>`;
  return `
    <a class="tile ${sizeClass(bm.size)}" data-id="${escAttr(bm.id)}" data-type="bookmark"
       href="${escAttr(hrefOf(bm.url))}" target="_blank" rel="noopener noreferrer"
       style="--tile:${escAttr(color)}" title="${escAttr(name)}">
      <span class="tile-face">${face}</span>
      <span class="tile-name">${esc(name)}</span>
    </a>`;
}

/* ---- Mini-Icon in der Ordner-Vorschau ---- */
function miniHTML(bm) {
  if (!bm) return `<span class="mini empty"></span>`;
  const name = bm.name || hostOf(bm.url);
  return isImg(bm.imageUrl)
    ? `<span class="mini"><img src="${escAttr(bm.imageUrl)}" alt="" loading="lazy"
         onerror="this.classList.add('broken')" /></span>`
    : `<span class="mini"><span class="mini-mono">${esc(initial(name))}</span></span>`;
}

/* ---- Ordner-Kachel ---- */
export function folderTileHTML(f) {
  const links = f.items || [];
  const count = links.length;
  const minis = [0, 1, 2, 3].map((n) => miniHTML(links[n])).join("");
  const color = f.color || DEFAULT_TILE_COLOR;
  return `
    <button class="tile folder ${sizeClass(f.size)}" data-id="${escAttr(f.id)}" data-type="folder"
            style="--tile:${escAttr(color)}" aria-expanded="false"
            title="${escAttr(f.name || "Ordner")}">
      <span class="tile-face"><span class="folder-preview">${minis}</span></span>
      <span class="tile-name">${esc(f.name || "Ordner")}</span>
      <span class="tile-count">${count}</span>
    </button>`;
}

/* ---- Aufgeklappter Ordner (öffnet sich an Ort und Stelle im Raster) ---- */
/* Das Feld spannt sich über alle Spalten. Dadurch schiebt es das CSS-Raster
   automatisch in die Zeile UNTER der Ordner-Kachel — genau wie am Handy-
   Homescreen, ohne dass wir Zeilen ausrechnen müssen. */
export function folderPanelHTML(f) {
  const links = f.items || [];
  const n = links.length;
  const inner = n
    ? links.map(tileHTML).join("")
    : `<p class="fp-empty">Dieser Ordner ist leer. Zieh eine Kachel hinein oder lege hier ein Bookmark an.</p>`;
  return `
    <div class="folder-panel" data-panel="${escAttr(f.id)}" style="--tile:${escAttr(f.color || DEFAULT_TILE_COLOR)}">
      <div class="fp-head">
        <span class="fp-title">${esc(f.name || "Ordner")}</span>
        <span class="fp-count">${n} ${n === 1 ? "Link" : "Links"}</span>
        <button class="fp-btn" data-fp-action="add" title="Bookmark in diesen Ordner legen">
          <i data-lucide="plus"></i></button>
        <button class="fp-btn" data-fp-action="rename" title="Ordner umbenennen">
          <i data-lucide="pencil"></i></button>
        <button class="fp-btn" data-fp-action="dissolve" title="Ordner auflösen (Inhalt bleibt erhalten)">
          <i data-lucide="folder-open"></i></button>
        <button class="fp-btn fp-close" data-fp-action="close" aria-label="Schließen">
          <i data-lucide="x"></i></button>
      </div>
      <div class="fp-grid">${inner}</div>
    </div>`;
}

/* ---- Sucht ein Bookmark anhand Name/URL ---- */
export function matchesQuery(bm, q) {
  const name = String(bm.name || "").toLowerCase();
  const url = String(bm.url || "").toLowerCase();
  return name.includes(q) || url.includes(q);
}
