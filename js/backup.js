/* ============ BACKUP-ROTATION & IMPORT-PROTOKOLL (Undo-Fundament) ============ */
/* Fundament für das Undo-System (Wegvisier-Spec v2, Abschnitt 3). Jede
   Import-Aktion — Bookmarks (JSON) wie Dienstplan (ICS) — schreibt VOR dem
   Überschreiben eine Zeile in die Tabelle `import_log` und legt darin einen
   Snapshot des kompletten vorherigen Zustands ab (`prev_snapshot`). Ein
   späteres /undo stellt genau diesen Zustand wieder her.

   Zwei-Slot-Prinzip: Es lässt sich immer der jeweils letzte, noch nicht
   zurückgenommene Import einer Art rückgängig machen. Der Snapshot beim
   Dienstplan umfasst bewusst den GESAMTEN Tabellenstand (nicht nur den
   importierten Zeitraum), damit die Wiederherstellung immer einen konsistenten
   Gesamtzustand liefert.

   Dieses Modul kennt die Oberfläche nicht: Die Wiederherstellungs-Funktionen
   geben ihr Ergebnis zurück, das Neu-Zeichnen übernimmt der Aufrufer. */

import { getSupabase, getUser } from "./auth.js";
import { saveData, pushToSupabase } from "./data.js";

function requireClient() {
  const sb = getSupabase();
  const user = getUser();
  if (!sb || !user) throw new Error("Nicht angemeldet.");
  return { sb, user };
}

/* Schreibt eine Import-Protokollzeile inklusive Snapshot des Zustands VOR dem
   Import. Von den Import-Wegen aufzurufen, BEVOR sie Daten überschreiben.
   Gibt die id der neuen Zeile zurück. */
export async function logImport({
  kind,               // "ics" | "json"
  filename = null,
  rangeVon = null,    // nur bei ICS: bestätigter, bereinigter Zeitraum
  rangeBis = null,
  eventCount = 0,
  prevSnapshot = null, // kompletter Zustand vor dem Import (siehe Snapshot-Helfer)
}) {
  const { sb, user } = requireClient();
  const { data, error } = await sb
    .from("import_log")
    .insert({
      user_id: user.id,
      kind,
      filename,
      range_von: rangeVon,
      range_bis: rangeBis,
      event_count: eventCount,
      prev_snapshot: prevSnapshot,
    })
    .select("id")
    .single();
  if (error) throw new Error("Import-Protokoll fehlgeschlagen: " + error.message);
  return data.id;
}

/* Snapshot des KOMPLETTEN Dienstplan-Bestands des Benutzers (alle Zeilen) —
   Grundlage für ein konsistentes Dienstplan-Undo. */
export async function snapshotDienstplan() {
  const { sb, user } = requireClient();
  const { data, error } = await sb
    .from("dienstplan_events")
    .select("datum, start_zeit, end_zeit, titel")
    .eq("user_id", user.id)
    .order("datum", { ascending: true })
    .order("start_zeit", { ascending: true });
  if (error) throw new Error("Snapshot fehlgeschlagen: " + error.message);
  return { events: data || [] };
}

/* Letzten noch nicht zurückgenommenen Import einer Art holen (oder null). */
export async function latestUndoable(kind) {
  const { sb, user } = requireClient();
  const { data, error } = await sb
    .from("import_log")
    .select("id, kind, filename, range_von, range_bis, prev_snapshot, created_at")
    .eq("user_id", user.id)
    .eq("kind", kind)
    .eq("restored", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Undo-Suche fehlgeschlagen: " + error.message);
  return data;
}

async function markRestored(id) {
  const { sb, user } = requireClient();
  const { error } = await sb
    .from("import_log")
    .update({ restored: true })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error("Undo-Markierung fehlgeschlagen: " + error.message);
}

/* Undo Dienstplan: den kompletten Bestand durch den Snapshot des letzten
   ICS-Imports ersetzen. Gibt den betroffenen Zeitraum { von, bis, filename }
   zurück (für den späteren Google-Re-Sync) oder null, wenn es nichts
   zurückzunehmen gibt. */
export async function undoDienstplan() {
  const { sb, user } = requireClient();
  const log = await latestUndoable("ics");
  if (!log) return null;

  const snap = log.prev_snapshot || { events: [] };
  const events = Array.isArray(snap.events) ? snap.events : [];

  // Ganzen Bestand des Benutzers leeren ...
  const { error: delErr } = await sb
    .from("dienstplan_events")
    .delete()
    .eq("user_id", user.id);
  if (delErr) throw new Error("Undo (Löschen) fehlgeschlagen: " + delErr.message);

  // ... und den Snapshot exakt wiederherstellen.
  if (events.length) {
    const batchId = crypto.randomUUID();
    const rows = events.map((e) => ({
      user_id: user.id,
      datum: e.datum,
      start_zeit: e.start_zeit,
      end_zeit: e.end_zeit,
      titel: e.titel,
      import_batch_id: batchId,
    }));
    const { error: insErr } = await sb.from("dienstplan_events").insert(rows);
    if (insErr) throw new Error("Undo (Einfügen) fehlgeschlagen: " + insErr.message);
  }

  await markRestored(log.id);
  return { von: log.range_von, bis: log.range_bis, filename: log.filename };
}

/* Undo Bookmarks: den vorherigen Datenstand des letzten JSON-Imports
   wiederherstellen (lokal + Cloud). War vorher gar nichts vorhanden, wird auf
   einen leeren Datensatz zurückgesetzt. Gibt den wiederhergestellten Datensatz
   zurück (zum Neu-Zeichnen) oder null, wenn es nichts zurückzunehmen gibt. */
export async function undoBookmarks() {
  const log = await latestUndoable("json");
  if (!log) return null;

  const restored = log.prev_snapshot || {
    version: 1,
    importedAt: new Date().toISOString(),
    folders: [],
    bookmarks: [],
  };
  saveData(restored);
  await pushToSupabase(restored);
  await markRestored(log.id);
  return restored;
}
