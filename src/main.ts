// Prehisteria — bootstrap, state machine, and the fixed-timestep loop.
// All simulation happens in step(FIXED_DT); rendering reads state only.

import { clearEdges, debugInfo, down, initInput, onFirstGesture, pressed } from './engine/input';
import { initAudio, play, toggleMuted, isMuted } from './engine/audio';
import { overlaps } from './engine/physics';
import { A, allReady, drawFrame } from './engine/sprites';
import { TILE, drawFarHills, drawGrid, tileAt } from './engine/tilemap';
import {
  EN_TUNE, attackHitbox, canStomp, enemyFrame, heroFrame, makeEnemy, makeHero,
  makePickup, squash, updateEnemy, updateHero, type Enemy, type Hero, type Pickup,
} from './game/entities';
import {
  PICKUP_INFO, isOneWayFg, isSolidFg, isSpike, loadLevel, type LevelData,
} from './game/levels';
import { drawArmClub, drawPop, POP_LIFE, type Pop } from './game/effects';
import { drawHud } from './game/hud';
import {
  drawComplete, drawGameOver, drawLeaderboard, drawNameEntry, drawPause, drawTitle,
} from './game/screens';
import { load as loadScores, qualifies, submit, type Score } from './leaderboard';

const VIEW_W = 480;
const VIEW_H = 270;
const MAX_HP = 3;
const START_LIVES = 3;
const DEBUG = location.search.includes('debug'); // ?debug shows an input readout

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
canvas.width = VIEW_W;
canvas.height = VIEW_H;

// Integer-scale the framebuffer to fit the window (letterboxed by the CSS grid).
function resize(): void {
  const scale = Math.max(1, Math.floor(Math.min(
    window.innerWidth / VIEW_W, window.innerHeight / VIEW_H,
  )));
  canvas.style.width = `${VIEW_W * scale}px`;
  canvas.style.height = `${VIEW_H * scale}px`;
  ctx.imageSmoothingEnabled = false; // context resets smoothing on size change
}
window.addEventListener('resize', resize);
resize();
ctx.imageSmoothingEnabled = false;

// ---------------------------------------------------------------------------
type State = 'title' | 'playing' | 'paused' | 'complete' | 'gameover' | 'entername' | 'leaderboard';

let level: LevelData = loadLevel();
let worldW = level.cols * TILE;
let worldH = level.rows * TILE;

let hero: Hero;
let enemies: Enemy[] = [];
let pickups: Pickup[] = [];
let score = 0;
let lives = START_LIVES;
let camX = 0, camY = 0;
let state: State = 'title';
let clock = 0;                 // wall-clock seconds, for blink/anim only
let scores: Score[] = [];
let highlight = -1;
let nameEntry = '';

// Juice: brief freeze + camera shake + impact sparks on a hit.
let hitstop = 0;
let shake = 0;
let pops: Pop[] = [];

function onHit(x: number, y: number): void {
  hitstop = 0.055;
  shake = 5;
  pops.push({ x, y, t: POP_LIFE });
}

const solid = (tx: number, ty: number) => isSolidFg(tileAt(level.fg, tx, ty));
const oneWay = (tx: number, ty: number) => isOneWayFg(tileAt(level.fg, tx, ty));

// Checkpoints: passing a totem lights it and moves the respawn point there.
// Dying respawns at the last lit totem with full hearts — but collected
// pickups STAY collected (no re-farming) while enemies come back.
let activatedCp = new Set<number>();
let respawnAt = { x: 0, y: 0 };

function spawnHero(at: { x: number; y: number }): void {
  hero = makeHero(at.x + (TILE - 14) / 2, at.y + (TILE - 22));
  hero.hp = MAX_HP;
  hero.invulnT = 1.0;   // brief grace so a camping enemy can't chain-hit
  enemies = level.enemies.map((e) => makeEnemy(e.x, e.y, e.kind));
  pops = [];
  shake = 0;
  hitstop = 0;
  centerCamera();
}

function startNewGame(): void {
  score = 0;
  lives = START_LIVES;
  level = loadLevel();
  worldW = level.cols * TILE;
  worldH = level.rows * TILE;
  activatedCp = new Set();
  respawnAt = level.spawn;
  pickups = level.pickups.map((p) => makePickup(p.x, p.y, p.kind));
  spawnHero(respawnAt);
  state = 'playing';
}

