#!/usr/bin/env python3
"""Generate ORIGINAL pixel-art PNGs for Prehisteria.

    python3 scripts/gen-art.py           # only writes files that don't exist yet
    python3 scripts/gen-art.py --force   # overwrite everything

Everything drawn here is original artwork — a caveman ("Brko"), a critter, jungle
foliage tiles, food icons — composed from primitive shapes. No dependency on Pillow;
we hand-encode PNGs. All sprite sheets are horizontal frame strips.

World tile size is TILE (24px). Sprite cells are documented at each generator.
"""
import math, os, struct, sys, zlib

OUT = os.path.join(os.path.dirname(__file__), '..', 'public')
FORCE = '--force' in sys.argv
TILE = 24  # world tile size, shared by fg/bg/far tilesheets

# --- PNG encode -------------------------------------------------------------
def write_png(path, w, h, px):
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    raw = bytearray()
    for y in range(h):
        raw.append(0)  # filter type 0 (none) per scanline
        for x in range(w):
            r, g, b, a = px[y * w + x]
            raw += bytes((r, g, b, a))
    data = (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
            + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(data)
    print(f'wrote {os.path.relpath(path)} ({w}x{h})')

# --- flat RGBA buffer + primitives ------------------------------------------
def make(w, h):
    return [(0, 0, 0, 0)] * (w * h)

def px(buf, w, h, x, y, c):
    x = int(x); y = int(y)
    if 0 <= x < w and 0 <= y < h:
        # alpha-1 overwrite (our art is flat, no blending needed)
        buf[y * w + x] = c

def rect(buf, w, h, x0, y0, x1, y1, c):
    for y in range(int(y0), int(y1) + 1):
        for x in range(int(x0), int(x1) + 1):
            px(buf, w, h, x, y, c)

def disk(buf, w, h, cx, cy, r, c):
    for y in range(int(cy - r), int(cy + r) + 1):
        for x in range(int(cx - r), int(cx + r) + 1):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                px(buf, w, h, x, y, c)

def line(buf, w, h, x0, y0, x1, y1, c, thick=1):
    x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
    dx = abs(x1 - x0); dy = -abs(y1 - y0)
    sx = 1 if x0 < x1 else -1; sy = 1 if y0 < y1 else -1
    err = dx + dy; x, y = x0, y0
    while True:
        for ox in range(thick):
            for oy in range(thick):
                px(buf, w, h, x + ox, y + oy, c)
        if x == x1 and y == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy; x += sx
        if e2 <= dx:
            err += dx; y += sy

# Deterministic PRNG so regenerated art is stable frame to frame.
class Rng:
    def __init__(self, seed):
        self.s = seed & 0xffffffff
    def next(self):
        self.s = (1103515245 * self.s + 12345) & 0x7fffffff
        return self.s
    def rand(self):
        return self.next() / 0x7fffffff
    def rint(self, a, b):
        return a + int(self.rand() * (b - a + 1))

# Draw a filled blob that WRAPS inside a single TILE cell placed at column ox,
# so the resulting tile is seamlessly repeatable in both axes.
def blob_wrap(buf, w, h, ox, cx, cy, r, c):
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy <= r * r:
                tx = (cx + dx) % TILE
                ty = (cy + dy) % TILE
                px(buf, w, h, ox + tx, ty, c)

# ============================================================================
# PALETTE (bright, cartoony 16-bit)
# ============================================================================
# Hero "Brko"
SKIN    = (240, 194, 140, 255); SKIN_DK = (198, 150, 104, 255)
HAIR    = (74, 46, 30, 255)
TUNIC   = (232, 138, 48, 255);  TUNIC_DK = (188, 98, 30, 255)
CLUB    = (126, 86, 50, 255);   CLUB_DK  = (92, 60, 34, 255)
EYE_W   = (255, 255, 255, 255); EYE_B    = (30, 24, 20, 255)
# Critter enemy (a stubby purple dino)
EN      = (156, 96, 176, 255);  EN_DK    = (112, 62, 132, 255)
EN_BEL  = (214, 176, 224, 255)
# Ground / foreground
GRASS   = (112, 182, 72, 255);  GRASS_DK = (78, 138, 52, 255)
DIRT    = (146, 100, 60, 255);  DIRT_DK  = (108, 70, 42, 255)
DIRT_HI = (170, 122, 78, 255)
STONE   = (150, 150, 164, 255); STONE_DK = (100, 100, 116, 255)
SPIKE   = (222, 224, 232, 255); SPIKE_DK = (150, 152, 164, 255)
# Jungle background
LEAF_D  = (24, 66, 40, 255);    LEAF_M = (40, 100, 54, 255); LEAF_L = (86, 152, 70, 255)
TRUNK   = (92, 62, 40, 255);    TRUNK_D = (62, 42, 26, 255)
VINE    = (66, 128, 60, 255)
# Far background
FAR_D   = (30, 62, 58, 255);    FAR_L = (46, 84, 78, 255)

# ============================================================================
# HERO — 11 frames × 24×32
#   0 idle | 1-4 run | 5 jump | 6 fall | 7 crouch | 8-10 attack
# ============================================================================
HERO_W, HERO_H, HERO_N = 24, 32, 11

def _hero_head(buf, W, H, ox, cx, cy, look_down=False):
    disk(buf, W, H, ox + cx, cy, 5, SKIN)
    disk(buf, W, H, ox + cx, cy + 1, 5, SKIN)
    # shading on the lower-left
    disk(buf, W, H, ox + cx - 2, cy + 2, 3, SKIN_DK)
    disk(buf, W, H, ox + cx, cy, 5, SKIN)  # restore top
    # messy hair on top + back
    rect(buf, W, H, ox + cx - 5, cy - 6, ox + cx + 5, cy - 2, HAIR)
    px(buf, W, H, ox + cx - 5, cy - 1, HAIR); px(buf, W, H, ox + cx + 5, cy - 1, HAIR)
    # eye + nose, facing right
    ey = cy + (2 if look_down else 0)
    px(buf, W, H, ox + cx + 2, ey, EYE_W); px(buf, W, H, ox + cx + 3, ey, EYE_B)
    px(buf, W, H, ox + cx + 5, cy + 1, SKIN_DK)  # nose nub
    # the signature mustache ("brki") — a bushy bar under the nose with droopy
    # tips; sits on the facing side so it reads in profile
    my = cy + (4 if look_down else 2)
    rect(buf, W, H, ox + cx + 1, my, ox + cx + 5, my + 1, HAIR)
    px(buf, W, H, ox + cx + 6, my + 1, HAIR)               # far tip
    px(buf, W, H, ox + cx + 6, my + 2, HAIR)               # far droop
    px(buf, W, H, ox + cx + 1, my + 2, HAIR)               # near droop

def _hero_torso(buf, W, H, ox, x0, y0, x1, y1):
    rect(buf, W, H, ox + x0, y0, ox + x1, y1, TUNIC)
    rect(buf, W, H, ox + x0, y0, ox + x0 + 1, y1, TUNIC_DK)   # left shade
    # jagged fur hem
    for x in range(x0, x1 + 1, 2):
        px(buf, W, H, ox + x, y1 + 1, TUNIC_DK)

# NOTE: the club-arm is NOT baked into the sprite. It's drawn procedurally in
# src/game/effects.ts (drawArmClub) for every state, so the club is one
# continuous object — visibly held at rest and the same object that swings on
# attack, rather than a shape that pops into existence. Here we only draw a small
# skin shoulder stub on the facing (right) side for the arm to grow out of.
def _hero_shoulder(buf, W, H, ox, sy):
    disk(buf, W, H, ox + 16, sy, 2, SKIN)

def _hero_leg(buf, W, H, ox, hipx, hipy, footx, footy):
    line(buf, W, H, ox + hipx, hipy, ox + footx, footy, SKIN, thick=2)
    rect(buf, W, H, ox + footx - 1, footy, ox + footx + 2, footy + 1, SKIN_DK)  # foot

def gen_hero():
    W, H = HERO_W * HERO_N, HERO_H
    buf = make(W, H)
    for f in range(HERO_N):
        ox = f * HERO_W
        if f == 7:   # crouch — compact, low
            _hero_head(buf, W, H, ox, 12, 15, look_down=True)
            _hero_torso(buf, W, H, ox, 8, 20, 16, 26)
            _hero_leg(buf, W, H, ox, 10, 26, 8, 31)
            _hero_leg(buf, W, H, ox, 14, 26, 16, 31)
            _hero_shoulder(buf, W, H, ox, 22)
            continue
        # standing poses share a head + torso block
        _hero_head(buf, W, H, ox, 12, 8)
        _hero_torso(buf, W, H, ox, 8, 13, 16, 23)
        _hero_shoulder(buf, W, H, ox, 15)
        if 1 <= f <= 4:                       # run cycle
            phase = (f - 1) / 4 * math.tau
            sw = math.sin(phase) * 4
            _hero_leg(buf, W, H, ox, 10, 24, int(10 - sw), 31)
            _hero_leg(buf, W, H, ox, 14, 24, int(14 + sw), 31)
        elif f == 5:                          # jump — legs tucked up
            _hero_leg(buf, W, H, ox, 10, 24, 9, 29)
            _hero_leg(buf, W, H, ox, 14, 24, 16, 28)
        elif f == 6:                          # fall — legs spread
            _hero_leg(buf, W, H, ox, 10, 24, 7, 31)
            _hero_leg(buf, W, H, ox, 14, 24, 17, 31)
        else:                                 # idle + attack (arm drawn on top)
            _hero_leg(buf, W, H, ox, 10, 24, 10, 31)
            _hero_leg(buf, W, H, ox, 14, 24, 14, 31)
    return W, H, buf

# ============================================================================
# ENEMY — 5 frames × 24×24 : 0-3 waddle, 4 squashed
# ============================================================================
EN_W, EN_H, EN_N = 24, 24, 5

def gen_enemy():
    W, H = EN_W * EN_N, EN_H
    buf = make(W, H)
    for f in range(EN_N):
        ox = f * EN_W
        if f == 4:  # squashed flat
            rect(buf, W, H, ox + 3, 18, ox + 20, 23, EN)
            rect(buf, W, H, ox + 5, 18, ox + 18, 19, EN_BEL)
            px(buf, W, H, ox + 8, 20, EYE_B); px(buf, W, H, ox + 15, 20, EYE_B)
            continue
        bob = 1 if f in (1, 3) else 0
        # body
        disk(buf, W, H, ox + 12, 14 + bob, 8, EN)
        disk(buf, W, H, ox + 12, 17 + bob, 6, EN_BEL)   # belly
        disk(buf, W, H, ox + 12, 9 + bob, 5, EN)        # head hump
        # eye + toothy grin, facing right
        px(buf, W, H, ox + 15, 9 + bob, EYE_W); px(buf, W, H, ox + 16, 9 + bob, EYE_B)
        rect(buf, W, H, ox + 13, 12 + bob, ox + 17, 12 + bob, EYE_W)  # teeth
        # little back spikes
        for sx in (8, 11, 14):
            line(buf, W, H, ox + sx, 6 + bob, ox + sx + 1, 3 + bob, EN_DK, thick=1)
        # feet waddle
        fo = 2 if f in (1, 3) else 0
        rect(buf, W, H, ox + 6, 21, ox + 9 + fo, 23, EN_DK)
        rect(buf, W, H, ox + 15 - fo, 21, ox + 18, 23, EN_DK)
    return W, H, buf

# ============================================================================
# SPIKY — 3 frames × 24×24 : 0-1 crawl, 2 KO (on its back)
# A spine-backed crawler: the pale spikes read as "do NOT jump on me".
# ============================================================================
SPK    = (168, 60, 60, 255); SPK_DK = (120, 40, 40, 255)
SPK_BEL = (214, 140, 120, 255)
SPINE  = (238, 230, 210, 255); SPINE_DK = (190, 180, 160, 255)

def gen_spiky():
    FW, FH, N = 24, 24, 3
    W, H = FW * N, FH
    buf = make(W, H)
    for f in range(N):
        ox = f * FW
        if f == 2:  # KO — flipped on its back, spikes down, feet up
            disk(buf, W, H, ox + 12, 17, 6, SPK)
            rect(buf, W, H, ox + 7, 14, ox + 17, 16, SPK_BEL)
            for sx in (7, 10, 13, 16):                       # spikes point DOWN
                line(buf, W, H, ox + sx, 20, ox + sx + 1, 23, SPINE_DK)
            rect(buf, W, H, ox + 8, 11, ox + 9, 13, SPK_DK)  # feet in the air
            rect(buf, W, H, ox + 14, 11, ox + 15, 13, SPK_DK)
            px(buf, W, H, ox + 10, 16, EYE_B); px(buf, W, H, ox + 12, 16, EYE_B)
            continue
        crawl = 1 if f == 1 else 0
        # low round body
        disk(buf, W, H, ox + 12, 17, 6, SPK)
        rect(buf, W, H, ox + 7, 19, ox + 17, 21, SPK_BEL)    # belly band
        # big pale spikes fanning off the back — the "don't stomp" signal
        for i, sx in enumerate((6, 9, 12, 15)):
            tipy = 5 + (i % 2) * 2 + crawl
            line(buf, W, H, ox + sx, 13, ox + sx + 1, tipy, SPINE)
            px(buf, W, H, ox + sx + 1, tipy, SPINE_DK)
        # snout + eye facing right
        disk(buf, W, H, ox + 18, 16, 3, SPK)
        px(buf, W, H, ox + 18, 15, EYE_W); px(buf, W, H, ox + 19, 15, EYE_B)
        # stubby feet alternate
        rect(buf, W, H, ox + 8 + crawl, 21, ox + 10 + crawl, 23, SPK_DK)
        rect(buf, W, H, ox + 14 - crawl, 21, ox + 16 - crawl, 23, SPK_DK)
    return W, H, buf

# ============================================================================
# TIGER — 4 frames × 32×24 : 0-1 prowl, 2 crouch (wind-up), 3 leap
# A sabre-cat that telegraphs (crouch) then pounces.
# ============================================================================
TIG = (226, 148, 62, 255); TIG_DK = (160, 95, 32, 255)
TIG_BEL = (246, 218, 172, 255); STRIPE = (74, 44, 22, 255)
FANG = (250, 246, 234, 255)

def _tiger_head(buf, W, H, ox, cx, cy):
    disk(buf, W, H, ox + cx, cy, 4, TIG)
    px(buf, W, H, ox + cx - 2, cy - 4, TIG_DK); px(buf, W, H, ox + cx + 1, cy - 4, TIG_DK)  # ears
    px(buf, W, H, ox + cx + 1, cy - 1, EYE_W); px(buf, W, H, ox + cx + 2, cy - 1, EYE_B)
    rect(buf, W, H, ox + cx + 3, cy + 1, ox + cx + 4, cy + 1, TIG_DK)   # snout
    px(buf, W, H, ox + cx + 2, cy + 3, FANG); px(buf, W, H, ox + cx + 4, cy + 3, FANG)  # sabre fangs

def _tiger_body(buf, W, H, ox, x0, x1, ytop, ybot):
    for y in range(ytop, ybot + 1):
        for x in range(x0, x1 + 1):
            mx = (x0 + x1) / 2.0
            if ((x - mx) / ((x1 - x0) / 2.0)) ** 2 + ((y - (ytop + ybot) / 2.0) / ((ybot - ytop) / 2.0 + 0.01)) ** 2 <= 1.1:
                px(buf, W, H, ox + x, y, TIG)
    rect(buf, W, H, ox + x0 + 3, ybot - 1, ox + x1 - 3, ybot, TIG_BEL)
    for sx in range(x0 + 3, x1 - 2, 4):                       # stripes
        line(buf, W, H, ox + sx, ytop, ox + sx - 1, ytop + 4, STRIPE)

def gen_tiger():
    FW, FH, N = 32, 24, 4
    W, H = FW * N, FH
    buf = make(W, H)
    for f in range(N):
        ox = f * FW
        if f == 3:    # leap — stretched long, legs extended, tail flying
            _tiger_body(buf, W, H, ox, 4, 26, 8, 15)
            _tiger_head(buf, W, H, ox, 27, 8)
            line(buf, W, H, ox + 7, 14, ox + 2, 20, TIG_DK, thick=2)    # hind leg trailing
            line(buf, W, H, ox + 23, 14, ox + 29, 18, TIG_DK, thick=2)  # foreleg reaching
            line(buf, W, H, ox + 5, 9, ox + 1, 4, TIG_DK, thick=2)      # tail up
        elif f == 2:  # crouch — compressed low, butt up: the tell before a pounce
            _tiger_body(buf, W, H, ox, 6, 24, 14, 20)
            _tiger_head(buf, W, H, ox, 26, 16)
            rect(buf, W, H, ox + 8, 21, ox + 10, 23, TIG_DK)
            rect(buf, W, H, ox + 20, 21, ox + 22, 23, TIG_DK)
            line(buf, W, H, ox + 7, 14, ox + 3, 8, TIG_DK, thick=2)     # tail raised high
        else:         # prowl, legs alternating
            step = 2 if f == 1 else 0
            _tiger_body(buf, W, H, ox, 5, 25, 10, 17)
            _tiger_head(buf, W, H, ox, 27, 11)
            rect(buf, W, H, ox + 7 + step, 18, ox + 9 + step, 23, TIG_DK)
            rect(buf, W, H, ox + 13 - step, 18, ox + 15 - step, 23, TIG_DK)
            rect(buf, W, H, ox + 19 + step, 18, ox + 21 + step, 23, TIG_DK)
            rect(buf, W, H, ox + 23 - step, 18, ox + 25 - step, 23, TIG_DK)
            line(buf, W, H, ox + 5, 11, ox + 1, 6, TIG_DK, thick=2)     # tail
    return W, H, buf

# ============================================================================
# FLIER — 3 frames × 24×24 : wing up / mid / down. A teal glider that bobs
# through the air on a sine path. Stompable and clubbable.
# ============================================================================
FLY = (88, 178, 188, 255); FLY_DK = (54, 128, 138, 255)
FLY_CREST = (232, 138, 48, 255)

def gen_flier():
    FW, FH, N = 24, 24, 3
    W, H = FW * N, FH
    buf = make(W, H)
    for f in range(N):
        ox = f * FW
        # body + head, facing right
        disk(buf, W, H, ox + 12, 14, 4, FLY)
        disk(buf, W, H, ox + 16, 11, 3, FLY)
        line(buf, W, H, ox + 18, 12, ox + 22, 13, FLY_CREST, thick=1)   # beak
        line(buf, W, H, ox + 15, 8, ox + 12, 5, FLY_CREST, thick=1)     # crest
        px(buf, W, H, ox + 16, 10, EYE_W); px(buf, W, H, ox + 17, 10, EYE_B)
        # one big membrane wing, position per frame
        tipy = (3, 10, 19)[f]
        for k in range(3):
            line(buf, W, H, ox + 11, 12, ox + 3 + k, tipy + k, FLY_DK, thick=1)
        line(buf, W, H, ox + 11, 12, ox + 3, tipy, FLY_DK, thick=2)
        # tail
        line(buf, W, H, ox + 8, 15, ox + 4, 17, FLY_DK, thick=1)
    return W, H, buf

# ============================================================================
# SPIDER — 4 frames × 24×24 : 0-1 crawl, 2 climb (tucked, on silk), 3 KO
# ============================================================================
SPI = (78, 56, 40, 255); SPI_DK = (52, 36, 26, 255)
SPI_EYE = (232, 70, 60, 255)

def gen_spider():
    FW, FH, N = 24, 24, 4
    W, H = FW * N, FH
    buf = make(W, H)
    for f in range(N):
        ox = f * FW
        if f == 3:  # KO — curled up
            disk(buf, W, H, ox + 12, 18, 4, SPI)
            for a in (-2, -1, 1, 2):
                line(buf, W, H, ox + 12 + a * 2, 15, ox + 12 + a * 3, 12, SPI_DK)
            px(buf, W, H, ox + 10, 17, EYE_B); px(buf, W, H, ox + 13, 17, EYE_B)
            continue
        if f == 2:  # climb — legs tucked upward, hanging from silk
            disk(buf, W, H, ox + 12, 15, 4, SPI)      # abdomen
            disk(buf, W, H, ox + 12, 10, 3, SPI)      # head up top
            px(buf, W, H, ox + 11, 9, SPI_EYE); px(buf, W, H, ox + 13, 9, SPI_EYE)
            for a in (-2, -1, 1, 2):
                line(buf, W, H, ox + 12 + a, 12, ox + 12 + a * 4, 7, SPI_DK)
            continue
        step = 1 if f == 1 else 0
        disk(buf, W, H, ox + 9, 17, 4, SPI)           # abdomen
        disk(buf, W, H, ox + 15, 16, 3, SPI)          # head, facing right
        px(buf, W, H, ox + 15, 15, SPI_EYE); px(buf, W, H, ox + 17, 15, SPI_EYE)
        # 3 legs per side, alternating splay
        for i, lx in enumerate((-4, -1, 2)):
            o = step if i % 2 == 0 else -step
            line(buf, W, H, ox + 12 + lx, 16, ox + 6 + lx + o * 2, 22, SPI_DK)
            line(buf, W, H, ox + 12 + lx, 16, ox + 18 + lx - o * 2, 22, SPI_DK)
    return W, H, buf

# ============================================================================
# VAMPIRE — 3 frames × 24×24 : 0-1 flap, 2 KO. Fast, fanged, club-only.
# ============================================================================
VAM = (66, 44, 88, 255); VAM_DK = (42, 28, 58, 255)
VAM_EYE = (244, 60, 60, 255)

def gen_vampire():
    FW, FH, N = 24, 24, 3
    W, H = FW * N, FH
    buf = make(W, H)
    for f in range(N):
        ox = f * FW
        if f == 2:  # KO — wings drooped
            disk(buf, W, H, ox + 12, 16, 4, VAM)
            line(buf, W, H, ox + 8, 16, ox + 4, 21, VAM_DK, thick=2)
            line(buf, W, H, ox + 16, 16, ox + 20, 21, VAM_DK, thick=2)
            px(buf, W, H, ox + 10, 15, EYE_B); px(buf, W, H, ox + 14, 15, EYE_B)
            continue
        up = f == 0
        wy = 5 if up else 17
        disk(buf, W, H, ox + 12, 13, 4, VAM)                            # body
        px(buf, W, H, ox + 10, 8, VAM_DK); px(buf, W, H, ox + 14, 8, VAM_DK)  # ears
        px(buf, W, H, ox + 10, 12, VAM_EYE); px(buf, W, H, ox + 14, 12, VAM_EYE)
        px(buf, W, H, ox + 11, 16, FANG); px(buf, W, H, ox + 13, 16, FANG)    # fangs
        # jagged bat wings both sides
        for sgn in (-1, 1):
            sxr = ox + 12 + sgn * 4
            line(buf, W, H, sxr, 12, sxr + sgn * 7, wy, VAM_DK, thick=2)
            line(buf, W, H, sxr + sgn * 7, wy, sxr + sgn * 9, 13, VAM_DK, thick=1)
    return W, H, buf

# ============================================================================
# CHECKPOINT — 2 frames × 24×32 : 0 dormant stone, 1 lit (ember flame on top)
# ============================================================================
def gen_checkpoint():
    FW, FH, N = 24, 32, 2
    W, H = FW * N, FH
    buf = make(W, H)
    for f in range(N):
        ox = f * FW
        # standing stone
        rect(buf, W, H, ox + 9, 12, ox + 14, 31, STONE)
        rect(buf, W, H, ox + 9, 12, ox + 10, 31, STONE_DK)
        rect(buf, W, H, ox + 8, 10, ox + 15, 12, STONE)      # bowl on top
        # carved band
        rect(buf, W, H, ox + 10, 20, ox + 13, 21, STONE_DK)
        if f == 1:  # lit — a little ember flame
            disk(buf, W, H, ox + 12, 7, 3, (240, 140, 40, 255))
            disk(buf, W, H, ox + 12, 6, 2, (255, 210, 63, 255))
            px(buf, W, H, ox + 12, 3, (255, 210, 63, 255))
            # glowing carve
            rect(buf, W, H, ox + 10, 20, ox + 13, 21, (240, 140, 40, 255))
    return W, H, buf

# ============================================================================
# FRONT FOLIAGE TILESHEET — 3 tiles × 24×24, drawn IN FRONT of entities
#   0 fern silhouette | 1 hanging frond (from tile top) | 2 tall grass
# Dark near-silhouette greens so the play plane pops between back and front.
# ============================================================================
FRONT_D = (16, 44, 26, 255); FRONT_M = (22, 58, 34, 255)

def gen_tiles_front():
    N = 3
    W, H = TILE * N, TILE
    buf = make(W, H)
    # 0 fern — fan of fronds rising from the bottom
    ox = 0
    for a in (-2, -1, 0, 1, 2):
        line(buf, W, H, ox + 12, TILE - 1, ox + 12 + a * 5, 5 + abs(a) * 3, FRONT_D, thick=2)
        for t in range(3):   # leaflets along each frond
            yy = 9 + t * 5 + abs(a) * 2
            px(buf, W, H, ox + 12 + a * 3 + (1 if a >= 0 else -1), yy, FRONT_M)
    # 1 hanging frond — drapes from the top edge
    ox = TILE
    for vx in (6, 13, 19):
        depth = 10 + (vx % 3) * 5
        for y in range(depth):
            wob = int(math.sin((y + vx) * 0.7) * 1.4)
            px(buf, W, H, ox + vx + wob, y, FRONT_D)
            if y % 3 == 0:
                px(buf, W, H, ox + vx + wob - 1, y, FRONT_M)
                px(buf, W, H, ox + vx + wob + 1, y + 1, FRONT_M)
    # 2 tall grass — blades from the bottom
    ox = TILE * 2
    for bx in (3, 7, 11, 15, 19, 22):
        hgt = 8 + (bx * 7) % 9
        line(buf, W, H, ox + bx, TILE - 1, ox + bx + ((bx % 3) - 1) * 2, TILE - hgt, FRONT_D)
    return W, H, buf

# ============================================================================
# FOREGROUND / COLLISION TILESHEET — 5 tiles × 24×24
#   img idx 0 ground_top | 1 ground_fill | 2 platform (solid stone)
#           3 spikes     | 4 ledge (wooden, ONE-WAY drop-through)
# ============================================================================
def gen_tiles_fg():
    N = 5
    W, H = TILE * N, TILE
    buf = make(W, H)

    # 0 ground_top: grassy top over dirt
    ox = 0
    rect(buf, W, H, ox, 0, ox + TILE - 1, TILE - 1, DIRT)
    r = Rng(7)
    for y in range(TILE):
        for x in range(TILE):
            if r.rand() < 0.12:
                px(buf, W, H, ox + x, y, DIRT_DK if r.rand() < 0.5 else DIRT_HI)
    rect(buf, W, H, ox, 0, ox + TILE - 1, 5, GRASS)
    for x in range(TILE):                 # grass blades on the seam
        px(buf, W, H, ox + x, 6, GRASS if x % 2 else GRASS_DK)
        if x % 3 == 0:
            px(buf, W, H, ox + x, 7, GRASS_DK)
    rect(buf, W, H, ox, 0, ox + TILE - 1, 1, GRASS_DK)  # top highlight edge

    # 1 ground_fill: solid dirt with pebbles
    ox = TILE
    rect(buf, W, H, ox, 0, ox + TILE - 1, TILE - 1, DIRT)
    r = Rng(11)
    for _ in range(26):
        x = r.rint(1, TILE - 2); y = r.rint(1, TILE - 2)
        px(buf, W, H, ox + x, y, DIRT_DK if r.rand() < 0.6 else DIRT_HI)

    # 2 platform: stone ledge, solid
    ox = TILE * 2
    rect(buf, W, H, ox, 0, ox + TILE - 1, TILE - 1, STONE_DK)
    rect(buf, W, H, ox, 0, ox + TILE - 1, TILE - 4, STONE)
    rect(buf, W, H, ox, 0, ox + TILE - 1, 2, (176, 176, 190, 255))
    r = Rng(5)
    for _ in range(10):
        x = r.rint(1, TILE - 2); y = r.rint(4, TILE - 3)
        px(buf, W, H, ox + x, y, STONE_DK)

    # 3 spikes: hazard row on dark base
    ox = TILE * 3
    rect(buf, W, H, ox, TILE - 4, ox + TILE - 1, TILE - 1, STONE_DK)
    for i in range(4):
        bx = i * 6 + 1
        for k in range(6):
            line(buf, W, H, ox + bx + k, TILE - 4, ox + bx + 3, 3, SPIKE)
        line(buf, W, H, ox + bx + 3, TILE - 4, ox + bx + 3, 3, SPIKE_DK)

    # 4 ledge: thin wooden plank across the TOP of the tile (one-way collision
    # snaps feet to the tile top, so the visual must hug it). Slats + gaps make
    # it read as "passable wood", clearly distinct from solid stone.
    ox = TILE * 4
    rect(buf, W, H, ox, 0, ox + TILE - 1, 5, CLUB)               # plank body
    rect(buf, W, H, ox, 0, ox + TILE - 1, 1, (168, 122, 76, 255))  # sun-lit top
    for gx in (5, 12, 19):                                       # slat gaps
        rect(buf, W, H, ox + gx, 0, ox + gx + 1, 5, (0, 0, 0, 0))
    for gx in (2, 9, 16, 22):                                    # wood grain
        px(buf, W, H, ox + gx, 3, CLUB_DK)
    # small rope lashings at the ends
    rect(buf, W, H, ox, 0, ox + 1, 5, (196, 168, 110, 255))
    rect(buf, W, H, ox + TILE - 2, 0, ox + TILE - 1, 5, (196, 168, 110, 255))
    return W, H, buf

# ============================================================================
# BACKGROUND JUNGLE TILESHEET — 6 seamlessly-tiling tiles × 24×24
#   0 leaf_fill | 1 leaf_dark | 2 trunk | 3 vines | 4 canopy_top | 5 fern
# The dense jungle wall is assembled from these on their own map layer.
# ============================================================================
def gen_tiles_bg():
    N = 6
    W, H = TILE * N, TILE
    buf = make(W, H)

    def leaves(ox, base, seed, density, lights):
        rect(buf, W, H, ox, 0, ox + TILE - 1, TILE - 1, base)
        r = Rng(seed)
        for _ in range(density):
            cx = r.rint(0, TILE - 1); cy = r.rint(0, TILE - 1)
            rad = r.rint(2, 4)
            col = lights[r.rint(0, len(lights) - 1)]
            blob_wrap(buf, W, H, ox, cx, cy, rad, col)

    # 0 leaf_fill — mid green dense foliage (the main backdrop tile)
    leaves(0, LEAF_M, 21, 26, [LEAF_L, LEAF_D, LEAF_L])
    # 1 leaf_dark — deeper shade variant for depth patches
    leaves(TILE, LEAF_D, 41, 24, [LEAF_M, LEAF_D])

    # 2 trunk — vertical tree trunk with bark, foliage at the sides
    ox = TILE * 2
    rect(buf, W, H, ox, 0, ox + TILE - 1, TILE - 1, LEAF_D)
    rect(buf, W, H, ox + 7, 0, ox + 16, TILE - 1, TRUNK)
    rect(buf, W, H, ox + 7, 0, ox + 9, TILE - 1, TRUNK_D)     # left bark shade
    r = Rng(63)
    for _ in range(10):                                       # bark flecks
        px(buf, W, H, ox + r.rint(10, 15), r.rint(0, TILE - 1), TRUNK_D)
    for cx in (2, 3, 21, 20):                                 # side leaves (wrap)
        blob_wrap(buf, W, H, ox, cx, r.rint(0, TILE - 1), 3, LEAF_M)

    # 3 vines — hanging vines over dark leaves
    ox = TILE * 3
    rect(buf, W, H, ox, 0, ox + TILE - 1, TILE - 1, LEAF_D)
    r = Rng(88)
    for vx in (5, 12, 19):
        for y in range(TILE):
            wobble = int(math.sin((y + vx) * 0.6) * 1.5)
            px(buf, W, H, ox + vx + wobble, y, VINE)
            if y % 4 == 0:
                blob_wrap(buf, W, H, ox, vx + wobble, y, 2, LEAF_L)  # leaf node

    # 4 canopy_top — lighter, sky peeking through the top edge
    ox = TILE * 4
    rect(buf, W, H, ox, 0, ox + TILE - 1, TILE - 1, LEAF_M)
    r = Rng(101)
    for _ in range(22):
        cx = r.rint(0, TILE - 1); cy = r.rint(2, TILE - 1)
        blob_wrap(buf, W, H, ox, cx, cy, r.rint(2, 4), LEAF_L)
    # a few bright rim leaves along the top
    for x in range(0, TILE, 3):
        blob_wrap(buf, W, H, ox, x, 1, 2, LEAF_L)

    # 5 fern — undergrowth fronds
    ox = TILE * 5
    rect(buf, W, H, ox, 0, ox + TILE - 1, TILE - 1, LEAF_D)
    for base_x in (6, 17):
        for a in range(-2, 3):
            line(buf, W, H, ox + base_x, TILE - 1, ox + base_x + a * 3, 6, LEAF_L)
        line(buf, W, H, ox + base_x, TILE - 1, ox + base_x, 8, VINE)
    return W, H, buf

# ============================================================================
# FAR BACKGROUND TILESHEET — 3 tiles × 24×24 (distant misty tree line)
#   0 sky_fill | 1 hill | 2 hill_top
# ============================================================================
def gen_tiles_far():
    N = 3
    W, H = TILE * N, TILE
    buf = make(W, H)
    # 0 sky_fill (semi-transparent so the sky gradient shows through)
    rect(buf, W, H, 0, 0, TILE - 1, TILE - 1, (60, 110, 100, 90))
    # 1 hill body
    ox = TILE
    rect(buf, W, H, ox, 0, ox + TILE - 1, TILE - 1, FAR_D)
    # 2 hill_top rounded silhouette
    ox = TILE * 2
    for x in range(TILE):
        top = int(6 + math.sin(x * 0.26) * 4)
        rect(buf, W, H, ox + x, top, ox + x, TILE - 1, FAR_L)
        px(buf, W, H, ox + x, top, (70, 120, 110, 255))
    return W, H, buf

# ============================================================================
# ITEMS / ICONS — 5 icons × 16×16 : 0 fruit 1 meat 2 egg 3 gem 4 heart
# ============================================================================
IT = 16
def gen_items():
    N = 5
    W, H = IT * N, IT
    buf = make(W, H)
    # 0 fruit (cherry-red with leaf)
    ox = 0
    disk(buf, W, H, ox + 8, 10, 5, (220, 66, 62, 255))
    disk(buf, W, H, ox + 6, 8, 2, (255, 140, 130, 255))     # shine
    line(buf, W, H, ox + 8, 5, ox + 10, 2, (120, 78, 44, 255))  # stem
    disk(buf, W, H, ox + 11, 3, 2, (86, 168, 70, 255))      # leaf
    # 1 meat drumstick
    ox = IT
    disk(buf, W, H, ox + 9, 7, 4, (196, 96, 74, 255))
    disk(buf, W, H, ox + 8, 6, 2, (232, 150, 128, 255))
    line(buf, W, H, ox + 9, 9, ox + 4, 14, (238, 228, 200, 255), thick=2)  # bone
    disk(buf, W, H, ox + 4, 14, 2, (250, 244, 224, 255))
    # 2 egg (speckled)
    ox = IT * 2
    disk(buf, W, H, ox + 8, 9, 5, (246, 240, 222, 255))
    disk(buf, W, H, ox + 8, 7, 4, (255, 252, 240, 255))
    for (dx, dy) in ((6, 9), (10, 10), (8, 12), (11, 7)):
        px(buf, W, H, ox + dx, dy, (176, 150, 108, 255))
    # 3 gem (big score, cyan diamond)
    ox = IT * 3
    for y in range(0, 8):
        wdt = y if y <= 4 else 8 - y
        rect(buf, W, H, ox + 8 - wdt, 4 + y, ox + 8 + wdt, 4 + y, (86, 202, 232, 255))
    line(buf, W, H, ox + 8, 4, ox + 5, 8, (200, 244, 255, 255))  # facet
    line(buf, W, H, ox + 8, 4, ox + 8, 11, (52, 158, 196, 255))
    # 4 heart (HUD life)
    ox = IT * 4
    disk(buf, W, H, ox + 6, 6, 3, (230, 62, 82, 255))
    disk(buf, W, H, ox + 10, 6, 3, (230, 62, 82, 255))
    for y in range(6, 13):
        wdt = 12 - y
        rect(buf, W, H, ox + 8 - wdt, y, ox + 8 + wdt, y, (230, 62, 82, 255))
    px(buf, W, H, ox + 5, 5, (255, 150, 160, 255))          # shine
    return W, H, buf

# ============================================================================
# GOAL FLAG — single frame 24×48 (a totem pole marking the level end)
# ============================================================================
def gen_flag():
    W, H = 24, 48
    buf = make(W, H)
    rect(buf, W, H, 9, 4, 14, 47, (150, 104, 62, 255))      # pole
    rect(buf, W, H, 9, 4, 10, 47, (110, 74, 44, 255))       # shade
    # carved totem head near the top
    disk(buf, W, H, 12, 10, 7, (206, 150, 92, 255))
    px(buf, W, H, 9, 9, EYE_B); px(buf, W, H, 15, 9, EYE_B)
    rect(buf, W, H, 9, 13, 15, 14, (120, 78, 44, 255))      # mouth
    line(buf, W, H, 4, 8, 20, 8, (232, 138, 48, 255), thick=2)  # feathers/wings
    disk(buf, W, H, 4, 8, 2, (220, 66, 62, 255)); disk(buf, W, H, 20, 8, 2, (86, 168, 70, 255))
    return W, H, buf

# ============================================================================
# FAVICON — tiny SVG of Brko's head
# ============================================================================
FAVICON = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#1a472a"/>
  <circle cx="16" cy="18" r="9" fill="#f0c28c"/>
  <rect x="6" y="6" width="20" height="7" rx="3" fill="#4a2e1e"/>
  <circle cx="20" cy="17" r="1.6" fill="#1e1814"/>
  <path d="M12 21 q4 -2.5 8 0 q-1 2.8 -4 1.4 q-3 1.4 -4 -1.4 z" fill="#4a2e1e"/>
  <path d="M23 10 l6 -4 v6 z" fill="#7e5632"/>
</svg>
'''

# ============================================================================
if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    pngs = [
        ('hero.png',        gen_hero),
        ('enemy.png',       gen_enemy),
        ('spiky.png',       gen_spiky),
        ('tiger.png',       gen_tiger),
        ('flier.png',       gen_flier),
        ('spider.png',      gen_spider),
        ('vampire.png',     gen_vampire),
        ('checkpoint.png',  gen_checkpoint),
        ('tiles_fg.png',    gen_tiles_fg),
        ('tiles_bg.png',    gen_tiles_bg),
        ('tiles_far.png',   gen_tiles_far),
        ('tiles_front.png', gen_tiles_front),
        ('items.png',       gen_items),
        ('flag.png',        gen_flag),
    ]
    for name, gen in pngs:
        path = os.path.join(OUT, name)
        if os.path.exists(path) and not FORCE:
            print(f'skip {name} (exists; --force to overwrite)')
            continue
        w, h, buf = gen()
        write_png(path, w, h, buf)

    fav = os.path.join(OUT, 'favicon.svg')
    if not os.path.exists(fav) or FORCE:
        with open(fav, 'w') as f:
            f.write(FAVICON)
        print(f'wrote {os.path.relpath(fav)}')
    else:
        print('skip favicon.svg (exists; --force to overwrite)')
