/* ============ DATA (imported Toride JSON, persisted locally) ============ */
const STORE_KEY = "vegvisir.data";

function loadData() {
  try { const r = localStorage.getItem(STORE_KEY); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
function saveData(d) { localStorage.setItem(STORE_KEY, JSON.stringify(d)); }

/* ---- Helpers ---- */
function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function escAttr(s) { return esc(s).replace(/'/g, "&#39;"); }

function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return String(u || ""); }
}
function hrefOf(u) { return /^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : "https://" + u; }

function initial(s) {
  s = String(s || "").trim();
  const m = s.match(/[\p{L}\p{N}]/u);
  return (m ? m[0] : (s[0] || "?")).toUpperCase();
}

function isImg(u) { return typeof u === "string" && u.trim() !== ""; }

/* ---- Tile (single bookmark) ---- */
function tileHTML(bm) {
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

/* ---- Mini icon inside a folder preview ---- */
function miniHTML(bm) {
  if (!bm) return `<span class="mini empty"></span>`;
  const name = bm.name || hostOf(bm.url);
  const img = isImg(bm.imageUrl)
    ? `<img src="${escAttr(bm.imageUrl)}" alt="" loading="lazy" onerror="this.remove()" />`
    : "";
  return `<span class="mini"><span class="mini-mono">${esc(initial(name))}</span>${img}</span>`;
}

/* ---- Folder tile (home grid) ---- */
function folderTileHTML(f, i) {
  const links = f.bookmarks || [];
  const minis = [0, 1, 2, 3].map((n) => miniHTML(links[n])).join("");
  return `
    <button class="folder-tile" aria-haspopup="dialog" aria-controls="sheet-${i}" data-sheet="${i}">
      <span class="folder-preview">${minis}</span>
      <span class="folder-label">${esc(f.name || "Ordner")}</span>
    </button>`;
}

function folderIcon(icon) {
  // Toride folder icons are Lucide kebab names; legacy "pi-*" → fall back.
  if (!icon || /^pi[-\s]/.test(icon)) return "folder";
  return String(icon).replace(/[^a-z0-9-]/gi, "") || "folder";
}

/* ---- Bottom sheet per folder ---- */
function sheetHTML(f, i) {
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

/* ============ SEARCH ============ */
let query = "";

/* Alle Bookmarks (lose + aus allen Ordnern) flach einsammeln. */
function allBookmarks(data) {
  const out = [];
  const roots = (data && data.bookmarks) || [];
  const folders = (data && data.folders) || [];
  roots.forEach((b) => out.push(b));
  folders.forEach((f) => (f.bookmarks || []).forEach((b) => out.push(b)));
  return out;
}

function matchesQuery(bm, q) {
  const name = String(bm.name || "").toLowerCase();
  const url = String(bm.url || "").toLowerCase();
  return name.includes(q) || url.includes(q);
}

/* ============ RENDER ============ */
const homeGrid = document.getElementById("homeGrid");
const sheetsRoot = document.getElementById("sheets");
const backdrop = document.getElementById("backdrop");
const searchbar = document.getElementById("searchbar");
const searchInput = document.getElementById("searchInput");

function render() {
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

  const q = query.trim().toLowerCase();

  if (q) {
    // Suchmodus: flache, gefilterte Trefferliste, keine Ordner.
    sheetsRoot.innerHTML = "";
    const hits = allBookmarks(data).filter((bm) => matchesQuery(bm, q));
    homeGrid.innerHTML = hits.length
      ? hits.map(tileHTML).join("")
      : `<div class="empty-home"><i data-lucide="search-x" class="eh-ico"></i>
           <p>Nichts gefunden für „${esc(query.trim())}".</p></div>`;
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

/* Suche zuruecksetzen (z.B. nach Klick auf ein Icon). */
function resetSearch() {
  if (!query) return;
  query = "";
  searchInput.value = "";
  searchbar.classList.remove("has-query");
  render();
}

/* ============ OPEN / CLOSE SHEET ============ */
let activeSheet = null;
function openSheet(sheet) {
  if (!sheet) return;
  if (activeSheet && activeSheet !== sheet) { activeSheet.classList.remove("open"); activeSheet.style.transform = ""; }
  activeSheet = sheet;
  backdrop.classList.add("open");
  requestAnimationFrame(() => {
    sheet.classList.add("open");
    sheet.style.transform = "translate(-50%, 0)";
  });
  document.body.style.overflow = "hidden";
}
function closeSheet() {
  if (!activeSheet) return;
  activeSheet.classList.remove("open");
  activeSheet.style.transform = "";
  backdrop.classList.remove("open");
  activeSheet = null;
  document.body.style.overflow = "";
}
backdrop.addEventListener("click", closeSheet);
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (activeSheet) closeSheet();
  else if (query) resetSearch();
});

/* ---- Drag-to-dismiss ---- */
// Das Sheet laesst sich auf zwei Wegen nach unten wegziehen:
//  • Desktop: per Maus am Griff (pointer-Events).
//  • Touch: mit einer Wischgeste irgendwo auf der GESAMTEN Sheet-Flaeche.
//    Damit Wischen und Scrollen sich nicht in die Quere kommen, startet die
//    Schliess-Geste nur, wenn die Liste bereits ganz oben steht und man nach
//    unten zieht – sonst scrollt der Inhalt ganz normal.
function attachDrag(sheet) {
  const handle = sheet.querySelector("[data-handle]");
  const scroll = sheet.querySelector(".sheet-scroll");
  let startY = 0, dy = 0, dragging = false;

  const finish = () => {
    dragging = false;
    sheet.classList.remove("dragging");
    if (dy > 110) closeSheet();
    else sheet.style.transform = "translate(-50%, 0)";
  };

  /* Desktop: Maus am Griff */
  handle.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") return; // Touch laeuft ueber die Geste unten
    dragging = true; startY = e.clientY; dy = 0;
    sheet.classList.add("dragging");
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    dy = Math.max(0, e.clientY - startY);
    sheet.style.transform = `translate(-50%, ${dy}px)`;
  });
  handle.addEventListener("pointerup", () => { if (dragging) finish(); });
  handle.addEventListener("pointercancel", () => { if (dragging) finish(); });

  /* Touch: Wischen auf der ganzen Flaeche */
  let touchActive = false;
  sheet.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    startY = e.touches[0].clientY; dy = 0;
    touchActive = true; dragging = false;
  }, { passive: true });
  sheet.addEventListener("touchmove", (e) => {
    if (!touchActive) return;
    const delta = e.touches[0].clientY - startY;
    const atTop = !scroll || scroll.scrollTop <= 0;
    if (!dragging) {
      // Geste erst starten, wenn man von ganz oben nach unten zieht
      if (delta > 6 && atTop) {
        dragging = true;
        sheet.classList.add("dragging");
      } else {
        return; // sonst normal scrollen lassen
      }
    }
    dy = Math.max(0, delta);
    e.preventDefault();
    sheet.style.transform = `translate(-50%, ${dy}px)`;
  }, { passive: false });
  const endTouch = () => {
    if (!touchActive) return;
    touchActive = false;
    if (dragging) finish();
  };
  sheet.addEventListener("touchend", endTouch);
  sheet.addEventListener("touchcancel", endTouch);
}

