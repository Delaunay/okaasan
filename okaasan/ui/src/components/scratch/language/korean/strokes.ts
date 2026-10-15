// Stroke order per letter (data/strokes.json): polylines in a 100x100 box,
// in writing order, used to check order and direction, not to match a font.
import type { Stroke } from '../engine/strokes';

export let STROKES: Record<string, Stroke[]> = {};
export let ALT_STROKES: Record<string, Stroke[]> = {};  // other accepted orders

export function initStrokes(d: { strokes: Record<string, Stroke[]>; alt: Record<string, Stroke[]> }) {
  STROKES = d.strokes;
  ALT_STROKES = d.alt;
}

export const strokeVariants = (ch: string): Stroke[][] => [STROKES[ch], ...(ALT_STROKES[ch] ? [ALT_STROKES[ch]] : [])];
