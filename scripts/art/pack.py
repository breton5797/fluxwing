#!/usr/bin/env python3
"""Post-process raw Higgsfield PNGs into art/*.webp (trim, resize, seamless pillars). Usage: pack.py [name...]"""
import os
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageChops, ImageEnhance

RAW = Path(os.environ.get('ART_RAW', '/tmp/swishby-art-raw'))
OUT = Path(__file__).resolve().parents[2] / 'art'
Q = 80
BG_DIM = {'bg-canyon': .6, 'bg-palace': .5, 'bg-magma': .85}
VCROP = {'pillar-palace': (.12, .88)}


def clean_alpha(im, floor=24):
    """Drop the faint halo the model leaves around sprites, then trim to content."""
    r, g, b, a = im.split()
    a = a.point(lambda v: 0 if v < floor else v)
    im = Image.merge('RGBA', (r, g, b, a))
    box = a.point(lambda v: 255 if v > 40 else 0).getbbox()
    return im.crop(box) if box else im


def fit(im, max_w, max_h):
    s = min(max_w / im.width, max_h / im.height, 1)
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)


def sprite(name, mw, mh):
    im = fit(clean_alpha(Image.open(RAW / f'{name}.png').convert('RGBA')), mw, mh)
    im.save(OUT / f'{name}.webp', 'WEBP', quality=Q, method=6)
    return im


