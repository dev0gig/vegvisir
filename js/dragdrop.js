/* ============ KACHELN ZIEHEN + ORDNER-GESTE ============ */
/* Eine eigene Ziehschicht auf Pointer-Events — EIN Codeweg für Maus, Finger
 * und Stift. Bewusst ohne Fremdbibliothek (gridstack & Co.): deren Kollisions-
 * Logik schiebt beim Ziehen genau die Kachel weg, auf der man landen will, und
 * damit wäre die Ordner-Geste unmöglich.
 *
 * Der Trick, der Umsortieren und Ordner-Bilden versöhnt — die MITTE zählt:
 *
 *     +---------------------+
 *     |  Rand: umsortieren  |
 *     |   +-------------+   |
 *     |   |    MITTE    |   |   Mitte  → 0,7 s halten = Ordner bilden
 *     |   |   = Ordner  |   |   Rand   → sofort einsortieren
 *     |   +-------------+   |
 *     |  Rand: umsortieren  |
 *     +---------------------+
 *
 * Weil über der Mitte NICHT umsortiert wird, rutscht die Zielkachel beim
 * Zielen nie weg. Genau das macht die Geste erst benutzbar.
 *
 * Bedienung:
 *   Maus:   ziehen ab 5 px Bewegung.
 *   Finger: 0,35 s drücken = Kachel aufnehmen (vorher scrollt die Seite ganz
 *           normal weiter). Aufnehmen und ohne Bewegung loslassen öffnet das
 *           Kachelmenü — so braucht es dafür keinen zweiten langen Druck. */

import { applyOrder, mergeItems, moveItem } from "./store.js";
import { render, openFolder } from "./render.js";
import { openTileMenu } from "./editor.js";

const LONG_PRESS_MS = 350;   // Finger: so lange drücken, um eine Kachel aufzunehmen
const MERGE_MS = 700;        // so lange über der Mitte halten, um einen Ordner zu bilden
const MOVE_TOL = 8;          // ab so vielen Pixeln gilt eine Berührung als Wischen
const MOUSE_START = 5;       // Maus: ab so vielen Pixeln beginnt das Ziehen
const MERGE_ZONE = 0.55;     // Anteil der Kachel, der als "Mitte" gilt
const EDGE_SCROLL = 90;      // Abstand zum Fensterrand, ab dem mitgescrollt wird

let st = null;               // Zustand der laufenden Geste (null = keine)

/* Hängt die Ziehschicht an das Kachelraster. Wird nach jedem render() neu
   aufgerufen — das Raster ist dann ein frisches Element. */
export function attachDrag(grid) {
  grid.addEventListener("pointerdown", onPointerDown);
}

/* Einmalig: verhindert das Scrollen der Seite, solange gezogen wird.
   Muss "passive: false" sein, sonst darf preventDefault() nicht wirken. */
document.addEventListener("touchmove", (e) => {
  if (st && st.dragging && e.cancelable) e.preventDefault();
}, { passive: false });

function onPointerDown(e) {
  if (st) return;                                   // schon eine Geste aktiv
  if (e.pointerType === "mouse" && e.button !== 0) return;  // nur linke Maustaste
  const tile = e.target.closest(".tile");
  if (!tile) return;
  const grid = e.currentTarget;

  st = {
    grid, tile,
    id: tile.dataset.id,
    pointerId: e.pointerId,
    type: e.pointerType,
    startX: e.clientX, startY: e.clientY,
    x: e.clientX, y: e.clientY,
    dragging: false,
    movedFar: false,
    ghost: null,
    hot: null,            // Kachel, über deren Mitte gerade gehalten wird
    hotTimer: null,
    mergeReady: false,
    longTimer: null,
    raf: null,
  };

  if (e.pointerType === "mouse") {
    // Maus: kein langer Druck nötig, Ziehen startet mit der Bewegung.
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
  } else {
    // Finger/Stift: erst nach kurzem Halten aufnehmen, damit Scrollen bleibt.
    st.longTimer = setTimeout(() => {
      st.longTimer = null;
      beginDrag();
    }, LONG_PRESS_MS);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
  }
}

function onPointerMove(e) {
  if (!st || e.pointerId !== st.pointerId) return;
  st.x = e.clientX; st.y = e.clientY;
  const dx = st.x - st.startX, dy = st.y - st.startY;
  const dist = Math.hypot(dx, dy);
  if (dist > MOVE_TOL) st.movedFar = true;

  if (!st.dragging) {
    if (st.type === "mouse") {
      if (dist > MOUSE_START) beginDrag();
    } else if (st.longTimer && dist > MOVE_TOL) {
      // Finger bewegt sich vor Ablauf des langen Drucks → das war Scrollen.
      cleanup(false);
    }
    return;
  }

  moveGhost();
  hitTest();
}

