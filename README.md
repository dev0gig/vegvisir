# Vegvisir

Eine statische, eigenständige **Bookmark-Startseite** im Norse-Look – über GitHub Pages
von überall erreichbar, ohne Backend und ohne Tailscale.

Vegvisir **zeigt** deine Bookmarks an, sie werden **ausschließlich per Import** befüllt:
Du lädst den JSON-Export aus [Toride](https://github.com/dev0gig/toride)
(*Import / Export → Exportieren*), und Vegvisir legt daraus automatisch Ordner und
Links als iOS-Homescreen an.

## Funktion

- **Nur Import** – kein Erstellen/Bearbeiten im UI. Lädt das Toride-JSON (Button oben
  rechts oder Datei aufs Fenster ziehen), gespeichert lokal im Browser (`localStorage`).
- **iOS-Homescreen-Layout:** Ordner zuerst als Kacheln (mit 2×2-Vorschau), lose
  Bookmarks daneben. Klick auf einen Ordner öffnet ein **Bottom-Sheet** mit den Links.
- **Icons aus dem Export:** ist im JSON ein `imageUrl` gesetzt, wird es als
  bildschirmfüllendes Cover-Icon angezeigt – sonst ein **Monogramm-Platzhalter**
  (erster Buchstabe). Keine bunten Tönungen, einheitlicher Look.
- Klick auf eine Kachel öffnet den Link in einem neuen Tab.
- Norse-Theme (Cinzel/Manrope, Vegvisir-Sigille, Aurora-Hintergrund, Glass-Kacheln).
  Kein Service-Worker, keine PWA – reine statische Seite.

## Erwartetes Import-Format (Toride-Export)

```json
{
  "version": 1,
  "folders": [
    { "name": "Arbeit", "icon": "folder",
      "bookmarks": [ { "name": "…", "url": "…", "imageUrl": "…", "isFavorite": true } ] }
  ],
  "bookmarks": [ { "name": "…", "url": "…", "imageUrl": "…" } ]
}
```

## Technik

Single-File `index.html` (HTML + CSS + JS inline). Einzige externe Abhängigkeiten:
[Lucide](https://lucide.dev) (Ordner-/UI-Icons) und Google Fonts (Cinzel, Manrope),
beide per CDN. Kein Build-Schritt.

## Deploy (GitHub Pages)

**Settings → Pages**: *Source: Deploy from a branch → Branch `main` / `/ (root)`*.
Danach erreichbar unter `https://dev0gig.github.io/vegvisir/`.

## Lokal testen

```bash
python3 -m http.server 8000   # http://localhost:8000
```
