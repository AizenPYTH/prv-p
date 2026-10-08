import type { TextSegment } from "./types";

let ctx: CanvasRenderingContext2D | null | undefined;

/**
 * Horizontal box of a character range inside a segment. Uses real glyph
 * widths (canvas measureText) scaled to the segment's measured width, and
 * falls back to a proportional estimate outside the browser.
 */
export function textRange(seg: TextSegment, start: number, end: number): { x: number; w: number } {
  if (ctx === undefined) ctx = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  if (!ctx) {
    const cw = seg.w / Math.max(seg.text.length, 1);
    return { x: seg.x + cw * start, w: cw * (end - start) };
  }
  ctx.font = `${seg.bold ? "bold " : ""}${Math.max(seg.fontSize, 1)}px Helvetica, Arial, sans-serif`;
  const full = ctx.measureText(seg.text).width || 1;
  const k = seg.w / full;
  return {
    x: seg.x + ctx.measureText(seg.text.slice(0, start)).width * k,
    w: ctx.measureText(seg.text.slice(start, end)).width * k,
  };
}
