/* ============ WERKZEUGE (frei verschiebbare Fenster) ============ */
/* Liest die Werkzeug-Liste aus tools.js (window.VEG_TOOLS, klassisches Skript)
   und öffnet ein Werkzeug als Fenster, das man an der Titelleiste überall
   hinschieben kann. Bottom-Sheets gibt es bewusst nicht mehr — und auch keinen
   Menü-Knopf: jedes Werkzeug hat seine eigene Kachel auf der Wand, dazu die
   Slash-Befehle (/calc, /zeit, /duplex). */

import { esc, escAttr } from "./dom.js";

const TOOLS = Array.isArray(window.VEG_TOOLS) ? window.VEG_TOOLS : [];
const openWindows = {}; // id -> { el, cleanup }
let winZ = 60;          // z-index-Zähler, damit angeklickte Fenster nach vorne kommen

export function getTools() { return TOOLS; }

function focusWindow(el) { el.style.zIndex = ++winZ; }

/* Ein Werkzeug anhand seiner id öffnen (Kachel und Slash-Befehle). Ist es schon
   offen, wird es nur nach vorne geholt statt umgeschaltet.
   Seiten-Werkzeuge (kind:"page", z.B. CardCrop) haben kein Fenster — sie
   sind eigene Unterseiten, dorthin wird einfach navigiert. */
export function openToolById(id) {
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) return;
  if (tool.kind === "page") { location.href = tool.url; return; }
  if (openWindows[id]) { focusWindow(openWindows[id].el); return; }
  openToolWindow(tool);
}

export function openToolWindow(tool) {
  if (!tool) return;
  // Schon offen? Erneutes Tippen auf die Kachel schließt das Werkzeug wieder.
  if (openWindows[tool.id]) { closeToolWindow(tool.id); return; }

  const win = document.createElement("section");
  win.className = "tool-window";
  win.dataset.toolId = tool.id;
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

  // Mittig-oben platzieren (innerhalb des sichtbaren Bereichs).
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

export function closeToolWindow(id) {
  const rec = openWindows[id];
  if (!rec) return;
  delete openWindows[id];
  if (typeof rec.cleanup === "function") { try { rec.cleanup(); } catch {} }
  rec.el.remove();
}

/* Für die Escape-Taste: das oberste offene Fenster schließen.
   Gibt zurück, ob überhaupt eines offen war. */
export function closeTopToolWindow() {
  const ids = Object.keys(openWindows);
  if (!ids.length) return false;
  const top = ids.reduce((best, id) =>
    (+openWindows[id].el.style.zIndex || 0) > (+openWindows[best].el.style.zIndex || 0) ? id : best);
  closeToolWindow(top);
  return true;
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