/* ============ SEARCH WIRING ============ */
searchInput.addEventListener("input", () => {
  query = searchInput.value;
  searchbar.classList.toggle("has-query", query.trim() !== "");
  render();
});
// Enter im Suchfeld: DuckDuckGo-Suche mit dem getippten Text in neuem Tab.
// (Das Suchfeld filtert live die Bookmarks — wer keinen Treffer anklickt,
//  startet mit Enter direkt die Web-Suche. DuckDuckGo wegen Privatsphaere.)
searchInput.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const q = searchInput.value.trim();
  if (!q) return;
  e.preventDefault();
  window.open("https://duckduckgo.com/?q=" + encodeURIComponent(q),
              "_blank", "noopener,noreferrer");
});
document.getElementById("searchClear").addEventListener("click", () => {
  resetSearch();
  searchInput.focus();
});
// Nach Klick auf ein Icon (Link oeffnet sich in neuem Tab) die Suche zuruecksetzen.
homeGrid.addEventListener("click", (e) => {
  if (e.target.closest(".tile")) setTimeout(resetSearch, 0);
});

/* ============ IMPORT (Toride JSON) ============ */
/* Import ist nur auf der leeren Seite möglich. Für Änderungen muss der
   localStorage geleert werden. */
const importFile = document.getElementById("importFile");
function pickFile() { importFile.click(); }

function isEmptyData() {
  const d = loadData();
  const folders = (d && d.folders) || [];
  const roots = (d && d.bookmarks) || [];
  return folders.length === 0 && roots.length === 0;
}

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

importFile.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { if (!ingestJson(String(reader.result))) alert("Keine gültige Toride-JSON-Datei."); };
  reader.readAsText(file);
  e.target.value = "";
});

/* ---- Drag a .json file anywhere onto the page (nur wenn leer) ---- */
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

/* ============ WERKZEUGE (Dock + verschiebbare Fenster) ============ */
const TOOLS = Array.isArray(window.VEG_TOOLS) ? window.VEG_TOOLS : [];
const toolsDock = document.getElementById("toolsDock");
const openWindows = {}; // id -> { el, cleanup }
let winZ = 60;          // z-index-Zähler, damit angeklickte Fenster nach vorne kommen

