import os
from pathlib import Path
RAW_DIR = Path(os.environ.get('ART_RAW', '/tmp/swishby-art-raw'))
#!/usr/bin/env python3
"""Contact sheet of art/*.webp on mid-grey; pillars shown tiled 2x to expose seams."""
from pathlib import Path
from PIL import Image, ImageDraw

ART = Path(__file__).resolve().parents[2] / 'art'
rows = [
    [f'pillar-{z}' for z in ('grove', 'canyon', 'magma', 'palace')] + [f'cap-{z}' for z in ('grove', 'canyon', 'magma', 'palace')],
    [f'sur-{k}-{z}' for k in ('snap', 'shot', 'drop') for z in ('grove', 'canyon', 'magma', 'palace')],
    [f'boss-{b}' for b in ('mawbloom', 'dunehulk', 'cinderwyrm', 'moltenking', 'stormcrown')],
    [f'bg-{z}' for z in ('grove', 'canyon', 'magma', 'palace')],
]
cells = []
for row in rows:
    ims = []
    for n in row:
        p = ART / f'{n}.webp'
        if not p.exists(): continue
        im = Image.open(p).convert('RGBA')
        if n.startswith('pillar-'):  # tile twice, then show at half size
            t = Image.new('RGBA', (128, 1024)); t.paste(im, (0, 0)); t.paste(im, (0, 512)); im = t.resize((64, 512))
        if n.startswith('bg-'): im = im.resize((270, 480))
        if n.startswith('sur-'): im = im.resize((im.width * 3 // 4, im.height * 3 // 4))
        ims.append((n, im))
    if ims: cells.append(ims)
pad = 14
W = max(sum(im.width + pad for _, im in r) + pad for r in cells)
H = sum(max(im.height for _, im in r) + pad + 16 for r in cells) + pad
sheet = Image.new('RGBA', (W, H), (128, 128, 128, 255))
d = ImageDraw.Draw(sheet)
y = pad
for r in cells:
    x = pad
    for n, im in r:
        sheet.alpha_composite(im, (x, y + 14)); d.text((x, y), n, fill=(255, 255, 255, 255)); x += im.width + pad
    y += max(im.height for _, im in r) + pad + 16
sheet.convert('RGB').save(str(RAW_DIR / 'art-contact.png'))
print(sheet.size)


# --- themed obstacles (section 10): `contact.py ob` writes the seam, join and assembled-gate checks ---
def ob_sheets():
    zones = ('grove', 'canyon', 'magma', 'palace')
    ld = lambda n: Image.open(ART / f'{n}.webp').convert('RGBA')
    sc = lambda im, k: im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    # 1. each stem stacked 3x at full size, on grey, to expose seams in colour and silhouette
    stems = [ld(f'ob-{z}-{s}-stem') for z in zones for s in ('bot', 'top')]
    seam = Image.new('RGBA', (len(stems) * 140, 1536), (128, 128, 128, 255))
    for i, im in enumerate(stems):
        for k in range(3): seam.alpha_composite(im, (i * 140 + 6, k * 512))
    seam.convert('RGB').save(str(RAW_DIR / 'ob-seams.png'))
    # 2. each tip butted against its stem with the stem drawn 84 px wide (tip drawn at the same scale)
    k = 84 / 128
    joins = Image.new('RGBA', (8 * 150, 560), (128, 128, 128, 255))
    for i, (z, s) in enumerate((z, s) for z in zones for s in ('bot', 'top')):
        st, tp = sc(ld(f'ob-{z}-{s}-stem'), k), sc(ld(f'ob-{z}-{s}-tip'), k)
        cx = i * 150 + 75
        if s == 'bot':   # tip on top, stem below
            joins.alpha_composite(tp, (cx - tp.width // 2, 20)); joins.alpha_composite(st, (cx - 42, 20 + tp.height))
        else:            # stem on top, tip below
            joins.alpha_composite(st, (cx - 42, 0)); joins.alpha_composite(tp, (cx - tp.width // 2, st.height))
    joins.convert('RGB').save(str(RAW_DIR / 'ob-joins.png'))
    # 3. assembled gate per zone on its backdrop: top obstacle (stem x2 + tip), gap, bottom obstacle (tip + stem x2)
    w, gap = 64, 150
    k = w / 128
    panels = []
    for z in zones:
        bst, btp = sc(ld(f'ob-{z}-bot-stem'), k), sc(ld(f'ob-{z}-bot-tip'), k)
        tst, ttp = sc(ld(f'ob-{z}-top-stem'), k), sc(ld(f'ob-{z}-top-tip'), k)
        H = 2 * tst.height + ttp.height + gap + btp.height + 2 * bst.height
        p = ld(f'bg-{z}').resize((300, H))
        cx = 150
        y = 0
        for _ in range(2): p.alpha_composite(tst, (cx - w // 2, y)); y += tst.height
        p.alpha_composite(ttp, (cx - ttp.width // 2, y)); y += ttp.height + gap
        p.alpha_composite(btp, (cx - btp.width // 2, y)); y += btp.height
        for _ in range(2): p.alpha_composite(bst, (cx - w // 2, y)); y += bst.height
        panels.append(p)
    H = max(p.height for p in panels)
    sheet = Image.new('RGBA', (4 * 310, H + 20), (40, 40, 40, 255))
    for i, p in enumerate(panels):
        sheet.alpha_composite(p, (i * 310, 20)); ImageDraw.Draw(sheet).text((i * 310 + 4, 4), zones[i], fill=(255, 255, 255, 255))
    sheet.convert('RGB').save(str(RAW_DIR.parent / 'art-contact2.png'))
    print('ob sheets written', sheet.size)


# --- A2 flat neon restyle: `contact.py neon [bird.png]` writes neon-contact-{obstacles,sprites,bosses}.png next to ART_RAW ---
def neon_sheets(bird=None):
    zones = ('grove', 'canyon', 'magma', 'palace')
    out = RAW_DIR.parent
    ld = lambda n: Image.open(ART / f'{n}.webp').convert('RGBA')
    sc = lambda im, k: im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    # obstacles: per zone, the top obstacle (stem x2 + tip), a gap, the bottom one (tip + stem x2), at the engine's 96 px stem width
    k, gap, pw = 96 / 128, 170, 260
    panels = []
    for z in zones:
        bst, btp, tst, ttp = (sc(ld(f'ob-{z}-{n}'), k) for n in ('bot-stem', 'bot-tip', 'top-stem', 'top-tip'))
        H = 2 * tst.height + ttp.height + gap + btp.height + 2 * bst.height
        p = ld(f'bg-{z}').resize((pw, H))
        y = 0
        for _ in range(2): p.alpha_composite(tst, (pw // 2 - tst.width // 2, y)); y += tst.height
        p.alpha_composite(ttp, (pw // 2 - ttp.width // 2, y)); y += ttp.height + gap
        p.alpha_composite(btp, (pw // 2 - btp.width // 2, y)); y += btp.height
        for _ in range(2): p.alpha_composite(bst, (pw // 2 - bst.width // 2, y)); y += bst.height
        panels.append(p)
    sheet = Image.new('RGBA', (4 * (pw + 10), max(p.height for p in panels) + 20), (20, 20, 28, 255))
    for i, p in enumerate(panels):
        sheet.alpha_composite(p, (i * (pw + 10), 20)); ImageDraw.Draw(sheet).text((i * (pw + 10) + 4, 4), zones[i], fill=(255, 255, 255, 255))
    sheet.convert('RGB').save(str(out / 'neon-contact-obstacles.png'))
    # surprises: each at 1x, and below it at 40 px (longest side), on the zone's backdrop colour
    names = [f'sur-{k}-{z}' for k in ('snap', 'shot', 'drop') for z in zones]
    sheet = Image.new('RGBA', (12 * 206 + 10, 290), (20, 20, 28, 255))
    d = ImageDraw.Draw(sheet)
    for i, n in enumerate(names):
        im = ld(n)
        bgc = ld(f'bg-{n.split("-")[2]}').resize((200, 270))
        sheet.alpha_composite(bgc, (10 + i * 206, 14))
        sheet.alpha_composite(im, (10 + i * 206 + (200 - im.width) // 2, 16))
        s40 = sc(im, 40 / max(im.size))
        sheet.alpha_composite(s40, (10 + i * 206 + (200 - s40.width) // 2, 228))
        d.text((10 + i * 206, 0), n, fill=(255, 255, 255, 255))
    sheet.convert('RGB').save(str(out / 'neon-contact-sprites.png'))
    # bosses at 160 px tall beside the player bird at ~26 px, on the zone backdrop, then each at 1x
    bz = {'mawbloom': 'grove', 'dunehulk': 'canyon', 'cinderwyrm': 'magma', 'moltenking': 'magma', 'stormcrown': 'palace'}
    sheet = Image.new('RGBA', (5 * 400 + 10, 640), (20, 20, 28, 255))
    d = ImageDraw.Draw(sheet)
    bird_im = Image.open(bird).convert('RGBA') if bird else None
    for i, (b, z) in enumerate(bz.items()):
        x0 = 10 + i * 400
        p = ld(f'bg-{z}').resize((390, 220))
        bs = sc(ld(f'boss-{b}'), 160 / 384)
        p.alpha_composite(bs, (390 - bs.width - 20, 30))
        if bird_im:
            bb = sc(bird_im.crop((180, 60, 440, 240)), 26 / 180)   # the bird's body in the ref crop
            p.alpha_composite(bb, (40, 100))
        sheet.alpha_composite(p, (x0, 16)); d.text((x0, 2), f'boss-{b} @160px, bird @26px', fill=(255, 255, 255, 255))
        im = ld(f'boss-{b}')
        sheet.alpha_composite(sc(im, 390 / max(im.width, 390) * min(1, 384 / im.height)), (x0, 246))
    sheet.convert('RGB').save(str(out / 'neon-contact-bosses.png'))
    print('neon sheets written to', out)


import sys
if sys.argv[1:] == ['ob']:
    ob_sheets()
if sys.argv[1:2] == ['neon']:
    neon_sheets(*sys.argv[2:3])
