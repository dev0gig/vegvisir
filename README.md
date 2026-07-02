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
- **Login + Cloud-Sync (Supabase):** Vor der App steht ein Login-Gate
  („Mit GitHub anmelden"). Nur die in `ALLOWED_EMAIL` hinterlegte E-Mail
  bekommt Zugriff, sonst sofortiger Logout mit „Kein Zugriff". Jeder JSON-Import
  wird zusätzlich in die Supabase-Tabelle `vegvisir_data` gespiegelt; beim Start
  rendert die App zuerst den lokalen `localStorage`-Stand und holt danach im
  Hintergrund eine ggf. neuere Cloud-Version.

## Konfiguration (Supabase)

Die Zugangsdaten stehen in **`js/config.js`** (`SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `ALLOWED_EMAIL`). Diese Werte dürfen öffentlich sein: Der
Anon-Key ist ein Browser-Schlüssel und wird durch Supabase-RLS + die
`ALLOWED_EMAIL`-Prüfung abgesichert — es sind **keine** Geheimnisse.

- **`ALLOWED_EMAIL`** muss exakt der E-Mail entsprechen, die GitHub bei der
  Anmeldung zurückliefert (die primäre GitHub-E-Mail).
- In Supabase muss der **GitHub-OAuth-Provider aktiv** sein, und die Callback-URL
  bei GitHub/Supabase muss auf die Deploy-Domain zeigen.

### Env Vars auf Vercel (optional, pro Umgebung)

Das Projekt ist reines Vanilla-JS **ohne Build-Step** — `config.js` wird direkt
ausgeliefert. Möchte man die Werte pro Umgebung austauschen, **ohne** `config.js`
zu bearbeiten, kann man sie über diese Env Vars setzen und per kleinem
Build-Step vor dem Laden von `config.js` in `window.VEGVISIR_CONFIG` schreiben
(der Override greift dann automatisch):

| Env Var              | Beispiel / Bedeutung                          |
| -------------------- | --------------------------------------------- |
| `SUPABASE_URL`       | `https://<projekt>.supabase.co`               |
| `SUPABASE_ANON_KEY`  | öffentlicher Anon-Key des Supabase-Projekts   |
| `ALLOWED_EMAIL`      | die einzige zugelassene Login-E-Mail          |

Ohne solchen Build-Step gelten schlicht die Vorgaben aus `js/config.js`.
