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

# Themed gate obstacles (section 10): a tileable stem plus a tip at the gap, separate objects for bottom and top.
STEM = ('The object is cut off cleanly by BOTH the top edge and the bottom edge of the image, so neither end is visible: '
        'it is one continuous straight vertical section of uniform width along its whole length, front view. '
        'It is tall and narrow: its solid body fills only the middle third of the image width, with irregular organic '
        'edges and small detail poking out a little at the sides. Fully transparent background left and right of it. '
        'Polished stylised 3D game asset render, bright colours, soft rim light, strong readable silhouette, '
        'not a pipe, not a cylinder, not a straight-sided column, no text, no letters, no watermark, no shadow, no glow halo.')
TIP = ('The object enters from the {edge} edge of the image, where its body is cut off flat and wide (the cut spans about '
       'two thirds of the image width), and it ends in the middle of the image in a clear point aimed straight {dir}. '
       'Front view, fully transparent background. Polished stylised 3D game asset render, bright colours, soft rim light, '
       'strong readable silhouette, not a pipe, no text, no letters, no watermark, no shadow, no glow halo.')
OB = {
 'grove-bot':  ('a thick twisted carnivorous-plant stalk of fleshy green stems braided together, overlapping leaf sheaths, small thorny leaves and glowing lime veins',
                'a carnivorous-plant stalk rising up and ending in a big closed glowing bud with tightly shut, thorn-toothed petals'),
 'grove-top':  ('a hanging bundle of gnarled twisted roots and dark green vines, intertwined root strands with moss, small leaves and glowing aqua spores, hanging downward',
                'a bundle of hanging gnarled roots and vines that ends in a dangling cluster of spiky thorny seed pods with glowing cores'),
 'canyon-bot': ('a hoodoo rock column of stacked, balanced, rounded sandstone boulders with uneven bulging outlines and horizontal strata bands',
                'a hoodoo: a column of stacked balanced sandstone boulders, as wide as the column at the bottom, topped by a big flat slab cap rock that overhangs clearly wider than the column'),
 'canyon-top': ('a hanging column of layered strata rock with jagged irregular ledges, horizontal sandstone bands in tan, orange and terracotta with turquoise mineral veins',
                'hanging layered strata rock that ends in a cluster of sharp stalactites'),
 'magma-bot':  ('a rising column of erupting lava fire: glowing molten lava with rough black basalt crust plates and flames licking up along both sides',
                'a short, wide, compact composition: a thick stub of glowing molten lava column with black basalt crust plates, as wide as two thirds of the image and only a third of the image tall, keeping that same width (not a volcano, not a cone, no flat base), bursting at its top into a flaming geyser crest of fire and lava spray that narrows to a point'),
 'magma-top':  ('a hanging flow of molten lava pouring downward: a thick glowing orange-red lava stream with cooling black crust plates and drips along its edges',
                'a thick hanging stream of glowing orange molten lava with a few black crust plates, the same width where it enters (no lid, no plate, no flat shelf), its lower end narrowing into heavy glowing lava drips'),
 'palace-bot': ('a spiralling crystal spire: a thick twisted column of faceted sky-blue and violet crystal wound by a spiral band of polished gold filigree',
                'a spiralling crystal spire with a polished gold ring around it, ending in a sharp faceted crystal point'),
 'palace-top': ('a hanging cluster of long faceted pale-blue crystal icicles bundled together and bound with gold filigree, hanging downward',
                'a hanging crystal icicle cluster with gold filigree that ends in an ornate gold chandelier pendant with a crystal drop'),
}
for k, (stem, tip) in OB.items():
    z, side = k.split('-')
    A[f'ob-{k}-stem'] = (f'A game obstacle body: {stem}. {Z[z]}. {STEM}', '9:16', 'transparent')
    A[f'ob-{k}-tip'] = (f'A game obstacle end piece: {tip}. {Z[z]}. ' + TIP.format(
        edge='bottom' if side == 'bot' else 'top', dir='UP toward the top of the image' if side == 'bot' else 'DOWN toward the bottom of the image'),
        '1:1' if k == 'magma-bot' else '3:4', 'transparent')


