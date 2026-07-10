/* ============ PDF DUPLEX-FIXER (reine Logik, keine DOM-Zugriffe) ============

   Anwendungsfall: Ein Simplex-Scanner scannt zuerst alle VORDERSEITEN eines
   Stapels (Blatt 1, 2, 3 …) und danach alle RÜCKSEITEN in umgekehrter
   Reihenfolge (die Rückseite des letzten Blatts zuerst). Die gescannte Datei
   hat also die Reihenfolge:

       V1, V2, …, Vk,  Rk, R(k-1), …, R1

   Dieses Modul sortiert die Seiten wieder in die echte Dokument-Reihenfolge
   (V1, R1, V2, R2, …) — das "Interleaving".

   pdf-lib wird als lokales Bundle aus js/vendor/ geladen (keine CDN-Abhängigkeit,
   damit die PWA offline funktioniert). */

import {
  PDFDocument,
  PDFName,
  PDFArray,
  PDFRawStream,
  decodePDFRawStream,
} from "./vendor/pdf-lib.esm.min.js";

/* Wird geworfen, wenn das PDF eine ungerade Seitenzahl hat und der Aufrufer
   das automatische Anfügen einer Leerseite nicht erlaubt hat. Die UI kann
   dann nachfragen ("X Seiten — Leerseite anfügen?") statt einfach zu scheitern. */
export class OddPageCountError extends Error {
  constructor(pageCount) {
    super(`Das PDF hat ${pageCount} Seiten (ungerade Anzahl).`);
    this.name = "OddPageCountError";
    this.pageCount = pageCount;
  }
}

/* Prüft, ob eine Seite (pdf-lib PDFPage) strukturell leer ist.

   BEKANNTE EINSCHRÄNKUNG — hier wird bewusst NUR die PDF-Struktur geprüft:
   eine Seite gilt als leer, wenn ihr Inhalts-Stream fehlt oder (dekomprimiert)
   nur ein paar Bytes ohne Zeichen-Operatoren enthält. Das erkennt digital
   erzeugte Leerseiten zuverlässig. WEISS GESCANNTE Seiten werden dagegen
   NICHT erkannt: sie enthalten ein vollwertiges Scan-Bild, und um dessen
   Pixel auf "fast alles weiß" zu prüfen, müsste jedes Bild dekodiert und
   gerendert werden (JPEG/CCITT-Decoder + Rasterizer) — das kann pdf-lib nicht,
   und es wäre im Browser bei vielen Seiten auch unangemessen langsam. Bevor
   eine Bild-Erkennung vorgetäuscht wird, die nicht stattfindet, bleibt es
   ehrlich bei der Struktur-Prüfung. */
export function detectBlankPage(page) {
  const node = page.node;
  const contents = node.Contents && node.Contents();
  if (!contents) return true; // gar kein Inhalts-Stream → sicher leer

  // Inhalts-Streams einsammeln (kann ein einzelner Stream oder eine Liste sein)
  const streams = [];
  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i++) {
      const s = page.doc.context.lookup(contents.get(i));
      if (s) streams.push(s);
    }
  } else {
    streams.push(contents);
  }

  // Gesamten Inhalt dekomprimiert betrachten. Schlägt das Dekodieren fehl
  // (exotischer Filter), gilt die Seite vorsichtshalber als NICHT leer —
  // lieber eine Leerseite behalten als echten Inhalt wegwerfen.
  let text = "";
  for (const s of streams) {
    try {
      if (s instanceof PDFRawStream) {
        text += new TextDecoder("latin1").decode(decodePDFRawStream(s).decode());
      } else if (typeof s.getContents === "function") {
        text += new TextDecoder("latin1").decode(s.getContents());
      } else {
        return false;
      }
    } catch {
      return false;
    }
  }

  // Nur Whitespace oder ein paar Koordinaten-Setzer ohne Zeichen-Operatoren?
  // Zeichen-Operatoren in PDF: Tj/TJ (Text), Do (Bild/Formular), Pfad-Maler
  // wie f, F, S, B, b (füllen/umranden) und "sh" (Verlauf). Ein "re W n"
  // (nur Clipping) zeichnet dagegen nichts.
  const stripped = text.trim();
  if (stripped.length === 0) return true;
  if (stripped.length < 60 && !/\b(Tj|TJ|Do|sh|f\*?|F|S|s|B\*?|b\*?)\b/.test(stripped)) {
    return true;
  }
  return false;
}

/* Bringt ein simplex-gescanntes PDF in Duplex-Reihenfolge.

   arrayBuffer — die Original-PDF-Datei
   options.addBlankPageIfOdd — bei ungerader Seitenzahl eine Leerseite ergänzen
                               (sie ist die fehlende Rückseite des letzten Blatts
                               und landet dadurch als letzte Seite im Ergebnis)
   options.removeBlankPages  — strukturell leere Seiten NACH dem Sortieren entfernen
   options.onProgress        — optional: (fertig, gesamt) → für eine Fortschrittsanzeige

   Rückgabe: die fertigen PDF-Bytes (Uint8Array). */
export async function interleavePages(arrayBuffer, options = {}) {
  const { removeBlankPages = false, addBlankPageIfOdd = false, onProgress = null } = options;

  let srcDoc;
  try {
    srcDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  } catch {
    throw new Error("Die Datei konnte nicht als PDF gelesen werden. Ist es wirklich eine PDF-Datei?");
  }

  let pageCount = srcDoc.getPageCount();
  if (pageCount === 0) throw new Error("Das PDF enthält keine Seiten.");

  if (pageCount % 2 !== 0) {
    if (!addBlankPageIfOdd) throw new OddPageCountError(pageCount);
    // Die fehlende Seite ist die Rückseite des LETZTEN Blatts. Da die Rück-
    // seiten rückwärts gescannt wurden, gehört sie im Scan direkt HINTER die
    // Vorderseiten (Index k) — im fertigen Dokument wird sie so zur letzten Seite.
    const half = (pageCount + 1) / 2;
    const last = srcDoc.getPage(pageCount - 1);
    const { width, height } = last.getSize();
    srcDoc.insertPage(half, [width, height]);
    pageCount += 1;
  }

  // Interleaving: Scan = V1…Vk, Rk…R1  →  Dokument = V1, R1, V2, R2, …
  // Also abwechselnd von vorne (Index i) und von hinten (Index n-1-i).
  const half = pageCount / 2;
  const order = [];
  for (let i = 0; i < half; i++) order.push(i, pageCount - 1 - i);

  // Leerseiten erst NACH dem Sortieren aussieben (Reihenfolge steht dann fest).
  let finalOrder = order;
  if (removeBlankPages) {
    finalOrder = order.filter((idx) => !detectBlankPage(srcDoc.getPage(idx)));
    if (finalOrder.length === 0) {
      throw new Error("Alle Seiten wurden als Leerseiten erkannt — es bliebe ein leeres PDF übrig. Es wurde nichts gespeichert.");
    }
  }

  // Seiten einzeln in ein neues Dokument kopieren, damit der Fortschritt
  // gemeldet werden kann (bei großen Scans dauert das spürbar).
  const outDoc = await PDFDocument.create();
  for (let i = 0; i < finalOrder.length; i++) {
    const [copied] = await outDoc.copyPages(srcDoc, [finalOrder[i]]);
    outDoc.addPage(copied);
    if (onProgress) {
      onProgress(i + 1, finalOrder.length);
      // kurz ans System abgeben, damit der Browser die Anzeige aktualisieren kann
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  return outDoc.save();
}
