"""Ground cover of DESIGN.md sections 13b and 18.3 built from cards: grass clumps of blade cards with flowering heads,
ferns and bracken of frond cards, clover, and flowers of petal and spike cards, each from its family's atlas. Every
card is dark at the root and light at the tip, sways more toward its top, and turns its normals up and out of the
plant, so a clump shades like a soft mound; flower heads keep the atlas colour (their corner colour is near white)
while leaves and grass take their green from the corner colour, which is what the site's seasons tint."""

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
    # kind: (head share of the side card's height, head size against the stem height); a colour variant's cells are
    # "<variant>" (the head from above) and "<variant>_side" (the flower on its stem).
    "marigold": (0.8, 0.36),
    "cornflower": (0.82, 0.3),
    "daisy": (0.84, 0.33),
    "poppy": (0.8, 0.4),
    "dandelion": (0.83, 0.46),
    "buttercup": (0.84, 0.15),
}
WHITE = (1.0, 1.0, 1.0)


def flowers(rng, name, kind, heads, stem, spread, leaves, leaf_cell, leaf_size, exposure=flora.INLAND, plan=None,
            buds=0, bud_cell=None, clocks=0, head_scale=1.0, leaf_tilt=(25.0, 55.0), leaf_lift=0.0, variant=None):
    """A flowering clump: for each head a card of the flower on its stem, facing a random way, and a card of the
    head seen from above at the stem's top, so it reads from the path and from above; basal leaf tufts round the
    foot; optional buds and seed clocks on their own stems. `variant` names the colour variant's cells (the kind's
    own colours when None)."""
    plant = cards.Plant("flowers")
    greens = flora.greens(exposure)
    head_at, head_size = FLOWERS[kind]
    top_cell = variant or kind
    side_cell = top_cell + "_side"
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


# Straw and seed colours of dry grass, and the green and purple-brown of flowering heads.
STRAW = (style.rgb("#8f7a45"), style.rgb("#d8c48a"))
HEADS = (style.rgb("#7c8456"), style.rgb("#b9ae8a"))


def meadow(rng, name, height, blades, heads, blade_cells, head_cells, dry=False, exposure=flora.INLAND):
    """A clump of meadow grass (DESIGN.md section 18.3): blade cards standing round its foot like the spokes of a
    star, leaning out and bowed, dark at the root and light at the tip, green or, when dry, straw; and taller cards of
    flowering heads standing up out of it in their own seed colours."""
    plant = cards.Plant("grass")
    greens = flora.greens(exposure)
    anchor = Vector((0.0, 0.0, -height * 0.8))
    width = height * 0.5
    for k in range(blades):
        a = math.pi * k / blades + rng.uniform(-0.25, 0.25)
        normal = Vector((math.cos(a), math.sin(a), 0.0))
        side = Vector((-math.sin(a), math.cos(a), 0.0))
        foot = Vector((rng.gauss(0.0, 0.1 * width), rng.gauss(0.0, 0.1 * width), 0.0))
        up = _lean(math.atan2(side.y, side.x) * (1 if rng.random() < 0.5 else -1), rng.uniform(4.0, 20.0))
        h, w = height * rng.uniform(0.8, 1.06), width * rng.uniform(0.85, 1.1)
        if dry:
            root, tip = flora.mix(greens.shade, STRAW[0], 0.6), flora.mix(STRAW[0], STRAW[1], rng.uniform(0.4, 0.9))
        else:
            root, tip = _blade_colours(greens, rng, dry=0.08)
        plant.card(foot, normal, up, w, h, rng.choice(blade_cells), (root, tip), (0.0, 1.0), rng.random(), anchor,
                   fold=0.12, pivot=0.0, bend=0.1 * rng.choice((-1.0, 1.0)), rows=3, flip=rng.random() < 0.5)
    for k in range(heads):
        a = rng.uniform(0.0, math.pi)
        normal = Vector((math.cos(a), math.sin(a), 0.0))
        foot = Vector((rng.gauss(0.0, 0.08 * width), rng.gauss(0.0, 0.08 * width), 0.0))
        h = height * rng.uniform(1.15, 1.4)
        tip = flora.mix(HEADS[0], HEADS[1], rng.uniform(0.2, 0.9) if not dry else 0.9)
        plant.card(foot, normal, _lean(rng.uniform(0.0, 2 * math.pi), rng.uniform(0.0, 8.0)), h * 0.5, h,
                   rng.choice(head_cells), (flora.mix(greens.shade, tip, 0.5), tip), (0.0, 1.0), rng.random(), foot - normal,
                   fold=0.1, pivot=0.0, rows=3, flip=rng.random() < 0.5)
    return plant.finish(name)


