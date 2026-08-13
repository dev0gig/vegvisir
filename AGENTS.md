# Agenten-Leitfaden — vegvisir

Persönliche Startseite von Patrick im Windows-Metro-Stil (eckig, warm-dunkel):
**Favoriten** (Bookmarks, localStorage) und **Werkzeuge** (fest aus `tools.js`)
als zwei getrennte Gruppen. Reines Vanilla-JS **ohne Build-Step** (nur das CSS
wird mit Tailwind gebaut), statisch gehostet. **Kein Backend, kein Login, keine
PWA.**

## Verbindliche Arbeitsregeln

### Commits & Push
- Nach **jeder** Änderung an einer Datei in diesem Repo wird **immer sofort
  selbstständig committet und gepusht** — ohne Rückfrage.
- Commit-Nachricht **auf Deutsch**: klar erklären, **was** geändert wurde und
  **warum** — verständlich ohne Fachwissen.
- Nach dem Push kurz Bescheid geben.

### Verifikation — headless testen ist Pflicht
Die App startet sofort und ist vollständig automatisiert erreichbar. Also
**nicht raten**:

- `node --check` auf alle geänderten JS-Module.
- Prüfen, dass Import-/Export-Namen zwischen den Modulen zusammenpassen.
- **Im Browser prüfen:** kleinen Server starten
  (`python3 -m http.server 8899`) und mit Playwright (liegt in
  `~/repos/toride/node_modules`) durchklicken — beide Gruppen, Ziehen,
  Ordner-Geste (0,7 s über der Mitte halten), Dialoge, Werkzeug-Fenster,
  die Unterseiten `cardcrop/` und `mtg/`, Handy-Breite (kein seitliches
  Scrollen). Screenshots ansehen, nicht nur Zusagen zählen.
- Daten zum Testen: `localStorage.setItem("vegvisir.data", …)` per
  `addInitScript` — die Migration läuft beim Laden automatisch.

## Tech-Stack

- **Frontend:** Vanilla-JS als native ES-Module, kein Framework, kein Bundler.
- **CSS:** Tailwind v4. Quelle `src/app.tailwind.css` → kompiliert zu
  `styles.css` (eingecheckt, das Hosting braucht keinen Build).
  **`styles.css` nie direkt bearbeiten** — immer die Quelle ändern und neu
  bauen. Das Design ist warm-dunkel und **komplett ohne Rundungen** (Metro);
  auf Gelb (`--color-sun`) steht immer `--color-sun-ink` (dunkel).
- **Speicher:** ausschließlich `localStorage` — und NUR für die Favoriten.
  Die Werkzeuge stehen fest in `tools.js` und werden nicht gespeichert.
- **Bibliotheken:** alle lokal im Repo (kein CDN!): `js/vendor/` (pdf-lib,
  Lucide) und `cardcrop/vendor/` (pdf.js + Worker, JSZip). Nur die MTG-Suche
  ruft nach draußen (Scryfall-API, braucht Netz).
- **Unterseiten:** `cardcrop/` und `mtg/` sind eigenständige, aus ihren alten
  Repos übernommene Apps mit **eigenem CSS/JS** — bewusst anderer Look, nicht
  ans Vegvisir-Design angleichen, außer Patrick verlangt es.

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
index.html            # App-Shell (Startseite)
styles.css            # Build-Artefakt (nicht editieren!)
src/app.tailwind.css  # CSS-Quelle (Tailwind v4)
tools.js              # Werkzeug-Liste (window.VEG_TOOLS, klassisches Skript)
                      #   Fenster-Tools: { id, name, icon, width, height, render() }
                      #   Seiten-Tools:  { id, name, icon, kind:"page", url:"…/" }
