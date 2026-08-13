# Vegvisir

Persönliche Startseite im **Windows-Metro-Stil** (eckig, warm-dunkel) mit zwei
Gruppen:

- **Favoriten** — Bookmarks als farbige Kacheln, frei verschiebbar, Ordner per
  Ziehen. Liegen nur im Browser (localStorage), kein Server, kein Login.
- **Werkzeuge** — feste Kacheln aus `tools.js`. Kleine Werkzeuge öffnen als
  frei verschiebbares Fenster, große als eigene Unterseite:

| Werkzeug | Art | Aufruf |
| --- | --- | --- |
| Rechner | Fenster | Kachel oder `/calc` |
| Arbeitszeit (Dienstzeiten) | Fenster | Kachel oder `/zeit` |
| PDF Duplex-Fixer | Fenster | Kachel oder `/duplex` |
| CardCrop (Karten-Scans zerlegen) | Unterseite `cardcrop/` | Kachel oder `/crop` |
| MTG-Suche (alte Magic-Sets) | Unterseite `mtg/` | Kachel oder `/mtg` |

CardCrop und die MTG-Suche waren früher eigene Repos (`cardcrop`,
`old-mtg-searcher`) und leben seit 13.8.2026 hier als Unterseiten — mit ihrem
eigenen Look, das ist Absicht. Alle Bibliotheken (pdf.js, JSZip, pdf-lib,
Lucide) liegen lokal im Repo; nur die MTG-Suche braucht Netz (Scryfall-API).

## Favoriten bedienen

- **Kachelwand:** drei Größen (1×1, 2×1, 2×2), Farbe kommt aus dem Favicon
  (nur bei eingebetteten Bildern auslesbar, sonst Standardfarbe).
- **Kachelmenü:** Rechtsklick bzw. langer Druck — bearbeiten, Größe, löschen.
- **Ziehen:** frei umsortieren; **Mitte einer anderen Kachel 0,7 s halten**
  → Ordner. Ordner klappen an Ort und Stelle im Raster auf.
- **Suche** (feste Leiste unten) durchsucht alle Bookmarks, auch in Ordnern.
  Enter ohne Slash = Websuche bei DuckDuckGo.

⚠️ Die Favoriten liegen NUR in diesem Browser. Browserdaten löschen oder
anderes Gerät = Kacheln weg. Eine Sicherung/Import gibt es bewusst nicht mehr —
Vegvisir ist eine Arbeitsfläche, keine Datenbank.

## Slash-Befehle

| Befehl | Wirkung |
| --- | --- |
| `/neu` | Neues Bookmark anlegen |
| `/ordner` | Neuen Ordner anlegen |
| `/g <text>` | Websuche bei Google |
| `/c <rechnung>` | Blitzrechner direkt in der Suchzeile |
| `/calc`, `/zeit`, `/duplex` | Werkzeug-Fenster öffnen |
| `/crop`, `/mtg` | Unterseiten-Werkzeug öffnen |

## Design / CSS bauen (Tailwind)

Warm-dunkles Metro-Design: dunkle, warme Flächen, **keine Rundungen**, dünne
Konturlinien, warmes Gelb als Akzent. Quelle ist **`src/app.tailwind.css`**,
kompiliert mit Tailwind v4 zu **`styles.css`** (eingecheckt — das Hosting
braucht keinen Build-Schritt).

```
npm install        # einmalig (holt Tailwind)
npm run css        # src/app.tailwind.css → styles.css
npm run css:watch  # dito, baut bei jeder Änderung neu
```

**Wichtig:** Nie `styles.css` direkt bearbeiten, immer die Quelle unter `src/`
ändern und neu bauen. Die Unterseiten `cardcrop/` und `mtg/` haben ihr eigenes,
davon unabhängiges CSS.

## Keine PWA mehr

Den Service Worker gibt es seit 13.8.2026 nicht mehr (Chrome kann Seiten auch
ohne installieren; fürs Handy gibt es Toride). `js/main.js` meldet den alten
Worker bei Besuchern ab und leert seine Caches — diese Zeilen müssen bleiben,
solange irgendwo die alte Version installiert sein könnte. Das
`manifest.webmanifest` bleibt nur für Name + Icon beim „Seite installieren".

## Veröffentlichen

Das Repo liegt **nur auf GitHub** (`dev0gig/vegvisir`, öffentlich). **Push auf
`main` = live** unter https://dev0gig.github.io/vegvisir/ — GitHub Pages baut
direkt aus dem Branch (deshalb die leere `.nojekyll`, ein Build dauert ~30–45 s).

## Lokal starten

```
./start-dev.sh     # Dev-Server auf Port 8080
```
