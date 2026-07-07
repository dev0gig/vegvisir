/* ============ EDGE FUNCTION google-sync (Deno, läuft bei Supabase) ============ */
/* Google-Kalender-Sync für den vegvisir-Dienstplan (Wegvisier-Spec v2, Abschnitt 4).

   Sicherheits-Grundsätze:
   - Client-Secret und refresh_token existieren NUR hier (Supabase Secrets +
     Tabelle user_google_tokens ohne Client-Zugriff). Das Frontend bekommt
     niemals ein Google-Token zu sehen.
   - Geschrieben und gelöscht wird AUSSCHLIESSLICH im eigenen Kalender
     "WienEnergie Dienstplan" (siehe ensureCalendar). Der Haupt-Kalender
     ("primary") und alle anderen Kalender werden NIE angefasst — das ist
     mehrfach abgesichert (Namens-Prüfung, primary-Sperre).
   - Supabase ist die Wahrheit, Google nur Spiegel: Beim Sync wird der
     Zeitraum im Google-Kalender komplett geleert und neu geschrieben.
     Doppelte Einträge sind dadurch unmöglich.

   Benötigte Supabase-Secrets (siehe docs/google-sync-einrichtung.md):
     GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
     optional GOOGLE_CALENDAR_NAME (Vorgabe: "WienEnergie Dienstplan")

   Aktionen (POST, JSON { action, ... }, Antwort immer Status 200 mit JSON;
   Fehler stehen im Feld `error` + maschinenlesbarem `code`):
     status     → { connected, kalender }
     authurl    → { url }  (Google-Zustimmungsseite, Frontend leitet dorthin)
     exchange   → { ok, kalender }  (Code gegen refresh_token tauschen)
     sync       → { ok, geloescht, geschrieben, kalender }  (von/bis optional)
     disconnect → { ok }  (Token widerrufen und löschen) */

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const CAL_NAME = Deno.env.get("GOOGLE_CALENDAR_NAME") ?? "WienEnergie Dienstplan";
const TZ = "Europe/Vienna";
const SCOPE = "https://www.googleapis.com/auth/calendar";
const GCAL = "https://www.googleapis.com/calendar/v3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
function fail(error: string, code = ""): Response {
  return json({ error, code });
}

/* Fehler mit maschinenlesbarem Code (z.B. "reconnect"), damit das Frontend
   gezielt reagieren kann. */
class CodeError extends Error {
  code: string;
  constructor(message: string, code = "") {
    super(message);
    this.code = code;
  }
}

/* ---- Google-HTTP-Helfer: ruft die Kalender-API mit Bearer-Token auf ---- */
async function gfetch(token: string, method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204 || res.status === 410) return null; // leer bzw. schon gelöscht
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as any)?.error?.message || res.status + " " + res.statusText;
    throw new CodeError("Google-API: " + msg);
  }
  return data;
}

/* Kurzlebiges Zugriffs-Token aus dem gespeicherten refresh_token holen. */
async function accessTokenFromRefresh(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    // invalid_grant = Zugriff widerrufen oder Token abgelaufen → neu verbinden.
    const code = data.error === "invalid_grant" ? "reconnect" : "";
    throw new CodeError(
      "Google-Anmeldung ungültig: " + (data.error_description || data.error || res.status),
      code,
    );
  }
  return data.access_token as string;
}

/* Stellt sicher, dass der eigene Kalender CAL_NAME existiert, und liefert
   seine ID. NUR diese ID wird zum Lesen/Löschen/Schreiben verwendet.
   Reihenfolge: gemerkte ID prüfen → in der Liste nach exakt dem Namen
   suchen → sonst neu anlegen. "primary" ist hart gesperrt. */
