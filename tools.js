/* ============ WERKZEUGE (Tools-Registry) ============

   Eigene kleine Werkzeuge für vegvisir. Jedes Tool ist ein Objekt:

     {
       id:      "eindeutige-id",
       name:    "Anzeigename",
       icon:    "lucide-name",     // Icon-Name von https://lucide.dev/icons
       display: "sheet",           // "sheet" = Bottom-Sheet wie die Ordner (Standard),
                                    // "window" = frei verschiebbares Fenster
       width:   280,               // feste Fenstergröße in px (nur bei "window")
       height:  400,
       render(container) { ... }   // baut die Oberfläche in `container`
     }

   Ohne `display` öffnet ein Werkzeug als Bottom-Sheet (auf jeder Bildschirmbreite).

   `render(container)` bekommt ein leeres <div> und füllt es mit der Tool-UI.
   Optional kannst du eine Aufräum-Funktion zurückgeben – sie wird aufgerufen,
   wenn das Fenster geschlossen wird (z.B. um Timer zu stoppen).

   NEUES TOOL = einfach ein weiteres Objekt in diese Liste eintragen. app.js
   zeigt automatisch eine Dock-Schaltfläche dafür an; ein Klick öffnet das Tool
   als frei verschiebbares Fenster mit fixer Größe. */

