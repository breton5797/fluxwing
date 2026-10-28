#!/usr/bin/env python3
"""Generate SWISHBY art via the higgsfield CLI. Usage: gen.py name [name...] | all"""
import os
import json, subprocess, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

RAW = Path(os.environ.get('ART_RAW', '/tmp/swishby-art-raw'))
LOG = RAW / 'gen-log.jsonl'
STYLE = ('Polished stylised 3D game asset render, bright colours, clean bold shapes, soft rim light, '
         'strong readable silhouette that reads at small size, centered with margin, isolated on a fully '
         'transparent background, no text, no letters, no watermark, no ground shadow, no floor, no glow halo around the edges.')
TEX = ('Opaque texture that fills the entire frame edge to edge, front orthographic view, evenly lit, '
       'stylised 3D game art material, clean hand-painted look, no text, no watermark, no border, no background visible.')
BG = ('Soft distant background painting for a mobile arcade game, fills the whole frame, low contrast, muted and slightly hazy, '
      'gentle depth, no characters, no foreground objects in the middle, no text, no watermark, stylised 3D game art.')

Z = {
 'grove':  'bioluminescent neon jungle palette: deep teal-green, neon lime green and aqua accents',
 'canyon': 'warm desert canyon at dusk palette: sandstone tan, burnt orange, terracotta, with turquoise accents',
 'magma':  'volcanic palette: black basalt rock with glowing lava orange and red cracks',
 'palace': 'heavenly sky palace palette: white marble, polished gold trim, sky blue and soft violet accents',
}

A = {}  # name -> (prompt, aspect, background)
pil = {
 'grove':  'a mossy living tree trunk wrapped in glowing vines and small leaves, vertical bark grooves',
 'canyon': 'layered sandstone with horizontal strata bands and carved weathered grooves',
 'magma':  'cracked black basalt column with glowing lava seams running through it',
 'palace': 'fluted white marble column shaft with thin vertical gold inlay lines',
}
cap = {
 'grove':  'a thick mossy wooden ring capital with leaves, glowing mushrooms and curled vine tendrils',
 'canyon': 'a carved sandstone capital block with stepped ledges and turquoise stone inlays',
 'magma':  'a jagged black basalt capital with glowing lava cracks and molten drips at the edges',
 'palace': 'an ornate white marble capital with gold scroll trim and a small sky-blue gem',
}
for z in Z:
    A[f'pillar-{z}'] = (f'Seamless vertical surface texture of a pillar shaft: {pil[z]}. The pattern runs vertically and repeats '
                        f'top to bottom. {Z[z]}. {TEX}', '9:16', 'opaque')
    A[f'cap-{z}'] = (f'A single wide end-cap piece for the top of a thick game pillar, front view, wide and short horizontal shape about '
                     f'twice as wide as tall, flat bottom edge: {cap[z]}. {Z[z]}. {STYLE}', '16:9', 'transparent')
    A[f'bg-{z}'] = (f'{BG} Scene: ' + {
        'grove': 'a dark bioluminescent jungle at night with tall silhouetted trees, hanging vines and faint glowing plants',
        'canyon': 'distant layered desert mesas and canyon walls at dusk under a warm orange to violet sky',
        'magma': 'a deep volcanic cavern with distant lava falls, dark basalt cliffs and drifting embers',
        'palace': 'floating white marble palace towers among soft clouds in a twilight blue and violet sky',
    }[z] + f'. {Z[z]}.', '9:16', 'opaque')

SUR = {
 'snap-grove':  'the head of a man-eating carnivorous plant bursting upward, huge open jaws with rows of thorn teeth pointing UP toward the top of the image, leafy stem at the bottom',
 'snap-canyon': 'the head of a giant sand worm bursting upward out of sand, round open maw with ring of teeth facing UP toward the top of the image, segmented body at the bottom',
 'snap-magma':  'the head of a lava serpent bursting upward, open jaws with glowing molten mouth facing UP toward the top of the image, scaly neck at the bottom',
 'snap-palace': 'a stone gargoyle claw reaching straight DOWN from above, open talons pointing toward the bottom of the image, wrist at the top',
 'shot-grove':  'a thorny seed pod projectile flying to the left, spiky green pod with glowing core and a short leafy motion trail to the right',
 'shot-canyon': 'a spinning sandstone boulder projectile flying to the left, cracks and a short dust trail to the right',
 'shot-magma':  'a fireball projectile flying to the left, molten rock core in bright flames with the flame tail streaming to the right',
 'shot-palace': 'a short chunky ice spear projectile flying LEFT: a thick wide crystal arrowhead with a broad pointed tip on the left side and a short frosty comet tail to the right, compact shape about twice as wide as tall',
 'drop-grove':  'a heavy spiky seed cone falling downward, pine-cone shaped with sharp glowing thorns, point facing down',
 'drop-canyon': 'a jagged rock stalactite falling, the sharp point facing DOWN toward the bottom of the image',
 'drop-magma':  'a falling molten lava meteor, glowing lava drop shape with the round heavy end at the bottom and a fiery tail trailing UP',
 'drop-palace': 'a crackling lightning orb, a glowing electric sphere with small lightning bolts arcing around it',
}
for k, v in SUR.items():
    z = k.split('-')[1]
    A[f'sur-{k}'] = (f'Game hazard sprite: {v}. {Z[z]}. {STYLE}', '1:1', 'transparent')

BOSS = {
 'mawbloom':   ('a giant carnivorous flower monster boss with a huge toothy flower-head maw, thick petals, thorny vines and leaf arms', 'grove'),
 'dunehulk':   ('a hulking sandstone golem boss built of carved stone blocks, glowing turquoise eyes and runes, massive fists', 'canyon'),
 'cinderwyrm': ('a lava serpent-dragon boss with coiled serpentine body, basalt scales, glowing lava belly, horned head and open fiery jaws', 'magma'),
 'moltenking': ('a towering magma titan king boss with a cracked basalt body full of glowing lava and a crown of roaring fire on its head', 'magma'),
 'stormcrown': ('a thunder sovereign boss whose body is a swirling dark storm cloud with glowing eyes, a crackling crown of lightning and golden armour pieces', 'palace'),
}
for k, (v, z) in BOSS.items():
    A[f'boss-{k}'] = (f'Boss monster for an arcade game: {v}. Facing LEFT in three-quarter side view, looking toward the left edge of the image, '
                      f'menacing but stylised, full body visible. {Z[z]}. {STYLE}', '1:1', 'transparent')


def run(name):
    prompt, ar, bg = A[name]
    ids = json.loads(subprocess.check_output(['higgsfield', 'generate', 'create', 'gpt_image_2_5', '--prompt', prompt,
        '--background', bg, '--quality', 'high', '--aspect_ratio', ar, '--json']))
    jid = ids[0]
    res = json.loads(subprocess.check_output(['higgsfield', 'generate', 'wait', jid, '--json'], timeout=900))
    url = res.get('result_url')
    with LOG.open('a') as f:
        f.write(json.dumps({'name': name, 'id': jid, 'status': res.get('status'), 'url': url}) + '\n')
    if url:
        urllib.request.urlretrieve(url, RAW / f'{name}.png')
    return name, res.get('status')


def safe(name):
    try:
        return run(name)
    except Exception as e:
        return name, f'ERROR {e}'


if __name__ == '__main__':
    names = list(A) if sys.argv[1:] == ['all'] else sys.argv[1:]
    with ThreadPoolExecutor(8) as ex:
        for n, s in ex.map(safe, names):
            print(n, s, flush=True)
