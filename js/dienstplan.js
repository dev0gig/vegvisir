/* ============ DIENSTPLAN (Kalender-UI) ============ */
/* Wochen- und Monatsansicht für die importierten Dienstplan-Termine.
   Es werden nur Werktage (Montag–Freitag) angezeigt, weil der Dienstplan
   keine Wochenend-Dienste enthält. Der Import passiert über einen Knopf in
   der Titelleiste: ICS-Datei wählen → parsen → in Supabase mergen. */

import { parseIcs } from "./ics.js";
import { importEvents, fetchEvents } from "./dienstplan-db.js";
import { esc } from "./dom.js";

const VIEW_KEY = "vegvisir.tool.dienstplan"; // gemerkte Ansicht (woche/monat)

/* ---- Datums-Helfer (alles lokale Zeit, Datum als "YYYY-MM-DD") ---- */
const toIso = (d) =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const fromIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
/* Montag der Woche, in der `d` liegt (Sa/So zählen zur Folgewoche ist NICHT
   gewollt — sie gehören zur laufenden Woche, damit "Heute" am Wochenende die
   gerade vergangene Arbeitswoche zeigt). */
const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));
const fmtZeit = (t) => String(t).slice(0, 5); // "08:00:00" → "08:00"

const WOCHENTAGE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"];
const WT_KURZ = ["Mo", "Di", "Mi", "Do", "Fr"];