window.VEG_TOOLS = [
  {
    id: "rechner",
    name: "Rechner",
    icon: "calculator",
    display: "window",   // Rechner bleibt ein frei verschiebbares Fenster (auch auf schmalen Bildschirmen)
    width: 280,
    height: 400,
    render(container) {
      container.innerHTML = `
        <div class="calc" tabindex="0">
          <div class="calc-display" data-display>0</div>
          <div class="calc-keys">
            <button class="calc-key fn" data-action="clear">AC</button>
            <button class="calc-key fn" data-action="negate">±</button>
            <button class="calc-key fn" data-action="percent">%</button>
            <button class="calc-key op" data-op="/">÷</button>

            <button class="calc-key" data-digit="7">7</button>
            <button class="calc-key" data-digit="8">8</button>
            <button class="calc-key" data-digit="9">9</button>
            <button class="calc-key op" data-op="*">×</button>

            <button class="calc-key" data-digit="4">4</button>
            <button class="calc-key" data-digit="5">5</button>
            <button class="calc-key" data-digit="6">6</button>
            <button class="calc-key op" data-op="-">−</button>

            <button class="calc-key" data-digit="1">1</button>
            <button class="calc-key" data-digit="2">2</button>
            <button class="calc-key" data-digit="3">3</button>
            <button class="calc-key op" data-op="+">+</button>

            <button class="calc-key wide" data-digit="0">0</button>
            <button class="calc-key" data-action="dot">,</button>
            <button class="calc-key eq" data-action="equals">=</button>
          </div>
        </div>`;

      const root = container.querySelector(".calc");
      const displayEl = container.querySelector("[data-display]");
      const KEY = "vegvisir.tool.rechner";

      let cur = "0";        // aktuell eingegebene/angezeigte Zahl (String, mit Komma)
      let prev = null;      // vorheriger Operand (Number)
      let op = null;        // ausstehende Operation: + - * /
      let overwrite = true; // nächste Ziffer überschreibt die Anzeige

      // Letzten Stand aus dem Browser laden, damit nichts verloren geht.
      try {
        const s = JSON.parse(localStorage.getItem(KEY) || "null");
        if (s && typeof s === "object") {
          cur = s.cur ?? "0"; prev = s.prev ?? null; op = s.op ?? null; overwrite = s.overwrite ?? true;
        }
      } catch {}
      const save = () => {
        try { localStorage.setItem(KEY, JSON.stringify({ cur, prev, op, overwrite })); } catch {}
      };

      const num = (s) => parseFloat(String(s).replace(",", "."));
      const fmt = (n) => {
        if (!isFinite(n)) return "Fehler";
        // auf 10 Nachkommastellen runden (Gleitkomma-Ungenauigkeit dämpfen),
        // Punkt durch Komma ersetzen (deutsche Schreibweise).
        const s = String(Math.round((n + Number.EPSILON) * 1e10) / 1e10);
        return s.replace(".", ",");
      };
      const show = () => { displayEl.textContent = cur; };

      const markOp = (o) => {
        root.querySelectorAll(".calc-key.op").forEach((b) =>
          b.classList.toggle("active", o != null && b.dataset.op === o));
      };

      const inputDigit = (d) => {
        if (overwrite) { cur = d; overwrite = false; }
        else { cur = cur === "0" ? d : cur + d; }
        show();
      };
      const inputDot = () => {
        if (overwrite) { cur = "0,"; overwrite = false; }
        else if (!cur.includes(",")) cur += ",";
        show();
      };
      const compute = (a, b, o) => {
        switch (o) {
          case "+": return a + b;
          case "-": return a - b;
          case "*": return a * b;
          case "/": return b === 0 ? NaN : a / b;
        }
        return b;
      };
      const setOp = (nextOp) => {
        if (op != null && !overwrite) {
          // verkettete Rechnung: zuerst die bisherige auswerten
          const r = compute(prev, num(cur), op);
          prev = r; cur = fmt(r); show();
        } else {
          prev = num(cur);
        }
        op = nextOp; overwrite = true;
        markOp(nextOp);
      };
      const equals = () => {
        if (op == null) return;
        const r = compute(prev, num(cur), op);
        cur = fmt(r); prev = null; op = null; overwrite = true;
        markOp(null); show();
      };
      const percent = () => {
        const c = num(cur);
        // Bei + und − ist % der Anteil vom vorherigen Wert (z.B. 200 + 10 % = 220),
        // sonst einfach "geteilt durch 100".
        const r = (op && prev != null && (op === "+" || op === "-"))
          ? prev * c / 100
          : c / 100;
        cur = fmt(r); overwrite = true; show();
      };
      const negate = () => {
        if (cur === "0" || cur === "Fehler") return;
        cur = cur.startsWith("-") ? cur.slice(1) : "-" + cur;
        show();
      };
      const clearAll = () => {
        cur = "0"; prev = null; op = null; overwrite = true;
        markOp(null); show();
      };
      const backspace = () => {
        if (overwrite) return;
        cur = cur.length > 1 ? cur.slice(0, -1) : "0";
        if (cur === "-") cur = "0";
        show();
      };

      root.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        if (b.dataset.digit != null) inputDigit(b.dataset.digit);
        else if (b.dataset.op) setOp(b.dataset.op);
        else switch (b.dataset.action) {
          case "dot": inputDot(); break;
          case "equals": equals(); break;
          case "percent": percent(); break;
          case "negate": negate(); break;
          case "clear": clearAll(); break;
        }
        save();
      });

      // Tastatur funktioniert, solange das Fenster den Fokus hat.
      root.addEventListener("keydown", (e) => {
        const k = e.key;
        if (k >= "0" && k <= "9") inputDigit(k);
        else if (k === "." || k === ",") inputDot();
        else if (k === "+" || k === "-" || k === "*" || k === "/") setOp(k);
        else if (k === "Enter" || k === "=") { e.preventDefault(); equals(); }
        else if (k === "%") percent();
        else if (k === "Escape") clearAll();
        else if (k === "Backspace") backspace();
        else return;
        save();
        e.stopPropagation();
      });

      setTimeout(() => root.focus(), 30);
      markOp(op);
      show();
    }
  },

  {
    id: "arbeitszeit",
    name: "Arbeitszeit",
    icon: "clock",
    display: "sheet",    // Arbeitszeit immer als Bottom-Sheet (auf jeder Bildschirmbreite)
    width: 360,
    height: 720,
    render(container, api) {
      const KEY = "vegvisir.tool.arbeitszeit";

      container.innerHTML = `
        <div class="wt">
          <div class="wt-head">
            <h2>Arbeitszeit</h2>
            <span class="wt-date" data-date></span>
          </div>

          <div class="wt-card">
            <div class="wt-goals">
              <div class="wt-goal">
                <label>Arbeitszeit</label>
                <input type="range" data-ziel min="4" max="10" step="0.5" value="8">
                <span class="wt-val" data-zielval>8:00</span>
              </div>
            </div>
          </div>

          <div class="wt-stats">
            <div class="wt-stat"><div class="wt-stat-label">Netto</div><div class="wt-stat-value blue" data-worked>0:00</div></div>
            <div class="wt-stat"><div class="wt-stat-label">Verbleibend</div><div class="wt-stat-value amber" data-rest>—</div></div>
            <div class="wt-stat"><div class="wt-stat-label">Pause heute</div><div class="wt-stat-value muted" data-pause>0:00</div></div>
            <div class="wt-stat"><div class="wt-stat-label">Schluss um</div><div class="wt-stat-value green" data-ende>—</div></div>
          </div>

          <div>
            <div class="wt-progress-meta"><span>Fortschritt</span><b data-pct>0%</b></div>
            <div class="wt-bar-bg"><div class="wt-bar-fill" data-fill style="width:0%"></div></div>
          </div>

          <div class="wt-card" data-startcard>
            <div class="wt-card-title">Arbeitsbeginn eingeben</div>
            <div class="wt-input-row">
              <label>Start</label>
              <input type="time" data-instart>
              <button class="wt-btn primary" data-setstart>Bestätigen</button>
            </div>
            <div class="wt-err" data-starterr></div>
          </div>

          <div class="wt-card wt-hidden" data-pausecard>
            <div class="wt-card-title">Pausen <span class="wt-pill active" data-pill>Aktiv</span></div>
            <div class="wt-input-row">
              <label>von</label>
              <input type="time" data-pausefrom>
              <label>bis</label>
              <input type="time" data-pauseto>
              <button class="wt-btn primary" data-addpause>Eintragen</button>
            </div>
            <div class="wt-err" data-pauseerr></div>
            <div class="wt-pauses" data-pauselist></div>
          </div>
        </div>`;

      const $ = (s) => container.querySelector(s);

      // Zustand wird im Browser gespeichert; "date" verankert alles am aktuellen Tag —
      // bei Datumswechsel werden Start und Pausen automatisch verworfen, nur das Ziel bleibt.
      const todayKey = () => { const n = new Date(); return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0"); };
      let state = { date: todayKey(), start: null, pauses: [], zielH: 8 };
      try {
        const s = localStorage.getItem(KEY);
        if (s) {
          const st = JSON.parse(s);
          state.zielH = st.zielH ?? st.maxH ?? 8;
          if (st.date === todayKey()) {
            state.start = st.start ?? null;
            state.pauses = Array.isArray(st.pauses) ? st.pauses.filter((p) => p && p.from) : [];
          }
        }
      } catch {}
      state.zielH = Math.min(10, Math.max(4, Number(state.zielH) || 8));
      let ticker = null;

      const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };

      /* ---- kleine Zeit-Helfer (Millisekunden ↔ "H:MM") ---- */
      const fmtMs = (ms) => { if (ms <= 0) return "0:00"; const m = Math.floor(ms / 60000); return Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0"); };
      const fmtHalf = (v) => Math.floor(v) + ":" + (v % 1 === 0.5 ? "30" : "00");
      const timeToMs = (t) => { const [h, m] = t.split(":").map(Number); return (h * 60 + m) * 60000; };
      const msToTimeStr = (ms) => { if (ms < 0 || ms >= 86400000) return null; const m = Math.floor(ms / 60000); return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
      const nowMs = () => { const n = new Date(); return (n.getHours() * 60 + n.getMinutes()) * 60000; };
      const nowTimeStr = () => { const n = new Date(); return String(n.getHours()).padStart(2, "0") + ":" + String(n.getMinutes()).padStart(2, "0"); };

      /* ---- Pausen-Rechnung ----
         Eine Pause ist einfach ein Eintrag {from, to}; "to" darf fehlen (offene Pause).
         Fürs Netto zählt nur der Teil, der zwischen Arbeitsbeginn und JETZT liegt —
         eine für später geplante Pause verändert das Netto also (noch) nicht.
         Für die Schlusszeit zählt zusätzlich der noch ausstehende Teil jeder Pause. */
      const pauseElapsedMs = (p, now) => Math.max(0, Math.min(p.to ? timeToMs(p.to) : now, now) - Math.max(timeToMs(p.from), timeToMs(state.start)));
      const pauseFutureMs = (p, now) => p.to ? Math.max(0, timeToMs(p.to) - Math.max(timeToMs(p.from), now)) : 0;
      const isPauseActive = (p, now) => timeToMs(p.from) <= now && (!p.to || now < timeToMs(p.to));
      const isPausePlanned = (p, now) => timeToMs(p.from) > now;

      const getPauseElapsedTotal = (now) => state.pauses.reduce((a, p) => a + pauseElapsedMs(p, now), 0);
      const getPauseFutureTotal = (now) => state.pauses.reduce((a, p) => a + pauseFutureMs(p, now), 0);
      const getNettoMs = (now) => state.start ? Math.max(0, now - timeToMs(state.start) - getPauseElapsedTotal(now)) : 0;

      function setStart() {
        const v = $("[data-instart]").value;
        if (!v) { $("[data-starterr]").textContent = "Bitte eine Uhrzeit eingeben."; return; }
        if (timeToMs(v) > nowMs()) { $("[data-starterr]").textContent = "Startzeit kann nicht in der Zukunft liegen."; return; }
        $("[data-starterr]").textContent = "";
        state.start = v; save(); startTicker();
        $("[data-pausefrom]").value = nowTimeStr();
        update();
      }
      function addPause() {
        const err = $("[data-pauseerr]");
        const from = $("[data-pausefrom]").value;
        const to = $("[data-pauseto]").value || null;
        if (!from) { err.textContent = "Bitte eine Von-Uhrzeit angeben."; return; }
        if (timeToMs(from) < timeToMs(state.start)) { err.textContent = "Pause kann nicht vor dem Arbeitsbeginn liegen."; return; }
        if (to && timeToMs(to) <= timeToMs(from)) { err.textContent = "Bis muss nach Von liegen."; return; }
        if (!to && state.pauses.some((p) => !p.to)) { err.textContent = "Es gibt schon eine offene Pause — bitte zuerst beenden."; return; }
        err.textContent = "";
        state.pauses.push({ from, to });
        state.pauses.sort((a, b) => timeToMs(a.from) - timeToMs(b.from));
        $("[data-pausefrom]").value = nowTimeStr();
        $("[data-pauseto]").value = "";
        save(); update();
      }
      function endPause(i) {
        const p = state.pauses[i];
        if (!p || p.to) return;
        const now = nowTimeStr();
        // Offene Pause, die noch gar nicht begonnen hat, wird beim Beenden einfach verworfen.
        if (timeToMs(now) <= timeToMs(p.from)) state.pauses.splice(i, 1);
        else p.to = now;
        save(); update();
      }
      function deletePause(i) { state.pauses.splice(i, 1); save(); update(); }
      function resetDay() {
        if (!confirm("Tag zurücksetzen?")) return;
        state.start = null; state.pauses = []; save();
        if (ticker) { clearInterval(ticker); ticker = null; }
        update();
      }
      // Beim Datumswechsel (z.B. Tool über Nacht offen) alles Tagesbezogene verwerfen.
      function rollover() {
        if (state.date === todayKey()) return;
        state.date = todayKey(); state.start = null; state.pauses = []; save();
        if (ticker) { clearInterval(ticker); ticker = null; }
      }
      function startTicker() { if (ticker) return; ticker = setInterval(update, 30000); }

      // "update" zeigt/versteckt die Karten und rechnet alles neu.
      function update() {
        rollover();
        const hasStart = !!state.start;
        $("[data-startcard]").classList.toggle("wt-hidden", hasStart);
        $("[data-pausecard]").classList.toggle("wt-hidden", !hasStart);
        $("[data-date]").textContent = dateLabel + (hasStart ? " · Beginn " + state.start : "");
        if (hasStart) { updateStats(); renderPauses(); } else { resetStats(); }
      }
      function resetStats() {
        ["[data-worked]", "[data-rest]", "[data-pause]", "[data-ende]"].forEach((s) => { $(s).textContent = "—"; });
        $("[data-fill]").style.width = "0%"; $("[data-pct]").textContent = "0%";
      }
      function updateStats() {
        if (!state.start) return;
        const now = nowMs();
        const netto = getNettoMs(now);
        const zielMs = state.zielH * 3600000;

        $("[data-worked]").textContent = fmtMs(netto);
        $("[data-pause]").textContent = fmtMs(getPauseElapsedTotal(now));

        const rest = zielMs - netto;
        const restEl = $("[data-rest]");
        restEl.textContent = rest <= 0 ? "✓" : fmtMs(rest);
        restEl.className = "wt-stat-value " + (rest <= 0 ? "green" : "amber");

        // Schlusszeit = jetzt + Restarbeitszeit + noch ausstehende (geplante) Pausenanteile.
        const endeEl = $("[data-ende]");
        endeEl.textContent = rest <= 0 ? "✓" : (msToTimeStr(now + rest + getPauseFutureTotal(now)) || ">24h");

        const pct = Math.min(100, Math.round((netto / zielMs) * 100));
        $("[data-pct]").textContent = pct + "%";
        const fill = $("[data-fill]");
        fill.style.width = pct + "%";
        fill.style.background = pct >= 100 ? "#A3C9A8" : "#F5C84C";

        const pill = $("[data-pill]");
        if (netto >= zielMs) { pill.textContent = "Ziel erreicht"; pill.className = "wt-pill done"; }
        else if (state.pauses.some((p) => isPauseActive(p, now))) { pill.textContent = "Pause"; pill.className = "wt-pill pause"; }
        else { pill.textContent = "Aktiv"; pill.className = "wt-pill active"; }
      }
      function renderPauses() {
        const now = nowMs();
        const list = $("[data-pauselist]");
        let html = "";
        state.pauses.forEach((p, i) => {
          const planned = isPausePlanned(p, now);
          const del = `<button class="wt-del" data-del="${i}" title="Löschen">×</button>`;
          if (p.to) {
            const tag = planned ? `<span class="wt-pause-dur">· geplant</span>` : "";
            html += `<div class="wt-pause-item"><span class="wt-pause-times">${p.from} – ${p.to}<span class="wt-pause-dur">${fmtMs(timeToMs(p.to) - timeToMs(p.from))}</span>${tag}</span>${del}</div>`;
          } else {
            const label = planned ? "geplant, offen" : "läuft…";
            html += `<div class="wt-pause-item"><span class="wt-pause-times wt-pause-open">${p.from} – ${label}</span><span><button class="wt-btn" data-end="${i}">Beenden</button>${del}</span></div>`;
          }
        });
        list.innerHTML = html;
        list.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => deletePause(+b.dataset.del)));
        list.querySelectorAll("[data-end]").forEach((b) => b.addEventListener("click", () => endPause(+b.dataset.end)));
      }

      /* ---- Verdrahtung ---- */
      $("[data-setstart]").addEventListener("click", setStart);
      $("[data-addpause]").addEventListener("click", addPause);

      // "Tag zurücksetzen" als Icon rechts im Fenster-Header (gleiche Zeile).
      if (api && api.addHeaderAction) {
        api.addHeaderAction({ icon: "rotate-ccw", title: "Tag zurücksetzen", danger: true, onClick: resetDay });
      }

      const zielSlider = $("[data-ziel]");
      zielSlider.value = state.zielH; $("[data-zielval]").textContent = fmtHalf(state.zielH);
      zielSlider.addEventListener("input", function () {
        state.zielH = Number(this.value); $("[data-zielval]").textContent = fmtHalf(state.zielH);
        save(); updateStats();
      });

      const dateLabel = new Date().toLocaleDateString("de-AT", { weekday: "long", day: "numeric", month: "long" });
      $("[data-instart]").value = nowTimeStr();
      $("[data-pausefrom]").value = nowTimeStr();
      if (state.start) startTicker();
      update();

      // Aufräumen: Timer stoppen, wenn das Fenster geschlossen wird.
      return () => { if (ticker) clearInterval(ticker); };
    }
  },

  {
    id: "pdfduplex",
    name: "PDF Duplex-Fixer",
    icon: "file-stack",
    display: "sheet",
    render(container, api) {
      // UI und Logik leben als ES-Module in js/pdfduplex.js + js/pdfDuplexFixer.js.
      // Erst beim Öffnen nachladen, weil das pdf-lib-Bundle (~500 KB) mitkommt.
      let cleanup = null;
      container.innerHTML = '<div class="dp-loading">Lade PDF-Werkzeug…</div>';
      import("./js/pdfduplex.js")
        .then((m) => { cleanup = m.renderPdfDuplex(container, api) || null; })
        .catch(() => { container.innerHTML = '<div class="dp-loading">PDF-Werkzeug konnte nicht geladen werden.</div>'; });
      return () => { if (typeof cleanup === "function") cleanup(); };
    }
  }
];
