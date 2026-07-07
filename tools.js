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
                <label>Minimum</label>
                <input type="range" data-min min="1" max="12" step="0.5" value="8">
                <span class="wt-val" data-minval>8:00</span>
              </div>
              <div class="wt-goal">
                <label>Maximum</label>
                <input type="range" data-max min="1" max="12" step="0.5" value="10">
                <span class="wt-val" data-maxval>10:00</span>
              </div>
            </div>
          </div>

          <div class="wt-stats">
            <div class="wt-stat"><div class="wt-stat-label">Netto</div><div class="wt-stat-value blue" data-worked>0:00</div></div>
            <div class="wt-stat"><div class="wt-stat-label">Bis Minimum</div><div class="wt-stat-value amber" data-untilmin>—</div></div>
            <div class="wt-stat"><div class="wt-stat-label">Bis Maximum</div><div class="wt-stat-value muted" data-untilmax>—</div></div>
            <div class="wt-stat"><div class="wt-stat-label">Pause heute</div><div class="wt-stat-value muted" data-pause>0:00</div></div>
          </div>

          <div>
            <div class="wt-progress-meta"><span>Fortschritt zum Maximum</span><b data-pct>0%</b></div>
            <div class="wt-bar-bg"><div class="wt-bar-fill" data-fill style="width:0%"></div></div>
          </div>

          <div class="wt-endtimes">
            <div class="wt-et"><div class="wt-et-label">Frühester Schluss</div><div class="wt-et-value green" data-etmin>—</div></div>
            <div class="wt-et"><div class="wt-et-label">Spätester Schluss</div><div class="wt-et-value amber" data-etmax>—</div></div>
            <div class="wt-et"><div class="wt-et-label">Beginn</div><div class="wt-et-value muted" data-etstart>—</div></div>
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
            <div class="wt-card-title">Pausen &amp; Unterbrechungen <span class="wt-pill active" data-pill>Aktiv</span></div>
            <div data-pauseopen>
              <div class="wt-input-row">
                <label>Pause von</label>
                <input type="time" data-pausefrom>
                <button class="wt-btn primary" data-openpause>Pause starten</button>
              </div>
              <div class="wt-err" data-pauseerr></div>
            </div>
            <div class="wt-hidden" data-pauseclose>
              <div class="wt-input-row">
                <label>Pause bis</label>
                <input type="time" data-pauseto>
                <button class="wt-btn primary" data-closepause>Weiterarbeiten</button>
              </div>
              <div class="wt-err" data-pauseenderr></div>
            </div>
            <div class="wt-pauses" data-pauselist></div>
          </div>
        </div>`;

      const $ = (s) => container.querySelector(s);

      // Zustand wird im Browser gespeichert (inkl. der Min/Max-Ziele).
      let state = { start: null, pauses: [], openPause: null, minH: 8, maxH: 10 };
      try { const s = localStorage.getItem(KEY); if (s) Object.assign(state, JSON.parse(s)); } catch {}
      let minH = state.minH ?? 8, maxH = state.maxH ?? 10;
      let ticker = null;

      const save = () => {
        state.minH = minH; state.maxH = maxH;
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
      };

      /* ---- kleine Zeit-Helfer (Millisekunden ↔ "H:MM") ---- */
      const fmtMs = (ms) => { if (ms <= 0) return "0:00"; const m = Math.floor(ms / 60000); return Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0"); };
      const fmtHalf = (v) => Math.floor(v) + ":" + (v % 1 === 0.5 ? "30" : "00");
      const timeToMs = (t) => { const [h, m] = t.split(":").map(Number); return (h * 60 + m) * 60000; };
      const msToTimeStr = (ms) => { if (ms < 0 || ms >= 86400000) return null; const m = Math.floor(ms / 60000); return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
      const nowMs = () => { const n = new Date(); return (n.getHours() * 60 + n.getMinutes()) * 60000; };
      const nowTimeStr = () => { const n = new Date(); return String(n.getHours()).padStart(2, "0") + ":" + String(n.getMinutes()).padStart(2, "0"); };

      const getPauseMs = () => state.pauses.reduce((a, p) => a + (timeToMs(p.to) - timeToMs(p.from)), 0);
      const getNettoMs = (now) => {
        if (!state.start) return 0;
        const elapsed = now - timeToMs(state.start);
        const openMs = state.openPause ? (now - timeToMs(state.openPause)) : 0;
        return Math.max(0, elapsed - getPauseMs() - openMs);
      };

      function setStart() {
        const v = $("[data-instart]").value;
        if (!v) { $("[data-starterr]").textContent = "Bitte eine Uhrzeit eingeben."; return; }
        if (timeToMs(v) > nowMs()) { $("[data-starterr]").textContent = "Startzeit kann nicht in der Zukunft liegen."; return; }
        $("[data-starterr]").textContent = "";
        state.start = v; save(); startTicker(); update();
      }
      function openPause() {
        const v = $("[data-pausefrom]").value || nowTimeStr();
        $("[data-pausefrom]").value = v;
        if (timeToMs(v) < timeToMs(state.start)) { $("[data-pauseerr]").textContent = "Pause kann nicht vor dem Arbeitsbeginn liegen."; return; }
        $("[data-pauseerr]").textContent = "";
        state.openPause = v; $("[data-pauseto]").value = ""; save(); update();
      }
      function closePause() {
        const v = $("[data-pauseto]").value || nowTimeStr();
        $("[data-pauseto]").value = v;
        if (!state.openPause) return;
        if (timeToMs(v) <= timeToMs(state.openPause)) { $("[data-pauseenderr]").textContent = "Ende muss nach Beginn der Pause liegen."; return; }
        $("[data-pauseenderr]").textContent = "";
        state.pauses.push({ from: state.openPause, to: v }); state.openPause = null; save(); update();
      }
      function deletePause(i) { state.pauses.splice(i, 1); save(); update(); }
      function resetDay() {
        if (!confirm("Tag zurücksetzen?")) return;
        state.start = null; state.pauses = []; state.openPause = null; save();
        if (ticker) { clearInterval(ticker); ticker = null; }
        update();
      }
      function startTicker() { if (ticker) return; ticker = setInterval(updateStats, 30000); }

      // "update" zeigt/versteckt die Karten und rechnet alles neu.
      function update() {
        const hasStart = !!state.start;
        $("[data-startcard]").classList.toggle("wt-hidden", hasStart);
        $("[data-pausecard]").classList.toggle("wt-hidden", !hasStart);
        if (hasStart) { updateStats(); renderPauses(); } else { resetStats(); }
      }
      function resetStats() {
        ["[data-worked]", "[data-untilmin]", "[data-untilmax]", "[data-pause]", "[data-etmin]", "[data-etmax]", "[data-etstart]"]
          .forEach((s) => { $(s).textContent = "—"; });
        $("[data-fill]").style.width = "0%"; $("[data-pct]").textContent = "0%";
      }
      function updateStats() {
        if (!state.start) return;
        const now = nowMs();
        const netto = getNettoMs(now);
        const minMs = minH * 3600000, maxMs = maxH * 3600000;

        $("[data-worked]").textContent = fmtMs(netto);

        const pauseTotal = getPauseMs() + (state.openPause ? (now - timeToMs(state.openPause)) : 0);
        $("[data-pause]").textContent = fmtMs(pauseTotal);

        const remMin = minMs - netto;
        const minEl = $("[data-untilmin]");
        minEl.textContent = remMin <= 0 ? "✓" : fmtMs(remMin);
        minEl.className = "wt-stat-value " + (remMin <= 0 ? "green" : "amber");

        const remMax = maxMs - netto;
        const maxEl = $("[data-untilmax]");
        maxEl.textContent = remMax <= 0 ? "✓" : fmtMs(remMax);
        maxEl.className = "wt-stat-value " + (remMax <= 0 ? "green" : "muted");

        const pct = Math.min(100, Math.round((netto / maxMs) * 100));
        $("[data-pct]").textContent = pct + "%";
        const fill = $("[data-fill]");
        fill.style.width = pct + "%";
        // Füllfarbe der Fortschritts-Kapsel: Gelb bis zum Minimum, dann Salbei-Töne.
        fill.style.background = pct >= 100 ? "#A3C9A8" : (pct >= Math.round((minMs / maxMs) * 100) ? "#C9DECB" : "#F5C84C");

        const openMs = state.openPause ? (now - timeToMs(state.openPause)) : 0;
        const etMinMs = now + Math.max(0, remMin) + openMs;
        const etMaxMs = now + Math.max(0, remMax) + openMs;
        $("[data-etmin]").textContent = remMin <= 0 ? "Erreicht" : (msToTimeStr(etMinMs) || ">24h") + " Uhr";
        $("[data-etmax]").textContent = remMax <= 0 ? "Erreicht" : (msToTimeStr(etMaxMs) || ">24h") + " Uhr";
        $("[data-etstart]").textContent = state.start + " Uhr";

        const pill = $("[data-pill]");
        if (netto >= maxMs) { pill.textContent = "Maximum erreicht"; pill.className = "wt-pill done"; }
        else if (state.openPause) { pill.textContent = "Pause"; pill.className = "wt-pill pause"; }
        else { pill.textContent = "Aktiv"; pill.className = "wt-pill active"; }

        $("[data-pauseopen]").classList.toggle("wt-hidden", !!state.openPause);
        $("[data-pauseclose]").classList.toggle("wt-hidden", !state.openPause);
        if (!state.openPause) $("[data-pausefrom]").value = nowTimeStr();
        if (state.openPause) $("[data-pauseto]").value = nowTimeStr();
      }
      function renderPauses() {
        const list = $("[data-pauselist]");
        let html = "";
        state.pauses.forEach((p, i) => {
          const dur = timeToMs(p.to) - timeToMs(p.from);
          html += `<div class="wt-pause-item"><span class="wt-pause-times">${p.from} – ${p.to}<span class="wt-pause-dur">${fmtMs(dur)}</span></span><button class="wt-del" data-del="${i}" title="Löschen">×</button></div>`;
        });
        if (state.openPause) html += `<div class="wt-pause-item"><span class="wt-pause-times wt-pause-open">${state.openPause} – läuft…</span></div>`;
        list.innerHTML = html;
        list.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => deletePause(+b.dataset.del)));
      }

      /* ---- Verdrahtung ---- */
      $("[data-setstart]").addEventListener("click", setStart);
      $("[data-openpause]").addEventListener("click", openPause);
      $("[data-closepause]").addEventListener("click", closePause);

      // "Tag zurücksetzen" als Icon rechts im Fenster-Header (gleiche Zeile).
      if (api && api.addHeaderAction) {
        api.addHeaderAction({ icon: "rotate-ccw", title: "Tag zurücksetzen", danger: true, onClick: resetDay });
      }

      const minSlider = $("[data-min]"), maxSlider = $("[data-max]");
      minSlider.value = minH; $("[data-minval]").textContent = fmtHalf(minH);
      maxSlider.value = maxH; $("[data-maxval]").textContent = fmtHalf(maxH);
      minSlider.addEventListener("input", function () {
        minH = Number(this.value); $("[data-minval]").textContent = fmtHalf(minH);
        if (minH > maxH) { maxH = minH; maxSlider.value = maxH; $("[data-maxval]").textContent = fmtHalf(maxH); }
        save(); updateStats();
      });
      maxSlider.addEventListener("input", function () {
        maxH = Number(this.value); $("[data-maxval]").textContent = fmtHalf(maxH);
        if (maxH < minH) { minH = maxH; minSlider.value = minH; $("[data-minval]").textContent = fmtHalf(minH); }
        save(); updateStats();
      });

      $("[data-date]").textContent = new Date().toLocaleDateString("de-AT", { weekday: "long", day: "numeric", month: "long" });
      $("[data-instart]").value = nowTimeStr();
      if (state.start) startTicker();
      update();

      // Aufräumen: Timer stoppen, wenn das Fenster geschlossen wird.
      return () => { if (ticker) clearInterval(ticker); };
    }
  },

  {
    id: "dienstplan",
    name: "Dienstplan",
    icon: "calendar-days",
    display: "sheet",
    render(container, api) {
      // Die eigentliche UI lebt als ES-Modul in js/dienstplan.js (braucht die
      // Supabase-Anmeldung aus auth.js). Hier nur dynamisch nachladen.
      let cleanup = null;
      container.innerHTML = '<div class="dp-loading">Lade Dienstplan…</div>';
      import("./js/dienstplan.js")
        .then((m) => { cleanup = m.renderDienstplan(container, api) || null; })
        .catch(() => { container.innerHTML = '<div class="dp-loading">Dienstplan konnte nicht geladen werden.</div>'; });
      return () => { if (typeof cleanup === "function") cleanup(); };
    }
  }
];