# A2 flat neon restyle (ART_STYLE=neon): one full object per obstacle (pack.py slices it into stem + tip), surprises and bosses,
# every call with the approved style references attached so all assets share one look.
REFS = [os.path.join(os.environ.get('ART_REFS', ''), f) for f in ('A2-trim.png', 'canyon-trim.png')]
NZ = {  # interior fills, neon outline (the zone's gate hue), accents
 'grove':  ('dark navy-teal (#0f2a33, #123f45)', 'bright neon green (#5cff3a)', 'small aqua (#3dffd8) glowing accents'),
 'canyon': ('dark plum-navy (#2a1830, #3a2040) with flat slightly lighter plum facets', 'bright orange (#ff8a3d)', 'thin cyan (#3de8ff) neon accent stripes'),
 'magma':  ('near-black basalt (#1a1216, #2a1c20) with flat dark facets', 'bright red-orange (#ff4b1f)', 'glowing yellow (#ffd23d) lava cracks and highlights'),
 'palace': ('deep navy (#141a3a, #20285a) with flat violet (#5a3a9a) facets', 'bright gold (#f5c43d)', 'violet (#da77f8) and pale cyan (#a1e3ff) glowing accents'),
}
NSTYLE = ('Match the art style of the attached reference images (flat vector neon arcade art): same simplicity and the same thick glowing '
          'edge treatment. Original design. FLAT NEON VECTOR: flat 2-3 tone fills only, no gradients, no texture, no painterly shading, no 3D render; '
          'interior {fill}; a thick {line} neon outline with a soft outer glow tracing the full outer silhouette; {acc}; simple geometric shapes, '
          'minimal detail, crisp clean silhouette, isolated on a fully transparent background, no text, no letters, no watermark, no ground, no shadow.')
NCOL = ('The body is ONE THICK SOLID column that fills about 40 percent of the image width, the SAME width along its whole length, '
        'with smooth parallel vertical sides and NOTHING sticking out of its sides; all decoration ({deco}) is drawn INSIDE the column outline as '
        'simple flat shapes repeating evenly along it. The column runs off the {edge} edge of the image (cut off flat there). The end piece '
        '({end}) stays as wide as the column where it joins, then narrows only near its very end, pointing {dir}. Front view, centered, vertical.')
NOB = {
 'grove-bot':  ('a carnivorous-plant stalk rising straight up from the ground', 'flat leaf shapes pressed flat on the stalk and a few straight vein lines',
                'a closed pointed glowing flower bud only about 1.4 times as wide as the column, with straight vein lines'),
 'grove-top':  ('a thick bundle of hanging vines and roots hanging straight down from the ceiling', 'braided vine bands and small flat leaf shapes',
                'a cluster of thorny seed pods with glowing cores'),
 'canyon-bot': ('a desert hoodoo: a column of stacked balanced rounded boulders rising from the ground', 'flat-sided boulders stacked flush so the column edge stays straight, each boulder outlined, flat lighter facets',
                'a flat cap rock slab only about 1.4 times as wide as the column, with a cyan stripe across it'),
 'canyon-top': ('a hanging column of layered rock hanging straight down from the ceiling', 'horizontal rock layers with flat facets and cyan mineral stripes',
                'a cluster of sharp stalactites'),
 'magma-bot':  ('a rising column of lava fire erupting from the ground', 'flat dark basalt crust plates with glowing yellow lava cracks between them',
                'a crest of stylised flames'),
 'magma-top':  ('a thick flow of molten lava hanging straight down from the ceiling', 'flat dark crust plates with glowing yellow lava seams',
                'heavy glowing lava drips'),
 'palace-bot': ('a crystal spire rising from the ground', 'faceted crystal panels and a thin spiral gold band',
                'a polished gold ring then a sharp faceted crystal point'),
 'palace-top': ('a bundle of crystal icicles hanging straight down from the ceiling', 'long faceted crystal panels bound by thin gold bands',
                'a wide ornate gold chandelier pendant, as wide as the column for most of its length, ending in a short crystal drop'),
}
N = {}
for k, (subj, deco, end) in NOB.items():
    z, side = k.split('-')
    bot = side == 'bot'
    N[f'ob-{k}'] = ('Game obstacle sprite for a 2D mobile arcade flyer: ' + subj + '. ' + NCOL.format(
        deco=deco, end=end, edge='bottom' if bot else 'top', dir='UP' if bot else 'DOWN') + ' ' + NSTYLE.format(
        fill=NZ[z][0], line=NZ[z][1], acc=NZ[z][2]) + ' Not a pipe.', '9:16')
