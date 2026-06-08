# Vegvisir

Persönliche Bookmark-Startseite. Zeigt Bookmarks im Homescreen-Look an,
befüllt ausschließlich per JSON-Import.

- **Nur Import:** lädt eine JSON-Datei (Button auf der leeren Seite oder Datei
  aufs Fenster ziehen), gespeichert lokal im Browser (`localStorage`).
- **Layout:** Ordner als Kacheln mit 2×2-Vorschau, lose Bookmarks daneben.
  Klick auf einen Ordner öffnet ein Bottom-Sheet mit den Links.
- **Suche:** feste Leiste unten durchsucht alle Bookmarks (auch in Ordnern).
- **Icons:** Bild aus dem Import als Cover-Icon, sonst Monogramm-Platzhalter.
- **Installierbar (PWA)** ohne Service-Worker.
