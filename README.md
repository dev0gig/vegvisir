# Vegvisir

Persönliche Bookmark-Startseite im **Windows-Metro-Stil**: farbige Kacheln,
frei verschiebbar, Ordner per Ziehen. Läuft komplett im Browser — **kein
Server, kein Login, keine Cloud**.

## Was die App kann

- **Kachelwand:** Jedes Bookmark ist eine farbige Kachel mit dem Favicon in der
  Mitte. Drei Größen: klein (1×1), breit (2×1), groß (2×2).
- **Kachelfarbe aus dem Favicon:** Die häufigste kräftige Farbe des Icons wird
  ausgelesen und auf eine feste Helligkeit gebracht, damit die weiße Schrift
  überall lesbar bleibt (Kontrast mindestens 4,5:1).
  ⚠️ Das geht nur bei **eingebetteten** Bildern (`data:`-Adressen). Fremde
  Favicon-Adressen (z.B. Googles Dienst `t2.gstatic.com`) darf der Browser aus
  Sicherheitsgründen nicht auslesen — die bekommen die Standardfarbe. Fügt man
  im Bearbeiten-Dialog ein eigenes Bild aus der Zwischenablage ein, ist es
  eingebettet und die Farbe wird berechnet.
- **Selbst verwalten:** Bookmarks und Ordner anlegen, bearbeiten, löschen,
  Größe wählen — über das Kachelmenü (Rechtsklick bzw. langer Druck), das
  Menü unten rechts oder die Slash-Befehle.
- **Ziehen:** Kacheln frei umsortieren. **Mitte einer anderen Kachel 0,7 s
  halten** → daraus wird ein Ordner (der Ring baut sich sichtbar auf).
  Funktioniert mit Maus, Finger und Stift.
- **Ordner** klappen an Ort und Stelle im Raster auf, direkt unter ihrer Kachel.
- **Suche** (feste Leiste unten) durchsucht alle Bookmarks, auch die in Ordnern.
- **Import/Export:** JSON-Datei per Knopf, `/import` oder Ziehen auf die Seite.
  Sind schon Bookmarks da, wird gefragt: **ersetzen oder zusammenführen**.

## ⚠️ Die Daten liegen NUR in diesem Browser

Es gibt keine Cloud und keine Synchronisierung. Browserdaten löschen, anderes
Gerät oder anderer Browser = die Bookmarks sind weg.

**Deshalb regelmäßig sichern:** `/export` (oder „Sichern" im Menü) lädt eine
JSON-Datei herunter. Ist die letzte Sicherung älter als 14 Tage, erinnert die
App oben mit einem Streifen daran.

`/undo` nimmt die letzte größere Änderung zurück (Import, Löschen, Ordner
bilden oder auflösen). Aufgehoben werden die letzten **zwei** Stände — mehr
passt nicht in den Browser-Speicher (rund 5 MB, ein voller Datensatz mit
eingebetteten Icons wiegt schon etwa 0,7 MB).

## Slash-Befehle

| Befehl | Wirkung |
| --- | --- |
| `/neu` | Neues Bookmark anlegen |
| `/ordner` | Neuen Ordner anlegen |
| `/import` | Bookmarks importieren (JSON) |
| `/export` | Bookmarks sichern (JSON) |
| `/undo` | Letzte größere Änderung zurücknehmen |
| `/g <text>` | Websuche bei Google |
| `/c <rechnung>` | Blitzrechner direkt in der Suchzeile |
| `/calc`, `/zeit`, `/duplex` | Werkzeug-Fenster öffnen |

Enter ohne Slash startet eine Websuche bei DuckDuckGo.

## Design / CSS bauen (Tailwind)

Das Design (Neo-Minimalismus: Creme-Flächen, Anthrazit-Konturen, Gelb-Akzent)
lebt als Quelle in **`src/app.tailwind.css`** und wird mit Tailwind v4 zu
**`styles.css`** kompiliert. Die fertige `styles.css` ist eingecheckt — das
Hosting braucht keinen Build-Schritt.

```
npm install        # einmalig (holt Tailwind)
npm run css        # src/app.tailwind.css → styles.css
npm run css:watch  # dito, baut bei jeder Änderung neu
```

**Wichtig:** Nie `styles.css` direkt bearbeiten, immer die Quelle unter `src/`
ändern und neu bauen (sonst überschreibt der nächste Build die Änderung).

## Lokal starten

```
./start-dev.sh     # Dev-Server auf Port 8080
```
