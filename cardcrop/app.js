/* ============================================================
   CardCrop — Vanilla JS
   Scan (JPG/PNG/PDF) -> Raster 2x4 -> 8 Einzelkarten (JPG/ZIP)
   ============================================================ */

"use strict";

// ---------- Konstanten ----------
const CARD_PRESETS = {
  big:   { w: 63.5, h: 88.9 }, // Magic / Pokémon
  small: { w: 59.0, h: 86.0 }, // Yu-Gi-Oh
};
const COLS = 4;
const ROWS = 2;
const JPG_QUALITY = 0.9;
const LS_KEY = "cardcrop.settings.v1";
const LS_IMG = "cardcrop.lastscan.v1";
const MAX_STORED_IMG = 5 * 1024 * 1024; // ~5 MB Base64-Limit fürs Speichern

// ---------- State ----------
const state = {
  mode: "big",
  customW: 63.5,
  customH: 88.9,
  scale: 0.44,      // Kartenhöhe als Anteil der Bildhöhe
  offsetX: 0,       // in Bild-Pixeln (Original)
  offsetY: 0,
  img: null,        // HTMLImageElement des Scans
  filename: "scan",
};

// ---------- DOM ----------
const $ = (sel) => document.querySelector(sel);
const els = {
  segs: document.querySelectorAll(".seg"),
  customDims: $("#customDims"),
  customW: $("#customW"),
  customH: $("#customH"),
  dropzone: $("#dropzone"),
  fileInput: $("#fileInput"),
  filename: $("#filename"),
  rasterStep: $("#rasterStep"),
  scale: $("#scale"),
  offsetReadout: $("#offsetReadout"),
  cropBtn: $("#cropBtn"),
  stageEmpty: $("#stageEmpty"),
  canvasWrap: $("#canvasWrap"),
  canvas: $("#editor"),
  results: $("#results"),
  cardsGrid: $("#cardsGrid"),
  zipBtn: $("#zipBtn"),
  spinner: $("#spinner"),
  spinnerText: $("#spinnerText"),
  tooltip: $("#tooltip"),
};
const ctx = els.canvas.getContext("2d");

// pdf.js Worker
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
}

// ============================================================
//  Hilfsfunktionen
// ============================================================
function showSpinner(text) {
  els.spinnerText.textContent = text || "Verarbeite …";
  els.spinner.hidden = false;
}
function hideSpinner() { els.spinner.hidden = true; }

// Erzwingt einen Repaint, bevor eine schwere Aufgabe blockiert
function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

function currentAspect() {
  if (state.mode === "custom") return state.customW / state.customH;
  const p = CARD_PRESETS[state.mode];
  return p.w / p.h;
}

// Liefert die 8 Karten-Rechtecke in Original-Bildkoordinaten.
function cardRects() {
  const W = state.img.naturalWidth;
  const H = state.img.naturalHeight;
  const aspect = currentAspect();

  const cardH = state.scale * H;
  const cardW = cardH * aspect;
  const gapX = (W - COLS * cardW) / (COLS + 1);
  const gapY = (H - ROWS * cardH) / (ROWS + 1);

  const rects = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = gapX + c * (cardW + gapX) + state.offsetX;
      const y = gapY + r * (cardH + gapY) + state.offsetY;
      rects.push({ x, y, w: cardW, h: cardH });
    }
  }
  return rects;
}

