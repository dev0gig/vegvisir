/* ============ WERKZEUGE (Tools-Registry) ============

   Eigene kleine Werkzeuge für vegvisir. Jedes Tool ist ein Objekt:

     {
       id:     "eindeutige-id",
       name:   "Anzeigename",
       icon:   "lucide-name",      // Icon-Name von https://lucide.dev/icons
       width:  280,                // feste Fenstergröße in px (optional)
       height: 400,
       render(container) { ... }   // baut die Oberfläche in `container`
     }

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

      let cur = "0";        // aktuell eingegebene/angezeigte Zahl (String, mit Komma)
      let prev = null;      // vorheriger Operand (Number)
      let op = null;        // ausstehende Operation: + - * /
      let overwrite = true; // nächste Ziffer überschreibt die Anzeige

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
        if (b.dataset.digit != null) { inputDigit(b.dataset.digit); return; }
        if (b.dataset.op) { setOp(b.dataset.op); return; }
        switch (b.dataset.action) {
          case "dot": inputDot(); break;
          case "equals": equals(); break;
          case "percent": percent(); break;
          case "negate": negate(); break;
          case "clear": clearAll(); break;
        }
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
        e.stopPropagation();
      });

      setTimeout(() => root.focus(), 30);
      show();
    }
  }
];