def bracken(rng, name, fronds=13, height=(0.6, 0.95), exposure=flora.INLAND):
    """Bracken under the copses: fronds on tall stalks from a creeping root, each broad triangular blade held almost
    level above the woodland floor and leaning out from the clump, seen from above in the bracken cell; each stalk is
    a pair of crossed stalk cards."""
    plant = cards.Plant("grass")
    greens = flora.greens(exposure)
    for k in range(fronds):
        a = 2 * math.pi * k / fronds + rng.uniform(-0.3, 0.3)
        out = Vector((math.cos(a), math.sin(a), 0.0))
        foot = out * rng.uniform(0.0, 0.35)
        h = rng.uniform(*height)
        top = foot + out * h * 0.18 + UP * h
        stalk = flora.mix(greens.shade, HAY, 0.35)
        for turn in (0.0, math.pi / 2):
            facing = Vector((math.cos(a + turn), math.sin(a + turn), 0.0))
            plant.card(foot, facing, top - foot, 0.05, (top - foot).length, "bracken_stalk", (stalk, stalk), (0.0, 0.6),
                       rng.random(), foot - facing, fold=0.0, pivot=0.0, rows=2)
        length = h * rng.uniform(1.0, 1.3)
        along = (out + UP * rng.uniform(0.05, 0.3)).normalized()
        normal = (UP - along * along.dot(UP)).normalized()
        green = flora.mix(greens.shade, greens.body, rng.uniform(0.45, 0.9))
        plant.card(top, normal, along, length * 0.5, length, "bracken", (flora.mix(greens.shade, green, 0.5), green), (0.6, 1.0),
                   rng.random(), top - UP, fold=0.1, pivot=0.0, bend=-0.12, rows=3, flip=rng.random() < 0.5)
    return plant.finish(name)


def spikes(rng, name, cell, leaf_cell, spikes_count, height, leaves, leaf_size, exposure=flora.INLAND):
    """A tall flower of spikes (foxglove, bluebell): a rosette of basal leaf cards and each flowering spike as a
    pair of crossed cards of `cell`, so it reads from every side."""
    plant = cards.Plant("flowers")
    greens = flora.greens(exposure)
    for _ in range(leaves):
        a = rng.uniform(0.0, 2 * math.pi)
        up = _lean(a, rng.uniform(40.0, 70.0))
        normal = (UP - up * up.dot(UP)).normalized()
        size = leaf_size * rng.uniform(0.85, 1.15)
        green = flora.mix(greens.body, greens.light, rng.uniform(0.0, 0.3))
        plant.card(Vector((rng.gauss(0.0, 0.04), rng.gauss(0.0, 0.04), 0.0)), normal, up, size, size, leaf_cell,
                   (tuple(c * 0.55 for c in greens.shade), green), (0.0, 0.4), rng.random(), Vector((0.0, 0.0, -0.3)),
                   fold=0.2, pivot=0.0, bend=-0.12, rows=2, flip=rng.random() < 0.5)
    for _ in range(spikes_count):
        foot = Vector((rng.gauss(0.0, 0.06), rng.gauss(0.0, 0.06), 0.0))
        h = rng.uniform(*height)
        up = _lean(rng.uniform(0.0, 2 * math.pi), rng.uniform(0.0, 7.0))
        turn = rng.uniform(0.0, math.pi)
        for k in (0.0, math.pi / 2):
            facing = Vector((math.cos(turn + k), math.sin(turn + k), 0.0))
            plant.card(foot, facing, up, h * 0.5, h, cell, ((0.62, 0.66, 0.6), WHITE), (0.0, 1.0), rng.random(),
                       foot - facing, fold=0.08, pivot=0.0, rows=2, flip=rng.random() < 0.5)
    return plant.finish(name)


def clover(rng, name, leaves=22, size=0.12, heads=6, exposure=flora.INLAND):
    """A patch of white clover: trefoil leaves held level just above the ground on their stalks, and round white
    heads on short stalks standing over them, each head a pair of crossed cards."""
    plant = cards.Plant("flowers")
    greens = flora.greens(exposure)
    for _ in range(leaves):
        a = rng.uniform(0.0, 2 * math.pi)
        centre = Vector((math.cos(a), math.sin(a), 0.0)) * rng.uniform(0.0, 0.28) + UP * rng.uniform(0.03, 0.09)
        normal = (UP + Vector((math.cos(a), math.sin(a), 0.0)) * rng.uniform(0.05, 0.3)).normalized()
        green = flora.mix(greens.body, greens.light, rng.uniform(0.1, 0.5))
        s = size * rng.uniform(0.8, 1.15)
        plant.card(centre, normal, Vector((math.cos(a + 1.0), math.sin(a + 1.0), 0.0)), s, s, "leaf_trefoil",
                   (tuple(c * 0.7 for c in green), green), (0.2, 0.4), rng.random(), centre - UP, fold=0.15)
    for _ in range(heads):
        a = rng.uniform(0.0, 2 * math.pi)
        foot = Vector((math.cos(a), math.sin(a), 0.0)) * rng.uniform(0.0, 0.22)
        h = rng.uniform(0.1, 0.16)
        for k in (0.0, math.pi / 2):
            facing = Vector((math.cos(a + k), math.sin(a + k), 0.0))
            plant.card(foot, facing, UP, h, h, "clover_head", ((0.8, 0.82, 0.78), WHITE), (0.2, 0.7), rng.random(),
                       foot - facing, fold=0.0, pivot=0.0)
    return plant.finish(name)
