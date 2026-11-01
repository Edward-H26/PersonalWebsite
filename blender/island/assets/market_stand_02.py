"""market_stand_02: the larger Fachwerk market stall (DESIGN.md section 10), running along Y with its counter open to
+X. A squared oak frame on stone pads with curved knee braces and a ridge beam on two king posts, a boxed counter in
a Colmar tint stocked with baskets, a bench of grain sacks behind it, a red and white striped awning falling to both
sides with scalloped valances, a brass balance and the brand lantern hanging from the ridge. Its goods are in the
brand colours (DESIGN.md section 13)."""

import math
import random

from mathutils import Matrix, Vector

from island import mesh, parts

LENGTH, HALF_SPAN = 2.8, 0.62
EAVE, RIDGE, REACH = 2.0, 2.6, 1.2
# Goods in the brand colours (DESIGN.md section 13): lantern-amber apricots, white eggs and Columbia blue plums.
GOODS = (("amber", 0.05), ("white", 0.04), ("columbia", 0.04))


def build(seed=7):
    rng = random.Random(seed)
    ch = parts.character(seed)
    objs = _counter(rng, ch) + _frame(rng) + _awnings(rng) + _scale() + _lantern() + _goods(rng)
    return mesh.finalize("isl_market_stand_02", objs)


def _counter(rng, ch):
    """The tinted counter along Y and a low bench behind it."""
    counter = parts.market_counter(LENGTH - 0.3, 0.7, 0.92, rng, tint=parts.tint(ch, parts.COLMAR_PLASTER))
    objs = mesh.transform(counter, mesh.frame((0.2, 0.0, 0.0), math.pi / 2))
    return objs + mesh.transform(parts.bench(LENGTH - 0.6, rng, height=0.42, depth=0.36), mesh.frame((-0.62, 0.0, 0.0), math.pi / 2))


def _frame(rng):
    """The squared oak frame at the eaves, a king post at the middle of each end carrying the ridge beam."""
    timber = parts.mat("timber")
    half = LENGTH / 2 + 0.08
    objs = mesh.transform(parts.stall_frame(2 * half, EAVE + 0.06, EAVE + 0.06, -HALF_SPAN, HALF_SPAN, rng),
                          mesh.frame((0.0, 0.0, 0.0), math.pi / 2))
    for s in (-1, 1):
        objs.append(mesh.box("king_post", (0.1, 0.1, RIDGE - EAVE + 0.06), at=(0.0, s * half, EAVE - 0.11), origin="bottom",
                             mat=timber))
    objs.append(mesh.box("ridge_beam", (0.1, 2 * half + 0.24, 0.12), at=(0.0, 0.0, RIDGE - 0.12), mat=timber))
    return objs


def _awnings(rng):
    """Two striped sheets from the ridge down past the corner posts, one to each side."""
    width = LENGTH + 0.45
    objs = []
    for side in (1, -1):
        sheet = parts.awning(width, REACH, RIDGE - EAVE + 0.02, rng, stripes=7, keys=("canvas", "paint_red"), sag=0.04,
                             valance=0.18)
        objs += mesh.transform([sheet], Matrix.Translation((side * REACH, 0.0, EAVE))
                               @ Matrix.Rotation(side * math.pi / 2, 4, "Z"))
    return objs


def _scale():
    """A balance hanging from the ridge beam: a chain, the beam and two pans on cords."""
    iron = parts.mat("iron")
    hook = Vector((0.0, 0.75, RIDGE - 0.18))
    pivot = hook - Vector((0.0, 0.0, 0.36))
    objs = [mesh.rod("scale_chain", hook, pivot, 0.008, iron, segments=4),
            mesh.rod("scale_beam", pivot - Vector((0.0, 0.24, 0.0)), pivot + Vector((0.0, 0.24, 0.0)), 0.012, iron, segments=4)]
    for s in (-1, 1):
        end = pivot + Vector((0.0, s * 0.23, 0.0))
        pan = end - Vector((0.0, 0.0, 0.34))
        objs += [mesh.rod("scale_cord", end, pan + Vector((dx, 0.0, 0.02)), 0.004, parts.mat("rope"), segments=3)
                 for dx in (-0.07, 0.07)]
        dish = mesh.lathe("scale_pan", [(0.02, -0.03), (0.09, 0.0), (0.1, 0.02)], segments=8, mat=parts.mat("bronze"))
        dish.location = pan
        objs.append(dish)
    return objs


def _lantern():
    """The brand lantern on a short chain from the ridge beam at the other end."""
    hook = Vector((0.0, -0.95, RIDGE - 0.18))
    objs = [mesh.rod("lantern_chain", hook, hook - Vector((0.0, 0.0, 0.2)), 0.008, parts.mat("iron"), segments=4)]
    return objs + mesh.transform(parts.lantern(size=0.6, hook=False), mesh.frame(hook - Vector((0.0, 0.0, 0.2 + 0.33))))


def _goods(rng):
    objs = []
    for (key, piece), y in zip(GOODS, (-0.85, 0.05, 0.9)):
        basket = parts.basket(rng, radius=rng.uniform(0.18, 0.22), goods=key, piece=piece, pieces=3)
        objs += mesh.transform(basket, mesh.frame((0.22 + parts.jitter(rng, 0.05), y, 0.92)))
    for y in (-0.7, 0.35):
        objs += mesh.transform([parts.sack(rng, (0.36, 0.34, 0.5), upright=True)], mesh.frame((-0.62, y, 0.42), rng.uniform(0, 3)))
    return objs
