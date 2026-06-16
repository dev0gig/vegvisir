/* ============ TEMPLATES (HTML-Bausteine) ============ */
/* Erzeugen nur HTML-Strings aus Daten — kein DOM, kein State. */

import { esc, escAttr, hostOf, hrefOf, initial, isImg } from "./dom.js";

/* ---- Kachel (einzelnes Bookmark) ---- */
export function tileHTML(bm) {
  const name = bm.name || hostOf(bm.url);
  const img = isImg(bm.imageUrl)
    ? `<img class="tile-img" src="${escAttr(bm.imageUrl)}" alt="" loading="lazy" onerror="this.remove()" />`
    : "";
  return `
    <a class="tile" href="${escAttr(hrefOf(bm.url))}" target="_blank" rel="noopener noreferrer"
       title="${escAttr(name)}">
      <span class="tile-ico">
        <span class="mono">${esc(initial(name))}</span>
        ${img}
      </span>
      <span class="tile-name">${esc(name)}</span>
    </a>`;
}

/* ---- Mini-Icon in der Ordner-Vorschau ---- */
export function miniHTML(bm) {
  if (!bm) return `<span class="mini empty"></span>`;
  const name = bm.name || hostOf(bm.url);
  const img = isImg(bm.imageUrl)
    ? `<img src="${escAttr(bm.imageUrl)}" alt="" loading="lazy" onerror="this.remove()" />`
    : "";
  return `<span class="mini"><span class="mini-mono">${esc(initial(name))}</span>${img}</span>`;
}

/* ---- Ordner-Kachel (Startseiten-Raster) ---- */
export function folderTileHTML(f, i) {
  const links = f.bookmarks || [];
  const minis = [0, 1, 2, 3].map((n) => miniHTML(links[n])).join("");
  return `
    <button class="folder-tile" aria-haspopup="dialog" aria-controls="sheet-${i}" data-sheet="${i}">
      <span class="folder-preview">${minis}</span>
      <span class="folder-label">${esc(f.name || "Ordner")}</span>
    </button>`;
}

export function folderIcon(icon) {
  // Toride folder icons are Lucide kebab names; legacy "pi-*" → fall back.
  if (!icon || /^pi[-\s]/.test(icon)) return "folder";
  return String(icon).replace(/[^a-z0-9-]/gi, "") || "folder";
}

/* ---- Bottom-Sheet je Ordner ---- */
export function sheetHTML(f, i) {
  const links = f.bookmarks || [];
  const cards = links.map(tileHTML).join("");
  const n = links.length;
  return `
    <section class="sheet" id="sheet-${i}" role="dialog" aria-modal="true" aria-label="${escAttr(f.name || "Ordner")}">
      <div class="sheet-handle" data-handle></div>
      <header class="sheet-head">
        <span class="sheet-ico"><i data-lucide="${folderIcon(f.icon)}"></i></span>
        <span><span class="sheet-title">${esc(f.name || "Ordner")}</span></span>
        <span class="sheet-sub" style="margin-left:6px">${n} ${n === 1 ? "link" : "links"}</span>
        <button class="sheet-close" aria-label="Schließen"><i data-lucide="x"></i></button>
      </header>
      <div class="sheet-scroll"><div class="grid">${cards}</div></div>
    </section>`;
}

/* ---- Sucht ein Bookmark anhand Name/URL ---- */
export function matchesQuery(bm, q) {
  const name = String(bm.name || "").toLowerCase();
  const url = String(bm.url || "").toLowerCase();
  return name.includes(q) || url.includes(q);
}
