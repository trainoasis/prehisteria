// Entities: the hero (Brko), patrolling critters, and pickups. This module owns
// each entity's own movement + animation (self-contained per tick). Cross-entity
// interactions (attack hits, stomps, pickup collection, damage) live in main.ts
// where the whole world is visible.

import { down, pressed } from '../engine/input';
import { type Body, type SolidFn, moveBody, onOneWayOnly } from '../engine/physics';
import { TILE } from '../engine/tilemap';
import { type PickupKind } from './levels';

// --- tuning (world px, seconds) ---
const RUN = 132;
const GRAVITY = 950;
const MAX_FALL = 560;
const JUMP_V = -338;
const JUMP_CUT = -120;      // rise speed cap when jump is released early
const COYOTE = 0.09;        // grace after leaving a ledge
const BUFFER = 0.10;        // jump press remembered this long
export const ATTACK_DUR = 0.30;
const STAND_H = 22;
const CROUCH_H = 14;
const HERO_W = 14;

// Per-kind enemy tuning.
//   critter: stompable waddler.            spiky: spine-back — club only.
//   tiger:   telegraphed pounce.           flier: airborne sine glider.
//   spider:  alternates ground crawl and silk climb.
//   vampire: fast homing flier, club-only, takes 2 club hits.
// stompHp = stomps to kill (multi-stomp enemies pay a bigger kill bounty).
// clubHp  = club hits to kill. score = base kill value.
export type EnemyKind = 'critter' | 'spiky' | 'tiger' | 'flier' | 'spider' | 'vampire';
export const EN_TUNE: Record<EnemyKind, {
  w: number; h: number; speed: number; stompHp: number; clubHp: number; score: number;
}> = {
  critter: { w: 18, h: 18, speed: 42, stompHp: 1, clubHp: 1, score: 200 },
  spiky:   { w: 18, h: 13, speed: 26, stompHp: 0, clubHp: 1, score: 300 },
  tiger:   { w: 26, h: 15, speed: 55, stompHp: 2, clubHp: 1, score: 400 },
  flier:   { w: 18, h: 14, speed: 62, stompHp: 1, clubHp: 1, score: 250 },
  spider:  { w: 16, h: 12, speed: 34, stompHp: 2, clubHp: 1, score: 300 },
  vampire: { w: 18, h: 14, speed: 165, stompHp: 0, clubHp: 2, score: 1000 },
};
const TIGER_SIGHT_X = 105;   // horizontal pounce-trigger range
const TIGER_SIGHT_Y = 46;
const TIGER_WINDUP = 0.35;   // crouch tell — the player's dodge window
const TIGER_LEAP_VX = 235;
const TIGER_LEAP_VY = -255;
const TIGER_COOLDOWN = 1.1;
const FLIER_RANGE = 70;      // patrol half-width around home
const SPIDER_CRAWL_TIME = 2.6;
const SPIDER_CLIMB_SPEED = 55;
const SPIDER_CLIMB_HEIGHT = 66;
const VAMP_SIGHT = 180;      // aggro radius (retreat time is set on club hit in main)

export interface Hero extends Body {
  face: 1 | -1;
  crouching: boolean;
  attackT: number;   // counts down while a swing is in progress
  animT: number;
  invulnT: number;   // i-frames after taking a hit
  hp: number;
  coyoteT: number;   // grace window to still jump just after leaving ground
  jumpBufT: number;  // remembered jump press
  dropT: number;     // >0 while intentionally dropping through a platform
}

export interface Enemy extends Body {
  kind: EnemyKind;
  dir: 1 | -1;
  alive: boolean;
  squashT: number;    // >0 while playing the defeated frame before removal
  animT: number;
  windupT: number;    // tiger: crouch tell countdown before a pounce
  cooldownT: number;  // tiger: rest between pounces
  leaping: boolean;   // tiger: currently airborne mid-pounce
  homeX: number;      // spawn anchor (flier patrol / vampire lair)
  homeY: number;
  stomps: number;     // stomps landed so far — scales the kill bounty
  clubHp: number;     // club hits left (vampire takes 2)
  flashT: number;     // hit-flash blink after a non-lethal hit
  modeT: number;      // spider: time left in the crawl phase
  climbing: boolean;  // spider: on its silk thread
  climbDir: 1 | -1;   // spider: -1 rising, 1 descending
  threadTop: number;  // spider: top of the current silk thread
  retreatT: number;   // vampire: flees after eating a club hit
}

