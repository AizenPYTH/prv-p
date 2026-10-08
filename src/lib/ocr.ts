"use client";
import type { TextSegment } from "./types";
import { uid } from "./types";

/**
 * Runs Tesseract OCR on a canvas and returns line segments.
 * `scale` converts canvas pixels back to document units.
 */
export async function ocrCanvas(
  canvas: HTMLCanvasElement,
  page: number,
  scale: number,
  onProgress?: (p: number) => void,
): Promise<TextSegment[]> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("fra+eng", 1, {
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) onProgress(m.progress);
    },
  });
  try {
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    const segments: TextSegment[] = [];
    for (const block of data.blocks ?? []) {
      for (const para of block.paragraphs) {
        for (const line of para.lines) {
          const text = line.text.replace(/\s+/g, " ").trim();
          if (!text || line.confidence < 40) continue;
          const { x0, y0, x1, y1 } = line.bbox;
          const h = (y1 - y0) / scale;
          segments.push({
            id: uid("seg"),
            page,
            text,
            x: x0 / scale,
            y: y0 / scale,
            w: (x1 - x0) / scale,
            h,
            fontSize: h * 0.8,
          });
        }
      }
    }
    return segments;
  } finally {
    await worker.terminate();
  }
}
