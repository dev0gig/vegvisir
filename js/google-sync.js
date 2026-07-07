/* ============ GOOGLE-KALENDER-SYNC (Frontend-Seite) ============ */
/* Dünne Brücke zur Supabase Edge Function `google-sync` — die gesamte
   Google-Logik (Tokens, Kalender suchen/anlegen, Löschen/Schreiben) läuft
   serverseitig. Der Browser sieht nie ein Google-Token; er schickt nur
   Aktionen mit dem normalen vegvisir-Login mit.

   Grundsatz (Wegvisier-Spec v2, Abschnitt 4): Supabase ist die Wahrheit,
   der Google-Kalender „WienEnergie Dienstplan" nur ein Spiegel. Andere
   Google-Kalender werden nie angefasst.

   Verbindung herstellen = zwei Schritte:
     1) connectGoogle(): holt die Google-Zustimmungs-URL und leitet dorthin.
     2) handleGoogleRedirect(): nach der Rückkehr (Query enthält code+state)
        den Code an die Edge Function geben, die ihn in ein Dauer-Token
        tauscht. Wird beim App-Start (main.js) aufgerufen. */

import { getSupabase, getUser } from "./auth.js";

/* Merker für den OAuth-Zwischenschritt: nur eine Rückkehr, die exakt zu
   diesem selbst erzeugten Zufallswert passt, wird akzeptiert. */
const STATE_KEY = "vegvisir.google.state";

const appUrl = () => window.location.origin + window.location.pathname;

/* Eine Aktion der Edge Function aufrufen. Die Funktion antwortet immer mit
   Status 200; Fehler stehen im Feld `error` (+ `code` für gezielte
   Behandlung, z.B. "not_connected"). */
async function call(body) {
  const sb = getSupabase();
  if (!sb || !getUser()) throw new Error("Nicht angemeldet.");
  const { data, error } = await sb.functions.invoke("google-sync", { body });
  if (error) throw new Error("Google-Sync ist nicht erreichbar: " + error.message);
  if (data && data.error) {
    const e = new Error(data.error);
    e.code = data.code || "";
    throw e;
  }
  return data || {};
}

/* Ist Google verbunden? → { connected, kalender } */
export function googleStatus() {
  return call({ action: "status" });
}

/* Schritt 1: zur Google-Zustimmungsseite weiterleiten. */
export async function connectGoogle() {
  const state = crypto.randomUUID();
  localStorage.setItem(STATE_KEY, state);
  const { url } = await call({ action: "authurl", redirectUri: appUrl(), state });
  window.location.href = url;
}

/* Schritt 2: Rückkehr von Google verarbeiten (beim App-Start aufrufen).
   Gibt { ok, kalender } zurück, wenn eine Verbindung hergestellt wurde,
   sonst null (= das war keine Google-Rückkehr). */
export async function handleGoogleRedirect() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  const expected = localStorage.getItem(STATE_KEY);
  if (!code || !state || !expected || state !== expected) return null;

  localStorage.removeItem(STATE_KEY);
  // Google-Reste (code, state, scope) aus der Adresszeile entfernen.
  history.replaceState(null, "", window.location.pathname);
  return call({ action: "exchange", code, redirectUri: appUrl() });
}

/* Spiegel-Sync eines Zeitraums (je "YYYY-MM-DD", inklusiv): der Zeitraum im
   Google-Kalender wird geleert und aus Supabase neu geschrieben. */
export function syncGoogleRange(von, bis) {
  return call({ action: "sync", von, bis });
}

/* Kompletter Spiegel-Sync (Selbstheilung, für /sync): den GANZEN Kalender
   leeren und den gesamten Supabase-Bestand neu schreiben. */
export function fullGoogleSync() {
  return call({ action: "sync" });
}

/* Verbindung trennen: Dauer-Token bei Google widerrufen und löschen.
   Der Kalender samt Terminen bleibt bei Google bestehen. */
export function disconnectGoogle() {
  return call({ action: "disconnect" });
}
