import { DEFAULT_FONT, FONTS } from "./fonts";
import type { Field } from "./types";

/**
 * Matches the replacement text to the original one by comparing pixels: the
 * original text, as rendered on the page, against the same text drawn with the
 * bundled font. Same text on both sides, so glyph shapes cancel out and only
 * size and weight differences remain.
 */
export interface Calibration {
  fontSize: number;
  bold: boolean;
  /** Extra outline width (document units) for text heavier than the bundled bold */
  stroke: number;
}

function parseHex(hex: string | undefined): number[] | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? "");
  return m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : null;
}

/**
 * Total ink (sum of per-pixel coverage, sub-pixel accurate) and height of the inked rows.
 * Rows that are almost entirely inked are rules (underline, table border), not text: skipped.
 */
function measure(data: Uint8ClampedArray, width: number, coverage: (i: number) => number) {
  let ink = 0;
  let top = Infinity;
  let bottom = -1;
  const rows = data.length / 4 / width;
  for (let y = 0; y < rows; y++) {
    let rowInk = 0;
    let solid = 0;
    for (let x = 0; x < width; x++) {
      const c = coverage((y * width + x) * 4);
      if (c <= 0.05) continue;
      rowInk += c;
      if (c > 0.5) solid++;
    }
    if (width > 20 && solid > width * 0.7) continue;
    ink += rowInk;
    if (solid) {
      if (y < top) top = y;
      bottom = y;
    }
  }
  return { ink, h: bottom >= top ? bottom - top + 1 : 0 };
}

let scratch: CanvasRenderingContext2D | null = null;

/** Draws `text` black on white and measures it. `clip` keeps only the rows of the original zone box. */
function measureOurs(text: string, css: string, px: number, bold: boolean, stroke: number, clip?: { baseline: number; h: number }) {
  scratch ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const ctx = scratch!;
  const font = `${bold ? 700 : 400} ${px}px ${css}`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width + px);
  const h = Math.ceil(px * 2);
  ctx.canvas.width = w;
  ctx.canvas.height = h;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.font = font;
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#000";
  ctx.lineJoin = "round";
  ctx.lineWidth = stroke;
  const baseline = Math.round(px * 1.3);
  ctx.fillText(text, px / 2, baseline);
  if (stroke > 0) ctx.strokeText(text, px / 2, baseline);
  const y0 = clip ? Math.max(0, Math.round(baseline - clip.baseline)) : 0;
  const y1 = clip ? Math.min(h, Math.round(baseline - clip.baseline + clip.h)) : h;
  if (y1 <= y0) return { ink: 0, h: 0 };
  const d = ctx.getImageData(0, y0, w, y1 - y0).data;
  return measure(d, w, (i) => (255 - d[i]) / 255);
}

/**
 * `scale` is canvas pixels per document unit. For PDFs the zone box puts the
 * baseline at 0.85 × font size (see pdf.ts), so the same rows are compared;
 * OCR boxes are tight around the ink, so our text is measured unclipped.
 */
export async function calibrateField(
  canvas: HTMLCanvasElement,
  f: Field,
  scale: number,
  kind: "pdf" | "image",
): Promise<Calibration | null> {
  const text = f.original.trim();
  const bg = parseHex(f.bg);
  const ink = parseHex(f.color);
  if (!text || !bg || !ink) return null;
  const contrast = Math.abs(ink[0] - bg[0]) + Math.abs(ink[1] - bg[1]) + Math.abs(ink[2] - bg[2]);
  if (contrast < 90) return null;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const bx = f.ox ?? f.x;
  const by = f.oy ?? f.y;
  const x0 = Math.max(0, Math.floor(bx * scale));
  const y0 = Math.max(0, Math.floor(by * scale));
  const x1 = Math.min(canvas.width, Math.ceil((bx + f.w) * scale));
  const y1 = Math.min(canvas.height, Math.ceil((by + f.h) * scale));
  if (x1 - x0 < 4 || y1 - y0 < 4) return null;
  const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
  const orig = measure(d, x1 - x0, (i) =>
    Math.min(1, (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2])) / contrast),
  );
  if (orig.h < 5 || orig.ink < 10) return null;

  const css = FONTS[f.font ?? DEFAULT_FONT].css;
  try {
    await Promise.all([document.fonts.load(`400 20px ${css}`), document.fonts.load(`700 20px ${css}`)]);
  } catch {
    // Fall back to whatever the browser has; the measurement stays relative.
  }
  // The original rows are fixed: the box top sits 0.85 × the detected size (h = 1.1 × that size) above the baseline.
  const clip = kind === "pdf" ? { baseline: ((f.h * 0.85) / 1.1) * scale, h: f.h * scale } : undefined;

  // Weight at a given size: compare the amount of ink with our regular and bold faces;
  // heavier than our face → add an outline, sized from how much ink a test outline adds.
  const weigh = (px: number) => {
    const regular = measureOurs(text, css, px, false, 0, clip).ink;
    const boldInk = measureOurs(text, css, px, true, 0, clip).ink;
    if (!regular || !boldInk) return null;
    const bold = orig.ink > Math.sqrt(regular * boldInk);
    const base = bold ? boldInk : regular;
    let stroke = 0;
    if (orig.ink > base * 1.12) {
      // Ink does not grow linearly with the outline (counters fill in): refine a few times.
      const max = px * 0.12;
      let t = Math.max(0.5, px * 0.04);
      for (let i = 0; i < 4; i++) {
        const added = measureOurs(text, css, px, bold, t, clip).ink - base;
        if (added <= 0) break;
        const next = Math.min(max, (t * (orig.ink - base)) / added);
        const done = Math.abs(next - t) < 0.1;
        t = next;
        if (done || t >= max) break;
      }
      stroke = t;
    }
    return { bold, stroke };
  };

  // Size: same text, so the inked height tells the real size. An outline also adds height,
  // so size and weight are refined together.
  const detected = f.fontSize * scale;
  let px = detected;
  let w = weigh(px);
  for (let i = 0; i < 3 && w; i++) {
    const h = measureOurs(text, css, px, w.bold, w.stroke, clip).h;
    if (h < 5) return null;
    const k = orig.h / h;
    if (Math.abs(k - 1) < 0.04) break;
    px = Math.min(detected * 1.35, Math.max(detected * 0.8, px * k));
    w = weigh(px);
  }
  if (Math.abs(px / detected - 1) < 0.05 && px !== detected) {
    px = detected;
    w = weigh(px);
  }
  if (!w) return null;
  const { bold, stroke: strokePx } = w;
  const stroke = strokePx / scale;
  return { fontSize: px / scale, bold, stroke };
}
