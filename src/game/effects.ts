// Combat visuals, drawn in world space (inside the camera transform) as vector
// primitives so they aren't clipped by sprite-frame bounds. Kept separate from
// main.ts so they can be rendered/verified in isolation.
//
// The hero's club-arm is NOT in the sprite (see scripts/gen-art.py). It's drawn
// here for EVERY state, so the club is one continuous object: visibly held at
// rest, and the same object that arcs on attack — never popping in from nothing.

import { ATTACK_DUR, type Hero } from './entities';

export interface Pop { x: number; y: number; t: number; }
export const POP_LIFE = 0.22;

const SKIN = '#f0c28c';
const SKIN_DK = '#c6966a';
const WOOD = '#7e5632';
const WOOD_DK = '#5c3a24';
const WOOD_HI = '#9a6d42';

// Resolve the arm angle (0 = forward, +down) for the hero's current state.
// Attack sweeps from raised-back to chopped-down-front; other states hold a
// natural resting angle with a little life (run bob / airborne raise).
function armAngle(h: Hero): { ang: number; swinging: boolean; from: number } {
  if (h.attackT > 0) {
    const p = 1 - h.attackT / ATTACK_DUR;   // 0..1 through the swing
    const from = -2.2, to = 0.9;
    return { ang: from + (to - from) * p, swinging: true, from };
  }
  if (!h.onGround) return { ang: -0.35, swinging: false, from: 0 }; // arm up in air
  if (h.crouching) return { ang: 0.85, swinging: false, from: 0 };  // low
  const moving = Math.abs(h.vx) > 1;
  const bob = moving ? Math.sin(h.animT * 12) * 0.16 : Math.sin(h.animT * 3) * 0.05;
  return { ang: 0.5 + bob, swinging: false, from: 0 };               // ready, forward
}

export function drawArmClub(ctx: CanvasRenderingContext2D, h: Hero): void {
  const face = h.face;
  const sx = h.x + h.w / 2 + face * 1;      // shoulder anchor
  const sy = h.y + (h.crouching ? 11 : 6);
  const { ang, swinging, from } = armAngle(h);

  const ARM = 8, CLUB = 13;
  const hx = sx + Math.cos(ang) * ARM * face;         // hand
  const hy = sy + Math.sin(ang) * ARM;
  const tx = sx + Math.cos(ang) * (ARM + CLUB) * face; // club tip
  const ty = sy + Math.sin(ang) * (ARM + CLUB);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // swoosh trail only while swinging (from the wind-up angle to the current one)
  if (swinging) {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    const R = ARM + CLUB;
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const aa = from + (ang - from) * (i / steps);
      const px = sx + Math.cos(aa) * R * face;
      const py = sy + Math.sin(aa) * R;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  // upper arm (skin) shoulder -> hand
  ctx.strokeStyle = SKIN;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.strokeStyle = SKIN_DK;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(sx, sy + 1); ctx.lineTo(hx, hy + 1); ctx.stroke();

  // club handle (wood) hand -> just short of the tip
  const bx = hx + Math.cos(ang) * (CLUB - 5) * face;
  const by = hy + Math.sin(ang) * (CLUB - 5);
  ctx.strokeStyle = WOOD;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(bx, by); ctx.stroke();

  // knobby head — a fat blob with two bumps so it reads as a club, not a ball
  ctx.fillStyle = WOOD;
  ctx.beginPath(); ctx.arc(tx, ty, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(tx - face * 2, ty - 3, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(tx - face * 3, ty + 2, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = WOOD_HI;
  ctx.beginPath(); ctx.arc(tx + face * 1, ty - 1, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = WOOD_DK;
  ctx.beginPath(); ctx.arc(tx - face * 2, ty + 3, 1.3, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

// Expanding star-burst at an impact point.
export function drawPop(ctx: CanvasRenderingContext2D, p: Pop): void {
  const k = 1 - p.t / POP_LIFE;           // 0..1
  const r = 3 + k * 11;
  ctx.save();
  ctx.globalAlpha = Math.max(0, p.t / POP_LIFE);
  ctx.strokeStyle = '#fff2a8';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const a = i * (Math.PI / 2) + Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(a) * r * 0.4, p.y + Math.sin(a) * r * 0.4);
    ctx.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