function centerCamera(): void {
  camX = clamp(hero.x + hero.w / 2 - VIEW_W / 2, 0, Math.max(0, worldW - VIEW_W));
  camY = clamp(hero.y + hero.h / 2 - VIEW_H / 2, 0, Math.max(0, worldH - VIEW_H));
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// --- damage / death ---
function hurtHero(fromX: number): void {
  if (hero.invulnT > 0) return;
  hero.hp -= 1;
  hero.invulnT = 1.3;
  hero.vy = -180;
  hero.vx = hero.x < fromX ? -140 : 140;
  play('hurt');
  if (hero.hp <= 0) loseLife();
}

function loseLife(): void {
  lives -= 1;
  if (lives <= 0) { finishRun(); return; }
  spawnHero(respawnAt);   // back to the last lit checkpoint, hearts refilled
}

function levelComplete(): void {
  score += 500 + hero.hp * 150;    // clear bonus + surviving health
  play('complete');
  state = 'complete';
}

async function finishRun(): Promise<void> {
  if (await qualifies(score)) {
    nameEntry = '';
    state = 'entername';
  } else {
    scores = await loadScores();
    highlight = -1;
    state = 'leaderboard';
  }
}

// ---------------------------------------------------------------------------
// Simulation (fixed dt). Only runs while playing.
// Kill payout scales with stomps landed before the finishing blow — bouncing
// on a tough enemy repeatedly pays off when it finally goes down.
function killScore(e: Enemy): number {
  return EN_TUNE[e.kind].score * (1 + e.stomps);
}

function step(dt: number): void {
  const ev = updateHero(hero, solid, oneWay, dt);
  if (ev.jumped) play('jump');
  if (ev.attacked) play('attack');

  const hcx = hero.x + hero.w / 2;
  const hcy = hero.y + hero.h / 2;
  for (const e of enemies) updateEnemy(e, solid, oneWay, dt, hcx, hcy);

  // checkpoints: light the totem and move the respawn point
  level.checkpoints.forEach((cp, i) => {
    if (activatedCp.has(i)) return;
    if (Math.abs(hcx - (cp.x + TILE / 2)) < 18 && Math.abs(hcy - (cp.y + TILE / 2)) < 40) {
      activatedCp.add(i);
      respawnAt = cp;
      play('checkpoint');
      pops.push({ x: cp.x + TILE / 2, y: cp.y, t: POP_LIFE });
    }
  });

  // club swing vs enemies — the club works on ALL kinds. Tough enemies
  // (vampire) soak hits: knockback + flash until their clubHp runs out.
  const hb = attackHitbox(hero);
  if (hb) {
    for (const e of enemies) {
      if (!e.alive || e.flashT > 0) continue;
      if (!overlaps(hb.x, hb.y, hb.w, hb.h, e.x, e.y, e.w, e.h)) continue;
      e.clubHp -= 1;
      if (e.clubHp <= 0) {
        score += killScore(e);
        squash(e, hero.face);
      } else {
        e.flashT = 0.3;
        if (e.kind === 'vampire') e.retreatT = 0.5;   // driven off, regroups
      }
      play('hit');
      onHit(e.x + e.w / 2, e.y + e.h / 2);
    }
  }

  // hero vs enemies: stomp from above (spiky spines and the vampire punish
  // it), else take damage. Held jump = springboard bounce. Multi-stomp
  // enemies (tiger, spider) score +50 per bounce and a scaled kill bounty.
  for (const e of enemies) {
    if (!e.alive) continue;
    if (!overlaps(hero.x, hero.y, hero.w, hero.h, e.x, e.y, e.w, e.h)) continue;
    const stomping = hero.vy > 0 && hero.y + hero.h - e.y < 12;
    if (stomping && canStomp(e)) {
      e.stomps += 1;
      hero.vy = down('jump') ? -340 : -240;   // held jump = springboard bounce
      if (e.stomps >= EN_TUNE[e.kind].stompHp) {
        score += killScore(e);    // base kill value scaled by stomps landed
        squash(e, hero.face);
      } else {
        score += 50;
        e.flashT = 0.35;    // dazed — brief immunity so one fall can't double-hit
      }
      play('hit');
      onHit(e.x + e.w / 2, e.y);
    } else if (e.flashT <= 0) {
      hurtHero(e.x + e.w / 2);
    }
  }

  // pickups
  for (const p of pickups) {
    if (p.taken) continue;
    if (overlaps(hero.x, hero.y, hero.w, hero.h, p.x, p.y, 14, 14)) {
      p.taken = true;
      const info = PICKUP_INFO[p.kind];
      score += info.score;
      play(p.kind === 'gem' ? 'gem' : 'collect');
    }
  }

  // spikes — any spike tile the hero overlaps hurts
  const tx0 = Math.floor(hero.x / TILE), tx1 = Math.floor((hero.x + hero.w - 1) / TILE);
  const ty0 = Math.floor(hero.y / TILE), ty1 = Math.floor((hero.y + hero.h - 1) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (isSpike(tileAt(level.fg, tx, ty))) hurtHero(hero.x + hero.w / 2);
    }
  }

  // fell into a pit
  if (hero.y > worldH + 40) { hero.hp = 0; loseLife(); return; }

  // reached the goal totem
  if (overlaps(hero.x, hero.y, hero.w, hero.h,
    level.goal.x, level.goal.y - TILE, TILE, TILE * 2)) {
    levelComplete();
    return;
  }

  centerCamera();
}

