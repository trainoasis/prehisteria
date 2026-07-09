// Shared text + panel drawing for HUD and overlay screens. Everything renders
// into the small internal framebuffer, then main.ts integer-scales it up, so a
// plain monospace font stays crisp and blocky.

export const COL = {
  ink: '#f4ecd8',
  shadow: '#20180f',
  gold: '#ffd23f',
  green: '#78b648',
  red: '#e63e52',
  dim: '#a8a08c',
} as const;

export function text(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  size = 8,
  color: string = COL.ink,
  align: CanvasTextAlign = 'left',
): void {
  ctx.font = `${size}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillStyle = COL.shadow;
  ctx.fillText(str, x + 1, y + 1);   // 1px drop shadow for legibility
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

export function panel(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
): void {
  ctx.fillStyle = 'rgba(18,26,14,0.82)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(244,236,216,0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}