// deno-lint-ignore no-explicit-any
async function ensureCalendar(admin: any, userId: string, token: string, storedId: string | null): Promise<string> {
  // 1) Gemerkte ID: existiert der Kalender noch und heißt er exakt richtig?
  if (storedId && storedId !== "primary") {
    try {
      const cal = await gfetch(token, "GET", `${GCAL}/calendars/${encodeURIComponent(storedId)}`);
      if (cal && (cal as any).summary === CAL_NAME) return storedId;
    } catch {
      /* gelöscht oder umbenannt → unten neu suchen/anlegen */
    }
  }

  // 2) Kalenderliste durchsuchen: nur eigene Kalender, exakter Name, nie primary.
  let found: string | null = null;
  let pageToken = "";
  do {
    const url =
      `${GCAL}/users/me/calendarList?maxResults=250&minAccessRole=owner` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
    const page = (await gfetch(token, "GET", url)) as any;
    const hit = (page.items || []).find((c: any) => c.summary === CAL_NAME && !c.primary);
    if (hit) {
      found = hit.id;
      break;
    }
    pageToken = page.nextPageToken || "";
  } while (pageToken);

  // 3) Gibt es ihn noch nicht: neu anlegen (eigener, separater Kalender).
  if (!found) {
    const created = (await gfetch(token, "POST", `${GCAL}/calendars`, {
      summary: CAL_NAME,
      timeZone: TZ,
    })) as any;
    found = created.id;
  }

  if (!found || found === "primary") {
    throw new CodeError("Kalender-ID ungültig — Abbruch zum Schutz deiner anderen Kalender.");
  }
  await admin
    .from("user_google_tokens")
    .update({ calendar_id: found, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  return found;
}

/* IDs aller Termine im Kalender sammeln — optional nur im Zeitraum [von, bis]
   (je "YYYY-MM-DD", inklusiv). Das Zeitfenster für die API wird großzügig
   gewählt und dann exakt nach dem lokalen Datum gefiltert (bei eigenen
   Terminen über die mitgespeicherte Eigenschaft `datum`), damit an den
   Zeitzonen-Rändern nichts falsch gelöscht wird. */
async function listEventIds(token: string, calId: string, von?: string | null, bis?: string | null) {
  const ids: string[] = [];
  const dayMs = 86400000;
  const base = new URLSearchParams({ maxResults: "2500", singleEvents: "true", showDeleted: "false" });
  if (von && bis) {
    base.set("timeMin", new Date(Date.parse(von + "T00:00:00Z") - dayMs).toISOString());
    base.set("timeMax", new Date(Date.parse(bis + "T00:00:00Z") + 2 * dayMs).toISOString());
  }
  let pageToken = "";
  do {
    const p = new URLSearchParams(base);
    if (pageToken) p.set("pageToken", pageToken);
    const page = (await gfetch(token, "GET", `${GCAL}/calendars/${encodeURIComponent(calId)}/events?` + p)) as any;
    for (const ev of page.items || []) {
      const datum =
        ev.extendedProperties?.private?.datum ||
        String(ev.start?.dateTime || ev.start?.date || "").slice(0, 10);
      if (!von || !bis || (datum >= von && datum <= bis)) ids.push(ev.id);
    }
    pageToken = page.nextPageToken || "";
  } while (pageToken);
  return ids;
}

/* Viele kleine Google-Aufrufe in Häppchen zu 5 parallel abarbeiten. */
async function inChunks<T>(items: T[], fn: (item: T) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += 5) {
    await Promise.all(items.slice(i, i + 5).map(fn));
  }
}

/* "YYYY-MM-DD" + 1 Tag (für Nachtdienste über Mitternacht). */
function plusDay(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const isIsoDay = (s: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");

  // Angemeldeten vegvisir-Benutzer aus dem mitgeschickten Login-Token holen.
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return fail("Nicht angemeldet.", "unauthorized");

  // Service-Role-Client: einziger Weg zur Token-Tabelle (RLS ohne Policies).
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    /* ---- Verbindungs-Status ---- */
    if (action === "status") {
      const { data: row } = await admin
        .from("user_google_tokens")
        .select("calendar_id")
        .eq("user_id", user.id)
        .maybeSingle();
      return json({ connected: !!row, kalender: CAL_NAME });
    }

    /* ---- Schritt 1 der Verbindung: URL der Google-Zustimmungsseite ---- */
    if (action === "authurl") {
      if (!CLIENT_ID || !CLIENT_SECRET) {
        return fail(
          "Google ist noch nicht eingerichtet: Secrets GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET fehlen (siehe docs/google-sync-einrichtung.md).",
          "not_configured",
        );
      }
      const p = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: String(body.redirectUri || ""),
        response_type: "code",
        scope: SCOPE,
        access_type: "offline", // liefert das refresh_token …
        prompt: "consent", // … auch bei wiederholter Zustimmung
        state: String(body.state || ""),
      });
      return json({ url: "https://accounts.google.com/o/oauth2/v2/auth?" + p });
    }

    /* ---- Schritt 2 der Verbindung: Code gegen refresh_token tauschen ---- */
    if (action === "exchange") {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code: String(body.code || ""),
          redirect_uri: String(body.redirectUri || ""),
          grant_type: "authorization_code",
        }),
      });
      const tok = await res.json().catch(() => ({}));
      if (!res.ok || !tok.refresh_token) {
        return fail(
          "Google-Anmeldung fehlgeschlagen: " +
            (tok.error_description || tok.error || "kein Dauer-Token erhalten"),
        );
      }
      const { error: upErr } = await admin.from("user_google_tokens").upsert({
        user_id: user.id,
        refresh_token: tok.refresh_token,
        updated_at: new Date().toISOString(),
      });
      if (upErr) throw new CodeError("Token speichern fehlgeschlagen: " + upErr.message);

      // Kalender sofort suchen/anlegen, damit die Verbindung komplett steht.
      await ensureCalendar(admin, user.id, tok.access_token, null);
      return json({ ok: true, kalender: CAL_NAME });
    }

    /* ---- Verbindung trennen: Token bei Google widerrufen und löschen ---- */
    if (action === "disconnect") {
      const { data: row } = await admin
        .from("user_google_tokens")
        .select("refresh_token")
        .eq("user_id", user.id)
        .maybeSingle();
      if (row?.refresh_token) {
        await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: row.refresh_token }),
        }).catch(() => {});
      }
      await admin.from("user_google_tokens").delete().eq("user_id", user.id);
      return json({ ok: true });
    }

    /* ---- Der eigentliche Spiegel-Sync ---- */
    if (action === "sync") {
      const { data: row } = await admin
        .from("user_google_tokens")
        .select("refresh_token, calendar_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!row) {
        return fail("Google ist nicht verbunden — in der Suchleiste „/google verbinden“ ausführen.", "not_connected");
      }

      let token: string;
      try {
        token = await accessTokenFromRefresh(row.refresh_token);
      } catch (err) {
        if (err instanceof CodeError && err.code === "reconnect") {
          // Widerrufene Verbindung serverseitig aufräumen.
          await admin.from("user_google_tokens").delete().eq("user_id", user.id);
          return fail("Google-Verbindung abgelaufen — bitte „/google verbinden“ neu ausführen.", "reconnect");
        }
        throw err;
      }

      const calId = await ensureCalendar(admin, user.id, token, row.calendar_id);

      // Zeitraum: beide Grenzen oder gar keine (= kompletter Spiegel).
      const von = isIsoDay(body.von) ? String(body.von) : null;
      const bis = isIsoDay(body.bis) ? String(body.bis) : null;
      if ((von && !bis) || (!von && bis)) return fail("Ungültiger Zeitraum.");

      // Die Wahrheit aus Supabase laden.
      let q = admin
        .from("dienstplan_events")
        .select("datum, start_zeit, end_zeit, titel")
        .eq("user_id", user.id);
      if (von && bis) q = q.gte("datum", von).lte("datum", bis);
      const { data: events, error: evErr } = await q
        .order("datum", { ascending: true })
        .order("start_zeit", { ascending: true });
      if (evErr) throw new CodeError("Dienstplan laden fehlgeschlagen: " + evErr.message);

      // Spiegeln: Zeitraum (oder alles) im eigenen Kalender leeren …
      const ids = await listEventIds(token, calId, von, bis);
      await inChunks(ids, (id) =>
        gfetch(token, "DELETE", `${GCAL}/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(id)}`),
      );

      // … und aus Supabase frisch neu schreiben.
      await inChunks(events || [], (e: any) => {
        // Nachtdienst über Mitternacht: Ende liegt am Folgetag.
        const endDatum = e.end_zeit <= e.start_zeit ? plusDay(e.datum) : e.datum;
        return gfetch(token, "POST", `${GCAL}/calendars/${encodeURIComponent(calId)}/events`, {
          summary: e.titel,
          start: { dateTime: `${e.datum}T${e.start_zeit}`, timeZone: TZ },
          end: { dateTime: `${endDatum}T${e.end_zeit}`, timeZone: TZ },
          extendedProperties: { private: { app: "vegvisir", datum: e.datum } },
        });
      });

      return json({ ok: true, geloescht: ids.length, geschrieben: (events || []).length, kalender: CAL_NAME });
    }

    return fail("Unbekannte Aktion.");
  } catch (err) {
    const e = err as CodeError;
    return fail(e.message || "Unbekannter Fehler.", e.code || "");
  }
});
