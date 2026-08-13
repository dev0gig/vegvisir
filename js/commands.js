/* ============ SLASH-BEFEHLE ============ */
/* Die Definitionen und die Ausführung der Slash-Befehle aus der Suchleiste.
   Die Eingabe-UX (Palette, Pfeiltasten, Global-Typing) liegt in search.js —
   dieses Modul kennt nur "was ein Befehl tut" und liefert die Live-Vorschau
   (Blitzrechner /c).

   Ein eigener, fixer Layer über der Suchleiste (#cmdLayer) hält die Palette
   (von search.js befüllt) und ein Panel für Vorschau/Ergebnisse/Meldungen. */

import { openToolById } from "./toolwindows.js";
import { openBookmarkEditor, openFolderEditor } from "./editor.js";
import { esc } from "./dom.js";

/* Definition aller Befehle. `arg` = nimmt Freitext hinter dem Befehl;
   `live` = zeigt schon beim Tippen ein Ergebnis (kein Ausführen mit Enter). */
export const COMMANDS = [
  { cmd: "/g",      arg: true,  live: false, icon: "search",      desc: "Websuche bei Google" },
  { cmd: "/c",      arg: true,  live: true,  icon: "calculator",  desc: "Blitzrechner direkt in der Suchzeile" },
  { cmd: "/neu",    arg: false, live: false, icon: "plus",        desc: "Neues Bookmark anlegen" },
  { cmd: "/ordner", arg: false, live: false, icon: "folder-plus", desc: "Neuen Ordner anlegen" },
  { cmd: "/calc",   arg: false, live: false, icon: "calculator",  desc: "Taschenrechner-Fenster öffnen" },
  { cmd: "/zeit",   arg: false, live: false, icon: "clock",       desc: "Dienstzeiten-Rechner öffnen" },
  { cmd: "/duplex", arg: false, live: false, icon: "file-stack",  desc: "PDF Duplex-Fixer öffnen (Scan-Seiten sortieren)" },
  { cmd: "/crop",   arg: false, live: false, icon: "crop",        desc: "CardCrop öffnen (Karten-Scans zerlegen)" },
  { cmd: "/mtg",    arg: false, live: false, icon: "layers",      desc: "MTG-Suche öffnen (alte Magic-Karten)" },
];

const byCmd = Object.fromEntries(COMMANDS.map((c) => [c.cmd, c]));

/* ---- Layer / Palette / Panel ---- */
let layer = null, paletteEl = null, panelEl = null;
function ensureLayer() {
  if (layer) return;
  layer = document.createElement("div");
  layer.id = "cmdLayer";
  layer.innerHTML = '<div class="cmd-palette" hidden></div><div class="cmd-panel" hidden></div>';
  document.body.appendChild(layer);
  paletteEl = layer.querySelector(".cmd-palette");
  panelEl = layer.querySelector(".cmd-panel");
}
export function getPaletteEl() { ensureLayer(); return paletteEl; }

function showPanel(html) { ensureLayer(); panelEl.innerHTML = html; panelEl.hidden = false; }
export function hidePanel() { if (panelEl) { panelEl.hidden = true; panelEl.innerHTML = ""; } }

/* Kurze, selbst verschwindende Rückmeldung im Panel. */
let flashTimer = null;
export function flash(text, kind) {
  showPanel(`<div class="cmd-flash ${kind || ""}">${esc(text)}</div>`);
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(hidePanel, 3200);
}

/* ---- Befehl aus dem Eingabetext zerlegen ---- */
export function parseInput(text) {
  const t = String(text);
  const sp = t.indexOf(" ");
  const cmd = (sp === -1 ? t : t.slice(0, sp)).toLowerCase();
  const arg = sp === -1 ? "" : t.slice(sp + 1);
  return { cmd, arg, hasSpace: sp !== -1 };
}

/* ---- Blitzrechner (/c): nur Grundrechenarten, sicher ohne echtes eval ---- */
export function calcExpression(expr) {
  const s = String(expr).trim();
  if (!s) return null;
  if (!/^[0-9+\-*/().,%\s]+$/.test(s)) return null;   // strikt: nur Zahlen & Rechenzeichen
  const norm = s.replace(/,/g, ".").replace(/%/g, "/100");
  try {
    const val = Function('"use strict";return (' + norm + ");")();
    return typeof val === "number" && isFinite(val) ? val : null;
  } catch { return null; }
}
function fmtNum(n) {
  const r = Math.round(n * 1e10) / 1e10;
  return r.toLocaleString("de-AT", { maximumFractionDigits: 10 });
}

/* Live-Vorschau aktualisieren, während getippt wird (nur /c). */
export function previewCommand(text) {
  const { cmd, arg } = parseInput(text);
  if (cmd === "/c") {
    if (!arg.trim()) { hidePanel(); return; }
    const v = calcExpression(arg);
    showPanel(`<div class="cmd-calc">${esc(arg.trim())} = <strong>${v === null ? "?" : esc(fmtNum(v))}</strong></div>`);
    return;
  }
  hidePanel();
}

/* Führt einen (vollständig getippten) Befehl aus. Gibt zurück, was mit dem
   Eingabefeld passieren soll:
     { handled, clear }  handled=false → kein bekannter Befehl
     live: true          → Ergebnis steht schon (Enter nicht ausführen) */
export async function runCommand(text) {
  const { cmd, arg } = parseInput(text);
  const def = byCmd[cmd];
  if (!def) return { handled: false };
  if (def.live) return { handled: true, clear: false, live: true };

  switch (cmd) {
    case "/g":
      if (arg.trim()) window.open("https://www.google.com/search?q=" + encodeURIComponent(arg.trim()), "_blank", "noopener,noreferrer");
      return { handled: true, clear: true };
    case "/neu":    openBookmarkEditor(null, null); return { handled: true, clear: true };
    case "/ordner": openFolderEditor(null);         return { handled: true, clear: true };
    case "/calc":   openToolById("rechner");        return { handled: true, clear: true };
    case "/zeit":   openToolById("arbeitszeit");    return { handled: true, clear: true };
    case "/duplex": openToolById("pdfduplex");      return { handled: true, clear: true };
    case "/crop":   openToolById("cardcrop");       return { handled: true, clear: true };
    case "/mtg":    openToolById("mtg");            return { handled: true, clear: true };
    default: return { handled: false };
  }
}
