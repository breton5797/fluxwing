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
    cells.append(ims)
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