export function renderDienstplan(container, api) {
  let view = "woche"; // "woche" | "monat"
  try { view = JSON.parse(localStorage.getItem(VIEW_KEY) || "{}").view === "monat" ? "monat" : "woche"; } catch {}
  let anchor = new Date(); // ein Tag innerhalb der angezeigten Woche bzw. des Monats
  let closed = false;

  container.innerHTML = `
    <div class="dp">
      <div class="dp-toolbar">
        <div class="dp-nav">
          <button class="dp-btn" data-prev aria-label="Zurück"><i data-lucide="chevron-left"></i></button>
          <button class="dp-btn dp-today" data-today>Heute</button>
          <button class="dp-btn" data-next aria-label="Weiter"><i data-lucide="chevron-right"></i></button>
        </div>
        <div class="dp-range" data-range></div>
        <div class="dp-switch" role="tablist">
          <button class="dp-sw" data-view="woche" role="tab">Woche</button>
          <button class="dp-sw" data-view="monat" role="tab">Monat</button>
        </div>
      </div>
      <div class="dp-msg" data-msg hidden></div>
      <div class="dp-cal" data-cal></div>
    </div>
    <input type="file" accept=".ics,text/calendar" hidden data-icsfile />`;

  const $ = (s) => container.querySelector(s);
  const msgEl = $("[data-msg]");
  const calEl = $("[data-cal]");
  const fileInput = $("[data-icsfile]");

  const saveView = () => { try { localStorage.setItem(VIEW_KEY, JSON.stringify({ view })); } catch {} };

  function showMsg(text, kind) {
    msgEl.hidden = !text;
    msgEl.textContent = text || "";
    msgEl.className = "dp-msg" + (kind ? " " + kind : "");
  }

  /* ---- sichtbarer Zeitraum je Ansicht ---- */
  function range() {
    if (view === "woche") {
      const mo = mondayOf(anchor);
      return { von: toIso(mo), bis: toIso(addDays(mo, 4)) };
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { von: toIso(first), bis: toIso(last) };
  }

  function rangeLabel() {
    if (view === "woche") {
      const mo = mondayOf(anchor), fr = addDays(mo, 4);
      const f = (d) => d.toLocaleDateString("de-AT", { day: "numeric", month: "short" });
      return `${f(mo)} – ${f(fr)} ${fr.getFullYear()}`;
    }
    return anchor.toLocaleDateString("de-AT", { month: "long", year: "numeric" });
  }

  /* ---- Termine eines Tages als kleine Blöcke (chronologisch aus der DB) ---- */
  function eventsHtml(list) {
    return list.map((e) => `
      <div class="dp-ev">
        <span class="dp-ev-zeit">${fmtZeit(e.start_zeit)}–${fmtZeit(e.end_zeit)}</span>
        <span class="dp-ev-titel">${esc(e.titel)}</span>
      </div>`).join("");
  }

  /* ---- Wochenansicht: fünf Tageskarten untereinander (Mo–Fr) ---- */
  function renderWoche(byDate) {
    const mo = mondayOf(anchor);
    const heute = toIso(new Date());
    let html = '<div class="dp-week">';
    for (let i = 0; i < 5; i++) {
      const d = addDays(mo, i);
      const iso = toIso(d);
      const list = byDate.get(iso) || [];
      html += `
        <div class="dp-day${iso === heute ? " today" : ""}">
          <div class="dp-day-head">
            <span class="dp-day-name">${WOCHENTAGE[i]}</span>
            <span class="dp-day-date">${d.toLocaleDateString("de-AT", { day: "numeric", month: "short" })}</span>
          </div>
          ${list.length ? eventsHtml(list) : '<div class="dp-frei">frei / kein Eintrag</div>'}
        </div>`;
    }
    calEl.innerHTML = html + "</div>";
  }

  /* ---- Monatsansicht: Raster mit 5 Spalten (Mo–Fr), Wochen als Zeilen ---- */
  function renderMonat(byDate) {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const heute = toIso(new Date());

    let html = '<div class="dp-month">';
    html += WT_KURZ.map((w) => `<div class="dp-m-head">${w}</div>`).join("");

    // Zeilenweise durch die Wochen des Monats, je Zeile nur Mo–Fr.
    for (let mo = mondayOf(first); mo <= last; mo = addDays(mo, 7)) {
      for (let i = 0; i < 5; i++) {
        const d = addDays(mo, i);
        if (d.getMonth() !== anchor.getMonth()) { html += '<div class="dp-m-cell out"></div>'; continue; }
        const iso = toIso(d);
        const list = byDate.get(iso) || [];
        html += `
          <div class="dp-m-cell${iso === heute ? " today" : ""}">
            <div class="dp-m-num">${d.getDate()}</div>
            ${eventsHtml(list)}
          </div>`;
      }
    }
    calEl.innerHTML = html + "</div>";
  }

  /* ---- Laden + Zeichnen ---- */
  async function refresh() {
    $("[data-range]").textContent = rangeLabel();
    container.querySelectorAll(".dp-sw").forEach((b) =>
      b.classList.toggle("active", b.dataset.view === view));

    const { von, bis } = range();
    calEl.innerHTML = '<div class="dp-loading">Lade Termine…</div>';
    let rows = [];
    try {
      rows = await fetchEvents(von, bis);
    } catch (err) {
      if (!closed) calEl.innerHTML = `<div class="dp-loading">${esc(err.message || "Fehler beim Laden.")}</div>`;
      return;
    }
    if (closed) return;

    const byDate = new Map();
    rows.forEach((r) => {
      if (!byDate.has(r.datum)) byDate.set(r.datum, []);
      byDate.get(r.datum).push(r);
    });
    if (view === "woche") renderWoche(byDate); else renderMonat(byDate);
  }

  /* ---- ICS-Import ---- */
  async function importFile(file) {
    showMsg("Importiere „" + file.name + "“ …");
    try {
      const events = parseIcs(await file.text());
      if (!events.length) { showMsg("Keine Termine in der Datei gefunden.", "warn"); return; }
      const { tage, termine } = await importEvents(events);
      showMsg(`${tage} Tage aktualisiert, ${termine} Termine importiert.`, "ok");
      // Zum ersten importierten Tag springen, damit das Ergebnis sofort sichtbar ist.
      anchor = fromIso(events[0].datum);
      await refresh();
    } catch (err) {
      showMsg(err.message || "Import fehlgeschlagen.", "warn");
    }
  }

  /* ---- Verdrahtung ---- */
  $("[data-prev]").addEventListener("click", () => {
    anchor = view === "woche" ? addDays(mondayOf(anchor), -7) : new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
    refresh();
  });
  $("[data-next]").addEventListener("click", () => {
    anchor = view === "woche" ? addDays(mondayOf(anchor), 7) : new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
    refresh();
  });
  $("[data-today]").addEventListener("click", () => { anchor = new Date(); refresh(); });
  container.querySelectorAll(".dp-sw").forEach((b) =>
    b.addEventListener("click", () => { view = b.dataset.view; saveView(); refresh(); }));

  fileInput.addEventListener("change", () => {
    const f = fileInput.files && fileInput.files[0];
    fileInput.value = ""; // gleiche Datei erneut wählbar
    if (f) importFile(f);
  });
  if (api && api.addHeaderAction) {
    api.addHeaderAction({ icon: "upload", title: "ICS-Datei importieren", onClick: () => fileInput.click() });
  }

  if (window.lucide) lucide.createIcons();
  refresh();

  return () => { closed = true; };
}
