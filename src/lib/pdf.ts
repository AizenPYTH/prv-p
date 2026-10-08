"use client";
import type { PageModel, TextSegment } from "./types";
import { uid } from "./types";

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;

/** Loads PDF.js lazily on the client and wires its worker. */
export async function getPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      return lib;
    });
  }
  return pdfjsPromise;
}

export const RENDER_SCALE = 2;

export interface RenderedPage extends PageModel {
  canvas: HTMLCanvasElement;
  /** Text segments found in the PDF text layer (empty for scanned PDFs) */
  segments: TextSegment[];
}

interface RawItem {
  str: string;
  x: number;
  baseline: number;
  w: number;
  fontSize: number;
  fontName: string;
}

/**
 * Renders every page to a canvas and extracts positioned text.
 * All coordinates are in PDF points with a top-left origin.
 */
export async function loadPdf(bytes: ArrayBuffer): Promise<RenderedPage[]> {
  const pdfjs = await getPdfJs();
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const pages: RenderedPage[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const renderViewport = page.getViewport({ scale: RENDER_SCALE });

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(renderViewport.width);
    canvas.height = Math.floor(renderViewport.height);
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvas, canvasContext: ctx, viewport: renderViewport }).promise;

    const content = await page.getTextContent();
    const styles = content.styles as Record<string, { fontFamily?: string }>;
    const items: RawItem[] = [];
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const [a, b, , d, e, f] = it.transform as number[];
      const fontSize = Math.hypot(a, b) || Math.abs(d) || it.height || 10;
      items.push({
        str: it.str,
        x: e,
        baseline: viewport.height - f,
        w: it.width,
        fontSize,
        fontName: `${it.fontName} ${styles[it.fontName]?.fontFamily ?? ""}`,
      });
    }

    pages.push({
      index: i - 1,
      width: viewport.width,
      height: viewport.height,
      imageUrl: canvas.toDataURL("image/png"),
      canvas,
      segments: mergeItems(items, i - 1),
    });
  }
  return pages;
}

/** Groups adjacent text items on the same baseline into line segments. */
function mergeItems(items: RawItem[], page: number): TextSegment[] {
  const sorted = [...items].sort((p, q) => p.baseline - q.baseline || p.x - q.x);
  const segments: TextSegment[] = [];
  let cur: (RawItem & { xEnd: number }) | null = null;

  const flush = () => {
    if (!cur) return;
    const text = cur.str.replace(/\s+/g, " ").trim();
    if (text) {
      segments.push({
        id: uid("seg"),
        page,
        text,
        x: cur.x,
        y: cur.baseline - cur.fontSize * 0.85,
        w: cur.xEnd - cur.x,
        h: cur.fontSize * 1.1,
        fontSize: cur.fontSize,
        bold: /bold|black|heavy|semibold/i.test(cur.fontName),
      });
    }
    cur = null;
  };

  for (const it of sorted) {
    if (
      cur &&
      Math.abs(it.baseline - cur.baseline) < cur.fontSize * 0.35 &&
      it.x >= cur.xEnd - cur.fontSize * 0.3 &&
      it.x - cur.xEnd < cur.fontSize * 1.2
    ) {
      const gap = it.x - cur.xEnd;
      cur.str += (gap > cur.fontSize * 0.2 && !cur.str.endsWith(" ") && !it.str.startsWith(" ") ? " " : "") + it.str;
      cur.xEnd = Math.max(cur.xEnd, it.x + it.w);
      cur.fontSize = Math.max(cur.fontSize, it.fontSize);
    } else {
      flush();
      cur = { ...it, xEnd: it.x + it.w };
    }
  }
  flush();
  return segments;
}

/** Loads an image file into a canvas (document units = image pixels). */
export async function loadImage(dataUrl: string): Promise<RenderedPage> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Image illisible"));
    el.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext("2d")!.drawImage(img, 0, 0);
  return {
    index: 0,
    width: img.naturalWidth,
    height: img.naturalHeight,
    imageUrl: dataUrl,
    canvas,
    segments: [],
  };
}

/** Samples the dominant background colour just outside a box, so edits blend in. */
export function sampleBackground(
  canvas: HTMLCanvasElement,
  box: { x: number; y: number; w: number; h: number },
  scale: number,
): string {
  const ctx = canvas.getContext("2d");
  if (!ctx) return "#ffffff";
  const points = [
    [box.x - 3, box.y + box.h / 2],
    [box.x + box.w + 3, box.y + box.h / 2],
    [box.x + box.w / 2, box.y - 2],
    [box.x + box.w / 2, box.y + box.h + 2],
  ];
  const samples: number[][] = [];
  for (const [px, py] of points) {
    const cx = Math.round(px * scale);
    const cy = Math.round(py * scale);
    if (cx < 0 || cy < 0 || cx >= canvas.width || cy >= canvas.height) continue;
    const d = ctx.getImageData(cx, cy, 1, 1).data;
    samples.push([d[0], d[1], d[2]]);
  }
  if (!samples.length) return "#ffffff";
  // Pick the lightest sample: text edges are darker than paper.
  samples.sort((a, b) => b[0] + b[1] + b[2] - (a[0] + a[1] + a[2]));
  const [r, g, b] = samples[0];
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
