"""market_stand_01: a narrow Fachwerk market stall (DESIGN.md section 10) running along Y with its counter open to +X.
A squared oak frame on stone pads with curved knee braces, a boxed counter in a Colmar tint with baskets of apples,
cabbages and bread, a Columbia blue and white striped awning sloping down over the customers with a scalloped
valance, a striped curtain closing the back, the brand lantern hanging from the front beam, a crate under the
counter and a sack beside it. Its goods are in the brand colours (DESIGN.md section 13)."""

import math
import random

from mathutils import Matrix

from island import mesh, parts

LENGTH, FRONT, BACK = 2.4, 0.44, -0.44
FRONT_TOP, BACK_TOP = 2.02, 2.42
# Goods in the brand colours (DESIGN.md section 13): red apples, lantern-amber oranges and golden loaves.
GOODS = (("paint_red", 0.04), ("amber", 0.05), ("paint_gold", 0.05))
STRIPES = ("white", "columbia")


def build(seed=7):
    rng = random.Random(seed)
    ch = parts.character(seed)
    objs = _counter(rng, ch) + _canopy(rng) + _goods(rng)
    return mesh.finalize("isl_market_stand_01", objs)


def _counter(rng, ch):
    """The tinted counter along Y and a slatted crate pushed in beside it."""
    counter = parts.market_counter(LENGTH - 0.3, 0.6, 0.9, rng, tint=parts.tint(ch, parts.COLMAR_PLASTER))
    objs = mesh.transform(counter, mesh.frame((0.12, 0.0, 0.0), math.pi / 2))
    objs.append(mesh.box("crate", (0.42, 0.55, 0.32), at=(-0.3, 0.75, 0.0), origin="bottom", mat=parts.mat("plank_light"),
                         rot=(0, 0, math.radians(parts.jitter(rng, 6)))))
    return objs


def _canopy(rng):
    """The oak frame, the awning sloping down towards the customers, the curtain at the back and the lantern."""
    half = LENGTH / 2 + 0.06
    objs = mesh.transform(parts.stall_frame(2 * half, FRONT_TOP, BACK_TOP, -FRONT, -BACK, rng), mesh.frame((0.0, 0.0, 0.0), math.pi / 2))
    width = 2 * half + 0.3
    front_edge = FRONT + 0.3
    run = front_edge - BACK
    rise = (BACK_TOP - FRONT_TOP) * run / (FRONT - BACK)
    sheet = parts.awning(width, run, rise, rng, stripes=9, keys=STRIPES, sag=0.05, valance=0.2)
    objs += mesh.transform([sheet], Matrix.Translation((front_edge, 0.0, FRONT_TOP - 0.3 * rise / run + 0.02))
                           @ Matrix.Rotation(math.pi / 2, 4, "Z"))
    curtain = parts.awning(width - 0.1, 0.01, -1.45, rng, stripes=9, keys=STRIPES, sag=0.03, valance=0.0, rows=2)
    objs += mesh.transform([curtain], Matrix.Translation((BACK - 0.08, 0.0, BACK_TOP)) @ Matrix.Rotation(math.pi / 2, 4, "Z"))
    hook = (FRONT, half - 0.35, FRONT_TOP - 0.12)
    objs.append(mesh.rod("lantern_chain", hook, (hook[0], hook[1], hook[2] - 0.18), 0.008, parts.mat("iron"), segments=4))
    return objs + mesh.transform(parts.lantern(size=0.6, hook=False), mesh.frame((hook[0], hook[1], hook[2] - 0.18 - 0.33)))


def _goods(rng):
    objs = []
    for (key, piece), y in zip(GOODS, (-0.72, 0.0, 0.72)):
        basket = parts.basket(rng, radius=rng.uniform(0.17, 0.2), goods=key, piece=piece, pieces=3)
        objs += mesh.transform(basket, mesh.frame((0.12 + parts.jitter(rng, 0.04), y, 0.9)))
    return objs + mesh.transform([parts.sack(rng, (0.36, 0.34, 0.55), upright=True)], mesh.frame((0.48, -1.12, 0.0), 0.4))
