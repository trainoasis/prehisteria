// In-game HUD: score, health hearts, lives, and the level name banner.

import { A, drawFrame } from '../engine/sprites';
import { HEART_ICON } from './levels';
import { COL, text } from './ui';

export interface HudState {
  score: number;
  hp: number;
  maxHp: number;
  lives: number;
  levelName: string;
}

export function drawHud(ctx: CanvasRenderingContext2D, viewW: number, s: HudState): void {
  // Score (top-left)
  text(ctx, `SCORE ${String(s.score).padStart(6, '0')}`, 6, 5, 9, COL.gold);

  // Hearts (below score)
  for (let i = 0; i < s.maxHp; i++) {
    const full = i < s.hp;
    ctx.globalAlpha = full ? 1 : 0.28;
    drawFrame(ctx, A.items, HEART_ICON, 6 + i * 15, 18, false, 12, 12);
    ctx.globalAlpha = 1;
  }

  // Lives (top-right)
  text(ctx, `x${s.lives}`, viewW - 6, 5, 9, COL.ink, 'right');
  drawFrame(ctx, A.hero, 0, viewW - 40, 2, false, 18, 24);

  // Level name (top-center)
  text(ctx, s.levelName, viewW / 2, 6, 8, COL.green, 'center');
}
