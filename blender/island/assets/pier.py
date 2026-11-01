"""pier: a 19 m timber pier on round posts. Bents of two posts with a cap beam and cross braces every 2.35 m,
stringers under a plank deck with a few planks missing, a sagging rope rail on the left, iron bollards every
4.8 m on the right, three steps down to a lower landing with a ladder at the sea end (-Y), barrels at the shore
end (+Y), coils of rope along the deck and a lantern post at each end. The model's Z = 0 is the waterline the
posts reach 1 m below; the deck top sits where the original's did, 3.66 m above the lowest post foot."""

import math
import random

from mathutils import Vector

from island import mesh, parts, style

HALF_LENGTH, HALF_WIDTH = 9.5, 1.45
FOOT = -0.99
DECK, LANDING = 2.67, 2.07
WET = 1.5
STEP_TOP, LANDING_START = -6.9, -7.6
BENTS = [-9.4 + 2.35 * k for k in range(9)]
BOLLARDS = (-6.2, -1.4, 3.4, 8.2)
RAIL_TOP = 3.62
PLANK = (0.25, 0.07)


def deck_top(y):
    return LANDING if y < LANDING_START else DECK


def build(seed=7):
    with style.weathered():
        return _build(random.Random(seed))


def _build(rng):
    objs = []
    for y in BENTS:
        objs += _bent(rng, y)
    objs += _stringers() + _planks(rng) + _steps(rng) + _rope_rail(rng) + _cargo(rng) + _ladder()
    objs += _lantern_post(-HALF_WIDTH + 0.28, HALF_LENGTH - 0.45, DECK)
    objs += _lantern_post(-HALF_WIDTH + 0.28, -HALF_LENGTH + 0.4, LANDING)
    for y in BOLLARDS:
        objs += mesh.transform(parts.bollard(height=0.5, radius=0.11, segments=10), mesh.frame((HALF_WIDTH - 0.3, y, DECK)))
    return mesh.finalize("isl_pier", objs, ground=False)


def _bent(rng, y):
    """Two posts, a cap beam and a cross of braces; the left post rises above the deck as a rail post."""
    top = deck_top(y)
    cap = top - PLANK[1] - 0.2
    rail = y > STEP_TOP
    objs = parts.pier_post(FOOT + abs(parts.jitter(rng, 0.08)), RAIL_TOP if rail else cap, 0.125, rng, water=WET)
    objs = mesh.transform(objs, mesh.frame((-HALF_WIDTH, y, 0.0)))
    right = parts.pier_post(FOOT + abs(parts.jitter(rng, 0.08)), cap, 0.125, rng, water=WET)
    objs += mesh.transform(right, mesh.frame((HALF_WIDTH, y, 0.0)))
    timber = parts.mat("driftwood")
    objs.append(mesh.box("cap_beam", (2 * HALF_WIDTH + 0.4, 0.22, 0.25), at=(0.0, y, cap - 0.125), mat=timber, bevel=0.015))
    for sx in (-1, 1):
        objs.append(mesh.beam("cross_brace", (sx * HALF_WIDTH, y + 0.14, 0.2), (-sx * HALF_WIDTH, y + 0.14, cap - 0.35),
                              0.05, 0.2, timber))
    return objs


def _stringers():
    objs = []
    for x in (-1.1, -0.37, 0.37, 1.1):
        for y0, y1, top in ((STEP_TOP, HALF_LENGTH, DECK), (-HALF_LENGTH, LANDING_START, LANDING)):
            z = top - PLANK[1] - 0.1
            objs.append(mesh.box("stringer", (0.14, y1 - y0, 0.2), at=(x, (y0 + y1) / 2, z), mat=parts.mat("timber")))
    return objs


def _planks(rng):
    """Deck planks laid across, each a little crooked; two are missing near the steps."""
    objs = []
    for y0, y1, top in ((STEP_TOP, HALF_LENGTH, DECK), (-HALF_LENGTH, LANDING_START, LANDING)):
        count = int((y1 - y0) / (PLANK[0] + 0.03))
        for i in range(count):
            if top == DECK and i in (2, 5):
                continue
            y = y0 + (i + 0.5) * (y1 - y0) / count
            length = 2 * HALF_WIDTH + 0.1 + parts.jitter(rng, 0.08)
            key = parts.pick(rng, (("driftwood", 0.55), ("plank", 0.45)))
            objs.append(mesh.box("deck_plank", (length, PLANK[0] + parts.jitter(rng, 0.015), PLANK[1]),
                                 at=(parts.jitter(rng, 0.05), y, top - PLANK[1] / 2 + parts.jitter(rng, 0.006)),
                                 rot=(0, math.radians(parts.jitter(rng, 0.6)), math.radians(parts.jitter(rng, 1.2))),
                                 mat=parts.mat(key)))
    return objs


