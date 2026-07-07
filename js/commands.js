/* ============ SLASH-BEFEHLE ============ */
/* Die Definitionen und die Ausführung der Slash-Befehle aus der Suchleiste
   (Wegvisier-Spec v2, Abschnitt 6). Die Eingabe-UX (Palette, Pfeiltasten,
   Global-Typing) liegt in search.js — dieses Modul kennt nur "was ein Befehl
   tut" und liefert die Live-Vorschau (Rechner /c, Kalender-Suche /k) sowie das
   Undo-Modal.

   Ein eigener, fixer Layer über der Suchleiste (#cmdLayer) hält die Palette
   (von search.js befüllt) und ein Panel für Vorschau/Ergebnisse/Meldungen. */

import { openToolById } from "./toolwindows.js";
import { pickFile } from "./import.js";
import { undoBookmarks, undoDienstplan } from "./backup.js";
import { connectGoogle, disconnectGoogle, googleStatus, fullGoogleSync, syncGoogleRange } from "./google-sync.js";
import { logout } from "./auth.js";
import { pullFromSupabase, loadData, saveData } from "./data.js";
import { fetchEvents } from "./dienstplan-db.js";
import { render } from "./render.js";
import { esc } from "./dom.js";

/* Definition aller Befehle. `arg` = nimmt Freitext hinter dem Befehl;
   `live` = zeigt schon beim Tippen ein Ergebnis (kein Ausführen mit Enter). */
export const COMMANDS = [
  { cmd: "/g",        arg: true,  live: false, icon: "search",          desc: "Websuche bei Google" },
  { cmd: "/k",        arg: true,  live: true,  icon: "calendar-search", desc: "Zukünftige Dienstplan-Einträge durchsuchen" },
  { cmd: "/kalender", arg: false, live: false, icon: "calendar-days",   desc: "Kalender / Dienstplan öffnen" },
  { cmd: "/c",        arg: true,  live: true,  icon: "calculator",      desc: "Blitzrechner direkt in der Suchzeile" },
  { cmd: "/calc",     arg: false, live: false, icon: "calculator",      desc: "Taschenrechner-Fenster öffnen" },
  { cmd: "/zeit",     arg: false, live: false, icon: "clock",           desc: "Dienstzeiten-Rechner öffnen" },
  { cmd: "/sync",     arg: false, live: false, icon: "refresh-cw",      desc: "Mit der Cloud abgleichen (und Google spiegeln)" },
  { cmd: "/google",   arg: true,  live: false, icon: "calendar-check",  desc: "Google-Kalender: verbinden · sync · trennen · status" },
  { cmd: "/import",   arg: false, live: false, icon: "upload",          desc: "Datei importieren (JSON oder ICS)" },
  { cmd: "/undo",     arg: true,  live: false, icon: "undo-2",          desc: "Letzten Import rückgängig machen" },
  { cmd: "/logout",   arg: false, live: false, icon: "log-out",         desc: "Abmelden" },
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
  flashTimer = setTimeout(hidePanel, 2600);
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

/* ---- Kalender-Suche (/k): zukünftige Dienste ab heute ---- */
const isoToday = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};
const fmtZeit = (t) => String(t).slice(0, 5);
const fmtTag = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("de-AT", { weekday: "short", day: "2-digit", month: "2-digit" });
};

async function searchFuture(term) {
  const von = isoToday();
  const bd = new Date(); bd.setFullYear(bd.getFullYear() + 2);
  const bis = bd.getFullYear() + "-" + String(bd.getMonth() + 1).padStart(2, "0") + "-" + String(bd.getDate()).padStart(2, "0");
  let rows;
  try { rows = await fetchEvents(von, bis); } catch { return null; }
  const q = term.trim().toLowerCase();
  const hits = q ? rows.filter((r) => String(r.titel).toLowerCase().includes(q)) : rows;
  return hits.slice(0, 50);
}

/* Live-Vorschau aktualisieren, während getippt wird (nur /c und /k). Für alle
   anderen Eingaben wird das Panel ausgeblendet. */
let kToken = 0;
export function previewCommand(text) {
  const { cmd, arg } = parseInput(text);
  if (cmd === "/c") {
    if (!arg.trim()) { hidePanel(); return; }
    const v = calcExpression(arg);
    showPanel(`<div class="cmd-calc">${esc(arg.trim())} = <strong>${v === null ? "?" : esc(fmtNum(v))}</strong></div>`);
    return;
  }
  if (cmd === "/google") {
    // Sichtbarer Wegweiser: /google nimmt ein Argument, darum führt der erste
    // Enter nur zur Vervollständigung — ohne Hinweis sähe das nach "nichts
    // passiert" aus.
    showPanel('<div class="cmd-hint">Weiter tippen: <strong>verbinden</strong> · <strong>sync</strong> · <strong>trennen</strong> — oder Enter für den Status.</div>');
    return;
  }
  if (cmd === "/k") {
    const my = ++kToken;
    showPanel('<div class="cmd-hint">Suche im Dienstplan …</div>');
    searchFuture(arg).then((hits) => {
      if (my !== kToken) return; // veraltete Antwort verwerfen
      if (hits === null) { showPanel('<div class="cmd-hint">Kalender konnte nicht geladen werden.</div>'); return; }
      if (!hits.length) { showPanel('<div class="cmd-hint">Keine zukünftigen Treffer.</div>'); return; }
      const list = hits.map((r) => `
        <div class="cmd-result">
          <span class="cmd-result-tag">${esc(fmtTag(r.datum))}</span>
          <span class="cmd-result-zeit">${esc(fmtZeit(r.start_zeit))}–${esc(fmtZeit(r.end_zeit))}</span>
          <span class="cmd-result-titel">${esc(r.titel)}</span>
        </div>`).join("");
      showPanel(`<div class="cmd-results">${list}</div>`);
    });
    return;
  }
  hidePanel();
}

