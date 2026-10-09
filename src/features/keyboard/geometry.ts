import type { KeyDef, Row } from './layout';

/**
 * Where each key sits on the keyboard surface, and which key a touch belongs to. The
 * surface renders rows with flex in the same proportions, so the hit test and the
 * drawing agree at any width without measuring each key.
 *
 * Every point maps to the nearest key, like a phone keyboard: the gaps between keys,
 * the stagger insets and the edges of the screen all count, so a slightly-off touch
 * still lands on the key it was closest to.
 */

export type Point = { x: number; y: number };

export type Rect = { x: number; y: number; width: number; height: number };

export type PlacedKey = { key: KeyDef; rect: Rect; row: number };

export function rowUnits(row: Row): number {
  return row.keys.reduce((sum, key) => sum + key.units, 0) + 2 * row.inset;
}

export function surfaceHeight(rows: Row[], padding: { top: number; bottom: number }): number {
  return padding.top + rows.reduce((sum, row) => sum + row.height, 0) + padding.bottom;
}

export function placeKeys(rows: Row[], width: number, paddingTop = 0): PlacedKey[] {
  const placed: PlacedKey[] = [];
  let y = paddingTop;
  rows.forEach((row, rowIndex) => {
    const unit = width / rowUnits(row);
    let x = row.inset * unit;
    for (const key of row.keys) {
      placed.push({
        key,
        rect: { x, y, width: key.units * unit, height: row.height },
        row: rowIndex,
      });
      x += key.units * unit;
    }
    y += row.height;
  });
  return placed;
}

/** The key under a point, or the nearest one. Null only when there are no keys. */
export function hitTest(placed: PlacedKey[], point: Point): PlacedKey | null {
  if (placed.length === 0) return null;

  // Rows are horizontal bands: pick the band (clamped to the first and last row)...
  const lastRow = placed[placed.length - 1].row;
  let row = placed[0].row;
  for (const candidate of placed) {
    if (point.y >= candidate.rect.y) row = candidate.row;
  }
  row = Math.min(row, lastRow);

  // ...then the key whose span holds the point, or the closest one along the row.
  let best: PlacedKey | null = null;
  let bestDistance = Infinity;
  for (const candidate of placed) {
    if (candidate.row !== row) continue;
    const { x, width } = candidate.rect;
    if (point.x >= x && point.x < x + width) return candidate;
    const distance = point.x < x ? x - point.x : point.x - (x + width);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}
