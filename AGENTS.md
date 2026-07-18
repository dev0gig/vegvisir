# Agenten-Leitfaden — vegvisir

Persönliches Dashboard (PWA) von Patrick: Bookmarks im Homescreen-Look,
Dienstplan-Kalender und Werkzeuge (z. B. PDF-Duplex-Fixer). Reines Vanilla-JS
**ohne Build-Step**, deployt auf **Vercel** (statisch, kein Build nötig).

## Verbindliche Arbeitsregeln

### Commits & Push
- Nach **jeder** Änderung an einer Datei in diesem Repo wird **immer sofort
  selbstständig committet und gepusht** — ohne Rückfrage.
- Commit-Nachricht **auf Deutsch**: klar erklären, **was** geändert wurde und
  **warum** — verständlich ohne Fachwissen.
- Nach dem Push kurz Bescheid geben.

### Verifikation — kein Headless-Test möglich
Die App liegt hinter einem **GitHub-OAuth-Login-Gate** (`js/auth.js`). Ein
headless Browser kommt nur bis zum Login; die eigentliche App (Suche,
Slash-Befehle, Dienstplan, Import-Dialoge) startet erst nach erlaubtem Login
und ist **nicht** automatisiert erreichbar.

Daher bei Änderungen **nicht** headless/im Browser verifizieren, sondern:
- `node --check` auf alle geänderten JS-Module laufen lassen.
- Prüfen, dass Import-/Export-Namen zwischen den Modulen zusammenpassen.
- Die Sicht-Prüfung macht **Patrick manuell im Browser** — nach dem Deploy
  kurz auflisten, was er durchklicken soll.

## Tech-Stack

- **Frontend:** Vanilla-JS als native ES-Module, kein Framework, kein Bundler.
- **CSS:** Tailwind v4. Quelle `src/app.tailwind.css` → kompiliert zu
  `styles.css` (eingecheckt, Vercel braucht keinen Build).
  **`styles.css` nie direkt bearbeiten** — immer die Quelle ändern und neu bauen.
- **Backend:** Supabase (GitHub-OAuth, Postgres-Tabellen `vegvisir_data` und
  `dienstplan_events`, Edge Function `google-sync`), abgesichert per RLS.
- **PDF:** `pdf-lib`, als ES-Modul in `js/vendor/` vendored.
- **PWA:** installierbar, bewusst ohne Service-Worker.

## Befehle

```
./start-dev.sh      # Dev-Server auf Port 8080 (auch via Tailscale erreichbar)
npm run css         # src/app.tailwind.css → styles.css bauen
npm run css:watch   # CSS bei Änderungen neu bauen
node --check js/<datei>.js   # Syntax-Check einzelner Module
```

Tests und Linting existieren nicht.

## Projektstruktur

```
index.html            # App-Shell
styles.css            # Build-Artefakt (nicht editieren!)
src/app.tailwind.css  # CSS-Quelle (Tailwind v4)
tools.js              # Werkzeug-Liste (window.VEG_TOOLS, klassisches Skript)
assets/               # Fonts, Favicon
js/
  main.js             # Einstieg: Login-Gate, danach App-Start, Event-Wiring
  auth.js             # GitHub-OAuth via Supabase, Zugriffsprüfung
  config.js           # SUPABASE_URL, ANON_KEY, ALLOWED_GITHUB_LOGIN
  data.js             # Bookmark-Daten: localStorage + Supabase-Spiegelung
  backup.js           # Backup-Rotation vor jedem Import (Undo-Fundament)
  import.js           # Datei-Router: JSON = Bookmarks, ICS = Dienstplan
  render.js           # Oberfläche aus Daten bauen
  templates.js        # HTML-Strings aus Daten (kein DOM, kein State)
  dom.js              # Reine Helfer: escapen, URLs normalisieren
  search.js           # Live-Suche + Befehls-Palette
  commands.js         # Slash-Befehle (Definitionen + Ausführung)
  sheet.js            # Ordner als Bottom-Sheet öffnen/schließen
  dienstplan.js       # Dienstplan-Kalender (Wochen-/Monatsansicht, Mo–Fr)
  dienstplan-db.js    # Supabase-Tabelle dienstplan_events
  ics.js              # ICS-Parser (OpCyc-Dienstplan)
  google-sync.js      # Frontend-Brücke zur Edge Function google-sync
  toolwindows.js      # Werkzeug-Dock + verschiebbare Fenster
  pdfduplex.js        # PDF-Duplex-Fixer UI (lazy geladen)
  pdfDuplexFixer.js   # PDF-Duplex-Fixer Logik (rein, ohne DOM)
  vendor/pdf-lib.esm.min.js
supabase/
  functions/google-sync/   # Edge Function: Google-Kalender-Sync
  migrations/              # SQL-Migrationen
docs/                      # Einrichtungs-Anleitungen
```

## Architektur-Notizen

- **Login-Gate:** Vor der App steht GitHub-OAuth via Supabase. Nur der in
  `ALLOWED_GITHUB_LOGIN` (klein geschrieben) hinterlegte GitHub-**Benutzername**
  bekommt Zugriff (Prüfung über Username, nicht E-Mail), sonst sofortiger
  Logout.
- **Datenfluss:** `localStorage` ist die Quelle der Wahrheit fürs sofortige
  Rendern; jeder Import wird zusätzlich nach Supabase gespiegelt, beim Start
  wird im Hintergrund eine ggf. neuere Cloud-Version geholt.
- **Backups:** Vor jedem Import (JSON wie ICS) rotiert `backup.js` eine
  Sicherung — Fundament für Undo. Nicht umgehen.
- **Lazy Loading:** Schwere Werkzeuge (PDF-Duplex-Fixer) und der Dienstplan
  werden erst beim Öffnen dynamisch importiert.
- **Konfiguration ist öffentlich:** `js/config.js` enthält bewusst keine
  Geheimnisse — der Anon-Key ist ein Browser-Schlüssel, abgesichert über
  Supabase-RLS + die `ALLOWED_GITHUB_LOGIN`-Prüfung.
- **Module-Stil:** Klare Trennung — `templates.js`/`dom.js`/`pdfDuplexFixer.js`
  sind reine Logik ohne Seiteneffekte; DOM-Zugriffe und State liegen in den
  UI-Modulen. Neue Funktionen diesem Muster folgend einordnen.
