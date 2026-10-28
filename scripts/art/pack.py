#!/usr/bin/env python3
"""Post-process raw Higgsfield PNGs into art/*.webp (trim, resize, seamless pillars). Usage: pack.py [name...]"""
import os
import sys
from pathlib import Path
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
    if name.startswith('pillar-'): return pillar(name)
    if name.startswith('cap-'): return cap(name)
    if name.startswith('bg-'): return bg(name)
    if name.startswith('boss-'): return sprite(name, 384, 384)
    return sprite(name, 192, 192)


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    names = sys.argv[1:] or sorted(p.stem for p in RAW.glob('*.png'))
    for n in names:
        im = pack(n)
        f = OUT / f'{n}.webp'
        print(f'{n}.webp {im.size} {im.mode} {f.stat().st_size} B')