// ============================================================
//  Zeichnen (Editor-Canvas mit Overlay)
// ============================================================
function drawEditor() {
  if (!state.img) return;
  const W = state.img.naturalWidth;
  const H = state.img.naturalHeight;
  if (els.canvas.width !== W) els.canvas.width = W;
  if (els.canvas.height !== H) els.canvas.height = H;

  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(state.img, 0, 0, W, H);

  const rects = cardRects();
  const line = Math.max(2, W / 500);

  // Abdunkeln außerhalb der Karten
  ctx.save();
  ctx.fillStyle = "rgba(6, 9, 16, 0.5)";
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  rects.forEach((r) => ctx.rect(r.x + r.w, r.y, -r.w, r.h)); // Löcher (gegenläufig)
  ctx.fill("evenodd");
  ctx.restore();

  // Karten-Rahmen
  rects.forEach((r, i) => {
    ctx.lineWidth = line;
    ctx.strokeStyle = "#34d0ff";
    ctx.shadowColor = "rgba(52,208,255,0.6)";
    ctx.shadowBlur = line * 2;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.shadowBlur = 0;

    // Nummer
    const fs = Math.max(18, W / 45);
    ctx.font = `700 ${fs}px -apple-system, sans-serif`;
    const pad = fs * 0.4;
    ctx.fillStyle = "rgba(124,108,255,0.92)";
    ctx.beginPath();
    ctx.roundRect(r.x + line, r.y + line, fs * 1.5, fs * 1.2, 6);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "top";
    ctx.fillText(String(i + 1), r.x + line + pad, r.y + line + pad * 0.6);
  });
}

// ============================================================
//  Datei laden (Bild / PDF)
// ============================================================
async function handleFile(file) {
  if (!file) return;
  state.filename = file.name.replace(/\.[^.]+$/, "") || "scan";

  try {
    if (file.type === "application/pdf") {
      showSpinner("PDF wird gerendert …");
      await nextFrame();
      await loadPdf(file);
    } else if (file.type === "image/jpeg" || file.type === "image/png") {
      showSpinner("Bild wird geladen …");
      await nextFrame();
      const dataUrl = await readAsDataURL(file);
      await setImageFromSrc(dataUrl);
    } else {
      alert("Nicht unterstütztes Format. Bitte JPG, PNG oder PDF verwenden.");
      hideSpinner();
      return;
    }
    els.filename.hidden = false;
    els.filename.textContent = "📄 " + file.name;
    persistImage();
  } catch (err) {
    console.error(err);
    alert("Datei konnte nicht verarbeitet werden:\n" + err.message);
  } finally {
    hideSpinner();
  }
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error("Lesefehler"));
    fr.readAsDataURL(file);
  });
}

function setImageFromSrc(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      state.img = img;
      onImageReady();
      resolve();
    };
    img.onerror = () => reject(new Error("Bild ungültig"));
    img.src = src;
  });
}

async function loadPdf(file) {
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1); // immer nur die erste Seite
  // Native Auflösung möglichst hoch halten (skaliert bei sehr großen Seiten herunter)
  let viewport = page.getViewport({ scale: 1 });
  const targetScale = Math.min(3, 2200 / Math.max(viewport.width, viewport.height) * 1.6 || 2);
  viewport = page.getViewport({ scale: Math.max(1.5, targetScale) });

  const tmp = document.createElement("canvas");
  tmp.width = Math.round(viewport.width);
  tmp.height = Math.round(viewport.height);
  await page.render({ canvasContext: tmp.getContext("2d"), viewport }).promise;
  await setImageFromSrc(tmp.toDataURL("image/jpeg", 0.95));
}

function onImageReady() {
  els.stageEmpty.hidden = true;
  els.canvasWrap.hidden = false;
  els.rasterStep.dataset.disabled = "false";
  drawEditor();
}

// ============================================================
//  Croppen & Vorschau
// ============================================================
async function cropCards() {
  if (!state.img) return;
  showSpinner("Karten werden ausgeschnitten …");
  await nextFrame();

  const rects = cardRects();
  const W = state.img.naturalWidth;
  const H = state.img.naturalHeight;
  const aspect = currentAspect();

  els.cardsGrid.innerHTML = "";
  els.cardsGrid.style.setProperty("--card-aspect", aspect.toFixed(3));

  const cut = document.createElement("canvas");
  const cctx = cut.getContext("2d");

  window.__cardBlobs = []; // für ZIP

  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    // Auf Bildgrenzen clampen
    const sx = Math.max(0, Math.round(r.x));
    const sy = Math.max(0, Math.round(r.y));
    const sw = Math.min(W - sx, Math.round(r.w));
    const sh = Math.min(H - sy, Math.round(r.h));

    cut.width = Math.max(1, sw);
    cut.height = Math.max(1, sh);
    cctx.clearRect(0, 0, cut.width, cut.height);
    cctx.drawImage(state.img, sx, sy, sw, sh, 0, 0, cut.width, cut.height);

    const name = `card_${String(i + 1).padStart(2, "0")}.jpg`;
    const blob = await new Promise((res) => cut.toBlob(res, "image/jpeg", JPG_QUALITY));
    const dataUrl = cut.toDataURL("image/jpeg", JPG_QUALITY);
    window.__cardBlobs.push({ name, blob });

    els.cardsGrid.appendChild(buildCardItem(dataUrl, name, blob));
  }

  els.results.hidden = false;
  hideSpinner();
  els.results.scrollIntoView({ behavior: "smooth", block: "start" });
}

