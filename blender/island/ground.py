"""Ground cover of DESIGN.md section 13b built from cards: grass clumps of six to twelve blade cards, ferns of arching
frond cards and flowers of petal cards, each from its family's atlas. Every card is dark at the root and light at the
tip, sways more toward its top, and turns its normals up and out of the plant, so a clump shades like a soft mound;
flower heads keep the atlas colour (their corner colour is near white) while leaves and grass take their green from
the corner colour, which is what the site's seasons tint."""

import math

from mathutils import Vector

from island import cards, flora, style

UP = Vector((0.0, 0.0, 1.0))
HAY = style.rgb("#b39a5a")


def _lean(azimuth, degrees):
    """A unit vector leaning `degrees` from vertical toward the horizontal direction `azimuth`."""
    t = math.radians(degrees)
    return Vector((math.cos(azimuth) * math.sin(t), math.sin(azimuth) * math.sin(t), math.cos(t)))


def _blade_colours(greens, rng, dry=0.0):
    """Root and tip colours of a grass card: shade green at the root, body to light green at the tip, now and then a
    straw tip where the grass has dried."""
    tip = flora.mix(greens.body, greens.light, rng.uniform(0.45, 0.85))
    if rng.random() < dry:
        tip = flora.mix(tip, HAY, rng.uniform(0.4, 0.7))
    root = flora.mix(greens.shade, greens.body, 0.35)
    return root, tip


def grass(rng, name, height, width, cards_count, cells, exposure=flora.INLAND, plan=None, lean=(4.0, 18.0), spread=0.12,
          dry=0.15, bend=0.1):
    """A grass clump: blade cards standing round its foot like the spokes of a star, each leaning a little outward,
    bowed by `bend`, dark at the root and light at the tip."""
    plant = cards.Plant("grass")
    greens = flora.greens(exposure)
    anchor = Vector((0.0, 0.0, -height * 0.8))
    for k in range(cards_count):
        a = math.pi * k / cards_count + rng.uniform(-0.25, 0.25)
        normal = Vector((math.cos(a), math.sin(a), 0.0))
        side = Vector((-math.sin(a), math.cos(a), 0.0))
        foot = Vector((rng.gauss(0.0, spread * width), rng.gauss(0.0, spread * width), 0.0))
        up = _lean(math.atan2(side.y, side.x) * (1 if rng.random() < 0.5 else -1), rng.uniform(*lean))
        h, w = height * rng.uniform(0.82, 1.08), width * rng.uniform(0.85, 1.1)
        plant.card(foot, normal, up, w, h, rng.choice(cells), _blade_colours(greens, rng, dry), (0.0, 1.0), rng.random(),
                   anchor, fold=0.12, pivot=0.0, bend=bend * rng.choice((-1.0, 1.0)), rows=3, flip=rng.random() < 0.5)
    return plant.finish(name, plan=plan)


def fern(rng, name, fronds, length, rise, exposure=flora.INLAND, plan=None):
    """A fern rosette: frond cards arching out from the crown, the young ones in the middle standing more upright,
    each curling down toward its tip."""
    plant = cards.Plant("grass")
    greens = flora.greens(exposure)
    anchor = Vector((0.0, 0.0, -length * 0.5))
    for k in range(fronds):
        a = 2 * math.pi * k / fronds + rng.uniform(-0.2, 0.2)
        young = k % 3 == 0
        tilt = rng.uniform(20.0, 30.0) if young else rng.uniform(34.0, 52.0)
        up = _lean(a, tilt)
        out = Vector((math.cos(a), math.sin(a), 0.0))
        normal = (UP - up * up.dot(UP)).normalized()
        size = length * (0.75 if young else 1.0) * rng.uniform(0.88, 1.08)
        colours = (tuple(c * 0.5 for c in greens.shade), flora.mix(greens.body, greens.light, 0.45 if young else 0.25))
        plant.card(out * 0.03, normal, up, size * 0.5, size, "fern", colours, (0.0, 1.0), rng.random(), anchor,
                   fold=0.25, pivot=0.0, bend=-rise * (0.4 if young else 1.0), rows=4, flip=rng.random() < 0.5)
    return plant.finish(name, plan=plan)


FLOWERS = {
    # name: (side cell, top cell, head share of the side card's height, head size against the stem height)
    "marigold": ("marigold_side", "marigold", 0.8, 0.36),
    "cornflower": ("cornflower_side", "cornflower", 0.82, 0.3),
    "daisy": ("daisy_side", "daisy", 0.84, 0.33),
    "poppy": ("poppy_side", "poppy", 0.8, 0.4),
    "dandelion": ("dandelion_side", "dandelion", 0.83, 0.46),
}
WHITE = (1.0, 1.0, 1.0)


