// Full-screen overlay screens: title, pause, level-complete, game-over, name
// entry, and the leaderboard. Each draws over the (already-rendered) world.

import { A, drawFrame } from '../engine/sprites';
import { type Score } from '../leaderboard';
import { COL, panel, text } from './ui';

function dim(ctx: CanvasRenderingContext2D, w: number, h: number, a = 0.55): void {
  ctx.fillStyle = `rgba(6,10,6,${a})`;
  ctx.fillRect(0, 0, w, h);
}

export function drawTitle(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  dim(ctx, w, h, 0.35);
  drawFrame(ctx, A.hero, 0, w / 2 - 24, h / 2 - 78, false, 48, 64);
  text(ctx, 'PREHISTERIA', w / 2, h / 2 - 6, 22, COL.gold, 'center');
  text(ctx, 'the caveman brko', w / 2, h / 2 + 20, 9, COL.green, 'center');
  if (Math.floor(t * 2) % 2 === 0) {
    text(ctx, 'PRESS ENTER / TAP TO START', w / 2, h / 2 + 44, 9, COL.ink, 'center');
  }
  text(ctx, 'move  ◀ ▶    jump  ▲ / space    club  J / X', w / 2, h - 34, 7, COL.dim, 'center');
  text(ctx, 'crouch  ▼     pause  ESC     mute  M', w / 2, h - 22, 7, COL.dim, 'center');
}

export function drawPause(ctx: CanvasRenderingContext2D, w: number, h: number, mutedOn: boolean): void {
  dim(ctx, w, h);
  text(ctx, 'PAUSED', w / 2, h / 2 - 20, 18, COL.ink, 'center');
  text(ctx, 'ESC resume    R restart    M mute', w / 2, h / 2 + 8, 8, COL.dim, 'center');
  if (mutedOn) text(ctx, '(muted)', w / 2, h / 2 + 22, 8, COL.red, 'center');
}

export function drawComplete(
  ctx: CanvasRenderingContext2D, w: number, h: number, score: number,
): void {
  dim(ctx, w, h);
  text(ctx, 'LEVEL CLEAR!', w / 2, h / 2 - 30, 20, COL.gold, 'center');
  text(ctx, `SCORE  ${score}`, w / 2, h / 2, 12, COL.ink, 'center');
  text(ctx, 'PRESS ENTER', w / 2, h / 2 + 26, 9, COL.green, 'center');
}

export function drawGameOver(ctx: CanvasRenderingContext2D, w: number, h: number, score: number): void {
  dim(ctx, w, h, 0.65);
  text(ctx, 'GAME OVER', w / 2, h / 2 - 26, 20, COL.red, 'center');
  text(ctx, `SCORE  ${score}`, w / 2, h / 2 + 2, 11, COL.ink, 'center');
  text(ctx, 'PRESS ENTER', w / 2, h / 2 + 26, 9, COL.dim, 'center');
}

export function drawNameEntry(
  ctx: CanvasRenderingContext2D, w: number, h: number, name: string, t: number,
): void {
  dim(ctx, w, h, 0.7);
  text(ctx, 'NEW HIGH SCORE!', w / 2, h / 2 - 40, 16, COL.gold, 'center');
  text(ctx, 'ENTER YOUR NAME', w / 2, h / 2 - 14, 9, COL.dim, 'center');
  const caret = Math.floor(t * 2) % 2 === 0 ? '_' : ' ';
  panel(ctx, w / 2 - 60, h / 2 + 2, 120, 24);
  text(ctx, name + caret, w / 2, h / 2 + 8, 14, COL.ink, 'center');
  text(ctx, 'A-Z type   ENTER confirm', w / 2, h / 2 + 34, 8, COL.dim, 'center');
}

export function drawLeaderboard(
  ctx: CanvasRenderingContext2D, w: number, h: number, scores: Score[], highlight: number,
): void {
  dim(ctx, w, h, 0.7);
  text(ctx, 'HIGH SCORES', w / 2, 22, 18, COL.gold, 'center');
  const x0 = w / 2 - 78;
  let y = 58;
  if (scores.length === 0) {
    text(ctx, 'no scores yet — go get one!', w / 2, y, 9, COL.dim, 'center');
  }
  scores.forEach((s, i) => {
    const c = i === highlight ? COL.gold : COL.ink;
    text(ctx, `${String(i + 1).padStart(2, ' ')}.`, x0, y, 9, c);
    text(ctx, s.name, x0 + 26, y, 9, c);
    text(ctx, String(s.score).padStart(6, '0'), x0 + 156, y, 9, c, 'right');
    y += 14;
  });
  text(ctx, 'PRESS ENTER TO PLAY AGAIN', w / 2, h - 20, 8, COL.green, 'center');
}
