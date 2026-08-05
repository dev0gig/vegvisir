/* ============ WERKZEUGE (Dock + verschiebbare Fenster) ============ */
/* Liest die Werkzeug-Liste aus tools.js (window.VEG_TOOLS, klassisches Skript)
   und baut je Werkzeug einen Knopf neben der Suche. Ein Werkzeug erscheint
   entweder als Bottom-Sheet (Standard) oder als frei verschiebbares Fenster. */

import { esc, escAttr } from "./dom.js";
import { openBookmarkEditor, openFolderEditor } from "./editor.js";
import { pickFile, exportData } from "./importexport.js";

const backdrop = document.getElementById("backdrop");
const toolsDock = document.getElementById("toolsDock");

const TOOLS = Array.isArray(window.VEG_TOOLS) ? window.VEG_TOOLS : [];
const openWindows = {}; // id -> { el, cleanup }
let winZ = 60;          // z-index-Zähler, damit angeklickte Fenster nach vorne kommen
let sheetToolId = null; // id des Werkzeugs, das gerade als Bottom-Sheet offen ist

/* Damit andere Module wissen, ob gerade ein Werkzeug-Sheet offen ist. */
export function getSheetToolId() { return sheetToolId; }

/* Was das Menü außer den Werkzeugen noch anbietet: die Bookmark-Verwaltung.
   So ist alles auch ohne Slash-Befehle erreichbar (wichtig am Handy). */
const ACTIONS = [
  { action: "new-bookmark", icon: "plus",                 label: "Bookmark anlegen" },
  { action: "new-folder",   icon: "folder-plus",          label: "Ordner anlegen" },
  { action: "import",       icon: "upload",               label: "Importieren (JSON)" },
  { action: "export",       icon: "hard-drive-download",  label: "Sichern (JSON)" },
];

/* Ein einziger Knopf neben der Suche öffnet ein kleines Menü mit der
   Bookmark-Verwaltung und allen Werkzeugen (aus tools.js). */
export function buildDock() {
  if (!toolsDock) return;
  const actionItems = ACTIONS.map((a) =>
    `<button class="dock-menu-item" role="menuitem" data-action="${escAttr(a.action)}">
       <i data-lucide="${escAttr(a.icon)}"></i><span>${esc(a.label)}</span>
     </button>`).join("");
  const toolItems = TOOLS.map((t, i) =>
    `<button class="dock-menu-item" role="menuitem" data-tool="${i}">
       <i data-lucide="${escAttr(t.icon || "wrench")}"></i><span>${esc(t.name || "Werkzeug")}</span>
     </button>`).join("");
  toolsDock.innerHTML = `
    <button class="tool-dock-btn" id="dockMenuBtn" title="Menü" aria-label="Menü"
            aria-haspopup="true" aria-expanded="false"><i data-lucide="menu"></i></button>
    <div class="dock-menu" id="dockMenu" role="menu">
      ${actionItems}
      ${TOOLS.length ? '<div class="dock-menu-sep"></div>' : ""}
      ${toolItems}
    </div>`;

  const btn = toolsDock.querySelector("#dockMenuBtn");
  const menu = toolsDock.querySelector("#dockMenu");
  // Sichtbarkeit über die .open-Klasse (nicht das hidden-Attribut), damit das
  // Ein-/Ausblenden per CSS sanft animiert werden kann.
  const isOpen = () => menu.classList.contains("open");
  const setOpen = (open) => {
    menu.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.classList.toggle("active", open);
  };

  btn.addEventListener("click", (e) => { e.stopPropagation(); setOpen(!isOpen()); });
  menu.querySelectorAll(".dock-menu-item").forEach((item) =>
    item.addEventListener("click", () => {
      setOpen(false);
      const a = item.dataset.action;
      if (a === "new-bookmark") openBookmarkEditor(null, null);
      else if (a === "new-folder") openFolderEditor(null);
      else if (a === "import") pickFile();
      else if (a === "export") exportData();
      else openToolWindow(TOOLS[+item.dataset.tool]);
    }));

  // Auf Geräten mit echtem Zeiger (Maus) öffnet sich das Menü schon beim
  // Überfahren des Knopfes. Eine kleine Schließ-Verzögerung überbrückt die
  // 10px-Lücke zwischen Knopf und Menü, damit es beim Rüberfahren nicht
  // flackert. Touch-Geräte (kein Hover) nutzen weiterhin den Klick.
  if (window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    let closeTimer = null;
    const cancelClose = () => { if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; } };
    toolsDock.addEventListener("mouseenter", () => { cancelClose(); setOpen(true); });
    toolsDock.addEventListener("mouseleave", () => {
      cancelClose();
      closeTimer = setTimeout(() => setOpen(false), 160);
    });
  }

  // Klick außerhalb oder Escape schließt das Menü wieder.
  document.addEventListener("click", (e) => {
    if (isOpen() && !toolsDock.contains(e.target)) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) setOpen(false);
  });

  if (window.lucide) lucide.createIcons();
}

function focusWindow(el) { el.style.zIndex = ++winZ; }

/* Ein Werkzeug anhand seiner id öffnen (für die Slash-Befehle). Ist es schon
   offen, wird es nur nach vorne geholt statt umgeschaltet. */
export function openToolById(id) {
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) return;
  if (openWindows[id]) { focusWindow(openWindows[id].el); return; }
  openToolWindow(tool);
}