// ---------------------------------------------------------------------------
// Rendering
function drawSky(): void {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, '#8fd0d8');
  g.addColorStop(0.5, '#bfe3a8');
  g.addColorStop(1, '#7fb46a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function drawWorld(): void {
  drawSky();
  drawFarHills(ctx, camX, VIEW_W, VIEW_H, worldH - camY - TILE * 4);

  const sx = shake > 0.1 ? (Math.random() * 2 - 1) * shake : 0;
  const sy = shake > 0.1 ? (Math.random() * 2 - 1) * shake : 0;
  ctx.save();
  ctx.translate(-Math.round(camX) + sx, -Math.round(camY) + sy);

  drawGrid(ctx, A.bg, level.bg, camX, camY, VIEW_W, VIEW_H);   // dense jungle

  // Depth veil: dim everything behind the play plane (sky, hills, jungle) so
  // the collision terrain, entities, and front foliage pop forward. Margin
  // covers the shake offset.
  ctx.fillStyle = 'rgba(8, 18, 10, 0.24)';
  ctx.fillRect(camX - 8, camY - 8, VIEW_W + 16, VIEW_H + 16);

  drawGrid(ctx, A.fg, level.fg, camX, camY, VIEW_W, VIEW_H);   // collision terrain

  // goal totem (base sits on its tile)
  drawFrame(ctx, A.flag, 0, level.goal.x, level.goal.y + TILE - 48);

  // checkpoint totems: dormant stone until passed, then lit with a flame
  level.checkpoints.forEach((cp, i) => {
    drawFrame(ctx, A.checkpoint, activatedCp.has(i) ? 1 : 0, cp.x, cp.y + TILE - 32);
  });

  // pickups (gentle bob)
  for (const p of pickups) {
    if (p.taken) continue;
    const by = p.y + Math.sin(clock * 3 + p.bob) * 2;
    drawFrame(ctx, A.items, PICKUP_INFO[p.kind].icon, p.x, Math.round(by), false, 16, 16);
  }

  // enemies — sheet chosen per kind (all frames drawn facing right; flip left).
  // A hit-flashed enemy blinks; a climbing spider hangs from its silk thread.
  const SHEETS = {
    critter: A.enemy, spiky: A.spiky, tiger: A.tiger,
    flier: A.flier, spider: A.spider, vampire: A.vampire,
  } as const;
  for (const e of enemies) {
    if (!e.alive && e.squashT <= 0) continue;
    if (e.flashT > 0 && Math.floor(clock * 24) % 2 === 0) continue;
    if (e.kind === 'spider' && e.climbing) {
      ctx.strokeStyle = 'rgba(235,235,235,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(e.x + e.w / 2) + 0.5, e.threadTop - 20);
      ctx.lineTo(Math.round(e.x + e.w / 2) + 0.5, Math.round(e.y + 4));
      ctx.stroke();
    }
    const sheet = SHEETS[e.kind];
    const dx = e.x + e.w / 2 - sheet.fw / 2;
    const dy = e.y + e.h - sheet.fh;
    drawFrame(ctx, sheet, enemyFrame(e), Math.round(dx), Math.round(dy), e.dir > 0);
  }

  // hero + his club-arm (blink together while invulnerable). The arm-club is
  // drawn procedurally on top so the club is continuous across all states.
  const blink = hero.invulnT > 0 && Math.floor(clock * 20) % 2 === 0;
  if (!blink) {
    const dx = hero.x + hero.w / 2 - 12;
    const dy = hero.y + hero.h - 32;
    drawFrame(ctx, A.hero, heroFrame(hero), Math.round(dx), Math.round(dy), hero.face < 0);
    drawArmClub(ctx, hero);
  }

  // front foliage — drawn OVER entities so feet disappear into ferns/grass and
  // fronds drape across the top: the "in front" half of the depth sandwich.
  drawGrid(ctx, A.front, level.front, camX, camY, VIEW_W, VIEW_H);

  // impact sparks (always on top so hits stay readable)
  for (const p of pops) drawPop(ctx, p);

  ctx.restore();
}

