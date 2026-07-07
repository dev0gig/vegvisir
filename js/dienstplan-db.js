/* ============ DIENSTPLAN (Supabase, Tabelle dienstplan_events) ============ */
/* Speichern und Laden der Dienstplan-Termine. Nutzt denselben Supabase-Client
   und dieselbe Anmeldung wie der Bookmark-Sync (auth.js). RLS auf der Tabelle
   sorgt serverseitig dafür, dass jeder nur seine eigenen Zeilen sieht.

   Import-Regel (Wegvisier-Spec v2, Abschnitt 2): Es wird ein bestätigter,
   bereinigter Zeitraum [von, bis] komplett neu geschrieben ("Mirror-Sync").
   Alles im Zeitraum wird gelöscht und durch die neuen Termine ersetzt; Tage
   außerhalb bleiben unangetastet. So können durch nachträgliche Änderungen im
   selben Monat keine Doppel- oder Geister-Einträge entstehen. Vor jedem Import
   wird der komplette bisherige Stand gesichert (siehe backup.js), damit sich
   der Import per /undo zurücknehmen lässt. */

import { getSupabase, getUser } from "./auth.js";
import { snapshotDienstplan, logImport } from "./backup.js";

function requireClient() {
  const sb = getSupabase();
  const user = getUser();
  if (!sb || !user) throw new Error("Nicht angemeldet.");
  return { sb, user };
}

/* Importiert die geparsten ICS-Termine in den bestätigten, bereinigten
   Zeitraum [von, bis] (je "YYYY-MM-DD", inklusiv). Ablauf (Spec 2.3):
     1) Kompletten bisherigen Stand sichern + Import protokollieren (für Undo)
     2) Alle bestehenden Termine im Zeitraum löschen ("bereinigen")
     3) Die neuen Termine dieses Zeitraums einfügen ("neu schreiben")
   Termine außerhalb des bestätigten Zeitraums werden bewusst ignoriert, damit
   der Grundsatz "der bestätigte Zeitraum wird komplett ersetzt" konsequent
   gilt. Gibt die Zusammenfassung { tage, termine } für die Anzeige zurück. */
export async function importEventsInRange(events, von, bis, filename) {
  const { sb, user } = requireClient();

  // 1) Sicherung des GESAMTEN bisherigen Standes + Protokoll (Basis fürs Undo).
  const snapshot = await snapshotDienstplan();
  const inRange = events.filter((e) => e.datum >= von && e.datum <= bis);
  await logImport({
    kind: "ics",
    filename: filename || null,
    rangeVon: von,
    rangeBis: bis,
    eventCount: inRange.length,
    prevSnapshot: snapshot,
  });

  // 2) Zeitraum bereinigen: alle bestehenden Termine darin löschen.
  const { error: delError } = await sb
    .from("dienstplan_events")
    .delete()
    .eq("user_id", user.id)
    .gte("datum", von)
    .lte("datum", bis);
  if (delError) throw new Error("Bereinigen des Zeitraums fehlgeschlagen: " + delError.message);

  // 3) Neue Termine des Zeitraums einfügen (alle mit derselben import_batch_id).
  const batchId = crypto.randomUUID();
  const rows = inRange.map((e) => ({
    user_id: user.id,
    datum: e.datum,
    start_zeit: e.start_zeit,
    end_zeit: e.end_zeit,
    titel: e.titel,
    import_batch_id: batchId,
  }));
  if (rows.length) {
    const { error: insError } = await sb.from("dienstplan_events").insert(rows);
    if (insError) throw new Error("Einfügen neuer Termine fehlgeschlagen: " + insError.message);
  }

  const tage = new Set(rows.map((r) => r.datum)).size;
  return { tage, termine: rows.length };
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
