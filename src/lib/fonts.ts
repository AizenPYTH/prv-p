/**
 * Bundled open fonts, metric-compatible with the most common document fonts.
 * The same files are used for the on-screen preview (@font-face) and for the
 * PDF export, so what you see is what you get.
 */
export type FontKey = "arial" | "calibri" | "times" | "courier" | "verdana";

export const FONTS: Record<FontKey, { label: string; css: string; regular: string; bold: string }> = {
  arial: {
    label: "Arial / Helvetica",
    css: "'Liberation Sans', Arial, Helvetica, sans-serif",
    regular: "/fonts/LiberationSans-Regular.ttf",
    bold: "/fonts/LiberationSans-Bold.ttf",
  },
  calibri: {
    label: "Calibri",
    css: "'Carlito', Calibri, 'Segoe UI', sans-serif",
    regular: "/fonts/Carlito-Regular.ttf",
    bold: "/fonts/Carlito-Bold.ttf",
  },
  times: {
    label: "Times New Roman",
    css: "'Liberation Serif', 'Times New Roman', Times, serif",
    regular: "/fonts/LiberationSerif-Regular.ttf",
    bold: "/fonts/LiberationSerif-Bold.ttf",
  },
  courier: {
    label: "Courier New",
    css: "'Liberation Mono', 'Courier New', Courier, monospace",
    regular: "/fonts/LiberationMono-Regular.ttf",
    bold: "/fonts/LiberationMono-Bold.ttf",
  },
  verdana: {
    label: "Verdana / DejaVu",
    css: "'DejaVu Sans', Verdana, Tahoma, sans-serif",
    regular: "/fonts/DejaVuSans.ttf",
    bold: "/fonts/DejaVuSans-Bold.ttf",
  },
};

export const DEFAULT_FONT: FontKey = "arial";

/** Picks the closest bundled font from a PDF font name / family hint. */
export function guessFont(hint?: string): FontKey {
  const n = (hint ?? "").toLowerCase();
  if (!n) return DEFAULT_FONT;
  if (/courier|mono|consol|menlo|typewriter/.test(n)) return "courier";
  if (/calibri|carlito|segoe|lato|open ?sans|source ?sans|noto ?sans|inter\b|poppins|montserrat|nunito/.test(n)) return "calibri";
  if (/verdana|tahoma|dejavu|geneva|bitstream vera/.test(n)) return "verdana";
  if (/times|georgia|garamond|cambria|palatino|minion|book ?antiqua|baskerville|roman/.test(n)) return "times";
  // "serif" alone (but not "sans-serif") also means a serif face.
  if (/(^|[^-])serif/.test(n.replace(/sans-?serif/g, "sans"))) return "times";
  return DEFAULT_FONT;
}