def cap(name):
    # Caps fill a 192x96 box exactly (width-led), centred, bottom-aligned so the flat edge meets the shaft.
    im = fit(clean_alpha(Image.open(RAW / f'{name}.png').convert('RGBA')), 192, 96)
    out = Image.new('RGBA', (192, 96), (0, 0, 0, 0))
    out.alpha_composite(im, ((192 - im.width) // 2, 96 - im.height))
    out.save(OUT / f'{name}.webp', 'WEBP', quality=Q, method=6)
    return out


def pillar(name):
    """Centre strip at 1:4, cross-faded so the top edge continues the bottom edge, plus cylinder shading."""
    im = Image.open(RAW / f'{name}.png').convert('RGB')
    if name in VCROP:                           # skip decorative end bands the model drew
        a, b = VCROP[name]; im = im.crop((0, round(a * im.height), im.width, round(b * im.height)))
    W, H = im.size
    sw = round(H / 4.6)                         # strip 1:4 after taking the overlap band off
    strip = im.crop(((W - sw) // 2, 0, (W + sw) // 2, H)).resize((128, round(128 * H / sw)), Image.LANCZOS)
    band = strip.height - 512                   # extra rows used for the seam crossfade
    body = strip.crop((0, 0, 128, 512))
    tail = strip.crop((0, 512, 128, 512 + band))
    # the top `band` rows blend from the rows that would follow the bottom (tail) into the real top
    mask = Image.linear_gradient('L').resize((128, band))   # 0 at top → 255 at bottom
    top = Image.composite(body.crop((0, 0, 128, band)), tail, mask)
    body.paste(top, (0, 0))
    # cylinder shading: darker at the left/right edges, slight highlight left of centre
    import math
    shade = Image.new('L', (128, 1))
    shade.putdata([round(255 * (0.55 + 0.45 * math.sin(math.pi * (x + .5) / 128) ** .6)) for x in range(128)])
    body = ImageChops.multiply(body, Image.merge('RGB', [shade.resize((128, 512))] * 3))
    body.save(OUT / f'{name}.webp', 'WEBP', quality=Q, method=6)
    return body


STEM_CORE = 105        # target solid core width in a 128 px stem (fairness: engine treats this as the hitbox width)
SEAM_BAND = 64         # rows cross-faded at the seam (before the period is stretched to 512)
MAX_STRETCH = 1.25     # how far the found period may be stretched or squashed to fit 512
TIP_CROP = {'ob-canyon-bot-tip': .17}   # fraction of the trimmed tip cut off at the join side
EDGE_FADE = 8         # side detail that sticks out past 128 px is clipped behind this alpha fade
SOLID = 200            # alpha that counts as solid core


def core_widths(a):
    """Solid pixels per row of an alpha array (H x W)."""
    return (a > SOLID).sum(axis=1)


def premul_blend(x, y, t):
    """Blend two RGBA float arrays with weight t (H x 1) on y, in premultiplied space so alpha edges stay clean."""
    px = x[..., :3] * x[..., 3:] / 255
    py = y[..., :3] * y[..., 3:] / 255
    a = x[..., 3:] * (1 - t) + y[..., 3:] * t
    rgb = (px * (1 - t) + py * t) * 255 / np.maximum(a, 1)
    return np.concatenate([rgb, a], axis=-1)


def stem(name, im=None, core_w=STEM_CORE, edge_fade=EDGE_FADE):
    """Scale so the solid core is ~core_w of 128, take a 512 window and crossfade RGB+alpha so it tiles."""
    if im is None:
        im = clean_alpha_keep(Image.open(RAW / f'{name}.png').convert('RGBA'))
        im = im.crop((0, round(.04 * im.height), im.width, round(.96 * im.height)))   # skip edge cut artefacts
    a = np.asarray(im)[..., 3]
    cols = np.where((a > 40).any(axis=0))[0]
    x0, x1 = cols[0], cols[-1] + 1
    core = np.median(core_widths(a))
    s = min(core_w / core, 1.25 * 128 / (x1 - x0))   # side detail may overflow and get clipped
    cx = (x0 + x1) / 2 * s
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    left = round(cx - 64)
    strip = Image.new('RGBA', (128, im.height), (0, 0, 0, 0))
    strip.alpha_composite(im.crop((max(left, 0), 0, min(left + 128, im.width), im.height)), (max(-left, 0), 0))
    fade = np.minimum(1, (np.minimum(np.arange(128), 127 - np.arange(128)) + .5) / edge_fade)
    r, g, b, al = strip.split()
    al = Image.fromarray((np.asarray(al) * fade).astype(np.uint8))
    strip = Image.merge('RGBA', (r, g, b, al))
    arr = np.asarray(strip, dtype=np.float64)
    y0, P = best_period(arr, SEAM_BAND)
    win = Image.fromarray(arr[y0:y0 + P + SEAM_BAND].astype(np.uint8), 'RGBA')
    band = round(SEAM_BAND * 512 / P)                # period P is stretched to exactly 512 rows
    arr = np.asarray(win.resize((128, 512 + band), Image.LANCZOS), dtype=np.float64)
    body, tail = arr[:512].copy(), arr[512:]
    t = np.linspace(0, 1, band)[:, None, None]      # top row = tail (continues the bottom), fading to the real rows
    body[:band] = premul_blend(tail, body[:band], t)
    out = Image.fromarray(np.clip(body.round(), 0, 255).astype(np.uint8), 'RGBA')
    out.save(OUT / f'{name}.webp', 'WEBP', quality=Q, method=6, exact=True)
    return out


def best_period(arr, band):
    """(y0, P): window start and repeat length whose top band best matches the band one period later."""
    pm = arr[..., :3] * arr[..., 3:] / 255
    pm = np.concatenate([pm, arr[..., 3:]], axis=-1)
    H = arr.shape[0]
    pmin = round(512 / MAX_STRETCH)
    assert H - band > pmin, f'only {H}px tall after scaling'
    best = None
    for P in range(pmin, min(H - band, round(512 * MAX_STRETCH)) + 1, 2):
        for y0 in range(0, H - P - band + 1, 3):
            d = np.abs(pm[y0:y0 + band] - pm[y0 + P:y0 + P + band]).mean()
            if best is None or d < best[0]: best = (d, y0, P)
    return best[1], best[2]


def clean_alpha_keep(im, floor=24):
    r, g, b, a = im.split()
    return Image.merge('RGBA', (r, g, b, a.point(lambda v: 0 if v < floor else v)))


def stem_core(name):
    """Core width stats of a packed stem: (min, p10, median) solid px per row."""
    w = core_widths(np.asarray(Image.open(OUT / f'{name}.webp').convert('RGBA'))[..., 3])
    return int(w.min()), int(np.percentile(w, 10)), int(np.median(w))


def tip(name, im=None, squeeze=False):
    """Trim, scale so the join row matches the stem core (tips are drawn at the stem's px scale), centre the join, max 192x256
    (a tip taller than 256 at that scale is squashed vertically, so the join keeps the stem's width). squeeze: keep the join at the stem's width
    even when the tip is wider than 192 there, by narrowing only the rows that do not fit."""
    im = clean_alpha(im if im is not None else Image.open(RAW / f'{name}.png').convert('RGBA'))
    bot = '-bot-' in name
    if name in TIP_CROP:                             # drop the wide cut-off base so the join sits where the body matches the stem
        c = round(TIP_CROP[name] * im.height)
        im = im.crop((0, 0, im.width, im.height - c) if bot else (0, c, im.width, im.height))
    a = np.asarray(im)[..., 3]
    edge = a[::-1] if bot else a
    rows = edge[core_widths(edge) > 0][:8]           # first solid rows at the join edge
    solid = np.where((rows > SOLID).any(axis=0))[0]
    jw = np.median(core_widths(rows))
    jc = (solid[0] + solid[-1] + 1) / 2              # join centre in source px
    stem_name = name.replace('-tip', '-stem')
    target = (stem_core(stem_name)[2] if (OUT / f'{stem_name}.webp').exists() else STEM_CORE)
    half = max(jc, im.width - jc)                    # padded half-width that keeps the join centred
    s = target / jw if squeeze else min(target / jw, 96 / half)
    im = im.resize((round(im.width * s), round(im.height * min(s, 256 / im.height))), Image.LANCZOS)
    w = 2 * round(half * s)
    out = Image.new('RGBA', (w, im.height), (0, 0, 0, 0))
    out.alpha_composite(im, (round(w / 2 - jc * s), 0))
    if w > 192:
        out = narrow_rows(out, 192)
    out.save(OUT / f'{name}.webp', 'WEBP', quality=Q, method=6, exact=True)
    return out


def narrow_rows(im, w_max, smooth=8):
    """Narrow each row about the centre just enough that it fits w_max (the factor eased over `smooth` rows); rows that fit stay as they are."""
    arr = np.asarray(im, dtype=np.float64)
    H, W = arr.shape[:2]
    c = W / 2
    on = arr[..., 3] > 24
    half = np.array([max(c - np.argmax(r), np.argmax(r[::-1]) + 1 - (W - c)) if r.any() else 0 for r in on])
    k = np.minimum(1, (w_max / 2 - 1) / np.maximum(half, 1))
    k = np.minimum(k, np.convolve(np.pad(k, smooth, mode='edge'), np.ones(2 * smooth + 1) / (2 * smooth + 1), 'valid'))   # eased, still fits
    pm = np.concatenate([arr[..., :3] * arr[..., 3:] / 255, arr[..., 3:]], axis=-1)
    xo = np.arange(w_max) + .5 - w_max / 2
    out = np.zeros((H, w_max, 4))
    for y in range(H):
        src = c + xo / k[y] - .5
        for ch in range(4):
            out[y, :, ch] = np.interp(src, np.arange(W), pm[y, :, ch], left=0, right=0)
    a = out[..., 3:]
    rgb = out[..., :3] * 255 / np.maximum(a, 1e-6)
    return Image.fromarray(np.clip(np.concatenate([rgb, a], -1).round(), 0, 255).astype(np.uint8), 'RGBA')


NEON_CORE = 118       # A2 flat neon: the core is the outlined column, so it can fill almost all of the 128 px
NEON_FADE = 4
JOIN_DEV = .06         # a row is past the column once its width leaves the column width by this much
TIP_LEAD = 20          # source rows of plain column kept on the tip's join side
JOIN_RUN = 4           # ... for this many rows in a row
JOIN_AT = {'ob-canyon-bot': 1095}   # rows from the cut edge to the join, where the auto rule would stop at a notch between boulders
NOTCH = .9             # a column whose narrowest solid row is below this fraction of its median gets a straight backing column


def neon_ob(name):
    """Slice one full neon obstacle (ob-<zone>-<bot|top>.png: column cut off by the image edge, end piece in the image) into
    ob-<..>-stem and ob-<..>-tip."""
    im = clean_alpha_keep(Image.open(RAW / f'{name}.png').convert('RGBA'))
    bot = name.endswith('-bot')
    a = np.asarray(im)[..., 3]
    op = (a > 128).sum(axis=1)
    H = len(op)
    order = np.arange(H)[::-1] if bot else np.arange(H)       # walk from the cut edge toward the end piece
    wc = np.median(op[order[:H // 3]])
    off = np.abs(op[order] - wc) > JOIN_DEV * wc
    run = np.convolve(off, np.ones(JOIN_RUN), 'valid') >= JOIN_RUN
    j = JOIN_AT.get(name) or int(np.argmax(run[round(.04 * H):])) + round(.04 * H)   # rows from the cut edge to the join
    c0, c1 = round(.03 * H), j - TIP_LEAD                     # column rows (skip the cut artefact and the join)
    so = core_widths(a[H - c1:H - c0] if bot else a[c0:c1])
    if so.min() < NOTCH * np.median(so):                      # back the column up to just under the end piece
        im = backing(im, H - j - 10, H) if bot else backing(im, 0, j + 10)
    col = im.crop((0, H - c1, im.width, H - c0)) if bot else im.crop((0, c0, im.width, c1))
    endp = im.crop((0, 0, im.width, H - j + TIP_LEAD)) if bot else im.crop((0, j - TIP_LEAD, im.width, H))
    s = stem(f'{name}-stem', col, NEON_CORE, NEON_FADE)
    t = tip(f'{name}-tip', endp, squeeze=True)
    return s, t


def backing(im, y0, y1):
    """Put a straight column (the column's darkest fill, outlined in its neon colour) behind rows y0:y1 of a column with notches,
    so every row is solid."""
    arr = np.asarray(im)
    a = arr[y0:y1, :, 3]
    w = core_widths(a)
    y = y0 + int(np.argsort(w)[len(w) // 2])                  # a median row: its first solid pixel is the outline
    xs = np.where(arr[y, :, 3] > SOLID)[0]
    l, r = int(xs[0]), int(xs[-1]) + 1
    edge = max(2, round(.03 * (r - l)))
    line = arr[y, l + edge // 2, :3]
    solid = arr[y0:y1][a > SOLID][:, :3].astype(int)
    fill = solid[np.argsort(solid.sum(axis=1))[len(solid) // 4]]  # a dark interior tone
    back = np.zeros_like(arr)
    back[y0:y1, l:r, :3] = fill
    back[y0:y1, l:l + edge, :3] = line
    back[y0:y1, r - edge:r, :3] = line
    back[y0:y1, l:r, 3] = 255
    out = Image.fromarray(back, 'RGBA')
    out.alpha_composite(im)
    return out


def boss(name):
    """Bosses are drawn by height: always 384 tall, a wider one is padded top and bottom."""
    im = fit(clean_alpha(Image.open(RAW / f'{name}.png').convert('RGBA')), 384, 384)
    if im.height < 384:
        out = Image.new('RGBA', (im.width, 384), (0, 0, 0, 0))
        out.alpha_composite(im, (0, (384 - im.height) // 2))
        im = out
    im.save(OUT / f'{name}.webp', 'WEBP', quality=Q, method=6)
    return im


def bg(name):
    im = Image.open(RAW / f'{name}.png').convert('RGB')
    W, H = im.size
    t = 540 / 960
    w = min(W, round(H * t)); h = round(w / t)
    im = im.crop(((W - w) // 2, (H - h) // 2, (W + w) // 2, (H + h) // 2)).resize((540, 960), Image.LANCZOS)
    im = ImageEnhance.Color(ImageEnhance.Contrast(im).enhance(.7)).enhance(.8)   # far backdrop: keep gates readable
    im = ImageEnhance.Brightness(im).enhance(BG_DIM.get(name, 1))                # match the zone's dark sky
    im.save(OUT / f'{name}.webp', 'WEBP', quality=72, method=6)
    return im


def pack(name):
    if name.startswith('ob-') and name.endswith(('-bot', '-top')): return neon_ob(name)
    if name.startswith('ob-'): return stem(name) if name.endswith('-stem') else tip(name)
    if name.startswith('pillar-'): return pillar(name)
    if name.startswith('cap-'): return cap(name)
    if name.startswith('bg-'): return bg(name)
    if name.startswith('boss-'): return boss(name)
    return sprite(name, 192, 192)


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    names = sys.argv[1:] or sorted(p.stem for p in RAW.glob('*.png'))
    for n in names:
        res = pack(n)
        for k, im in zip(('-stem', '-tip') if isinstance(res, tuple) else ('',), res if isinstance(res, tuple) else (res,)):
            f = OUT / f'{n}{k}.webp'
            print(f'{n}{k}.webp {im.size} {im.mode} {f.stat().st_size} B')