function onPointerUp(e) {
  if (!st || e.pointerId !== st.pointerId) return;
  if (!st.dragging) { cleanup(false); return; }

  // Aufgenommen und ohne Bewegung wieder losgelassen (Finger) → Kachelmenü.
  if (!st.movedFar && st.type !== "mouse") {
    const id = st.id;
    const x = st.x, y = st.y;
    cleanup(true);
    openTileMenu(id, x, y);
    return;
  }

  if (st.mergeReady && st.hot) {
    const targetId = st.hot.dataset.id;
    const dragId = st.id;
    cleanup(true);
    const folderId = mergeItems(dragId, targetId);
    if (folderId) openFolder(folderId); else render();
    return;
  }

  commitOrder();
  cleanup(true);
  render();
}

function onPointerCancel(e) {
  if (!st || e.pointerId !== st.pointerId) return;
  const wasDragging = st.dragging;
  cleanup(false);
  if (wasDragging) render(); // abgebrochen: sauberen Stand neu zeichnen
}

/* ---- Ziehen starten ---- */
/* WICHTIG: Verschoben wird beim Umsortieren ein leerer PLATZHALTER, nicht die
   Kachel selbst. Grund: Wandert das Element, an dem die Geste hängt, im DOM
   umher, bricht der Browser die Zeiger-Erfassung ab (pointercancel) und die
   ganze Geste endet mitten in der Bewegung. Die Originalkachel bleibt deshalb
   unsichtbar an ihrem Platz stehen, bis losgelassen wird. */
function beginDrag() {
  if (!st || st.dragging) return;
  if (st.longTimer) { clearTimeout(st.longTimer); st.longTimer = null; }
  st.dragging = true;

  const tile = st.tile;
  const r = tile.getBoundingClientRect();
  st.offX = st.startX - r.left;
  st.offY = st.startY - r.top;

  // Platzhalter = die Lücke, die durchs Raster wandert.
  const ph = document.createElement("div");
  ph.className = "tile tile-placeholder " + [...tile.classList].filter((c) => c.startsWith("size-")).join(" ");
  ph.dataset.id = st.id;
  tile.parentElement.insertBefore(ph, tile);
  st.ph = ph;

  // Der Klon folgt dem Zeiger.
  const ghost = tile.cloneNode(true);
  ghost.classList.add("tile-ghost");
  ghost.removeAttribute("href");
  ghost.style.width = r.width + "px";
  ghost.style.height = r.height + "px";
  document.body.appendChild(ghost);
  st.ghost = ghost;

  tile.classList.add("is-dragging");
  st.grid.classList.add("dragging");
  document.body.classList.add("tile-dragging");

  moveGhost();
  startAutoScroll();
}

function moveGhost() {
  if (!st || !st.ghost) return;
  st.ghost.style.transform = `translate(${st.x - st.offX}px, ${st.y - st.offY}px)`;
}

/* ---- Ziel bestimmen: Mitte = Ordner, Rand = umsortieren ---- */
function hitTest() {
  const el = document.elementFromPoint(st.x, st.y); // der Klon hat pointer-events:none
  if (!el) { clearHot(); return; }

  const over = el.closest(".tile");
  const panel = el.closest(".folder-panel");

  // Die Werkzeug-Gruppe ist ein eigenes, festes Raster — dort wird weder
  // einsortiert noch ein Ordner gebildet. Alles außerhalb des Favoriten-
  // Rasters zählt als freie Fläche.
  if (over && !st.grid.contains(over)) { clearHot(); return; }

  // Über einer fremden Kachel? (Die eigene und der Platzhalter zählen nicht.)
  if (over && over !== st.tile && over !== st.ph) {
    const r = over.getBoundingClientRect();
    const cx = (st.x - r.left) / r.width;
    const cy = (st.y - r.top) / r.height;
    const lo = (1 - MERGE_ZONE) / 2, hi = 1 - lo;
    const inMiddle = cx > lo && cx < hi && cy > lo && cy < hi;

    // Ordner in Ordner gibt es nicht — dann zählt auch die Mitte als Rand.
    const canMerge = inMiddle && st.tile.dataset.type !== "folder";

    if (canMerge) {
      setHot(over);     // Ring baut sich auf, NICHT umsortieren
      return;
    }
    clearHot();
    reorderBefore(over, cx > 0.5);
    return;
  }

  clearHot();

  // Über der freien Fläche eines aufgeklappten Ordners → hineinlegen.
  // (Der Ordner ist selbst das Raster, es gibt kein Feld drumherum mehr.)
  if (panel && st.tile.dataset.type !== "folder") {
    if (st.ph.parentElement !== panel) flip(() => panel.appendChild(st.ph));
    return;
  }

  // Über der freien Fläche der Kachelwand → ans Ende der obersten Ebene.
  const grid = st.grid;
  if (el.closest(".tile-grid") === grid && st.ph.parentElement !== grid) {
    flip(() => grid.appendChild(st.ph));
  }
}