export interface Pickup {
  x: number; y: number;
  kind: PickupKind;
  taken: boolean;
  bob: number;       // animation phase
}

export function makeHero(x: number, y: number): Hero {
  return {
    x, y, w: HERO_W, h: STAND_H, vx: 0, vy: 0, onGround: false,
    face: 1, crouching: false, attackT: 0, animT: 0, invulnT: 0, hp: 3,
    coyoteT: 0, jumpBufT: 0, dropT: 0,
  };
}

export function makeEnemy(x: number, y: number, kind: EnemyKind = 'critter'): Enemy {
  const t = EN_TUNE[kind];
  const ex = x + (TILE - t.w) / 2;
  const ey = y + (TILE - t.h);
  return {
    kind, x: ex, y: ey, w: t.w, h: t.h,
    vx: 0, vy: 0, onGround: false, dir: -1, alive: true, squashT: 0, animT: 0,
    windupT: 0, cooldownT: 0, leaping: false,
    homeX: ex, homeY: ey, stomps: 0, clubHp: t.clubHp, flashT: 0,
    modeT: SPIDER_CRAWL_TIME, climbing: false, climbDir: -1, threadTop: ey, retreatT: 0,
  };
}

// Spiky's spines and the vampire's speed punish stomps — club only for those.
export function canStomp(e: Enemy): boolean {
  return EN_TUNE[e.kind].stompHp > 0;
}

export function makePickup(x: number, y: number, kind: PickupKind): Pickup {
  return { x: x + 4, y: y + 4, kind, taken: false, bob: (x + y) * 0.01 };
}

function setHeight(h: Hero, newH: number): void {
  const feet = h.y + h.h;
  h.y = feet - newH;
  h.h = newH;
}

export interface HeroEvents { jumped: boolean; attacked: boolean; dropped: boolean; }

export function updateHero(h: Hero, solid: SolidFn, oneWay: SolidFn, dt: number): HeroEvents {
  const ev: HeroEvents = { jumped: false, attacked: false, dropped: false };

  if (h.dropT > 0) h.dropT -= dt;

  // Pressing down on a platform-only support drops THROUGH it; pressing down
  // on hard ground crouches. The drop window is long enough to clear the tile.
  const wantDown = down('crouch');
  if (wantDown && h.onGround && h.dropT <= 0 && onOneWayOnly(h, solid, oneWay)) {
    h.dropT = 0.18;
    ev.dropped = true;
    if (h.crouching) { setHeight(h, STAND_H); h.crouching = false; }
  }

  // crouch (only grounded, not while dropping); hitbox shrinks, feet stay put
  const wantCrouch = wantDown && h.onGround && h.dropT <= 0;
  if (wantCrouch && !h.crouching) { setHeight(h, CROUCH_H); h.crouching = true; }
  else if (!wantCrouch && h.crouching) { setHeight(h, STAND_H); h.crouching = false; }

  // horizontal
  let dir = 0;
  if (down('left')) dir -= 1;
  if (down('right')) dir += 1;
  if (dir !== 0) h.face = dir > 0 ? 1 : -1;
  h.vx = h.crouching ? 0 : dir * RUN;

  // attack
  if (pressed('attack') && h.attackT <= 0) { h.attackT = ATTACK_DUR; ev.attacked = true; }

  // jump with coyote-time + input buffering for a forgiving feel
  h.coyoteT = h.onGround ? COYOTE : Math.max(0, h.coyoteT - dt);
  h.jumpBufT = pressed('jump') ? BUFFER : Math.max(0, h.jumpBufT - dt);
  if (h.jumpBufT > 0 && h.coyoteT > 0) {
    h.vy = JUMP_V; h.jumpBufT = 0; h.coyoteT = 0; ev.jumped = true;
  }
  if (!down('jump') && h.vy < JUMP_CUT) h.vy = JUMP_CUT; // variable height

  // gravity + integrate (drop flag lets us pass through one-way platforms)
  h.vy = Math.min(MAX_FALL, h.vy + GRAVITY * dt);
  moveBody(h, solid, dt, oneWay, h.dropT > 0);

  if (h.attackT > 0) h.attackT -= dt;
  if (h.invulnT > 0) h.invulnT -= dt;
  h.animT += dt;
  return ev;
}

