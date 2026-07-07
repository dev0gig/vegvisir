/* ============ DIENSTPLAN (Kalender-UI) ============ */
/* Wochen- und Monatsansicht für die importierten Dienstplan-Termine.
   Es werden nur Werktage (Montag–Freitag) angezeigt, weil der Dienstplan
   keine Wochenend-Dienste enthält. Importiert wird über /import oder
   Drag&Drop einer ICS-Datei; in der Titelleiste sitzen stattdessen die
   Google-Wolke (Verbindungsstatus, Klick = anmelden) und der Sync-Knopf. */

import { parseIcs } from "./ics.js";
import { importEventsInRange, fetchEvents } from "./dienstplan-db.js";
import { syncGoogleRange, fullGoogleSync, googleStatus, connectGoogle, syncSummary } from "./google-sync.js";
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
/* ISO-Kalenderwoche (KW): die Woche gehört zu dem Jahr, in dem ihr
   Donnerstag liegt (übliche Zählweise in Österreich/Deutschland). */
const isoWeek = (d) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const jahresStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - jahresStart) / 86400000 + 1) / 7);
};
const fmtZeit = (t) => String(t).slice(0, 5); // "08:00:00" → "08:00"
const fmtDe = (iso) => fromIso(iso).toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" });

const WOCHENTAGE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"];
const WT_KURZ = ["Mo", "Di", "Mi", "Do", "Fr"];

/* Dienst-Kategorie aus dem Termin-Titel ableiten — bestimmt die gedeckte
   Pastellfarbe (Spec Abschnitt 7): WiWo = Lachs, Erdberg = Salbei,
   Spittelau = Flieder, Flexi/Home Office = sanftes Grün, sonst neutral. */
function catOf(titel) {
  const t = String(titel || "").toLowerCase();
  if (/wiwo|wiener\s*wohnen/.test(t)) return "wiwo";
  if (/erdberg/.test(t)) return "erdberg";
  if (/spittelau/.test(t)) return "spittelau";
  if (/flexi|home\s*office|homeoffice/.test(t)) return "flexi";
  return "dienst";
}

/* Damit eine ICS-Datei auch von außen (Slash-Befehl /import, Drag&Drop)
   importiert werden kann: Ist das Dienstplan-Werkzeug offen, übernimmt es die
   Datei sofort; sonst wird sie gemerkt und beim Öffnen verarbeitet. */
let activeImport = null; // Funktion, die eine Datei importiert, solange das Tool offen ist
let pendingFile = null;  // Datei, die auf das Öffnen des Tools wartet
export function importIcsFile(file) {
  if (activeImport) activeImport(file);
  else pendingFile = file;
}

