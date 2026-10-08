"use client";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { DocModel, Field } from "./types";

function hexToRgb(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return rgb(1, 1, 1);
  return rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255);
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Drops characters the standard fonts cannot encode (WinAnsi). */
function sanitize(text: string, font: PDFFont): string {
  const set = new Set(font.getCharacterSet());
  return Array.from(text)
    .map((ch) => (set.has(ch.codePointAt(0)!) ? ch : "?"))
    .join("");
}

function drawField(page: PDFPage, f: Field, fonts: { regular: PDFFont; bold: PDFFont }, scale: number, pageHeight: number) {
  const font = f.bold ? fonts.bold : fonts.regular;
  const text = sanitize(f.value, font);
  let size = f.fontSize * scale;
  const boxW = f.w * scale;
  const boxH = f.h * scale;
  let textW = font.widthOfTextAtSize(text, size);
  // Shrink to fit when the new value is much longer than the original box.
  const maxW = Math.max(boxW, f.w * scale * 1.6);
  if (textW > maxW) {
    size = Math.max(4, (size * maxW) / textW);
    textW = font.widthOfTextAtSize(text, size);
  }
  const x = f.x * scale;
  const top = pageHeight - f.y * scale; // PDF origin is bottom-left
  page.drawRectangle({
    x: x - 1,
    y: top - boxH - 1,
    width: Math.max(boxW, textW) + 2,
    height: boxH + 2,
    color: hexToRgb(f.bg),
  });
  page.drawText(text, {
    x,
    y: top - boxH + (boxH - size) / 2 + size * 0.2,
    size,
    font,
    color: rgb(0.08, 0.08, 0.08),
  });
}

/**
 * Exports the document as a PDF: the original file is kept as-is and every
 * edited field is painted over with its new value at the same position.
 */
export async function exportPdf(doc: DocModel): Promise<Uint8Array> {
  const edited = doc.fields.filter((f) => f.value !== f.original);
  let pdf: PDFDocument;
  let scale = 1;

  if (doc.kind === "pdf") {
    pdf = await PDFDocument.load(dataUrlToBytes(doc.dataUrl), { ignoreEncryption: true });
  } else {
    pdf = await PDFDocument.create();
    const bytes = dataUrlToBytes(doc.dataUrl);
    const image = doc.mime === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const { width, height } = doc.pages[0];
    // Fit the image on an A4-width page, keeping its aspect ratio.
    scale = 595 / width;
    const page = pdf.addPage([width * scale, height * scale]);
    page.drawImage(image, { x: 0, y: 0, width: width * scale, height: height * scale });
  }

  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const pages = pdf.getPages();
  for (const f of edited) {
    const page = pages[f.page];
    if (!page) continue;
    drawField(page, f, fonts, scale, page.getHeight());
  }
  return pdf.save();
}

export function downloadBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
