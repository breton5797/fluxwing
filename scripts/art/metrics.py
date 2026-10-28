#!/usr/bin/env python3
"""Alpha metrics of the themed obstacle art (art/ob-*.webp) for index.html's ART_FIT and tests/art.test.js, which cannot decode WebP in node.
Usage: metrics.py  -> writes scripts/art/ob-metrics.json. Rerun it whenever an ob-* file changes (the test compares each file's byte size).

A pixel is opaque at alpha >= 128. Per file: w, h, bytes, and
  stem: cols (the opaque fraction of each column over all rows), cx (the opacity-weighted centre column), core ([l, r], the columns opaque in at
        least half the rows), solid ([min, 10th percentile, median] over the rows of the row's count of solid pixels, alpha > 200);
  tip:  pad (transparent rows on the gap side: the top for a bot tip, the bottom for a top tip), join (transparent rows on the stem side),
        base ([l, r], the opaque extent averaged over the 8 rows next to the join), cx (the base's centre), end ([l, r], the opaque extent over
        the 12 rows next to the gap end)."""
import json
from statistics import median
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'art'
OUT = Path(__file__).resolve().parent / 'ob-metrics.json'
ZONES = ('grove', 'canyon', 'magma', 'palace')
OPAQUE = 128
SOLID = 200


def rows_of(im):
    a = im.getchannel('A')
    w, h = im.size
    px = a.load()
    return [[px[x, y] >= OPAQUE for x in range(w)] for y in range(h)]


def extent(rows):
    """Mean [l, r] of the opaque pixels over rows that have any."""
    ls, rs = [], []
    for r in rows:
        xs = [x for x, v in enumerate(r) if v]
        if xs:
            ls.append(xs[0])
            rs.append(xs[-1] + 1)
    return [round(sum(ls) / len(ls), 1), round(sum(rs) / len(rs), 1)] if ls else [0, 0]


def stem(im):
    rows = rows_of(im)
    w, h = im.size
    cols = [sum(r[x] for r in rows) / h for x in range(w)]
    tot = sum(cols)
    on = [x for x, c in enumerate(cols) if c >= .5]
    cx = sum((x + .5) * c for x, c in enumerate(cols)) / tot if tot else w / 2
    px = im.getchannel('A').load()
    solid = sorted(sum(px[x, y] > SOLID for x in range(w)) for y in range(h))
    return {'cols': [round(c, 3) for c in cols], 'cx': round(cx, 1), 'core': [on[0], on[-1] + 1] if on else [0, 0],
            'solid': [solid[0], solid[int(.1 * (h - 1))], int(median(solid))]}


def tip(im, pos):
    rows = rows_of(im)
    # a row counts once it has at least 2 opaque pixels, so a stray speck does not move the end
    hit = [sum(r) >= 2 for r in rows]
    first = hit.index(True)
    last = len(hit) - 1 - hit[::-1].index(True)
    h = len(rows)
    gap_end, join_end = (first, last) if pos == 'bot' else (last, first)
    pad = first if pos == 'bot' else h - 1 - last
    join = h - 1 - last if pos == 'bot' else first
    near_join = rows[join_end - 7:join_end + 1] if pos == 'bot' else rows[join_end:join_end + 8]
    near_gap = rows[gap_end:gap_end + 12] if pos == 'bot' else rows[gap_end - 11:gap_end + 1]
    base = extent(near_join)
    return {'pad': pad, 'join': join, 'base': base, 'cx': round((base[0] + base[1]) / 2, 1), 'end': extent(near_gap)}


def main():
    out = {}
    for z in ZONES:
        for pos in ('bot', 'top'):
            for k in ('stem', 'tip'):
                n = f'ob-{z}-{pos}-{k}'
                f = ART / f'{n}.webp'
                im = Image.open(f).convert('RGBA')
                m = {'w': im.width, 'h': im.height, 'bytes': f.stat().st_size}
                m.update(stem(im) if k == 'stem' else tip(im, pos))
                out[n] = m
    OUT.write_text(json.dumps(out, separators=(',', ':')) + '\n')
    print('wrote', OUT.relative_to(ROOT), len(out), 'files')


if __name__ == '__main__':
    main()