NSUR = dict(SUR, **{
 'snap-grove':  'the head of a carnivorous flytrap plant bursting upward, big open jaws with a row of triangular thorn teeth, mouth facing UP toward the top of the image, thick stem at the bottom, two big glowing eyes',
 'snap-canyon': 'the head of a giant sandworm bursting upward, round open maw with a ring of triangular teeth facing UP toward the top of the image, segmented body at the bottom',
 'snap-magma':  'the head of a lava serpent bursting upward, open jaws with a glowing mouth facing UP toward the top of the image, scaly neck at the bottom, glowing eyes',
 'shot-grove':  'a spiky seed pod projectile flying to the LEFT, round pod with short spikes and a glowing core, a short streak trail to the right',
 'shot-canyon': 'a round boulder projectile flying to the LEFT, cracked facets and a short speed-line trail to the right',
 'shot-magma':  'a fireball projectile flying to the LEFT, round molten core with stylised flame tail streaming to the right',
 'shot-palace': 'a chunky ice spear projectile flying to the LEFT, a thick crystal arrowhead pointing left and a short frosty tail to the right, about twice as wide as tall',
})
for k, v in NSUR.items():
    z = k.split('-')[1]
    N[f'sur-{k}'] = (f'Game hazard sprite for a 2D mobile arcade flyer: {v}. Bold simple silhouette that reads at 32 pixels, centered. '
                     + NSTYLE.format(fill=NZ[z][0], line=NZ[z][1], acc=NZ[z][2]), '1:1')
NBOSS = {
 'mawbloom':   'a giant carnivorous flower monster with a huge toothy flower-head maw ringed by thick petals, thorny vine arms and leaf hands',
 'dunehulk':   'a hulking rock golem built of big stacked boulders, glowing cyan eyes and cyan rune stripes, massive fists',
 'cinderwyrm': 'a lava serpent-dragon with a coiled serpentine body, basalt scale plates, glowing lava belly, horned head and open jaws',
 'moltenking': 'a towering magma titan king with a cracked basalt body full of glowing lava seams and a crown of fire on its head',
 'stormcrown': 'a thunder sovereign whose body is a swirling dark storm cloud with big glowing eyes, a crackling lightning crown and gold armour pieces',
}
for k, v in NBOSS.items():
    z = BOSS[k][1]
    N[f'boss-{k}'] = (f'Boss monster for a 2D mobile arcade flyer: {v}. Facing LEFT in side view, looking toward the left edge of the image, '
                      'cartoon menace, not gore, big readable eyes and mouth, full body visible, taller than wide, bold silhouette that reads at 150 pixels. '
                      + NSTYLE.format(fill=NZ[z][0], line=NZ[z][1], acc=NZ[z][2]), '3:4')


def run(name):
    if os.environ.get('ART_STYLE') == 'neon':
        prompt, ar = N[name]
        bg, refs = 'transparent', [x for r in REFS for x in ('--image', r)]
    else:
        (prompt, ar, bg), refs = A[name], []
    ids = json.loads(subprocess.check_output(['higgsfield', 'generate', 'create', 'gpt_image_2_5', '--prompt', prompt,
        '--background', bg, '--quality', 'high', '--aspect_ratio', ar, *refs, '--json']))
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
    RAW.mkdir(parents=True, exist_ok=True)
    pool = N if os.environ.get('ART_STYLE') == 'neon' else A
    names = list(pool) if sys.argv[1:] == ['all'] else sys.argv[1:]
    with ThreadPoolExecutor(8) as ex:
        for n, s in ex.map(safe, names):
            print(n, s, flush=True)
