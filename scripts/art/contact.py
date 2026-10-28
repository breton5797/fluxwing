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


import sys
if sys.argv[1:] == ['ob']:
    ob_sheets()
