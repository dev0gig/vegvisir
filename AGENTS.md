# Agenten-Leitfaden — vegvisir

Persönliche Bookmark-Startseite von Patrick im Windows-Metro-Stil, dazu ein
paar Werkzeuge (z. B. PDF-Duplex-Fixer). Reines Vanilla-JS **ohne Build-Step**,
statisch gehostet. **Kein Backend, kein Login** — alle Daten liegen im
`localStorage` des Browsers.

## Verbindliche Arbeitsregeln

### Commits & Push
- Nach **jeder** Änderung an einer Datei in diesem Repo wird **immer sofort
  selbstständig committet und gepusht** — ohne Rückfrage.
- Commit-Nachricht **auf Deutsch**: klar erklären, **was** geändert wurde und
  **warum** — verständlich ohne Fachwissen.
- Nach dem Push kurz Bescheid geben.

### Verifikation — headless testen ist Pflicht
Seit das GitHub-OAuth-Login-Gate weg ist, startet die App sofort und ist
vollständig automatisiert erreichbar. Also **nicht mehr raten**:

- `node --check` auf alle geänderten JS-Module.
- Prüfen, dass Import-/Export-Namen zwischen den Modulen zusammenpassen.
- **Im Browser prüfen:** kleinen Server starten
  (`python3 -m http.server 8899`) und mit Playwright (liegt in
  `~/repos/toride/node_modules`) durchklicken — Kachelwand, Ziehen,
  Ordner-Geste, Dialoge, Handy-Breite. Screenshots ansehen, nicht nur Zusagen
  zählen.
- Daten zum Testen: `localStorage.setItem("vegvisir.data", …)` mit einem
  Toride-Export; die Migration nach Version 2 läuft beim Laden automatisch.

## Tech-Stack

- **Frontend:** Vanilla-JS als native ES-Module, kein Framework, kein Bundler.
- **CSS:** Tailwind v4. Quelle `src/app.tailwind.css` → kompiliert zu
  `styles.css` (eingecheckt, das Hosting braucht keinen Build).
  **`styles.css` nie direkt bearbeiten** — immer die Quelle ändern und neu bauen.
- **Speicher:** ausschließlich `localStorage`. Kein Server, kein Konto.
- **PDF:** `pdf-lib`, als ES-Modul in `js/vendor/` vendored.
- **Von außen geladen:** nur Lucide (Icons) per CDN.

## Befehle

```
./start-dev.sh      # Dev-Server auf Port 8080 (auch via Tailscale erreichbar)
npm run css         # src/app.tailwind.css → styles.css bauen
npm run css:watch   # CSS bei Änderungen neu bauen
node --check js/<datei>.js   # Syntax-Check einzelner Module
```

Tests und Linting existieren nicht (die Prüfung läuft über Playwright, siehe oben).

## Projektstruktur

```
index.html            # App-Shell
styles.css            # Build-Artefakt (nicht editieren!)
src/app.tailwind.css  # CSS-Quelle (Tailwind v4)
tools.js              # Werkzeug-Liste (window.VEG_TOOLS, klassisches Skript)
assets/               # Fonts, Favicon
js/
  main.js             # Einstieg: App starten, globale Schließen-Gesten
  store.js            # Daten: Modell v2, localStorage, Undo, alle Änderungen
  color.js            # Kachelfarbe aus dem Favicon berechnen
  render.js           # Oberfläche aus den Daten bauen
  templates.js        # HTML-Strings aus Daten (kein DOM, kein State)
  dragdrop.js         # Ziehen (Pointer-Events) + Ordner-Geste
  editor.js           # Dialoge, Kachelmenü, Icon aus der Zwischenablage
  importexport.js     # JSON-Import (mit Rückfrage) und Sicherung
  dom.js              # Reine Helfer: escapen, URLs normalisieren, IDs
  search.js           # Live-Suche + Befehls-Palette
  commands.js         # Slash-Befehle (Definitionen + Ausführung)
  toolwindows.js      # Menü-Dock + verschiebbare Werkzeug-Fenster
  pdfduplex.js        # PDF-Duplex-Fixer UI (lazy geladen)
  pdfDuplexFixer.js   # PDF-Duplex-Fixer Logik (rein, ohne DOM)
  vendor/pdf-lib.esm.min.js
```

## Architektur-Notizen

- **Datenformat (Version 2):** EINE geordnete Liste `items` — die Reihenfolge
  ist zugleich die Anzeige. Ein Eintrag ist entweder ein Bookmark oder ein
  Ordner; Ordner haben genau **eine** Ebene (kein Ordner im Ordner).
  Alte Toride-Exporte (`{folders, bookmarks}`) werden beim Laden automatisch
  migriert — `migrate()` in `store.js` versteht beide Formate.
- **Kachelfarbe:** wird EINMAL je Kachel berechnet und mitgespeichert
  (`ensureColors()`), nicht bei jedem Zeichnen. Auslesbar sind nur
  `data:`-Bilder — fremde Adressen liefern die Standardfarbe (siehe README).
- **⚠️ Ziehen: nie das gezogene Element im DOM verschieben.** Wandert das
  Element, an dem die Geste hängt, im DOM umher, bricht der Browser die
  Zeiger-Erfassung ab (`pointercancel`) und die Geste endet mitten in der
  Bewegung. Deshalb bleibt die Originalkachel unsichtbar an Ort und Stelle
  (`.is-dragging { display:none }`) und ein **Platzhalter** wandert durchs
  Raster. Das war ein echter Fehler beim ersten Anlauf — bitte nicht
  „vereinfachen".
- **⚠️ Ordner-Geste vs. Umsortieren:** Über der **Mitte** einer Kachel wird
  NICHT umsortiert, nur der Ordner-Ring aufgebaut; umsortiert wird am **Rand**.
  Ohne diese Trennung schiebt sich die Zielkachel beim Zielen selbst weg —
  genau daran scheitern fertige Raster-Bibliotheken wie gridstack, deren
  Kollisions-Logik sich nicht abschalten lässt.
- **Ordner klappen im Raster auf:** Das Feld bekommt `grid-column: 1 / -1` und
  landet dadurch von selbst in der Zeile unter seiner Kachel — ohne
  Zeilenberechnung.
- **Metro-Raster:** feste Kachel-Grundgröße `--unit` am `:root` (nicht am
  Raster!), damit auch der gezogene Klon am `<body>` dieselben Maße erbt.
- **Lazy Loading:** Schwere Werkzeuge (PDF-Duplex-Fixer) werden erst beim
  Öffnen dynamisch importiert.
- **Module-Stil:** Klare Trennung — `templates.js`/`dom.js`/`color.js`/
  `pdfDuplexFixer.js` sind (fast) reine Logik; DOM-Zugriffe und State liegen in
  den UI-Modulen. Neue Funktionen diesem Muster folgend einordnen.
