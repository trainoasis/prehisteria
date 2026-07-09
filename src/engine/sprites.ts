// Asset loading + frame-strip drawing. All sheets are horizontal strips of
// fixed-size frames (see scripts/gen-art.py for the source art).

export interface Sheet {
  img: HTMLImageElement;
  fw: number;        // frame width
  fh: number;        // frame height
  frames: number;    // computed once loaded
  ready: boolean;
}

function sheet(src: string, fw: number, fh: number): Sheet {
  const img = new Image();
  const s: Sheet = { img, fw, fh, frames: 1, ready: false };
  img.onload = () => {
    s.frames = Math.max(1, Math.floor(img.width / fw));
    s.ready = true;
  };
  img.src = src;
  return s;
}

// The full asset table. Frame sizes MUST match scripts/gen-art.py.
export const A = {
  hero: sheet('/hero.png', 24, 32),
  enemy: sheet('/enemy.png', 24, 24),
  spiky: sheet('/spiky.png', 24, 24),
  tiger: sheet('/tiger.png', 32, 24),
  flier: sheet('/flier.png', 24, 24),
  spider: sheet('/spider.png', 24, 24),
  vampire: sheet('/vampire.png', 24, 24),
  checkpoint: sheet('/checkpoint.png', 24, 32),
  fg: sheet('/tiles_fg.png', 24, 24),
  bg: sheet('/tiles_bg.png', 24, 24),
  far: sheet('/tiles_far.png', 24, 24),
  front: sheet('/tiles_front.png', 24, 24),
  items: sheet('/items.png', 16, 16),
  flag: sheet('/flag.png', 24, 48),
};

export function allReady(): boolean {
  return Object.values(A).every((s) => s.ready);
}

// Draw frame `index` of a sheet at (dx,dy). `flip` mirrors horizontally around
// the frame's own width. dw/dh default to the native frame size.
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  s: Sheet,
  index: number,
  dx: number,
  dy: number,
  flip = false,
  dw = s.fw,
  dh = s.fh,
): void {
  if (!s.ready) return;
  const sx = index * s.fw;
  if (flip) {
    ctx.save();
    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(s.img, sx, 0, s.fw, s.fh, 0, 0, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(s.img, sx, 0, s.fw, s.fh, dx, dy, dw, dh);
  }
}
