# Google-Kalender-Sync einrichten (einmalig)

Der Dienstplan wird in einen **eigenen** Google-Kalender namens
**„WienEnergie Dienstplan"** gespiegelt. Die App legt ihn beim ersten Sync
selbst an und schreibt/löscht **ausschließlich dort** — dein Haupt-Kalender
und alle anderen Kalender werden nie angefasst.

Damit das funktioniert, brauchst du einmalig ein Google-Cloud-Projekt mit
OAuth-Zugangsdaten. Das dauert ca. 10 Minuten und kostet nichts.

## 1. Google-Cloud-Projekt anlegen

1. <https://console.cloud.google.com/> öffnen (mit deinem Google-Konto
   anmelden — dem Konto, dessen Kalender du nutzen willst).
2. Oben links auf die Projekt-Auswahl → **Neues Projekt** → Name z.B.
   `vegvisir` → **Erstellen**. Danach oben das neue Projekt auswählen.

## 2. Calendar API einschalten

1. Menü ☰ → **APIs & Dienste** → **Bibliothek**.
2. Nach **Google Calendar API** suchen → anklicken → **Aktivieren**.

## 3. Zustimmungsbildschirm (OAuth Consent Screen)

1. Menü ☰ → **APIs & Dienste** → **OAuth-Zustimmungsbildschirm**
   (heißt neuerdings auch „Google Auth Platform / Branding").
2. Beim ersten Mal: **External** wählen (mit privatem Gmail-Konto gibt es
   nichts anderes) → App-Name z.B. `vegvisir`, deine E-Mail als Support- und
   Kontaktadresse → speichern. Weitere Felder kannst du leer lassen.
3. **WICHTIG — Veröffentlichungsstatus auf „In Production" stellen**
   (Bereich „Audience"/„Zielgruppe" → **Publish App / App veröffentlichen**).
   Bleibt die App im Status „Testing", wirft Google die Verbindung nach
   **7 Tagen** weg und du müsstest jede Woche neu verbinden.
4. Da die App nicht von Google verifiziert ist, zeigt Google beim Verbinden
   eine Warnung („Google hat diese App nicht überprüft"). Das ist okay:
   unten auf **Erweitert** → **vegvisir (unsicher) öffnen** klicken. Das
   machst nur du, einmalig, mit deiner eigenen App.

## 4. OAuth-Client (die eigentlichen Zugangsdaten) anlegen

1. Menü ☰ → **APIs & Dienste** → **Anmeldedaten** →
   **+ Anmeldedaten erstellen** → **OAuth-Client-ID**.
2. Anwendungstyp: **Webanwendung**, Name z.B. `vegvisir`.
3. Bei **Autorisierte Weiterleitungs-URIs** die **exakte Adresse eintragen,
   unter der du vegvisir öffnest** — mit Schrägstrich am Ende genau so, wie
   sie in der Adresszeile steht, z.B.:
   - `https://dev0gig.github.io/vegvisir/`
   - bzw. deine Vercel-Adresse, z.B. `https://vegvisir-xyz.vercel.app/`
   - optional zusätzlich `http://localhost:8080/` fürs lokale Testen
   (Öffnest du die App später unter einer neuen Adresse, muss die hier
   ebenfalls eingetragen werden.)
4. **Erstellen** → Google zeigt **Client-ID** und **Client-Secret**.
   Beide kopieren (sie sind auch später unter „Anmeldedaten" abrufbar).

## 5. Zugangsdaten als Supabase-Secrets hinterlegen

Die Geheimnisse gehören NUR auf den Server (Edge Function), nie ins Repo
oder in den Browser.

1. <https://supabase.com/dashboard> → Projekt `jvjerdlbpjrjvmkumhov` →
   **Edge Functions** → **Secrets**.
2. Zwei Secrets anlegen:
   - `GOOGLE_CLIENT_ID` = die Client-ID (endet auf `.apps.googleusercontent.com`)
   - `GOOGLE_CLIENT_SECRET` = das Client-Secret (beginnt mit `GOCSPX-`)
3. Optional: `GOOGLE_CALENDAR_NAME`, falls der Kalender anders heißen soll
   als die Vorgabe „WienEnergie Dienstplan".

Die Secrets gelten sofort — die Funktion muss nicht neu deployt werden.

## 6. In vegvisir verbinden und testen

1. vegvisir öffnen, in der Suchleiste **`/google login`** ausführen.
2. Google-Konto wählen, die Warnung per **Erweitert → öffnen** bestätigen,
   Kalender-Zugriff **erlauben**.
3. Du landest automatisch zurück in vegvisir; es erscheint
   „Google-Kalender ‚WienEnergie Dienstplan' verbunden."
4. **`/google sync`** ausführen → der komplette Dienstplan aus Supabase wird
   in den (neu angelegten) Kalender geschrieben. In Google Kalender prüfen.

## Ab dann läuft alles automatisch

- **ICS-Import:** Der bestätigte Zeitraum wird im Google-Kalender geleert
  und neu geschrieben — Doppelte sind unmöglich.
- **`/undo` (Dienstplan):** Der Google-Kalender wird für den betroffenen
  Zeitraum sofort nachgezogen.
- **`/sync`:** Schreibt zusätzlich den ganzen Google-Kalender frisch aus
  Supabase (Selbstheilung).
- **`/google`** (ohne Zusatz): zeigt den Verbindungsstatus.
- **`/google trennen`:** widerruft die Verbindung; der Kalender samt
  Terminen bleibt bei Google bestehen (bei Bedarf dort von Hand löschen).
