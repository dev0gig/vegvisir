# Anweisungen für Claude — vegvisir

## Commits

Nach **JEDER** Änderung an einer Datei in diesem Repo wird **IMMER sofort committet**.

- Die Commit-Nachricht erklärt **klar und auf Deutsch**, **was** geändert wurde und
  **warum**, so dass Patrick sie ohne Fachwissen versteht.
- **Niemals selbst pushen.** Der Push erfolgt nur, wenn Patrick es ausdrücklich sagt.
  Nach dem Commit kurz darauf hinweisen, dass committet wurde, und auf Freigabe zum
  Pushen warten.

## Kein Headless-Test — GitHub-Login blockiert

Diese App liegt komplett hinter einem **GitHub-OAuth-Login-Gate** (`js/auth.js`).
Ein headless-Browser kommt nur bis zum Login-Bildschirm; die eigentliche App
(Suchleiste, Slash-Befehle, Import-Dialoge) startet erst nach
erfolgreichem Login und ist so **nicht** automatisiert erreichbar.

**Regel:** Bei Änderungen hier **nicht** versuchen, headless/im Browser zu
verifizieren. Stattdessen:

- `node --check` auf die geänderten JS-Module laufen lassen und prüfen, dass alle
  Import-/Export-Namen zwischen den Modulen zusammenpassen.
- Die eigentliche Sicht-Prüfung macht **Patrick manuell im Browser** (er ist
  eingeloggt) — nach dem Deploy kurz auflisten, was er durchklicken soll.
