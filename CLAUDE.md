# Anweisungen für Claude — vegvisir

## Commits & Push

Nach **JEDER** Änderung an einer Datei in diesem Repo wird **sofort committet
und gepusht** — ohne Rückfrage (Patricks Dauer-Freigabe).

- Die Commit-Nachricht erklärt **klar und auf Deutsch**, **was** geändert wurde
  und **warum**, so dass Patrick sie ohne Fachwissen versteht.
- Nach dem Push kurz Bescheid geben.

## Headless testen — ist jetzt möglich und Pflicht

Das GitHub-OAuth-Login-Gate ist weg (kein Supabase mehr, alle Daten liegen im
`localStorage`). Die App startet also sofort und ist voll automatisierbar.

**Regel:** Bei Änderungen hier **im Browser verifizieren**, nicht nur
`node --check` laufen lassen:

- Server starten (`python3 -m http.server 8899`), mit Playwright
  (`~/repos/toride/node_modules`) durchklicken, Screenshots ansehen.
- Testdaten über `localStorage.setItem("vegvisir.data", …)` setzen.
- Mindestens prüfen: Kachelwand, Ziehen/Umsortieren, Ordner-Geste (0,7 s über
  der Mitte halten), Dialoge, Handy-Breite (kein seitliches Scrollen).

Alles Weitere — Aufbau, Datenformat und die beiden Stolperfallen beim Ziehen —
steht in **AGENTS.md**.

## Design

Nur die CSS-Quelle `src/app.tailwind.css` bearbeiten und mit `npm run css`
bauen. **`styles.css` niemals direkt anfassen.**
