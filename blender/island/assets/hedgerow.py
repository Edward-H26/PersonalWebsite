"""hedgerow: one piece of the hawthorn hedgerows along the fields (DESIGN.md section 17), LENGTH long so the site
chains pieces end to end. A few crooked woody stems show under a dense, slightly lumpy body of hawthorn leaf clusters
whose cards face out from the hedge's core, dark low and inside, lighter on top and warm toward the key light; the
foliage runs right out over its flush ends, so two pieces meet without a gap and a lone end still reads as hedge. One
mesh under the foliage family's textured material, with the wind channel."""

import math
import random

from mathutils import Vector

from island import cards, flora

LENGTH, DEPTH, HEIGHT = 4.0, 1.1, 1.6
CARDS, CARD_SIZE, STEMS = 240, (0.5, 0.78), 6
UP = Vector((0.0, 0.0, 1.0))


def build(seed=7, exposure=flora.INLAND):
    rng = random.Random(seed)
    plant = cards.Plant("foliage")
    greens = flora.greens(exposure)
    phase = (rng.uniform(0.0, math.pi), rng.uniform(0.0, math.pi))
    _stems(rng, plant, greens)
    _leaves(rng, plant, greens, phase)
    return plant.finish("isl_hedgerow")


def _top(x, phase):
    """The hedge's top along its length: a gently lumpy crown, the same at both ends so pieces join."""
    k = 2 * math.pi / LENGTH
    return HEIGHT * (1.0 + 0.05 * math.sin(k * x + phase[0]) + 0.035 * math.sin(2 * k * x + phase[1]))


def _half_width(z, top):
    """Half the hedge's depth at height z: full up to the shoulder, rounding over the top."""
    u = z / top
    return DEPTH / 2 * (1.0 if u < 0.7 else math.sqrt(max(0.0, 1.0 - ((u - 0.7) / 0.3) ** 2)) * 0.85 + 0.15)


def _shade(greens, point, outward, top):
    rise = max(0.0, min(1.0, point.z / top))
    colour = flora.mix(greens.shade, greens.body, 0.3 + 0.55 * rise)
    colour = flora.mix(colour, greens.light, 0.3 * max(0.0, outward.dot(flora.KEY_LIGHT)) * rise)
    return colour


def _stems(rng, plant, greens):
    """Crooked woody stems along the hedge's line, showing below the foliage."""
    bark = flora.mix(greens.shade, (0.09, 0.07, 0.05), 0.7)
    for k in range(STEMS):
        x = -LENGTH / 2 + LENGTH * (k + 0.5) / STEMS + rng.uniform(-0.25, 0.25)
        y = rng.uniform(-0.2, 0.2)
        path = [Vector((x, y, 0.0))]
        for _ in range(3):
            path.append(path[-1] + Vector((rng.uniform(-0.15, 0.15), rng.uniform(-0.12, 0.12), 0.35)))
        plant.tube(path, [0.06, 0.05, 0.04, 0.03], "bark_apple", lambda p, n: bark, lambda p: 0.0, 0.0, sides=5, tile=0.8)


def _leaves(rng, plant, greens, phase):
    """Hawthorn cluster cards over the hedge's surface: its two long sides, its crown and its ends, each facing out
    from the core and leaning a little up."""
    areas = (("side", 2 * LENGTH * HEIGHT * 0.8), ("top", LENGTH * DEPTH), ("end", 2 * DEPTH * HEIGHT * 0.8))
    total = sum(a for _, a in areas)
    for _ in range(CARDS):
        where = _choose(rng, areas, total)
        x = rng.uniform(-LENGTH / 2, LENGTH / 2)
        top = _top(x, phase)
        if where == "side":
            side = rng.choice((-1, 1))
            z = rng.uniform(0.2, top * 0.82)
            point = Vector((x, side * _half_width(z, top) * rng.uniform(0.9, 1.04), z))
            normal = Vector((0.0, side, rng.uniform(0.05, 0.35)))
        elif where == "top":
            y = rng.uniform(-0.85, 0.85) * DEPTH / 2
            point = Vector((x, y, top * rng.uniform(0.95, 1.02)))
            normal = Vector((0.0, y / (DEPTH / 2) * 0.7, 1.0))
        else:
            end = rng.choice((-1, 1))
            z = rng.uniform(0.2, top * 0.9)
            point = Vector((end * LENGTH / 2, rng.uniform(-0.8, 0.8) * _half_width(z, top), z))
            normal = Vector((end, 0.0, rng.uniform(0.0, 0.3)))
        normal.normalize()
        core = Vector((point.x, 0.0, min(point.z, top) * 0.55))
        colour = _shade(greens, point, normal, top)
        tone = rng.uniform(0.88, 1.08)
        low = tuple(c * tone * 0.78 for c in colour)
        high = tuple(c * tone for c in colour)
        up = UP if abs(normal.z) < 0.8 else Vector((1.0, 0.0, 0.0))
        size = rng.uniform(*CARD_SIZE)
        rise = point.z / HEIGHT
        plant.card(point + normal * 0.04, normal, up, size, size, "hawthorn", (low, high), (0.2 * rise, 0.25 + 0.5 * rise),
                   rng.random(), core, fold=0.35, flip=rng.random() < 0.5)


def _choose(rng, areas, total):
    """A part of the hedge's surface, drawn in proportion to its area."""
    x = rng.uniform(0.0, total)
    for name, area in areas:
        x -= area
        if x <= 0.0:
            return name
    return areas[-1][0]
