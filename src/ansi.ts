/** ANSI color codes + a small paint helper. */

export const RESET = "\x1b[0m";

export const C = {
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  grey: "\x1b[90m",
} as const;

export const paint = (color: string, text: string): string => `${color}${text}${RESET}`;

/** Standard low/mid/high coloring for a 0-100 percentage. */
export function colorForPct(pct: number): string {
  if (pct >= 80) return C.red;
  if (pct >= 50) return C.yellow;
  return C.blue;
}