function buildCardItem(dataUrl, name, blob) {
  const item = document.createElement("div");
  item.className = "card-item";

  const wrap = document.createElement("div");
  wrap.className = "card-thumb-wrap";

  const img = document.createElement("img");
  img.className = "card-thumb";
  img.src = dataUrl;
  img.alt = name;
  img.dataset.zoom = "1";
  img.addEventListener("dblclick", () => {
    const steps = { "1": "1.5", "1.5": "2", "2": "1" };
    const z = steps[img.dataset.zoom] || "1";
    img.dataset.zoom = z;
    img.style.transform = `scale(${z})`;
    img.style.cursor = z === "2" ? "zoom-out" : "zoom-in";
  });
  wrap.appendChild(img);

  const foot = document.createElement("div");
  foot.className = "card-foot";
  const label = document.createElement("span");
  label.className = "card-name";
  label.textContent = name.replace(".jpg", "");
  const dl = document.createElement("button");
  dl.className = "dl-btn";
  dl.textContent = "↓ JPG";
  dl.addEventListener("click", () => downloadBlob(blob, name));
  foot.append(label, dl);

  item.append(wrap, foot);
  return item;
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadZip() {
  if (!window.__cardBlobs || !window.__cardBlobs.length) return;
  if (!window.JSZip) { alert("ZIP-Bibliothek nicht geladen."); return; }
  showSpinner("ZIP wird erstellt …");
  await nextFrame();
  const zip = new window.JSZip();
  window.__cardBlobs.forEach(({ name, blob }) => zip.file(name, blob));
  const content = await zip.generateAsync({ type: "blob", compression: "STORE" });
  downloadBlob(content, `${state.filename}_karten.zip`);
  hideSpinner();
}

// ============================================================
//  Offset / Interaktion
// ============================================================
function updateReadout() {
  els.offsetReadout.textContent =
    `${Math.round(state.offsetX)}, ${Math.round(state.offsetY)} px`;
}

function nudge(dir, big) {
  const step = big ? 10 : 1;
  if (dir === "up") state.offsetY -= step;
  else if (dir === "down") state.offsetY += step;
  else if (dir === "left") state.offsetX -= step;
  else if (dir === "right") state.offsetX += step;
  else if (dir === "reset") { state.offsetX = 0; state.offsetY = 0; }
  drawEditor();
  updateReadout();
  saveSettings();
}

// Maus-/Touch-Ziehen
let dragging = false;
let last = { x: 0, y: 0 };
function ratio() {
  return state.img ? state.img.naturalWidth / els.canvas.clientWidth : 1;
}
els.canvas.addEventListener("pointerdown", (e) => {
  if (!state.img) return;
  dragging = true;
  els.canvas.setPointerCapture(e.pointerId);
  last = { x: e.clientX, y: e.clientY };
});
els.canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const k = ratio();
  state.offsetX += (e.clientX - last.x) * k;
  state.offsetY += (e.clientY - last.y) * k;
  last = { x: e.clientX, y: e.clientY };
  drawEditor();
  updateReadout();
});
els.canvas.addEventListener("pointerup", (e) => {
  if (!dragging) return;
  dragging = false;
  try { els.canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  saveSettings();
});

// Pfeiltasten (Fokus auf Canvas)
els.canvas.addEventListener("keydown", (e) => {
  const map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
  if (map[e.key]) {
    e.preventDefault();
    nudge(map[e.key], e.shiftKey);
  }
});

// ============================================================
//  Einstellungen (localStorage)
// ============================================================
function saveSettings() {
  const data = {
    mode: state.mode,
    customW: state.customW,
    customH: state.customH,
    scale: state.scale,
    offsetX: state.offsetX,
    offsetY: state.offsetY,
    filename: state.filename,
  };
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (_) {}
}

function persistImage() {
  // Letzten Scan als Base64 sichern (nur wenn nicht zu groß)
  try {
    const src = state.img && state.img.src;
    if (src && src.length <= MAX_STORED_IMG) {
      localStorage.setItem(LS_IMG, src);
    } else {
      localStorage.removeItem(LS_IMG);
    }
  } catch (_) { /* Speicher voll -> ignorieren */ }
  saveSettings();
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      Object.assign(state, {
        mode: d.mode ?? state.mode,
        customW: d.customW ?? state.customW,
        customH: d.customH ?? state.customH,
        scale: d.scale ?? state.scale,
        offsetX: d.offsetX ?? 0,
        offsetY: d.offsetY ?? 0,
        filename: d.filename ?? "scan",
      });
    }
  } catch (_) {}

  // UI spiegeln
  setMode(state.mode, true);
  els.customW.value = state.customW;
  els.customH.value = state.customH;
  els.scale.value = state.scale;
  updateReadout();

  // Letzten Scan wiederherstellen
  try {
    const img = localStorage.getItem(LS_IMG);
    if (img) setImageFromSrc(img);
  } catch (_) {}
}

