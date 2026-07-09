// Level authoring. A level is one hand-drawn ASCII grid for the foreground
// (terrain + entity spawns), plus a procedurally-built DENSE jungle background
// grid so the backdrop is lush without hand-drawing a second grid. Foreground
// solidity is defined here.
//
// Foreground symbols:
//   ' '  empty            '='  ground top (grassy)     '#'  ground fill (dirt)
//   '-'  stone platform (SOLID — blocks every direction)
//   '~'  wooden ledge (ONE-WAY: jump up through it, press down to drop through)
//   '^'  spikes (hazard)
//   '@'  player spawn       'F'  goal totem     'C'  checkpoint totem
//   'E'  critter (stompable)  'S'  spiky (club only!)  'T'  tiger (pounces)
//   'B'  flier (airborne)     'P'  spider (crawls+climbs)  'V'  vampire (fast!)
//   'f'  fruit  'm'  meat  'e'  egg  'g'  gem   (pickups)
// Entity symbols occupy an otherwise-empty tile.

import { type Grid } from '../engine/tilemap';
import { type EnemyKind } from './entities';

// Foreground tilesheet frame indices (+1 when stored in a grid; 0 = empty).
export const FG = { GROUND_TOP: 1, GROUND_FILL: 2, PLATFORM: 3, SPIKES: 4, LEDGE: 5 } as const;
// Background tilesheet frame indices.
const BG = { LEAF: 0, LEAF_DARK: 1, TRUNK: 2, VINES: 3, CANOPY: 4, FERN: 5 } as const;

export type PickupKind = 'fruit' | 'meat' | 'egg' | 'gem';

export interface LevelData {
  name: string;
  fg: Grid;
  bg: Grid;
  front: Grid;   // decorative foliage drawn IN FRONT of entities (depth)
  cols: number;
  rows: number;
  spawn: { x: number; y: number };
  goal: { x: number; y: number };
  checkpoints: { x: number; y: number }[];   // mid-level respawn totems
  enemies: { x: number; y: number; kind: EnemyKind }[];
  pickups: { x: number; y: number; kind: PickupKind }[];
}

// Hard solids block every direction (spikes are NOT solid — they hurt).
// Only wooden LEDGES are one-way: land from above, jump through from below,
// press down to drop through. Stone platforms are as solid as the ground.
export function isSolidFg(id: number): boolean {
  return id === FG.GROUND_TOP || id === FG.GROUND_FILL || id === FG.PLATFORM;
}
export function isOneWayFg(id: number): boolean { return id === FG.LEDGE; }
export function isSpike(id: number): boolean { return id === FG.SPIKES; }

// -- Level 1: "Vine Canyon" ----------------------------------------------------
// 144 wide x 26 tall - seven ground segments split by BOTTOMLESS 3-tile pits.
// A gem tower, a wooden ridge road above a prowling tiger, a platform maze over
// spikes, a tiger den with a baited perch, a spike gauntlet with 1-wide hops,
// and a final 4-tier climb to the goal. Wooden '~' ledges are the only
// drop-through surfaces (intro ledge, ridge road, den perch) — stone '-' is
// solid. SECRET: a wooden patch in the grass at cols 75-76 drops (press down
// twice) into a hidden treasure chamber under segment D; ledge stairs inside
// climb back out through the entrance. Checkpoints C, enemies E/S/T/B/P/V.
const L1 = [
  '                                                                                                                                                ',
  '                                                                                                                                                ',
  '                                                                                                                                                ',
  '                                                                                                                                                ',
  '                                                                                                                                                ',
  '                                                                                                                                                ',
  '                                                                                                                                                ',
  '                                                                                                                                                ',
  '                                g                                                                                                            F  ',
  '                               ---                                                                                                          --- ',
  '                            e                    f                    e                                                                   f     ',
  '                           ---                  ~~~                  ---                                                                 ---    ',
  '                        E                    f       f                    f                m  B                                    V  E         ',
  '                       ---                B ~~~     ~~~          ---     ---              ~~~                                        ---        ',
  '            m                                                     m                                             f     e                         ',
  '           ~~~     ---                  ~~~                  ---                       ~~                       -     -          ---            ',
  '  @  f  E f        f      S              m     T      Ce        S        P  T      Cf T    S e  T  f      CS     E   P E    m     m             ',
  '===============   =================   =====^^=====^^=====   ========^^^====~~==   =====================   ===^^====^^====^^==   ================',
  '###############   #################   ###################   ###############~~##   #####################   ###################   ################',
  '                                                                        #     #                                                                 ',
  '                                                                        #   ~~#                                                                 ',
  '                                                                        #     #                                                                 ',
  '                                                                        #~~   #                                                                 ',
  '                                                                        #mSg f#                                                                 ',
  '                                                                        #######                                                                 ',
  '                                                                                                                                                ',
];