manifest.webmanifest  # nur noch Name+Icon für Chromes "Seite installieren"
assets/               # Fonts, Favicon, Icons
cardcrop/             # Unterseite: Karten-Scans zerlegen (eigenes CSS/JS + vendor/)
mtg/                  # Unterseite: alte Magic-Sets durchsuchen (Scryfall)
js/
  main.js             # Einstieg: App starten, Schließen-Gesten, SW-Abmeldung
  store.js            # Favoriten-Daten: Modell v2, localStorage, alle Änderungen
  color.js            # Kachelfarbe aus dem Favicon berechnen
  render.js           # Oberfläche: Gruppen Favoriten + Werkzeuge bauen
  templates.js        # HTML-Strings aus Daten (kein DOM, kein State)
  dragdrop.js         # Ziehen (Pointer-Events) + Ordner-Geste (nur Favoriten)
  editor.js           # Dialoge, Kachelmenü, Icon aus der Zwischenablage
  dom.js              # Reine Helfer: escapen, URLs normalisieren, IDs
  search.js           # Live-Suche + Befehls-Palette
  commands.js         # Slash-Befehle (Definitionen + Ausführung)
  toolwindows.js      # frei verschiebbare Werkzeug-Fenster
  pdfduplex.js        # PDF-Duplex-Fixer UI (lazy geladen)
  pdfDuplexFixer.js   # PDF-Duplex-Fixer Logik (rein, ohne DOM)
  vendor/             # pdf-lib, lucide (lokal)
```

## Architektur-Notizen

- **Zwei Gruppen, eine Datei:** `render.js` zeichnet erst die Favoriten
  (aus `store.js`), dann die Werkzeug-Gruppe (aus `tools.js`). Die
  Werkzeug-Gruppe hat KEIN Ziehen und KEIN Kachelmenü — Fenster-Tools sind
  Buttons, Seiten-Tools normale Links.
- **Datenformat (Version 2):** EINE geordnete Liste `items` — die Reihenfolge
  ist zugleich die Anzeige. Bookmark oder Ordner; Ordner haben genau **eine**
  Ebene. `migrate()` versteht alte Stände und wirft dabei die früheren
  `type:"tool"`-Kacheln stillschweigend raus.
- **Kein Service Worker mehr:** `main.js` meldet den alten Worker ab und leert
  seine Caches. Diese Zeilen NICHT entfernen, solange irgendwo die alte
  PWA-Version installiert sein könnte.
- **Kachelfarbe:** wird EINMAL je Kachel berechnet und mitgespeichert
  (`ensureColors()`). Auslesbar sind nur `data:`-Bilder — fremde Adressen
  liefern die Standardfarbe.
- **⚠️ Ziehen: nie das gezogene Element im DOM verschieben.** Wandert das
  Element, an dem die Geste hängt, im DOM umher, bricht der Browser die
  Zeiger-Erfassung ab (`pointercancel`). Deshalb bleibt die Originalkachel
  unsichtbar an Ort und Stelle (`.is-dragging { display:none }`) und ein
  **Platzhalter** wandert durchs Raster. Bitte nicht „vereinfachen".
- **⚠️ Ordner-Geste vs. Umsortieren:** Über der **Mitte** einer Kachel wird
  NICHT umsortiert, nur der Ordner-Ring aufgebaut; umsortiert wird am **Rand**.
  Kacheln der Werkzeug-Gruppe sind für die Geste unsichtbar (`hitTest` prüft
  `st.grid.contains`).
- **Ordner klappen im Raster auf:** Das Feld bekommt `grid-column: 1 / -1` und
  landet dadurch von selbst in der Zeile unter seiner Kachel.
- **Metro-Raster:** feste Kachel-Grundgröße `--unit` am `:root` (nicht am
  Raster!), damit auch der gezogene Klon am `<body>` dieselben Maße erbt.
- **Lazy Loading:** Schwere Werkzeuge (PDF-Duplex-Fixer) werden erst beim
  Öffnen dynamisch importiert.
- **Module-Stil:** `templates.js`/`dom.js`/`color.js`/`pdfDuplexFixer.js` sind
  (fast) reine Logik; DOM-Zugriffe und State liegen in den UI-Modulen.
