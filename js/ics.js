/* ============ ICS-PARSER (Dienstplan-Import) ============ */
/* Liest die ICS-Dateien vom OpCyc-Dienstplan ein. Das Format ist bewusst
   simpel gehalten: nur VEVENT-Blöcke mit DTSTART/DTEND/SUMMARY, keine
   Wiederholungsregeln (RRULE). Wichtig: Die UID ist in diesen Dateien bei
   JEDEM Termin identisch und daher nutzlos — sie wird komplett ignoriert.
   Zusammengehörigkeit ergibt sich allein über das Datum. */

/* ICS erlaubt "gefaltete" Zeilen: Eine Zeile, die mit Leerzeichen oder Tab
   beginnt, ist die Fortsetzung der vorherigen. Vor dem Parsen entfalten. */
function unfoldLines(text) {
  const raw = String(text).split(/\r\n|\n|\r/);
  const lines = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

/* ICS-escapte Sonderzeichen im SUMMARY zurückverwandeln: \, \; \\ \n */
function unescapeText(s) {
  return String(s)
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

/* "20260706T080000" → { datum: "2026-07-06", zeit: "08:00:00" } oder null.
   (Lokale Zeit; ein evtl. Z-Suffix wie bei DTSTAMP kommt bei DTSTART/DTEND
   in diesen Dateien nicht vor und wird schlicht ignoriert.) */
function parseIcsDateTime(v) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/.exec(String(v).trim());
  if (!m) return null;
  return { datum: `${m[1]}-${m[2]}-${m[3]}`, zeit: `${m[4]}:${m[5]}:${m[6]}` };
}

/* Hauptfunktion: ICS-Text → Liste von Terminen
     [{ datum: "2026-07-06", start_zeit: "08:00:00", end_zeit: "16:00:00", titel: "…" }, …]
   Unvollständige Blöcke (ohne Start, Ende oder Titel) werden übersprungen. */
export function parseIcs(text) {
  const events = [];
  let cur = null; // Sammelobjekt innerhalb eines VEVENT-Blocks

  for (const line of unfoldLines(text)) {
    if (/^BEGIN:VEVENT/i.test(line)) { cur = {}; continue; }
    if (/^END:VEVENT/i.test(line)) {
      if (cur && cur.start && cur.end && cur.titel) {
        events.push({
          datum: cur.start.datum,
          start_zeit: cur.start.zeit,
          end_zeit: cur.end.zeit,
          titel: cur.titel,
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    // Eigenschaftsname ggf. mit Parametern (z.B. "DTSTART;TZID=…:20260706T080000")
    const m = /^([A-Za-z-]+)(?:;[^:]*)?:(.*)$/.exec(line);
    if (!m) continue;
    const name = m[1].toUpperCase();
    const value = m[2];

    if (name === "DTSTART") cur.start = parseIcsDateTime(value);
    else if (name === "DTEND") cur.end = parseIcsDateTime(value);
    else if (name === "SUMMARY") cur.titel = unescapeText(value);
  }

  // Chronologisch sortieren (Datum, dann Startzeit) — macht Import & Anzeige berechenbar.
  events.sort((a, b) =>
    a.datum === b.datum ? a.start_zeit.localeCompare(b.start_zeit) : a.datum.localeCompare(b.datum));
  return events;
}