// The club's damage rect while a swing is active (null otherwise). Sized and
// placed to match the visible swing arc drawn in main.ts, reaching in front of
// and slightly above the hero.
export function attackHitbox(h: Hero): { x: number; y: number; w: number; h: number } | null {
  if (h.attackT <= 0.08 || h.attackT > ATTACK_DUR - 0.02) return null; // active mid-swing
  const w = 22, ht = 24;
  const x = h.face > 0 ? h.x + h.w - 6 : h.x - w + 6;
  return { x, y: h.y - 8, w, h: ht };
}

export function heroFrame(h: Hero): number {
  if (h.attackT > 0) {
    const p = 1 - h.attackT / ATTACK_DUR;       // 0..1 through the swing
    return 8 + Math.min(2, Math.floor(p * 3));  // frames 8,9,10
  }
  if (h.crouching) return 7;
  if (!h.onGround) return h.vy < 0 ? 5 : 6;     // jump / fall
  if (Math.abs(h.vx) > 1) return 1 + (Math.floor(h.animT * 10) % 4); // run 1-4
  return 0;                                      // idle
}

// Shared ground patrol: walk, turn at walls and ledges. One-way platforms
// count as footing for patrollers (they never drop through).
function patrol(e: Enemy, solid: SolidFn, oneWay: SolidFn, dt: number, speed: number): void {
  e.vy = Math.min(MAX_FALL, e.vy + GRAVITY * dt);
  e.vx = e.dir * speed;
  moveBody(e, solid, dt, oneWay, false);
  if (e.vx === 0) {
    e.dir = e.dir > 0 ? -1 : 1;                  // bumped a wall -> turn
  } else if (e.onGround) {
    // turn at ledges so patrollers don't walk off platforms
    const frontX = e.dir > 0 ? e.x + e.w + 1 : e.x - 1;
    const tx = Math.floor(frontX / TILE);
    const belowTy = Math.floor((e.y + e.h + 2) / TILE);
    if (!solid(tx, belowTy) && !oneWay(tx, belowTy)) e.dir = e.dir > 0 ? -1 : 1;
  }
}

