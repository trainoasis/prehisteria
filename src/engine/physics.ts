// AABB physics against a tile grid. Movement is integrated by the caller into
// (vx,vy); moveBody() applies it and resolves overlaps axis-by-axis (X then Y).
// Resolving one axis at a time is what makes wall-slides and clean landings
// work. Fixed-timestep keeps per-step displacement < TILE, so a single-pass
// snap per column/row is sufficient and robust.
//
// Two tile classes:
//  - solid: blocks in every direction (ground, fill).
//  - oneWay: platforms you can jump up through and walk under; they only catch
//    a FALLING body whose feet were above the tile top last step. Passing
//    drop=true disables one-way collision entirely — that's how "press down to
//    drop through" works.

import { TILE } from './tilemap';

export interface Body {
  x: number; y: number;   // top-left, world pixels
  w: number; h: number;
  vx: number; vy: number; // pixels/second
  onGround: boolean;
}

export type SolidFn = (tx: number, ty: number) => boolean;

function tileRange(a: number, size: number): [number, number] {
  return [Math.floor(a / TILE), Math.floor((a + size - 1) / TILE)];
}

export function moveBody(
  b: Body, solid: SolidFn, dt: number, oneWay?: SolidFn, drop = false,
): void {
  // --- X axis (hard solids only; one-way tiles never block sideways) ---
  b.x += b.vx * dt;
  {
    const [ty0, ty1] = tileRange(b.y, b.h);
    const [tx0, tx1] = tileRange(b.x, b.w);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!solid(tx, ty)) continue;
        if (b.vx > 0) b.x = tx * TILE - b.w;
        else if (b.vx < 0) b.x = (tx + 1) * TILE;
        b.vx = 0;
        break;
      }
    }
  }

  // --- Y axis ---
  const prevFeet = b.y + b.h;   // where the feet were BEFORE this step
  b.y += b.vy * dt;
  {
    const [tx0, tx1] = tileRange(b.x, b.w);
    const [ty0, ty1] = tileRange(b.y, b.h);
    let hardHit = false;
    outer:
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!solid(tx, ty)) continue;
        if (b.vy > 0) b.y = ty * TILE - b.h;       // landed on a floor
        else if (b.vy < 0) b.y = (ty + 1) * TILE;  // bonked a ceiling
        b.vy = 0;
        hardHit = true;
        break outer;
      }
    }
    // One-way catch: only when falling, not dropping, and only if the feet
    // were above the platform's top surface last step (so rising or walking
    // through from the side never snags).
    if (!hardHit && b.vy > 0 && oneWay && !drop) {
      const feetTy = Math.floor((b.y + b.h - 0.01) / TILE);
      if (prevFeet <= feetTy * TILE + 0.6) {
        for (let tx = tx0; tx <= tx1; tx++) {
          if (oneWay(tx, feetTy)) {
            b.y = feetTy * TILE - b.h;
            b.vy = 0;
            break;
          }
        }
      }
    }
  }

  // Ground detection with a 1px tolerance. Resolving against the tile the feet
  // *penetrate* leaves the feet resting exactly on a boundary, where the strict
  // overlap test reads as "not touching" — that would flicker onGround off every
  // frame at rest and jitter the fall/idle animation + coyote time. Probe the
  // tile directly beneath the feet instead, and snap to a clean rest. One-way
  // tiles count as ground only when resting exactly on their top (never while
  // passing through mid-tile) and never while dropping.
  b.onGround = false;
  {
    const feetTy = Math.floor((b.y + b.h) / TILE);
    const [tx0, tx1] = tileRange(b.x, b.w);
    for (let tx = tx0; tx <= tx1; tx++) {
      if (solid(tx, feetTy)) { b.onGround = true; break; }
      if (oneWay && !drop && oneWay(tx, feetTy)
        && (b.y + b.h) - feetTy * TILE < 2) { b.onGround = true; break; }
    }
    if (b.onGround && b.vy >= 0) { b.vy = 0; b.y = feetTy * TILE - b.h; }
  }
}

// True if the body is supported ONLY by one-way tiles (nothing hard beneath) —
// i.e. pressing down here should drop through instead of crouching.
export function onOneWayOnly(b: Body, solid: SolidFn, oneWay: SolidFn): boolean {
  if (!b.onGround) return false;
  const feetTy = Math.floor((b.y + b.h) / TILE);
  const [tx0, tx1] = tileRange(b.x, b.w);
  let sawOneWay = false;
  for (let tx = tx0; tx <= tx1; tx++) {
    if (solid(tx, feetTy)) return false;
    if (oneWay(tx, feetTy)) sawOneWay = true;
  }
  return sawOneWay;
}

// AABB overlap test — used for hero/enemy/pickup/hitbox interactions.
export function overlaps(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
