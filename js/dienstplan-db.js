/* ============ DIENSTPLAN (Supabase, Tabelle dienstplan_events) ============ */
/* Speichern und Laden der Dienstplan-Termine. Nutzt denselben Supabase-Client
   und dieselbe Anmeldung wie der Bookmark-Sync (auth.js). RLS auf der Tabelle
   sorgt serverseitig dafür, dass jeder nur seine eigenen Zeilen sieht.

   Merge-Regel beim Import: Es zählt AUSSCHLIESSLICH das Datum. Für jeden Tag,
   der in der neuen ICS-Datei vorkommt, werden zuerst alle bestehenden Termine
   dieses Tages gelöscht und dann die neuen eingefügt — "neuester Import
   gewinnt komplett" pro Tag. Tage, die in der Datei nicht vorkommen, bleiben
   unangetastet. */

import { getSupabase, getUser } from "./auth.js";

function requireClient() {
  const sb = getSupabase();
  const user = getUser();
  if (!sb || !user) throw new Error("Nicht angemeldet.");
  return { sb, user };
}

/* Importiert die geparsten ICS-Termine (aus ics.js). Alle Zeilen dieses
   Vorgangs bekommen dieselbe import_batch_id. Gibt die Zusammenfassung
   { tage, termine } für die Anzeige zurück. */
export async function importEvents(events) {
  const { sb, user } = requireClient();
  if (!events.length) return { tage: 0, termine: 0 };

  const batchId = crypto.randomUUID();
  const tage = [...new Set(events.map((e) => e.datum))];

  // 1) Alle bestehenden Termine der betroffenen Tage löschen (nur eigene Zeilen).
  const { error: delError } = await sb
    .from("dienstplan_events")
    .delete()
    .eq("user_id", user.id)
    .in("datum", tage);
  if (delError) throw new Error("Löschen alter Termine fehlgeschlagen: " + delError.message);

  // 2) Alle neuen Termine einfügen.
  const rows = events.map((e) => ({
    user_id: user.id,
    datum: e.datum,
    start_zeit: e.start_zeit,
    end_zeit: e.end_zeit,
    titel: e.titel,
    import_batch_id: batchId,
  }));
  const { error: insError } = await sb.from("dienstplan_events").insert(rows);
  if (insError) throw new Error("Einfügen neuer Termine fehlgeschlagen: " + insError.message);

  return { tage: tage.length, termine: rows.length };
}

/* Lädt alle Termine im Datumsbereich [von, bis] (je "YYYY-MM-DD", inklusiv),
   sortiert nach Datum und Startzeit — fertig für die Kalender-Anzeige. */
export async function fetchEvents(von, bis) {
  const { sb, user } = requireClient();
  const { data, error } = await sb
    .from("dienstplan_events")
    .select("datum, start_zeit, end_zeit, titel")
    .eq("user_id", user.id)
    .gte("datum", von)
    .lte("datum", bis)
    .order("datum", { ascending: true })
    .order("start_zeit", { ascending: true });
  if (error) throw new Error("Laden der Termine fehlgeschlagen: " + error.message);
  return data || [];
}