/* ---- Cloud-Abgleich (/sync) — inkl. Google-Selbstheilung ---- */
async function resync() {
  showPanel('<div class="cmd-hint">Gleiche mit der Cloud ab …</div>');
  const row = await pullFromSupabase();
  if (!row || !row.data) { flash("Kein Cloud-Stand gefunden.", "warn"); return; }
  const local = loadData();
  const lt = local && local.importedAt ? Date.parse(local.importedAt) : 0;
  const rt = row.data.importedAt ? Date.parse(row.data.importedAt) : (row.updated_at ? Date.parse(row.updated_at) : 0);
  if (rt >= lt) { saveData(row.data); render(); }

  // Selbstheilung: den Google-Kalender komplett aus Supabase neu schreiben.
  // Ist Google nicht verbunden, bleibt es still beim normalen Cloud-Abgleich.
  try {
    const g = await fullGoogleSync();
    flash(`Mit der Cloud abgeglichen — Google-Kalender neu geschrieben (${g.geschrieben} Termine).`, "ok");
  } catch (err) {
    if (err.code === "not_connected") flash("Mit der Cloud abgeglichen.", "ok");
    else flash("Cloud ok, aber Google-Sync fehlgeschlagen: " + (err.message || ""), "warn");
  }
}

/* ---- Undo ---- */
async function doUndo(kind) {
  if (kind === "ics") {
    const r = await undoDienstplan();
    if (!r) { flash("Kein Dienstplan-Import zum Rückgängigmachen.", "warn"); return; }
    // Google-Spiegel des betroffenen Zeitraums sofort nachziehen (falls verbunden).
    let note = "", warn = false;
    if (r.von && r.bis) {
      try { await syncGoogleRange(r.von, r.bis); note = " Google-Kalender aktualisiert."; }
      catch (err) {
        if (err.code !== "not_connected") { note = " Google-Sync fehlgeschlagen: " + (err.message || ""); warn = true; }
      }
    }
    flash("Dienstplan-Import rückgängig gemacht." + note, warn ? "warn" : "ok");
  } else {
    const d = await undoBookmarks();
    if (d) render();
    flash(d ? "Bookmark-Import rückgängig gemacht." : "Kein Bookmark-Import zum Rückgängigmachen.", d ? "ok" : "warn");
  }
}

/* Modal „Was rückgängig machen?" mit zwei Knöpfen. */
function openUndoModal() {
  const back = document.createElement("div");
  back.className = "cmd-modal-back";
  back.innerHTML = `
    <div class="cmd-modal" role="dialog" aria-modal="true" aria-label="Rückgängig machen">
      <h3 class="cmd-modal-title">Was rückgängig machen?</h3>
      <p class="cmd-modal-sub">Der jeweils letzte Import wird auf den vorherigen Stand zurückgesetzt.</p>
      <div class="cmd-modal-actions">
        <button class="dp-btn" data-undo="ics"><i data-lucide="calendar-days"></i><span>Dienstplan (ICS)</span></button>
        <button class="dp-btn" data-undo="json"><i data-lucide="bookmark"></i><span>Bookmarks (JSON)</span></button>
      </div>
      <button class="cmd-modal-cancel" data-cancel>Abbrechen</button>
    </div>`;
  document.body.appendChild(back);
  if (window.lucide) lucide.createIcons();

  const close = () => { back.remove(); document.removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); close(); } };
  document.addEventListener("keydown", onKey, true);
  back.addEventListener("click", (e) => { if (e.target === back) close(); });
  back.querySelector("[data-cancel]").addEventListener("click", close);
  back.querySelectorAll("[data-undo]").forEach((b) =>
    b.addEventListener("click", () => { const k = b.dataset.undo; close(); doUndo(k); }));
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
    case "/kalender": openToolById("dienstplan"); return { handled: true, clear: true };
    case "/calc":     openToolById("rechner");    return { handled: true, clear: true };
    case "/zeit":     openToolById("arbeitszeit"); return { handled: true, clear: true };
    case "/import":   pickFile();                  return { handled: true, clear: true };
    case "/logout":   logout();                    return { handled: true, clear: true };
    case "/sync":     await resync();              return { handled: true, clear: true };
    case "/google": {
      const a = arg.trim().toLowerCase();
      try {
        if (a === "verbinden" || a === "an" || a === "connect") {
          showPanel('<div class="cmd-hint">Leite zur Google-Anmeldung weiter …</div>');
          await connectGoogle(); // leitet zur Zustimmungsseite; Rückkehr verarbeitet main.js
        } else if (a === "trennen" || a === "aus") {
          await disconnectGoogle();
          flash("Google-Verbindung getrennt.", "ok");
        } else if (a === "sync") {
          showPanel('<div class="cmd-hint">Schreibe den Google-Kalender neu …</div>');
          const g = await fullGoogleSync();
          flash(`Google-Kalender „${g.kalender}“ neu geschrieben (${g.geschrieben} Termine).`, "ok");
        } else {
          const s = await googleStatus();
          flash(s.connected
            ? `Google verbunden — Kalender „${s.kalender}“. Befehle: /google sync · trennen`
            : "Google nicht verbunden — „/google verbinden“ ausführen.", s.connected ? "ok" : "warn");
        }
      } catch (err) {
        flash(err.message || "Google-Befehl fehlgeschlagen.", "warn");
      }
      return { handled: true, clear: true };
    }
    case "/undo": {
      const a = arg.trim().toLowerCase();
      if (a === "ics" || a === "json") { await doUndo(a); }
      else openUndoModal();
      return { handled: true, clear: true };
    }
    default: return { handled: false };
  }
}
