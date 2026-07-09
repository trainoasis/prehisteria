// Tile grids. A grid is number[row][col]; 0 means empty, and any positive value
// is (sprite-frame-index + 1) into the layer's tilesheet. Solidity for physics
// is decided by the game layer (see game/levels.ts), not here.

import { A, drawFrame, type Sheet } from './sprites';

export const TILE = 24; // world pixels per tile (matches scripts/gen-art.py)

export type Grid = number[][];

export function gridCols(g: Grid): number { return g[0]?.length ?? 0; }
export function gridRows(g: Grid): number { return g.length; }

export function tileAt(g: Grid, tx: number, ty: number): number {
  if (ty < 0 || ty >= g.length) return 0;
  const row = g[ty];
  if (tx < 0 || tx >= row.length) return 0;
  return row[tx];
}

// Draw only the tiles visible in the camera window (culling). `camX/camY` are
// the top-left of the view in world pixels.
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  s: Sheet,
  g: Grid,
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
): void {
  const x0 = Math.max(0, Math.floor(camX / TILE));
  const y0 = Math.max(0, Math.floor(camY / TILE));
  const x1 = Math.min(gridCols(g) - 1, Math.floor((camX + viewW) / TILE));
  const y1 = Math.min(gridRows(g) - 1, Math.floor((camY + viewH) / TILE));
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const id = g[ty][tx];
      if (id <= 0) continue;
      drawFrame(ctx, s, id - 1, tx * TILE, ty * TILE);
    }
  }
}

// Distant hill band, drawn with parallax and horizontal wrap so it always fills
// the view. Uses the `far` tilesheet (0=sky_fill, 1=hill, 2=hill_top). This is
// subtle depth BEHIND the dense jungle tile layer — not the main backdrop.
export function drawFarHills(
  ctx: CanvasRenderingContext2D,
  camX: number,
  viewW: number,
  viewH: number,
  groundY: number,
): void {
  const s = A.far;
  if (!s.ready) return;
  const factor = 0.35;                 // hills drift slower than the world
  const off = (camX * factor) % TILE;
  const bandTop = groundY - TILE * 3;  // hills sit low, near the ground
  const startX = -off - TILE;
  for (let x = startX; x < viewW + TILE; x += TILE) {
    drawFrame(ctx, s, 2, Math.round(x), bandTop);           // rounded top
    for (let y = bandTop + TILE; y < viewH; y += TILE) {
      drawFrame(ctx, s, 1, Math.round(x), y);               // body down to floor
    }
  }
}