def flowers(rng, name, kind, heads, stem, spread, leaves, leaf_cell, leaf_size, exposure=flora.INLAND, plan=None,
            buds=0, bud_cell=None, clocks=0, head_scale=1.0, leaf_tilt=(25.0, 55.0), leaf_lift=0.0):
    """A flowering clump: for each head a card of the flower on its stem, facing a random way, and a card of the
    head seen from above at the stem's top, so it reads from the path and from above; basal leaf tufts round the
    foot; optional buds and seed clocks on their own stems."""
    plant = cards.Plant("flowers")
    greens = flora.greens(exposure)
    side_cell, top_cell, head_at, head_size = FLOWERS[kind]
    anchor = Vector((0.0, 0.0, -stem[1] * 0.6))
    for _ in range(leaves):
        a = rng.uniform(0.0, 2 * math.pi)
        up = _lean(a, rng.uniform(*leaf_tilt))
        normal = (UP - up * up.dot(UP)).normalized()
        size = leaf_size * rng.uniform(0.85, 1.15)
        foot = Vector((rng.gauss(0.0, spread * 0.25), rng.gauss(0.0, spread * 0.25), leaf_lift))
        green = flora.mix(greens.body, greens.light, rng.uniform(0.0, 0.35))
        plant.card(foot, normal, up, size, size, leaf_cell, (tuple(c * 0.55 for c in greens.shade), green), (0.0, 0.4),
                   rng.random(), anchor, fold=0.2, pivot=0.0, bend=-0.1, rows=2, flip=rng.random() < 0.5)
    stems = [(side_cell, top_cell, 1.0)] * heads + [(bud_cell, None, 0.8)] * buds + [("seed_clock", None, 1.15)] * clocks
    for cell, top, scale in stems:
        a = rng.uniform(0.0, 2 * math.pi)
        h = rng.uniform(*stem) * scale
        foot = Vector((rng.gauss(0.0, spread * 0.3), rng.gauss(0.0, spread * 0.3), 0.0))
        up = _lean(rng.uniform(0.0, 2 * math.pi), rng.uniform(0.0, 9.0))
        normal = Vector((math.cos(a), math.sin(a), 0.0))
        plant.card(foot, normal, up, h, h, cell, ((0.62, 0.66, 0.6), WHITE), (0.0, 1.0), rng.random(), foot - normal,
                   fold=0.1, pivot=0.0, rows=2, flip=rng.random() < 0.5)
        if top:
            head = foot + up * h * head_at
            facing = (UP * 2.0 + normal * 0.6).normalized()
            size = h * head_size * head_scale
            plant.card(head, facing, normal, size, size, top, ((0.9, 0.9, 0.9), WHITE), (0.9, 1.0), rng.random(),
                       head - facing, fold=0.0)
    return plant.finish(name, plan=plan)


def trefoils(rng, name, leaves, size, height, flowers_count, exposure=flora.INLAND, plan=None):
    """Wood sorrel: tufts of trefoil leaves held level on slender stalks just above the ground, with a few small white
    flowers among them."""
    plant = cards.Plant("flowers")
    greens = flora.greens(exposure)
    for _ in range(leaves):
        a = rng.uniform(0.0, 2 * math.pi)
        centre = Vector((math.cos(a), math.sin(a), 0.0)) * rng.uniform(0.0, size * 0.35) + UP * rng.uniform(0.35, 1.0) * height
        normal = (UP + Vector((math.cos(a), math.sin(a), 0.0)) * rng.uniform(0.1, 0.5)).normalized()
        green = flora.mix(greens.body, greens.light, rng.uniform(0.1, 0.5))
        s = size * rng.uniform(0.45, 0.6)
        plant.card(centre, normal, Vector((math.cos(a + 1.0), math.sin(a + 1.0), 0.0)), s, s, "leaf_trefoil",
                   (tuple(c * 0.7 for c in green), green), (0.2, 0.5), rng.random(), centre - UP, fold=0.15)
    for _ in range(flowers_count):
        a = rng.uniform(0.0, 2 * math.pi)
        centre = Vector((math.cos(a), math.sin(a), 0.0)) * rng.uniform(0.0, size * 0.3) + UP * height * rng.uniform(0.75, 0.95)
        s = size * 0.16
        plant.card(centre, UP, Vector((1.0, 0.0, 0.0)), s, s, "daisy", (WHITE, WHITE), (0.6, 0.6), rng.random(),
                   centre - UP, fold=0.0)
    return plant.finish(name, plan=plan)
