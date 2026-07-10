/* ============ PDF DUPLEX-FIXER (reine Logik, keine DOM-Zugriffe) ============

   Anwendungsfall: Ein Simplex-Scanner scannt zuerst alle VORDERSEITEN eines
   Stapels (Blatt 1, 2, 3 …) und danach alle RÜCKSEITEN in umgekehrter
   Reihenfolge (die Rückseite des letzten Blatts zuerst). Die gescannte Datei
   hat also die Reihenfolge:

       V1, V2, …, Vk,  Rk, R(k-1), …, R1

   Dieses Modul teilt das PDF in der Mitte, DREHT die zweite Hälfte um und fügt
   beide Hälften per Reißverschluss wieder zur echten Dokument-Reihenfolge
   zusammen: V1, R1, V2, R2, …

   pdf-lib wird als lokales Bundle aus js/vendor/ geladen (keine CDN-Abhängigkeit,
   damit die PWA offline funktioniert). */

import { PDFDocument } from "./vendor/pdf-lib.esm.min.js";

/* Bringt ein simplex-gescanntes PDF in Duplex-Reihenfolge.

   arrayBuffer        — die Original-PDF-Datei
   options.onProgress — optional: (fertig, gesamt) → für eine Fortschrittsanzeige

   Rückgabe: die fertigen PDF-Bytes (Uint8Array). */
export async function interleavePages(arrayBuffer, options = {}) {
  const { onProgress = null } = options;

  let srcDoc;
  try {
    srcDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  } catch {
    throw new Error("Die Datei konnte nicht als PDF gelesen werden. Ist es wirklich eine PDF-Datei?");
  }

  const pageCount = srcDoc.getPageCount();
  if (pageCount === 0) throw new Error("Das PDF enthält keine Seiten.");
  if (pageCount % 2 !== 0) {
    throw new Error(`Das PDF hat ${pageCount} Seiten (ungerade Anzahl). ` +
      "Vorder- und Rückseiten lassen sich nur bei gerader Seitenzahl paaren — " +
      "bitte prüfen, ob eine Seite fehlt oder doppelt gescannt wurde.");
  }

  // Reißverschluss: erste Hälfte vorwärts (Index i), zweite Hälfte rückwärts
  // (Index pageCount-1-i), abwechselnd. Scan V1…Vk,Rk…R1 → V1,R1,V2,R2,…
  const half = pageCount / 2;
  const order = [];
  for (let i = 0; i < half; i++) order.push(i, pageCount - 1 - i);

  // Seiten einzeln in ein neues Dokument kopieren, damit der Fortschritt
  // gemeldet werden kann (bei großen Scans dauert das spürbar).
  const outDoc = await PDFDocument.create();
  for (let i = 0; i < order.length; i++) {
    const [copied] = await outDoc.copyPages(srcDoc, [order[i]]);
    outDoc.addPage(copied);
    if (onProgress) {
      onProgress(i + 1, order.length);
      // kurz ans System abgeben, damit der Browser die Anzeige aktualisieren kann
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  return outDoc.save();
}
