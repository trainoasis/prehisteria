# Working on Prehisteria

## What this is
An original browser platformer (Brko the caveman). **Everything is original** — art,
characters, level design, code. Never extract, trace, or "minorly tweak" assets from any
existing game, and never bundle a commercial ROM/binary. If it looks like it came from
another game, it doesn't belong here.

## Architecture
Deliberately modular — do NOT dump everything into one file.

- `src/engine/` — reusable, game-agnostic systems:
  - `input.ts` — keyboard + on-screen touch → a single `Buttons` state.
  - `tilemap.ts` — multi-layer tile grids: parse, cull-render, collision queries.
  - `physics.ts` — AABB swept collision resolution against the collision layer.
  - `sprites.ts` — async image loading + `drawSprite()` frame-strip helper.
  - `audio.ts` — procedural Web Audio SFX (no asset files); gesture-gated, mutable.
- `src/game/` — this game's content:
  - `entities.ts` — hero + enemy + pickup types and their per-tick update logic.
  - `levels.ts` — tile constants + level data (one ASCII grid per layer) + metadata.
  - `hud.ts` / `screens.ts` — HUD and full-screen overlays.
- `src/leaderboard.ts` — localStorage top-10; a clean async boundary so a server tier
  can slot in behind it without touching game code.
- `src/main.ts` — bootstrap, the state machine, and the fixed-timestep loop only.

## Rules
- **Determinism**: all simulation happens in `step(FIXED_DT)`. Animation clocks and
  camera easing may use wall-clock time but must never feed back into physics.
- **Backgrounds are dense tiled jungle**, not thin vector parallax. The lush look comes
  from real background tiles (trunks, ferns, vines, canopy) on their own layers.
- **No runtime dependencies** beyond the browser — the engine is hand-written.
- **The bar is**: `npm run typecheck` passes clean (strict) + a manual playtest of the
  full loop. No test runner, no linter.
- Comments explain *why*, not *what*. Keep load-bearing invariants written down (coord
  system, layer draw order, collision axis order).

## Art
`scripts/gen-art.py` is a dependency-free PNG generator (no Pillow). It's idempotent —
it only writes missing files unless `--force`. Sprite sheets are horizontal frame strips.
Regenerate with `npm run art` (add `--force` to overwrite).