/* Den Platzhalter vor oder hinter die überfahrene Kachel setzen. */
function reorderBefore(target, after) {
  const parent = target.parentElement;
  const ref = after ? target.nextSibling : target;
  if (ref === st.ph) return;                          // steht schon dort
  if (!after && target.previousSibling === st.ph) return;
  flip(() => parent.insertBefore(st.ph, ref));
}

/* ---- Ring über der Mitte ---- */
function setHot(tile) {
  if (st.hot === tile) return;
  clearHot();
  st.hot = tile;
  // Klasse kurz entfernen und einen Umbruch erzwingen, damit die Ring-
  // Animation auch beim erneuten Überfahren derselben Kachel neu startet.
  tile.classList.remove("merge-hot");
  void tile.offsetWidth;
  tile.classList.add("merge-hot");
  st.hotTimer = setTimeout(() => {
    st.mergeReady = true;
    if (st.hot) st.hot.classList.add("merge-ready");
  }, MERGE_MS);
}

function clearHot() {
  if (!st) return;
  if (st.hotTimer) { clearTimeout(st.hotTimer); st.hotTimer = null; }
  if (st.hot) { st.hot.classList.remove("merge-hot", "merge-ready"); st.hot = null; }
  st.mergeReady = false;
}

/* ---- Sanftes Nachrutschen der anderen Kacheln (FLIP) ---- */
/* Erst alle Positionen merken, dann umbauen, dann jede Kachel von ihrer alten
   an ihre neue Stelle animieren. */
function flip(mutate) {
  const els = [...st.grid.querySelectorAll(".tile")];
  const before = new Map(els.map((el) => [el, el.getBoundingClientRect()]));
  mutate();
  els.forEach((el) => {
    if (el === st.ph || el === st.tile) return;   // Lücke und Original springen mit
    const b = before.get(el);
    if (!b) return;
    const a = el.getBoundingClientRect();
    const dx = b.left - a.left, dy = b.top - a.top;
    if (!dx && !dy) return;
    el.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
      { duration: 190, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)" }
    );
  });
}

/* ---- Mitscrollen am Fensterrand ---- */
function startAutoScroll() {
  const step = () => {
    if (!st || !st.dragging) return;
    const top = st.y - EDGE_SCROLL;
    const bottom = st.y - (window.innerHeight - EDGE_SCROLL);
    let dy = 0;
    if (top < 0) dy = Math.max(-18, top / 5);
    else if (bottom > 0) dy = Math.min(18, bottom / 5);
    if (dy) window.scrollBy(0, dy);
    st.raf = requestAnimationFrame(step);
  };
  st.raf = requestAnimationFrame(step);
}

/* ---- Neue Reihenfolge aus dem DOM in die Daten übernehmen ---- */
/* Die Position des Platzhalters IST die neue Position der Kachel; die
   unsichtbare Originalkachel wird dabei übersprungen. */
function readIds(parent, directOnly) {
  const list = directOnly ? [...parent.children] : [...parent.querySelectorAll(":scope > .tile")];
  return list
    .filter((el) => el.classList.contains("tile") && !el.classList.contains("is-dragging"))
    .map((el) => el.dataset.id);
}

function commitOrder() {
  const grid = st.grid;
  const topIds = readIds(grid, true);

  const panel = grid.querySelector(".folder-panel");
  let folderId = null, folderIds = null;
  if (panel) {
    folderId = panel.dataset.panel;
    folderIds = readIds(panel, true);
  }
  applyOrder(topIds, folderId, folderIds);
}

/* ---- Aufräumen ---- */
function cleanup(wasDrag) {
  if (!st) return;
  if (st.longTimer) clearTimeout(st.longTimer);
  if (st.hotTimer) clearTimeout(st.hotTimer);
  if (st.raf) cancelAnimationFrame(st.raf);
  if (st.hot) st.hot.classList.remove("merge-hot", "merge-ready");
  if (st.ghost) st.ghost.remove();
  if (st.ph) st.ph.remove();
  st.tile.classList.remove("is-dragging");
  st.grid.classList.remove("dragging");
  document.body.classList.remove("tile-dragging");

  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", onPointerCancel);

  if (wasDrag) {
    // Der Browser feuert nach dem Loslassen noch ein click-Ereignis. Ohne
    // diese Sperre würde das gezogene Bookmark zusätzlich geöffnet.
    const grid = st.grid;
    grid.dataset.justDragged = "1";
    setTimeout(() => { delete grid.dataset.justDragged; }, 250);
  }
  st = null;
}

/* Für das Kachelmenü: ein Bookmark aus einem Ordner nach oben holen. */
export function moveOut(id) {
  moveItem(id, { toEnd: true });
  render();
}