// (hx,hy) is the hero's center — tigers pounce at it, vampires home on it.
export function updateEnemy(
  e: Enemy, solid: SolidFn, oneWay: SolidFn, dt: number, hx: number, hy: number,
): void {
  if (!e.alive) {
    // Defeated: pop up and arc away (no tile collision) so the hit reads clearly.
    if (e.squashT > 0) {
      e.squashT -= dt;
      e.vy = Math.min(MAX_FALL, e.vy + GRAVITY * dt);
      e.x += e.vx * dt;
      e.y += e.vy * dt;
    }
    return;
  }
  e.animT += dt;
  if (e.flashT > 0) e.flashT -= dt;

  switch (e.kind) {
    case 'tiger': {
      if (e.leaping) {
        // Airborne pounce: ballistic until touchdown, then rest.
        e.vy = Math.min(MAX_FALL, e.vy + GRAVITY * dt);
        moveBody(e, solid, dt, oneWay, false);
        if (e.onGround) { e.leaping = false; e.cooldownT = TIGER_COOLDOWN; }
        return;
      }
      if (e.windupT > 0) {
        // Crouch tell: frozen in place so the player can read the pounce coming.
        e.windupT -= dt;
        e.vx = 0;
        e.vy = Math.min(MAX_FALL, e.vy + GRAVITY * dt);
        moveBody(e, solid, dt, oneWay, false);
        if (e.windupT <= 0) {
          e.leaping = true;
          e.vx = e.dir * TIGER_LEAP_VX;
          e.vy = TIGER_LEAP_VY;
        }
        return;
      }
      if (e.cooldownT > 0) e.cooldownT -= dt;
      const dx = hx - (e.x + e.w / 2);
      const dy = hy - (e.y + e.h / 2);
      if (e.cooldownT <= 0 && e.onGround
        && Math.abs(dx) < TIGER_SIGHT_X && Math.abs(dx) > 14 && Math.abs(dy) < TIGER_SIGHT_Y) {
        e.dir = dx > 0 ? 1 : -1;   // square up on the hero, then telegraph
        e.windupT = TIGER_WINDUP;
        e.vx = 0;
        return;
      }
      patrol(e, solid, oneWay, dt, EN_TUNE.tiger.speed);
      return;
    }

    case 'flier': {
      // Airborne: sweep left-right around home on a gentle sine — no gravity,
      // no tile collision (it flies over the map).
      e.x += e.dir * EN_TUNE.flier.speed * dt;
      if (e.x > e.homeX + FLIER_RANGE) e.dir = -1;
      else if (e.x < e.homeX - FLIER_RANGE) e.dir = 1;
      e.y = e.homeY + Math.sin(e.animT * 2.2) * 16;
      return;
    }

    case 'spider': {
      if (e.climbing) {
        // On the silk: rise to the thread top, then sink back to the floor.
        e.y += e.climbDir * SPIDER_CLIMB_SPEED * dt;
        if (e.climbDir < 0 && e.y <= e.threadTop) e.climbDir = 1;
        if (e.climbDir > 0 && e.y >= e.homeY) {
          e.y = e.homeY;
          e.climbing = false;
          e.modeT = SPIDER_CRAWL_TIME;
        }
        return;
      }
      patrol(e, solid, oneWay, dt, EN_TUNE.spider.speed);
      e.modeT -= dt;
      if (e.modeT <= 0 && e.onGround) {
        // Anchor a thread where it stands and start climbing.
        e.homeY = e.y;
        e.threadTop = e.y - SPIDER_CLIMB_HEIGHT;
        e.climbing = true;
        e.climbDir = -1;
        e.vx = 0;
      }
      return;
    }

    case 'vampire': {
      const cx = e.x + e.w / 2;
      const cy = e.y + e.h / 2;
      const dx = hx - cx;
      const dy = hy - cy;
      if (e.retreatT > 0) {
        // Just ate a club hit: break off fast so the fight has rhythm.
        e.retreatT -= dt;
        e.x -= Math.sign(dx) * EN_TUNE.vampire.speed * 1.2 * dt;
        e.y -= 50 * dt;
        return;
      }
      const dist = Math.hypot(dx, dy);
      if (dist < VAMP_SIGHT) {
        // Homing swoop: fast direct pursuit with a wing-beat wobble.
        e.dir = dx > 0 ? 1 : -1;
        e.x += Math.sign(dx) * EN_TUNE.vampire.speed * dt;
        e.y += Math.max(-110, Math.min(110, dy * 2.4)) * dt
          + Math.sin(e.animT * 6) * 28 * dt;
      } else {
        // Drift back toward its lair.
        e.x += Math.sign(e.homeX - e.x) * 40 * dt;
        e.y += Math.sign(e.homeY - e.y) * 30 * dt;
      }
      return;
    }

    default:
      patrol(e, solid, oneWay, dt, EN_TUNE[e.kind].speed);
      return;
  }
}

export function enemyFrame(e: Enemy): number {
  switch (e.kind) {
    case 'spiky':
      if (!e.alive) return 2;                    // KO'd on its back
      return Math.floor(e.animT * 4) % 2;        // slow crawl
    case 'tiger':
      if (!e.alive) return 2;                    // collapsed (crouch pose)
      if (e.leaping) return 3;
      if (e.windupT > 0) return 2;               // crouch tell
      return Math.floor(e.animT * 7) % 2;        // prowl
    case 'flier':
      if (!e.alive) return 2;                    // wings-down while falling away
      return Math.floor(e.animT * 8) % 3;        // flap cycle
    case 'spider':
      if (!e.alive) return 3;                    // curled up
      if (e.climbing) return 2;                  // tucked on the silk
      return Math.floor(e.animT * 6) % 2;        // scuttle
    case 'vampire':
      if (!e.alive) return 2;                    // drooped wings
      return Math.floor(e.animT * 10) % 2;       // frantic flap
    case 'critter':
      if (!e.alive) return 4;                    // squashed
      return Math.floor(e.animT * 6) % 4;        // waddle
  }
}

// Defeat a critter, launching it up and away from `dir` (the direction of the
// blow) so the hit has visible follow-through.
export function squash(e: Enemy, dir: 1 | -1 = 1): void {
  e.alive = false;
  e.squashT = 0.7;
  e.vx = dir * 90;
  e.vy = -240;
}
