/* ============ WERKZEUGE (Dock + verschiebbare Fenster) ============ */
/* Liest die Werkzeug-Liste aus tools.js (window.VEG_TOOLS, klassisches Skript)
   und baut je Werkzeug einen Knopf neben der Suche. Ein Werkzeug erscheint
   entweder als Bottom-Sheet (Standard) oder als frei verschiebbares Fenster. */

import { esc, escAttr } from "./dom.js";
import { getActiveSheet } from "./sheet.js";

const backdrop = document.getElementById("backdrop");
const toolsDock = document.getElementById("toolsDock");

const TOOLS = Array.isArray(window.VEG_TOOLS) ? window.VEG_TOOLS : [];
const openWindows = {}; // id -> { el, cleanup }
let winZ = 60;          // z-index-Zähler, damit angeklickte Fenster nach vorne kommen
let sheetToolId = null; // id des Werkzeugs, das gerade als Bottom-Sheet offen ist

/* Damit andere Module wissen, ob gerade ein Werkzeug-Sheet offen ist. */
export function getSheetToolId() { return sheetToolId; }

/* Für jedes Tool einen Knopf neben der Suche; ein Klick öffnet sein Fenster. */
export function buildDock() {
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
    if (!getActiveSheet() && !sheetToolId) {
      backdrop.classList.remove("open");
      document.body.style.overflow = "";
    }
    el.addEventListener("transitionend", () => el.remove(), { once: true });
    setTimeout(() => { if (el.isConnected) el.remove(); }, 500);
  } else {
    el.remove();
  }
}

/* Werkzeug-Sheet am Griff nach unten wegziehen (Schließen ab ~110px). */
function attachToolSheetDrag(win, id) {
  const handle = win.querySelector("[data-handle]");
  if (!handle) return;
  let startY = 0, dy = 0, dragging = false;
  handle.addEventListener("pointerdown", (e) => {
    dragging = true; startY = e.clientY; dy = 0;
    win.classList.add("dragging");
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    dy = Math.max(0, e.clientY - startY);
    win.style.transform = `translate(-50%, ${dy}px)`;
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false; win.classList.remove("dragging");
    try { handle.releasePointerCapture(e.pointerId); } catch {}
    if (dy > 110) closeToolWindow(id);
    else win.style.transform = "translate(-50%, 0)";
  };
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
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
