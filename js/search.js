/* ============ SUCHE + SLASH-BEFEHLE ============ */
/* Das Suchfeld filtert live die Bookmarks. Beginnt die Eingabe mit "/", wird
   stattdessen die Befehls-Palette geöffnet (Auswahl per Maus, Pfeiltasten,
   Enter) und der Befehl ausgeführt bzw. eine Live-Vorschau gezeigt (Rechner
   /c, Kalender-Suche /k). Drückt man Enter bei normaler Suche ohne Treffer,
   startet eine Web-Suche bei DuckDuckGo.

   Zusätzlich (Global-Typing): Tippt man los, ohne dass ein Eingabefeld
   fokussiert ist, springt der Cursor automatisch in die Suchleiste. Tasten mit
   Modifier (Strg/Cmd/Alt) und Funktionstasten werden dabei NICHT abgefangen. */

import { render } from "./render.js";
import { COMMANDS, parseInput, previewCommand, runCommand, hidePanel, flash, getPaletteEl } from "./commands.js";

const searchbar = document.getElementById("searchbar");
const searchInput = document.getElementById("searchInput");

let query = "";
let palette = null;   // Palette-Element (aus commands.js), einmalig geholt
let sel = 0;          // Index des hervorgehobenen Palette-Eintrags
let matches = [];     // aktuell passende Befehle

export function getQuery() { return query; }

/* Suche/Palette zurücksetzen (z.B. nach Ausführen oder Klick auf ein Icon). */
export function resetSearch() {
  query = "";
  searchInput.value = "";
  searchbar.classList.remove("has-query");
  closePalette();
  hidePanel();
  render();
}

/* ---- Befehls-Palette ---- */
function closePalette() {
  matches = [];
  if (palette) { palette.hidden = true; palette.innerHTML = ""; }
}

function renderPalette(token) {
  if (!palette) palette = getPaletteEl();
  matches = COMMANDS.filter((c) => c.cmd.startsWith(token));
  if (!matches.length) { closePalette(); return; }
  if (sel >= matches.length) sel = 0;
  palette.innerHTML = matches.map((c, i) => `
    <button class="cmd-item${i === sel ? " active" : ""}" data-i="${i}" role="option">
      <i data-lucide="${c.icon}"></i>
      <span class="cmd-key">${c.cmd}${c.arg ? " …" : ""}</span>
      <span class="cmd-desc">${c.desc}</span>
    </button>`).join("");
  palette.hidden = false;
  if (window.lucide) lucide.createIcons();
  palette.querySelectorAll(".cmd-item").forEach((el) => {
    el.addEventListener("mouseenter", () => { sel = +el.dataset.i; highlight(); });
    el.addEventListener("click", () => choose(matches[+el.dataset.i]));
  });
}

function highlight() {
  if (!palette) return;
  palette.querySelectorAll(".cmd-item").forEach((el, i) => el.classList.toggle("active", i === sel));
}

/* Einen Befehl aus der Palette übernehmen: Befehl mit Argument → Text
   vervollständigen und auf Eingabe warten; Befehl ohne Argument → ausführen. */
function choose(def) {
  if (!def) return;
  if (def.arg) {
    searchInput.value = def.cmd + " ";
    closePalette();
    onInput();            // Live-Vorschau ggf. sofort aktualisieren
    searchInput.focus();
  } else {
    execute(def.cmd);
  }
}

async function execute(text) {
  const res = await runCommand(text);
  if (!res.handled) { flash("Unbekannter Befehl.", "warn"); return; }
  if (res.live) return;            // Ergebnis steht schon (z.B. /c, /k)
  if (res.clear !== false) resetSearch();
}

/* ---- Eingabe-Verarbeitung ---- */
function onInput() {
  const val = searchInput.value;
  query = val;
  searchbar.classList.toggle("has-query", val.trim() !== "");

  if (val.startsWith("/")) {
    const { hasSpace } = parseInput(val);
    const token = val.split(" ")[0].toLowerCase();
    // Palette nur beim Wählen des Befehls zeigen (noch kein Argument getippt).
    if (!hasSpace) renderPalette(token); else closePalette();
    previewCommand(val);
    render(); // Bookmarks ausblenden (Suchtext beginnt mit "/")
    return;
  }
  closePalette();
  hidePanel();
  render();
}

export function initSearch() {
  searchInput.addEventListener("input", onInput);

  searchInput.addEventListener("keydown", (e) => {
    const paletteOpen = palette && !palette.hidden && matches.length;

    if (paletteOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      sel = (sel + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length;
      highlight();
      return;
    }
    if (paletteOpen && e.key === "Tab") { e.preventDefault(); choose(matches[sel]); return; }
    if (e.key === "Escape") {
      if (paletteOpen || query) { e.stopImmediatePropagation(); e.preventDefault(); resetSearch(); searchInput.focus(); }
      return;
    }
    if (e.key !== "Enter") return;

    const val = searchInput.value;
    if (paletteOpen) { e.preventDefault(); choose(matches[sel]); return; }
    if (val.startsWith("/")) { e.preventDefault(); execute(val); return; }

    // Normale Web-Suche bei DuckDuckGo (Privatsphäre).
    const q = val.trim();
    if (!q) return;
    e.preventDefault();
    window.open("https://duckduckgo.com/?q=" + encodeURIComponent(q), "_blank", "noopener,noreferrer");
    resetSearch();
  });

  document.getElementById("searchClear").addEventListener("click", () => { resetSearch(); searchInput.focus(); });

  // Nach Klick auf ein Icon (Link öffnet sich in neuem Tab) die Suche zurücksetzen.
  document.getElementById("homeGrid").addEventListener("click", (e) => {
    if (e.target.closest(".tile")) setTimeout(resetSearch, 0);
  });

  // Klick außerhalb von Suchleiste/Palette schließt die Palette.
  document.addEventListener("click", (e) => {
    if (!searchbar.contains(e.target) && !(palette && palette.contains(e.target))) closePalette();
  });

  initGlobalTyping();
}

/* Global-Typing: druckbares Zeichen ohne fokussiertes Eingabefeld → in die
   Suchleiste umleiten und dort weiterschreiben. */
function initGlobalTyping() {
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;   // Strg+C, Cmd+R … nicht abfangen
    if (e.key.length !== 1) return;                    // Funktionstasten/Pfeile ignorieren
    if (searchbar.classList.contains("hidden")) return; // Leiste gerade ausgeblendet
    const a = document.activeElement;
    if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable)) return;
    e.preventDefault();
    searchInput.focus();
    searchInput.value += e.key;
    onInput();
  });
}