function draw(): void {
  if (!allReady()) {
    ctx.fillStyle = '#0b0f0a';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#f4ecd8';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('loading…', VIEW_W / 2, VIEW_H / 2);
    return;
  }

  drawWorld();

  if (state !== 'title') {
    drawHud(ctx, VIEW_W, {
      score, hp: Math.max(0, hero.hp), maxHp: MAX_HP, lives: Math.max(0, lives),
      levelName: level.name,
    });
  }

  switch (state) {
    case 'title': drawTitle(ctx, VIEW_W, VIEW_H, clock); break;
    case 'paused': drawPause(ctx, VIEW_W, VIEW_H, isMuted()); break;
    case 'complete': drawComplete(ctx, VIEW_W, VIEW_H, score); break;
    case 'gameover': drawGameOver(ctx, VIEW_W, VIEW_H, score); break;
    case 'entername': drawNameEntry(ctx, VIEW_W, VIEW_H, nameEntry, clock); break;
    case 'leaderboard': drawLeaderboard(ctx, VIEW_W, VIEW_H, scores, highlight); break;
    case 'playing': break;
  }

  if (DEBUG) {
    const d = debugInfo();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, VIEW_H - 26, VIEW_W, 26);
    ctx.fillStyle = '#7fff7f';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`state:${state}  held:[${d.held.join(',')}]`, 4, VIEW_H - 24);
    ctx.fillText(`last key:${d.last}`, 4, VIEW_H - 13);
  }
}

// ---------------------------------------------------------------------------
// Menu input: a tap on the canvas counts as "confirm" in menu states.
let tapped = false;
canvas.addEventListener('pointerdown', () => { initAudio(); tapped = true; });
function confirmPressed(): boolean {
  if (pressed('confirm')) return true;
  if (tapped) { tapped = false; return true; }
  return false;
}

// Name entry has its own key handling so letters don't collide with gameplay.
window.addEventListener('keydown', (e) => {
  if (state !== 'entername') return;
  if (e.key === 'Enter') {
    void submitName();
  } else if (e.key === 'Backspace') {
    nameEntry = nameEntry.slice(0, -1);
  } else if (/^[a-zA-Z0-9 ]$/.test(e.key) && nameEntry.length < 8) {
    nameEntry += e.key.toUpperCase();
  }
});

async function submitName(): Promise<void> {
  scores = await submit(nameEntry, score);
  highlight = scores.findIndex(
    (s) => s.name === (nameEntry.trim() || 'BRKO').toUpperCase().slice(0, 8) && s.score === score,
  );
  state = 'leaderboard';
}

function handleMenus(): void {
  if (pressed('mute')) toggleMuted();

  switch (state) {
    case 'title':
      if (confirmPressed()) { play('select'); startNewGame(); }
      break;
    case 'playing':
      if (pressed('pause')) { play('select'); state = 'paused'; }
      break;
    case 'paused':
      if (pressed('pause')) state = 'playing';
      else if (pressed('restart')) startNewGame();
      break;
    case 'complete':
      if (confirmPressed()) void finishRun();
      break;
    case 'gameover':
      if (confirmPressed()) void finishRun();
      break;
    case 'leaderboard':
      if (confirmPressed()) { clearEdges(); state = 'title'; }
      break;
    case 'entername':
      // handled by the dedicated keydown listener above
      break;
  }
}

// ---------------------------------------------------------------------------
// Fixed-timestep loop.
const FIXED_DT = 1 / 120;
let acc = 0;
let last = performance.now() / 1000;

function frame(): void {
  const now = performance.now() / 1000;
  let dt = now - last;
  last = now;
  if (dt > 0.1) dt = 0.1;      // clamp tab-away spikes
  clock += dt;

  handleMenus();

  if (hitstop > 0) {
    hitstop -= dt;                 // freeze the sim briefly so the blow lands hard
  } else if (state === 'playing') {
    acc += dt;
    while (acc >= FIXED_DT) { step(FIXED_DT); acc -= FIXED_DT; }
  } else {
    acc = 0;
  }

  // decay visual juice (wall-clock; never feeds back into physics)
  shake = Math.max(0, shake - 60 * dt);
  if (pops.length) {
    for (const p of pops) p.t -= dt;
    pops = pops.filter((p) => p.t > 0);
  }

  draw();
  requestAnimationFrame(frame);
}

initInput();
onFirstGesture(initAudio);
// Boot with a populated world so the title screen has a scene behind it.
respawnAt = level.spawn;
pickups = level.pickups.map((p) => makePickup(p.x, p.y, p.kind));
spawnHero(respawnAt);
requestAnimationFrame(frame);