// ============================================================
//  Kartengröße wählen
// ============================================================
function setMode(mode, silent) {
  state.mode = mode;
  els.segs.forEach((b) =>
    b.setAttribute("aria-checked", String(b.dataset.size === mode)));
  els.customDims.hidden = mode !== "custom";
  if (state.img) drawEditor();
  if (!silent) saveSettings();
}

// ============================================================
//  Event-Verdrahtung
// ============================================================
els.segs.forEach((btn) =>
  btn.addEventListener("click", () => setMode(btn.dataset.size)));

[els.customW, els.customH].forEach((inp) =>
  inp.addEventListener("input", () => {
    state.customW = parseFloat(els.customW.value) || 1;
    state.customH = parseFloat(els.customH.value) || 1;
    if (state.img) drawEditor();
    saveSettings();
  }));

els.scale.addEventListener("input", () => {
  state.scale = parseFloat(els.scale.value);
  if (state.img) drawEditor();
  saveSettings();
});

// Dropzone
els.dropzone.addEventListener("click", () => els.fileInput.click());
els.dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); els.fileInput.click(); }
});
els.fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));
["dragover", "dragenter"].forEach((ev) =>
  els.dropzone.addEventListener(ev, (e) => { e.preventDefault(); els.dropzone.classList.add("drag"); }));
["dragleave", "drop"].forEach((ev) =>
  els.dropzone.addEventListener(ev, (e) => { e.preventDefault(); els.dropzone.classList.remove("drag"); }));
els.dropzone.addEventListener("drop", (e) => {
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) handleFile(f);
});

// D-Pad
document.querySelectorAll(".dpad-btn").forEach((b) =>
  b.addEventListener("click", () => nudge(b.dataset.nudge, false)));

els.cropBtn.addEventListener("click", cropCards);
els.zipBtn.addEventListener("click", downloadZip);

// Tooltips (Hilfe-Buttons)
document.querySelectorAll("[data-tip]").forEach((el) => {
  const show = (e) => {
    els.tooltip.innerHTML = el.dataset.tip;
    els.tooltip.hidden = false;
    const rect = el.getBoundingClientRect();
    const tw = els.tooltip.offsetWidth;
    let left = rect.left + rect.width / 2 - tw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
    els.tooltip.style.left = left + "px";
    els.tooltip.style.top = (rect.bottom + 8) + "px";
  };
  const hide = () => { els.tooltip.hidden = true; };
  el.addEventListener("mouseenter", show);
  el.addEventListener("mouseleave", hide);
  el.addEventListener("focus", show);
  el.addEventListener("blur", hide);
  el.addEventListener("click", (e) => {
    e.preventDefault();
    els.tooltip.hidden ? show(e) : hide();
  });
});

// Start
loadSettings();
