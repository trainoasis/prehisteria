// Push camera with a dead zone. The view holds perfectly still while the
// target roams an inner window; only when the target reaches the window's
// edge does the camera move — and exactly enough to keep the target pinned
// at that edge, so scrolling starts near the side of the screen instead of
// tracking every step. Pure function: main.ts owns the state.

export interface Camera { x: number; y: number; }

// Dead-zone margins as fractions of the view. 0.32 means the target can roam
// the middle 36% horizontally before pushing; vertical is looser (middle 50%)
// so a full-height jump (~60px) never nudges the view.
const DEAD_X = 0.32;
const DEAD_Y = 0.25;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function updateCamera(
  cam: Camera,
  targetX: number, targetY: number,      // target center, world px
  viewW: number, viewH: number,
  worldW: number, worldH: number,
): void {
  const left = cam.x + viewW * DEAD_X;
  const right = cam.x + viewW * (1 - DEAD_X);
  if (targetX < left) cam.x = targetX - viewW * DEAD_X;
  else if (targetX > right) cam.x = targetX - viewW * (1 - DEAD_X);

  const top = cam.y + viewH * DEAD_Y;
  const bottom = cam.y + viewH * (1 - DEAD_Y);
  if (targetY < top) cam.y = targetY - viewH * DEAD_Y;
  else if (targetY > bottom) cam.y = targetY - viewH * (1 - DEAD_Y);

  cam.x = clamp(cam.x, 0, Math.max(0, worldW - viewW));
  cam.y = clamp(cam.y, 0, Math.max(0, worldH - viewH));
}

// Hard-center on the target (spawn/respawn), clamped to the world.
export function centerCamera(
  cam: Camera,
  targetX: number, targetY: number,
  viewW: number, viewH: number,
  worldW: number, worldH: number,
): void {
  cam.x = clamp(targetX - viewW / 2, 0, Math.max(0, worldW - viewW));
  cam.y = clamp(targetY - viewH / 2, 0, Math.max(0, worldH - viewH));
}