export function renderDienstplan(container, api) {
  let view = "woche"; // "woche" | "monat"
  try { view = JSON.parse(localStorage.getItem(VIEW_KEY) || "{}").view === "monat" ? "monat" : "woche"; } catch {}
  let anchor = new Date(); // ein Tag innerhalb der angezeigten Woche bzw. des Monats
  let closed = false;

  container.innerHTML = `
    <div class="dp">
      <div class="dp-head cat-dienst" data-head>
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
        <div class="dp-strip" data-strip hidden></div>
      </div>
      <div class="dp-body">
        <div class="dp-msg" data-msg hidden></div>
        <div class="dp-cal" data-cal></div>
      </div>
    </div>
    <input type="file" accept=".ics,text/calendar" hidden data-icsfile />`;

  const $ = (s) => container.querySelector(s);
  const headEl = $("[data-head]");
  const stripEl = $("[data-strip]");
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
      return `KW ${isoWeek(mo)} · ${f(mo)} – ${f(fr)} ${fr.getFullYear()}`;
    }
    return anchor.toLocaleDateString("de-AT", { month: "long", year: "numeric" });
  }

  /* ---- Termine eines Tages als Kapseln in der Kategoriefarbe ---- */
  function eventsHtml(list) {
    return list.map((e) => `
      <div class="dp-ev cat-${catOf(e.titel)}">
        <span class="dp-ev-zeit">${fmtZeit(e.start_zeit)}–${fmtZeit(e.end_zeit)}</span>
        <span class="dp-ev-titel">${esc(e.titel)}</span>
      </div>`).join("");
  }

  /* ---- Wochenleiste (nur Wochenansicht) + Header-Zone einfärben ----
     Die Leiste zeigt Mo–Fr der angezeigten Woche; der ausgewählte Tag als
     schwarze Kapsel (weiße Zahl). Ein Klick wählt den Tag aus — die farbige
     Header-Zone übernimmt dann die Kategoriefarbe seines ersten Dienstes. */
  function renderStrip(byDate) {
    const selIso = toIso(anchor);
    if (view !== "woche") {
      stripEl.hidden = true;
    } else {
      const mo = mondayOf(anchor);
      const heute = toIso(new Date());
      stripEl.hidden = false;
      stripEl.innerHTML = Array.from({ length: 5 }, (_, i) => {
        const d = addDays(mo, i);
        const iso = toIso(d);
        return `
          <button class="dp-wd${iso === selIso ? " active" : ""}${iso === heute ? " is-today" : ""}"
                  data-iso="${iso}" aria-label="${WOCHENTAGE[i]}">
            <span class="dp-wd-name">${WT_KURZ[i]}</span>
            <span class="dp-wd-num">${d.getDate()}</span>
          </button>`;
      }).join("");
      stripEl.querySelectorAll(".dp-wd").forEach((b) =>
        b.addEventListener("click", () => { anchor = fromIso(b.dataset.iso); refresh(); }));
    }
    const list = byDate.get(selIso) || [];
    headEl.className = "dp-head cat-" + (list.length ? catOf(list[0].titel) : "dienst");
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

  /* ---- Laden + Zeichnen ----
     Beim Blättern und beim Wechsel Woche/Monat bleibt der bisherige Inhalt
     stehen und wird nur leicht abgeblendet, bis die neuen Termine da sind —
     das Sheet klappt also nicht mehr zusammen und wieder auf. Eine laufende
     Nummer verwirft Antworten, die von schnellem Blättern überholt wurden. */
  let loadSeq = 0;
  async function refresh() {
    $("[data-range]").textContent = rangeLabel();
    container.querySelectorAll(".dp-sw").forEach((b) =>
      b.classList.toggle("active", b.dataset.view === view));

    const { von, bis } = range();
    const my = ++loadSeq;
    if (calEl.childElementCount) {
      calEl.style.minHeight = calEl.offsetHeight + "px"; // Höhe festhalten
      calEl.classList.add("busy");
    } else {
      calEl.innerHTML = '<div class="dp-loading">Lade Termine…</div>';
    }
    let rows = [];
    try {
      rows = await fetchEvents(von, bis);
    } catch (err) {
      if (!closed && my === loadSeq) {
        calEl.classList.remove("busy");
        calEl.style.minHeight = "";
        calEl.innerHTML = `<div class="dp-loading">${esc(err.message || "Fehler beim Laden.")}</div>`;
      }
      return;
    }
    if (closed || my !== loadSeq) return;

    const byDate = new Map();
    rows.forEach((r) => {
      if (!byDate.has(r.datum)) byDate.set(r.datum, []);
      byDate.get(r.datum).push(r);
    });
    renderStrip(byDate);
    if (view === "woche") renderWoche(byDate); else renderMonat(byDate);
    calEl.classList.remove("busy");
    calEl.style.minHeight = "";
  }

  /* ---- Bestätigungs-Dialog für den Bereinigungs-Zeitraum (Spec 2.2) ----
     Die ICS enthält nur Tage MIT Terminen; stornierte Randtage stünden sonst
     als Geister-Einträge da. Deshalb wird der zu bereinigende Zeitraum nicht
     stillschweigend übernommen, sondern mit Min/Max vorbelegt und editierbar
     bestätigt. Gibt { von, bis } zurück oder null bei Abbruch. */
  function askRange({ von, bis, count, filename }) {
    return new Promise((resolve) => {
      const back = document.createElement("div");
      back.className = "dp-dialog-back";
      back.innerHTML = `
        <div class="dp-dialog" role="dialog" aria-modal="true" aria-label="Dienstplan importieren">
          <h3 class="dp-dialog-title">Dienstplan importieren</h3>
          <p class="dp-dialog-info">Export „${esc(filename || "")}“ erkannt:
            <strong>${fmtDe(von)} – ${fmtDe(bis)}</strong>
            (${count} ${count === 1 ? "Eintrag" : "Einträge"})</p>
          <div class="dp-dialog-range">
            <label>Zeitraum bereinigen von<input type="date" data-von value="${von}"></label>
            <label>bis<input type="date" data-bis value="${bis}"></label>
          </div>
          <p class="dp-dialog-hint">Dieser Zeitraum wird komplett neu geschrieben. Bei stornierten Randtagen den Bereich einfach erweitern.</p>
          <div class="dp-dialog-actions">
            <button class="dp-btn" data-cancel>Abbrechen</button>
            <button class="dp-btn dp-dialog-ok" data-ok>Importieren</button>
          </div>
        </div>`;
      container.querySelector(".dp").appendChild(back);

      const vonI = back.querySelector("[data-von]");
      const bisI = back.querySelector("[data-bis]");
      let done = false;
      // Escape/Enter in der Capture-Phase abfangen, damit sie zuerst hier landen
      // (und nicht das Werkzeug-Fenster über den globalen Handler schließen).
      const onKey = (e) => {
        if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); close(null); }
      };
      const close = (result) => {
        if (done) return;
        done = true;
        back.remove();
        document.removeEventListener("keydown", onKey, true);
        resolve(result);
      };
      document.addEventListener("keydown", onKey, true);
      back.addEventListener("click", (e) => { if (e.target === back) close(null); });
      back.querySelector("[data-cancel]").addEventListener("click", () => close(null));
      back.querySelector("[data-ok]").addEventListener("click", () => {
        const v = vonI.value, b = bisI.value;
        if (!v || !b) { showMsg("Bitte gültige Datumsgrenzen wählen.", "warn"); return; }
        if (v > b) { showMsg("Das Von-Datum liegt nach dem Bis-Datum.", "warn"); return; }
        close({ von: v, bis: b });
      });
    });
  }

  /* ---- ICS-Import ---- */
  async function importFile(file) {
    let events;
    try {
      events = parseIcs(await file.text());
    } catch (err) {
      showMsg(err.message || "Datei konnte nicht gelesen werden.", "warn");
      return;
    }
    if (!events.length) { showMsg("Keine Termine in der Datei gefunden.", "warn"); return; }

    // Min/Max-Datum aus der Datei (parseIcs liefert bereits chronologisch sortiert).
    const von0 = events[0].datum;
    const bis0 = events[events.length - 1].datum;

    const range = await askRange({ von: von0, bis: bis0, count: events.length, filename: file.name });
    if (!range) { showMsg(""); return; } // abgebrochen

    showMsg("Importiere „" + file.name + "“ …");
    try {
      const { tage, termine } = await importEventsInRange(events, range.von, range.bis, file.name);
      showMsg(`${tage} Tage aktualisiert, ${termine} Termine importiert.`, "ok");
      // Zum Anfang des bereinigten Zeitraums springen, damit das Ergebnis sofort sichtbar ist.
      anchor = fromIso(range.von);
      await refresh();
      // Google-Spiegel des Zeitraums nachziehen (nur wenn Google verbunden ist;
      // sonst bleibt es still beim normalen Import-Ergebnis).
      try {
        const g = await syncGoogleRange(range.von, range.bis);
        showMsg(`${termine} Termine importiert — Google-Kalender abgeglichen (${syncSummary(g)}).`, "ok");
      } catch (err) {
        if (err.code !== "not_connected") {
          showMsg("Import ok, aber Google-Sync fehlgeschlagen: " + (err.message || ""), "warn");
        }
      }
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

  /* ---- Titelleiste: Google-Wolke (Status) + Sync-Knopf ----
     Die Wolke zeigt, ob Google verbunden ist (gefüllt/durchgestrichen);
     ein Klick darauf startet bei fehlender Verbindung die Anmeldung.
     Der Sync-Knopf schreibt den kompletten Google-Kalender aus Supabase neu. */
  let gConnected = null; // null = noch unbekannt
  let gKalender = "Google-Kalender";
  let gSyncing = false;
  let statusBtn = null, syncBtn = null;

  function paintGoogle() {
    if (!statusBtn) return;
    statusBtn.classList.toggle("g-on", gConnected === true);
    statusBtn.classList.toggle("g-off", gConnected === false);
    statusBtn.innerHTML = `<i data-lucide="${gConnected ? "cloud" : "cloud-off"}"></i>`;
    statusBtn.title = gConnected
      ? `Google verbunden — Kalender „${gKalender}“`
      : "Google nicht verbunden — klicken zum Anmelden";
    statusBtn.setAttribute("aria-label", statusBtn.title);
    if (window.lucide) lucide.createIcons();
  }

  async function onGoogleBadge() {
    if (gConnected) {
      showMsg(`Google ist verbunden — Termine landen im Kalender „${gKalender}“.`, "ok");
      return;
    }
    try { await connectGoogle(); } // leitet zur Google-Anmeldung weiter
    catch (err) { showMsg(err.message || "Google-Anmeldung fehlgeschlagen.", "warn"); }
  }

  async function doGoogleSync() {
    if (gSyncing) return;
    if (gConnected === false) {
      showMsg("Google ist nicht verbunden — auf die Wolke klicken zum Anmelden.", "warn");
      return;
    }
    gSyncing = true;
    if (syncBtn) syncBtn.disabled = true;
    showMsg("Gleiche mit Google ab …");
    try {
      const g = await fullGoogleSync();
      gConnected = true;
      showMsg(`Google-Kalender „${g.kalender}“ abgeglichen (${syncSummary(g)}).`, "ok");
    } catch (err) {
      if (err.code === "not_connected" || err.code === "reconnect") gConnected = false;
      showMsg(err.message || "Google-Sync fehlgeschlagen.", "warn");
    } finally {
      gSyncing = false;
      if (syncBtn) syncBtn.disabled = false;
      if (!closed) paintGoogle();
    }
  }

  if (api && api.addHeaderAction) {
    statusBtn = api.addHeaderAction({ icon: "cloud", title: "Google-Verbindung wird geprüft …", onClick: onGoogleBadge });
    syncBtn = api.addHeaderAction({ icon: "refresh-cw", title: "Mit Google-Kalender abgleichen", onClick: doGoogleSync });
    googleStatus()
      .then((s) => { gConnected = !!s.connected; if (s.kalender) gKalender = s.kalender; })
      .catch(() => { gConnected = false; })
      .finally(() => { if (!closed) paintGoogle(); });
  }

  if (window.lucide) lucide.createIcons();
  refresh();

  // Import-Haken für /import und Drag&Drop registrieren; eine bereits wartende
  // Datei (Tool war beim Drop noch zu) sofort verarbeiten.
  activeImport = importFile;
  if (pendingFile) { const f = pendingFile; pendingFile = null; importFile(f); }

  return () => { closed = true; if (activeImport === importFile) activeImport = null; };
}
