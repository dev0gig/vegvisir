/* ============ IMPORT-PROTOKOLL (Undo-Fundament) ============ */
/* Fundament für das Undo-System (Wegvisier-Spec v2, Abschnitt 3). Jeder
   Bookmark-Import (JSON) schreibt VOR dem Überschreiben eine Zeile in die
   Tabelle `import_log` und legt darin einen Snapshot des kompletten vorherigen
   Zustands ab (`prev_snapshot`). Ein späteres /undo stellt genau diesen
   Zustand wieder her — es lässt sich immer der letzte, noch nicht
   zurückgenommene Import rückgängig machen.

   Dieses Modul kennt die Oberfläche nicht: Die Wiederherstellungs-Funktion
   gibt ihr Ergebnis zurück, das Neu-Zeichnen übernimmt der Aufrufer. */

import { getSupabase, getUser } from "./auth.js";
import { saveData, pushToSupabase } from "./data.js";

function requireClient() {
  const sb = getSupabase();
  const user = getUser();
  if (!sb || !user) throw new Error("Nicht angemeldet.");
  return { sb, user };
}

/* Schreibt eine Import-Protokollzeile inklusive Snapshot des Zustands VOR dem
   Import. Vom Import-Weg aufzurufen, BEVOR er Daten überschreibt.
   Gibt die id der neuen Zeile zurück. */
export async function logImport({
  kind,               // "json"
  filename = null,
  eventCount = 0,
  prevSnapshot = null, // kompletter Zustand vor dem Import
}) {
  const { sb, user } = requireClient();
  const { data, error } = await sb
    .from("import_log")
    .insert({
      user_id: user.id,
      kind,
      filename,
      event_count: eventCount,
      prev_snapshot: prevSnapshot,
    })
    .select("id")
    .single();
  if (error) throw new Error("Import-Protokoll fehlgeschlagen: " + error.message);
  return data.id;
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
