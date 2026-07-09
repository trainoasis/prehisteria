# Prehisteria

An original 16-bit-style caveman platformer for the browser — you play **Brko**, a
mustachioed caveman who runs, jumps, clubs prehistoric critters, and hoovers up food
for points on his way through the jungle.

Inspired by the *feel* of early-90s DOS platformers, but a wholly original game:
original engine, original pixel art, original characters. Not a copy of any existing
game and not an emulator.

**Play:** https://prehisteria.wiwacloud.com

## Controls

| Action | Keys |
|---|---|
| Move | ← → or A / D |
| Jump (variable height) | ↑ / W / Space |
| Crouch / drop through wooden ledges | ↓ / S |
| Club attack | J / X / K |
| Pause | Esc / P |
| Mute | M |
| Restart run | R |

Touch controls appear automatically on mobile.

## The game

- **One level (so far):** Vine Canyon — a gem tower, a wooden ridge road, a platform
  maze, a tiger den, a spike gauntlet, and a final climb… plus a hidden treasure
  chamber for the observant.
- **Six enemy types:** critters (stompable), spikys (club only!), pouncing tigers,
  fliers, silk-climbing spiders, and one very fast vampire.
- **Multi-stomp scoring:** bouncing repeatedly on tough enemies pays a bigger bounty
  on the kill. Hold jump while stomping for a springboard bounce.
- **Energy & lives:** 3 hearts per life, 3 lives per run. Checkpoints (stone totems)
  light up as you pass and respawn you mid-level.
- **Local top-10 leaderboard** (browser localStorage).

## Development

```bash
npm install
npm run art        # (re)generate all pixel art into public/ (pure Python, no deps)
npm run dev        # Vite dev server
npm run typecheck  # strict TS — the quality bar
npm run build      # production build to dist/
```

Tech: Vite + strict TypeScript, hand-written Canvas 2D engine (no runtime
dependencies), fixed-timestep simulation, multi-layer tilemaps, procedural Web Audio
SFX. See `AGENTS.md` for architecture and project conventions.

## Asset provenance

Every sprite, tile, and icon in `public/` is **generated from scratch** by
[`scripts/gen-art.py`](scripts/gen-art.py) — primitive-shape pixel art composed in
code, deterministic and reproducible (`npm run art -- --force` rebuilds the entire
set byte-for-byte). The favicon is hand-written SVG and all sound is synthesized at
runtime with the Web Audio API. Nothing is extracted, traced, sampled, or copied
from any existing game or asset pack.

## License

MIT — see [LICENSE](LICENSE).