def _steps(rng):
    """Three steps from the deck down to the landing on two sloping stringers."""
    rise = (DECK - LANDING) / 3
    run = (STEP_TOP - LANDING_START) / 2
    objs = []
    for i in (1, 2):
        y = STEP_TOP - run * (i - 0.5)
        objs.append(mesh.box("step", (2 * HALF_WIDTH - 0.1, run + 0.04, 0.07), at=(0.0, y, DECK - rise * i - 0.035),
                             rot=(0, 0, math.radians(parts.jitter(rng, 0.8))), mat=parts.mat("plank")))
    for x in (-HALF_WIDTH + 0.15, HALF_WIDTH - 0.15):
        objs.append(mesh.beam("step_stringer", (x, STEP_TOP + 0.1, DECK - 0.1), (x, LANDING_START - 0.1, LANDING - 0.12),
                              0.08, 0.22, parts.mat("timber")))
    return objs


def _rope_rail(rng):
    posts = [y for y in BENTS if y > STEP_TOP]
    objs = []
    for a, b in zip(posts, posts[1:]):
        points = parts.sag((-HALF_WIDTH, a, RAIL_TOP - 0.1), (-HALF_WIDTH, b, RAIL_TOP - 0.1), 0.16 + parts.jitter(rng, 0.03), 6)
        objs.append(parts.rope(points, 0.025, sides=4, name="rail_rope"))
    return objs


def _cargo(rng):
    """Barrels at the shore end and coils of rope on the deck and the landing."""
    objs = mesh.transform(parts.barrel(rng, segments=12), mesh.frame((0.55, 8.9, DECK)))
    objs += mesh.transform(parts.barrel(rng, segments=12), mesh.frame((1.0, 8.1, DECK)))
    for x, y, top in ((0.75, 3.4, DECK), (-0.55, -2.6, DECK), (0.65, -8.7, LANDING)):
        coil = parts.rope_coil(radius=rng.uniform(0.26, 0.34), turns=2.5, sides=4, per_turn=12)
        objs += mesh.transform(coil, mesh.frame((x, y, top), rng.uniform(0.0, 2 * math.pi)))
    return objs


def _lantern_post(x, y, deck):
    """A tall post with an arm reaching over the deck and a lantern hanging from it on a short chain."""
    timber = parts.mat("timber")
    top = deck + 3.68
    objs = [mesh.beam("lantern_post", (x, y, deck), (x, y, top), 0.2, 0.2, timber, bevel=0.015),
            mesh.beam("lantern_arm", (x - 0.1, y, top - 0.2), (x + 0.95, y, top - 0.2), 0.12, 0.14, timber, bevel=0.012),
            mesh.beam("lantern_brace", (x, y, top - 0.85), (x + 0.6, y, top - 0.26), 0.08, 0.08, timber),
            mesh.box("post_cap", (0.28, 0.28, 0.08), at=(x, y, top + 0.04), mat=timber, bevel=0.012)]
    hook = Vector((x + 0.78, y, top - 0.27))
    objs.append(mesh.rod("lantern_chain", hook, hook - Vector((0.0, 0.0, 0.25)), 0.01, parts.mat("iron"), segments=4))
    return objs + mesh.transform(parts.lantern(size=1.5, hook=False), mesh.frame(hook - Vector((0.0, 0.0, 0.25 + 0.55 * 1.5))))


def _ladder():
    """An iron ladder from the landing down into the water."""
    iron = parts.mat("iron")
    x = HALF_WIDTH + 0.06
    objs = [mesh.rod("ladder_rail", (x, y, 0.2), (x, y, LANDING + 0.5), 0.02, iron, segments=6) for y in (-8.3, -8.75)]
    for i in range(6):
        z = 0.5 + i * 0.3
        objs.append(mesh.rod("ladder_rung", (x, -8.3, z), (x, -8.75, z), 0.014, iron, segments=4))
    return objs
