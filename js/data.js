/* ============ DATEN (importiertes Toride-JSON, lokal gespeichert) ============ */
/* Quelle der Wahrheit fürs sofortige Rendern ist der localStorage. Zusätzlich
   wird der Datensatz in die Cloud (Supabase) gespiegelt, damit er auf mehreren
   Geräten verfügbar ist. Die reinen Lese-/Schreib-Helfer kennen weiterhin
   nichts von der Oberfläche. */

import { getSupabase, getUser } from "./auth.js";

export const STORE_KEY = "vegvisir.data";

export function loadData() {
  try { const r = localStorage.getItem(STORE_KEY); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
export function saveData(d) { localStorage.setItem(STORE_KEY, JSON.stringify(d)); }

/* Alle Bookmarks (lose + aus allen Ordnern) flach einsammeln. */
export function allBookmarks(data) {
  const out = [];
  const roots = (data && data.bookmarks) || [];
  const folders = (data && data.folders) || [];
  roots.forEach((b) => out.push(b));
  folders.forEach((f) => (f.bookmarks || []).forEach((b) => out.push(b)));
  return out;
}

export function isEmptyData() {
  const d = loadData();
  const folders = (d && d.folders) || [];
  const roots = (d && d.bookmarks) || [];
  return folders.length === 0 && roots.length === 0;
}

/* ---- Cloud-Sync (Supabase, Tabelle vegvisir_data) ----
   Beide Funktionen sind async und fehlertolerant: Klappt der Zugriff nicht
   (offline, nicht angemeldet, Serverfehler), wird nichts geworfen — die App
   läuft einfach lokal weiter. */

/* Schreibt den kompletten Datensatz in die Cloud (eine Zeile pro Benutzer,
   upsert über user_id). Gibt true bei Erfolg zurück, sonst false. */
export async function pushToSupabase(data) {
  try {
    const sb = getSupabase();
    const user = getUser();
    if (!sb || !user) return false;
    const { error } = await sb.from("vegvisir_data").upsert(
      { user_id: user.id, data, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    return !error;
  } catch {
    return false;
  }
}

/* Holt den Datensatz des Benutzers aus der Cloud. Gibt das Zeilen-Objekt
   { data, updated_at } zurück oder null (auch bei Fehler/offline). */
export async function pullFromSupabase() {
  try {
    const sb = getSupabase();
    const user = getUser();
    if (!sb || !user) return null;
    const { data, error } = await sb
      .from("vegvisir_data")
      .select("data, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}