/* Für jedes Tool einen Knopf neben der Suche; ein Klick öffnet sein Fenster. */
function buildDock() {
  if (!toolsDock) return;
  toolsDock.innerHTML = TOOLS.map((t, i) =>
    `<button class="tool-dock-btn" data-tool="${i}" title="${escAttr(t.name || "Werkzeug")}"
             aria-label="${escAttr(t.name || "Werkzeug")}"><i data-lucide="${escAttr(t.icon || "wrench")}"></i></button>`
  ).join("");
  toolsDock.querySelectorAll(".tool-dock-btn").forEach((btn) =>
    btn.addEventListener("click", () => openToolWindow(TOOLS[+btn.dataset.tool])));
  if (window.lucide) lucide.createIcons();
}

function focusWindow(el) { el.style.zIndex = ++winZ; }

function openToolWindow(tool) {
  if (!tool) return;
  // Schon offen? Nur nach vorne holen.
  if (openWindows[tool.id]) { focusWindow(openWindows[tool.id].el); return; }

  const win = document.createElement("section");
  win.className = "tool-window";
  win.setAttribute("role", "dialog");
  win.setAttribute("aria-label", tool.name || "Werkzeug");
  if (tool.width) win.style.width = tool.width + "px";
  if (tool.height) win.style.height = tool.height + "px";
  win.innerHTML = `
    <header class="tw-bar" data-drag>
      <span class="tw-ico"><i data-lucide="${escAttr(tool.icon || "wrench")}"></i></span>
      <span class="tw-title">${esc(tool.name || "Werkzeug")}</span>
      <button class="tw-close" aria-label="Schließen"><i data-lucide="x"></i></button>
    </header>
    <div class="tw-body"></div>`;
  document.body.appendChild(win);

  // mittig-oben platzieren (innerhalb des sichtbaren Bereichs)
  const w = win.offsetWidth, h = win.offsetHeight;
  win.style.left = Math.max(8, (window.innerWidth - w) / 2) + "px";
  win.style.top = Math.max(8, (window.innerHeight - h) / 3) + "px";

  const closeBtn = win.querySelector(".tw-close");

  // Schnittstelle, die ein Tool in render() bekommt: eigene Icon-Knöpfe in die
  // Titelleiste hängen (z.B. "Zurücksetzen") und das Fenster schließen.
  const api = {
    addHeaderAction({ icon, title, onClick, danger }) {
      const btn = document.createElement("button");
      btn.className = "tw-action" + (danger ? " danger" : "");
      btn.title = title || "";
      btn.setAttribute("aria-label", title || "");
      btn.innerHTML = `<i data-lucide="${escAttr(icon || "circle")}"></i>`;
      btn.addEventListener("click", onClick);
      closeBtn.before(btn); // immer links vom Schließen-Knopf
      if (window.lucide) lucide.createIcons();
      return btn;
    },
    close: () => closeToolWindow(tool.id),
  };

  let cleanup = null;
  const body = win.querySelector(".tw-body");
  try { cleanup = tool.render(body, api) || null; }
  catch { body.textContent = "Fehler beim Laden des Werkzeugs."; }
  openWindows[tool.id] = { el: win, cleanup };

  closeBtn.addEventListener("click", () => closeToolWindow(tool.id));
  win.addEventListener("pointerdown", () => focusWindow(win), true);
  makeWindowDraggable(win, win.querySelector("[data-drag]"));
  focusWindow(win);
  if (window.lucide) lucide.createIcons();
}

function closeToolWindow(id) {
  const rec = openWindows[id];
  if (!rec) return;
  if (typeof rec.cleanup === "function") { try { rec.cleanup(); } catch {} }
  rec.el.remove();
  delete openWindows[id];
}

/* Fenster an der Titelleiste mit Maus oder Finger frei verschieben. */
function makeWindowDraggable(win, handle) {
  let startX = 0, startY = 0, originX = 0, originY = 0, dragging = false;
  handle.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return; // Knöpfe in der Titelleiste nicht zum Ziehen nutzen
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    const r = win.getBoundingClientRect();
    originX = r.left; originY = r.top;
    win.classList.add("dragging");
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const maxX = Math.max(0, window.innerWidth - win.offsetWidth);
    const maxY = Math.max(0, window.innerHeight - win.offsetHeight);
    const nx = Math.min(Math.max(0, originX + e.clientX - startX), maxX);
    const ny = Math.min(Math.max(0, originY + e.clientY - startY), maxY);
    win.style.left = nx + "px";
    win.style.top = ny + "px";
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false; win.classList.remove("dragging");
    try { handle.releasePointerCapture(e.pointerId); } catch {}
  };
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
}

buildDock();

/* ============ INIT ============ */
render();
if (window.lucide) lucide.createIcons();

/* Alte Service-Worker + Caches einer früheren PWA-Version entfernen. */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
}
if (window.caches) {
  caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
}
