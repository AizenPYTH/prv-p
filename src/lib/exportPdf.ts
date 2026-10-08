"use client";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { DocModel, Field } from "./types";
import { isEdited, isMoved } from "./types";
import { DEFAULT_FONT, FONTS, type FontKey } from "./fonts";

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

/** Drops characters the font cannot encode. */
function sanitize(text: string, font: PDFFont): string {
  const set = new Set(font.getCharacterSet());
  return Array.from(text)
    .map((ch) => (set.has(ch.codePointAt(0)!) ? ch : "?"))
    .join("");
}

/** Loads bundled TTF fonts on demand; falls back to the built-in Helvetica. */
class FontLoader {
  private cache = new Map<string, Promise<PDFFont>>();
  constructor(private pdf: PDFDocument) {
    pdf.registerFontkit(fontkit);
  }
  get(key: FontKey | undefined, bold: boolean): Promise<PDFFont> {
    const k = `${key ?? DEFAULT_FONT}:${bold ? "b" : "r"}`;
    let p = this.cache.get(k);
    if (!p) {
      p = this.load(key ?? DEFAULT_FONT, bold);
      this.cache.set(k, p);
    }
    return p;
  }
  private async load(key: FontKey, bold: boolean): Promise<PDFFont> {
    try {
      const url = bold ? FONTS[key].bold : FONTS[key].regular;
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.statusText);
      return await this.pdf.embedFont(await res.arrayBuffer(), { subset: true });
    } catch {
      return this.pdf.embedFont(bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica);
    }
  }
}

function drawField(page: PDFPage, f: Field, font: PDFFont, scale: number, pageHeight: number) {
  const text = sanitize(f.value, font);
  // Always keep the original font size: the value must look like the text it replaces.
  const size = f.fontSize * scale;
  const boxW = f.w * scale;
  const boxH = Math.max(f.h, f.fontSize * 1.15) * scale;
  const textW = text ? font.widthOfTextAtSize(text, size) : 0;
  const bg = hexToRgb(f.bg);

  // A moved zone must hide the text at its original place.
  if (isMoved(f)) {
    page.drawRectangle({
      x: f.ox! * scale - 1,
      y: pageHeight - f.oy! * scale - boxH - 1,
      width: boxW + 2,
      height: boxH + 2,
      color: bg,
    });
  }

  const x = f.x * scale;
  const top = pageHeight - f.y * scale; // PDF origin is bottom-left
  if (f.value !== f.original || isMoved(f)) {
    page.drawRectangle({
      x: x - 1,
      y: top - boxH - 1,
      width: Math.max(boxW, textW) + 2,
      height: boxH + 2,
      color: bg,
    });
  }
  if (text) {
    page.drawText(text, {
      x,
      y: top - boxH + (boxH - size) / 2 + size * 0.2,
      size,
      font,
      color: rgb(0.08, 0.08, 0.08),
    });
  }
}

/**
 * Exports the document as a PDF: the original file is kept as-is and every
 * edited (or moved) field is painted over with its value at its position,
 * using a font matching the original one.
 */
export async function exportPdf(doc: DocModel): Promise<Uint8Array> {
  const edited = doc.fields.filter(isEdited);
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

  const fonts = new FontLoader(pdf);
  const pages = pdf.getPages();
  for (const f of edited) {
    const page = pages[f.page];
    if (!page) continue;
    drawField(page, f, await fonts.get(f.font, !!f.bold), scale, page.getHeight());
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
