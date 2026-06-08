# Vegvisir

Eine winzige, statische **PWA zum Erfassen von Bookmarks unterwegs** – von überall
erreichbar über GitHub Pages, ganz ohne Backend und ohne Tailscale.

Erfasste Bookmarks liegen lokal im Browser (`localStorage`). Per **JSON exportieren**
bekommst du eine Datei im exakten Format, das [Toride](https://github.com/dev0gig/toride)
über *Import / Export → Importieren* einliest.

## Features

- Bookmark hinzufügen: URL, Name, optionaler Ordner, Favorit.
- Name wird aus der Domain vorgeschlagen, Favicon automatisch als Bild gesetzt.
- **Export** als `bookmarks-JJJJ-MM-TT.json` (Toride-kompatibel).
- **Import** des eigenen Exports (zum Weitermachen auf einem anderen Gerät; dubletten-sicher per URL).
- Installierbar als PWA, funktioniert offline.
- **Android Share-Target:** Link aus einer beliebigen App „Teilen" → landet vorausgefüllt in Vegvisir.

## Export-Format (Toride)

```json
{
  "version": 1,
  "exportedAt": "2026-06-08T12:00:00.000Z",
  "folders": [
    { "name": "Arbeit", "icon": "folder",
      "bookmarks": [ { "name": "…", "url": "…", "imageUrl": "…", "isFavorite": true } ] }
  ],
  "bookmarks": [ { "name": "…", "url": "…", "imageUrl": "…" } ]
}
```

## Deploy (GitHub Pages)

Reine statische Dateien, kein Build. In **Settings → Pages**:
*Source: Deploy from a branch → Branch: `main` / `/ (root)`*.

Danach erreichbar unter `https://dev0gig.github.io/vegvisir/`.

## Lokal testen

```bash
python3 -m http.server 8000
# http://localhost:8000
```
(Service Worker & „Installieren" brauchen `https://` oder `localhost`.)
