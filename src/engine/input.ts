// Unified input: keyboard + on-screen touch buttons map to a small set of game
// Actions. Consumers ask `down()` for held state and `pressed()` for one-shot
// edges (consumed on read). Text entry (name) is handled separately in main.ts.

export type Action =
  | 'left' | 'right' | 'jump' | 'crouch' | 'attack'
  | 'pause' | 'mute' | 'confirm' | 'restart';

// Physical-position mapping (event.code) — layout-independent for QWERTY hardware.
const KEYMAP: Record<string, Action> = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
  ArrowDown: 'crouch', KeyS: 'crouch',
  KeyJ: 'attack', KeyX: 'attack', KeyK: 'attack',
  Escape: 'pause', KeyP: 'pause',
  KeyM: 'mute',
  Enter: 'confirm',
  KeyR: 'restart',
};

// Character mapping (event.key) — a fallback so non-QWERTY layouts, remappers,
// or keyboards that report unexpected `code` values still work. Keyed by the
// lowercased typed character.
const KEYCHAR: Record<string, Action> = {
  a: 'left', d: 'right', w: 'jump', s: 'crouch',
  j: 'attack', x: 'attack', k: 'attack',
  p: 'pause', m: 'mute', r: 'restart',
  arrowleft: 'left', arrowright: 'right', arrowup: 'jump', arrowdown: 'crouch',
  ' ': 'jump', escape: 'pause', enter: 'confirm',
};

function resolve(e: KeyboardEvent): Action | undefined {
  return KEYMAP[e.code] ?? KEYCHAR[(e.key || '').toLowerCase()];
}

const held = new Set<Action>();
const edges = new Set<Action>();

// Debug: the last raw key seen (mapped or not) so a diagnostic overlay can show
// whether a keypress is even reaching the game.
let lastKey = '';
export function debugInfo(): { held: string[]; last: string } {
  return { held: Array.from(held), last: lastKey };
}

// Called on the first real user gesture so main.ts can unlock audio.
let firstGesture: (() => void) | null = null;
export function onFirstGesture(cb: () => void): void { firstGesture = cb; }
function gesture(): void { if (firstGesture) { firstGesture(); firstGesture = null; } }

function press(a: Action): void { held.add(a); edges.add(a); gesture(); }
function release(a: Action): void { held.delete(a); }

export function initInput(): void {
  window.addEventListener('keydown', (e) => {
    lastKey = `${e.code}/${e.key}`;
    const a = resolve(e);
    if (!a) return;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (!e.repeat) press(a);
  });
  window.addEventListener('keyup', (e) => {
    const a = resolve(e);
    if (a) release(a);
  });

  // On-screen touch pad (buttons carry data-key matching an Action-ish name).
  const map: Record<string, Action> = {
    left: 'left', right: 'right', down: 'crouch', jump: 'jump', attack: 'attack',
  };
  document.querySelectorAll<HTMLElement>('#touch .btn').forEach((btn) => {
    const a = map[btn.dataset.key ?? ''];
    if (!a) return;
    const on = (e: Event) => { e.preventDefault(); press(a); };
    const off = (e: Event) => { e.preventDefault(); release(a); };
    btn.addEventListener('touchstart', on, { passive: false });
    btn.addEventListener('touchend', off, { passive: false });
    btn.addEventListener('touchcancel', off, { passive: false });
    // pointer fallback for mouse testing
    btn.addEventListener('mousedown', on);
    btn.addEventListener('mouseup', off);
    btn.addEventListener('mouseleave', off);
  });

  // Reveal touch controls only on touch-capable devices.
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    document.getElementById('touch')?.classList.add('on');
  }
}

export function down(a: Action): boolean { return held.has(a); }

// True at most once per physical press.
export function pressed(a: Action): boolean {
  if (edges.has(a)) { edges.delete(a); return true; }
  return false;
}

// Drop any pending edges (e.g. when changing screens so a click doesn't leak).
export function clearEdges(): void { edges.clear(); }