export function openToolWindow(tool) {
  if (!tool) return;
  // Schon offen? Erneutes Tippen auf den Knopf schließt das Werkzeug wieder.
  if (openWindows[tool.id]) { closeToolWindow(tool.id); return; }

  // Das Werkzeug bestimmt selbst, wie es erscheint: als Bottom-Sheet (wie die
  // Ordner, Standard) oder als frei verschiebbares Fenster (display: "window").
  const asSheet = tool.display !== "window";

  const win = document.createElement("section");
  win.className = "tool-window" + (asSheet ? " as-sheet" : "");
  win.dataset.toolId = tool.id;
  win.setAttribute("role", "dialog");
  win.setAttribute("aria-modal", asSheet ? "true" : "false");
  win.setAttribute("aria-label", tool.name || "Werkzeug");
  if (!asSheet) {
    if (tool.width) win.style.width = tool.width + "px";
    if (tool.height) win.style.height = tool.height + "px";
  }
  win.innerHTML = `
    ${asSheet ? '<div class="tw-handle" data-handle></div>' : ""}
    <header class="tw-bar" data-drag>
      <span class="tw-ico"><i data-lucide="${escAttr(tool.icon || "wrench")}"></i></span>
      <span class="tw-title">${esc(tool.name || "Werkzeug")}</span>
      <button class="tw-close" aria-label="Schließen"><i data-lucide="x"></i></button>
    </header>
    <div class="tw-body"></div>`;
  document.body.appendChild(win);

  if (asSheet) {
    // wie ein Ordner-Sheet: Hintergrund abdunkeln, von unten hereinfahren
    sheetToolId = tool.id;
    backdrop.classList.add("open");
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      win.classList.add("open");
      win.style.transform = "translate(-50%, 0)";
    });
  } else {
    // mittig-oben platzieren (innerhalb des sichtbaren Bereichs)
    const w = win.offsetWidth, h = win.offsetHeight;
    win.style.left = Math.max(8, (window.innerWidth - w) / 2) + "px";
    win.style.top = Math.max(8, (window.innerHeight - h) / 3) + "px";
  }

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
  if (asSheet) {
    // Am Griff nach unten ziehen schließt das Sheet (wie bei den Ordnern).
    attachToolSheetDrag(win, tool.id);
  } else {
    win.addEventListener("pointerdown", () => focusWindow(win), true);
    makeWindowDraggable(win, win.querySelector("[data-drag]"));
    focusWindow(win);
  }
  if (window.lucide) lucide.createIcons();
}

export function closeToolWindow(id) {
  const rec = openWindows[id];
  if (!rec) return;
  delete openWindows[id];
  if (typeof rec.cleanup === "function") { try { rec.cleanup(); } catch {} }
  const el = rec.el;
  if (el.classList.contains("as-sheet")) {
    // nach unten herausfahren, dann erst entfernen
    if (sheetToolId === id) sheetToolId = null;
    el.classList.remove("open");
    el.style.transform = "";
    if (!sheetToolId) {
      backdrop.classList.remove("open");
      document.body.style.overflow = "";
    }
    el.addEventListener("transitionend", () => el.remove(), { once: true });
    setTimeout(() => { if (el.isConnected) el.remove(); }, 500);
  } else {
    el.remove();
  }
}

/* Werkzeug-Sheet nach unten wegziehen (Schließen ab ~110px) — wie bei den
   Ordner-Sheets auf zwei Wegen:
    • Desktop: per Maus am Griff.
    • Touch: mit einer Wischgeste irgendwo auf der GESAMTEN Sheet-Fläche.
      Damit Wischen und Scrollen sich nicht in die Quere kommen, startet die
      Schließ-Geste nur, wenn der Inhalt ganz oben steht und man nach unten
      zieht — sonst scrollt der Inhalt ganz normal. */
function attachToolSheetDrag(win, id) {
  const handle = win.querySelector("[data-handle]");
  if (!handle) return;
  const scroll = win.querySelector(".tw-body");
  let startY = 0, dy = 0, dragging = false;

  const finish = () => {
    dragging = false;
    win.classList.remove("dragging");
    if (dy > 110) closeToolWindow(id);
    else win.style.transform = "translate(-50%, 0)";
  };

  /* Desktop: Maus am Griff */
  handle.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") return; // Touch läuft über die Geste unten
    dragging = true; startY = e.clientY; dy = 0;
    win.classList.add("dragging");
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    dy = Math.max(0, e.clientY - startY);
    win.style.transform = `translate(-50%, ${dy}px)`;
  });
  handle.addEventListener("pointerup", () => { if (dragging) finish(); });
  handle.addEventListener("pointercancel", () => { if (dragging) finish(); });

  /* Touch: Wischen auf der ganzen Fläche */
  let touchActive = false;
  win.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    startY = e.touches[0].clientY; dy = 0;
    touchActive = true; dragging = false;
  }, { passive: true });
  win.addEventListener("touchmove", (e) => {
    if (!touchActive) return;
    const delta = e.touches[0].clientY - startY;
    const atTop = !scroll || scroll.scrollTop <= 0;
    if (!dragging) {
      // Geste erst starten, wenn man von ganz oben nach unten zieht
      if (delta > 6 && atTop) {
        dragging = true;
        win.classList.add("dragging");
      } else {
        return; // sonst normal scrollen lassen
      }
    }
    dy = Math.max(0, delta);
    e.preventDefault();
    win.style.transform = `translate(-50%, ${dy}px)`;
  }, { passive: false });
  const endTouch = () => {
    if (!touchActive) return;
    touchActive = false;
    if (dragging) finish();
  };
  win.addEventListener("touchend", endTouch);
  win.addEventListener("touchcancel", endTouch);
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