function symToFg(c: string): number {
  switch (c) {
    case '=': return FG.GROUND_TOP;
    case '#': return FG.GROUND_FILL;
    case '-': return FG.PLATFORM;
    case '~': return FG.LEDGE;
    case '^': return FG.SPIKES;
    default: return 0;
  }
}

// Deterministic hash for procedural background variety (no Math.random so the
// jungle looks identical every load).
function hash(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

// Build a dense jungle backdrop the full size of the level: canopy along the
// top, occasional trunk and vine columns, leaf fill everywhere else, ferns low.
function buildJungleBg(cols: number, rows: number): Grid {
  const g: Grid = [];
  for (let y = 0; y < rows; y++) {
    const row: number[] = [];
    for (let x = 0; x < cols; x++) {
      let id: number;
      if (y <= 1) id = BG.CANOPY;
      else if (x % 9 === 3) id = BG.TRUNK;
      else if (x % 13 === 7) id = BG.VINES;
      else {
        const h = hash(x, y);
        id = h < 0.16 ? BG.LEAF_DARK : (y >= rows - 3 && h > 0.75 ? BG.FERN : BG.LEAF);
      }
      row.push(id + 1);
    }
    g.push(row);
  }
  return g;
}

// Front tilesheet frame indices: 0 fern, 1 hanging frond, 2 tall grass.
// Scatter foliage over the play plane: ferns/grass on walkable surfaces
// (occluding feet) and fronds draping from the canopy — the "in front" layer
// that, with the dimmed backdrop behind, gives the scene its depth sandwich.
function buildFrontLayer(fg: Grid, cols: number, rows: number): Grid {
  const g: Grid = [];
  for (let y = 0; y < rows; y++) g.push(new Array<number>(cols).fill(0));
  for (let x = 0; x < cols; x++) {
    if (hash(x, 991) < 0.34) g[0][x] = 2;                 // canopy frond fringe
    for (let y = 1; y < rows; y++) {
      const isTop = fg[y][x] === FG.GROUND_TOP || fg[y][x] === FG.PLATFORM;
      if (isTop && fg[y - 1][x] === 0) {
        const h = hash(x, y);
        if (h < 0.16) g[y - 1][x] = 1;                    // fern at the feet
        else if (h < 0.34) g[y - 1][x] = 3;               // tall grass
      }
    }
  }
  return g;
}

function parse(name: string, rows: string[]): LevelData {
  const cols = Math.max(...rows.map((r) => r.length));
  const fg: Grid = [];
  const spawn = { x: 24, y: 24 };
  const goal = { x: 0, y: 0 };
  const checkpoints: { x: number; y: number }[] = [];
  const enemies: { x: number; y: number; kind: EnemyKind }[] = [];
  const pickups: { x: number; y: number; kind: PickupKind }[] = [];
  const T = 24;

  for (let y = 0; y < rows.length; y++) {
    const line = rows[y].padEnd(cols, ' ');
    const frow: number[] = [];
    for (let x = 0; x < cols; x++) {
      const c = line[x];
      frow.push(symToFg(c));
      const wx = x * T;
      const wy = y * T;
      switch (c) {
        case '@': spawn.x = wx; spawn.y = wy; break;
        case 'F': goal.x = wx; goal.y = wy; break;
        case 'C': checkpoints.push({ x: wx, y: wy }); break;
        case 'E': enemies.push({ x: wx, y: wy, kind: 'critter' }); break;
        case 'S': enemies.push({ x: wx, y: wy, kind: 'spiky' }); break;
        case 'T': enemies.push({ x: wx, y: wy, kind: 'tiger' }); break;
        case 'B': enemies.push({ x: wx, y: wy, kind: 'flier' }); break;
        case 'P': enemies.push({ x: wx, y: wy, kind: 'spider' }); break;
        case 'V': enemies.push({ x: wx, y: wy, kind: 'vampire' }); break;
        case 'f': pickups.push({ x: wx, y: wy, kind: 'fruit' }); break;
        case 'm': pickups.push({ x: wx, y: wy, kind: 'meat' }); break;
        case 'e': pickups.push({ x: wx, y: wy, kind: 'egg' }); break;
        case 'g': pickups.push({ x: wx, y: wy, kind: 'gem' }); break;
        default: break;
      }
    }
    fg.push(frow);
  }

  return {
    name, fg, bg: buildJungleBg(cols, rows.length),
    front: buildFrontLayer(fg, cols, rows.length),
    cols, rows: rows.length, spawn, goal, checkpoints, enemies, pickups,
  };
}

export function loadLevel(): LevelData {
  return parse('VINE CANYON', L1);
}

// Score value per pickup kind + its icon index into the `items` sheet.
export const PICKUP_INFO: Record<PickupKind, { score: number; icon: number }> = {
  fruit: { score: 100, icon: 0 },
  meat: { score: 250, icon: 1 },
  egg: { score: 150, icon: 2 },
  gem: { score: 1000, icon: 3 },
};
export const HEART_ICON = 4;
