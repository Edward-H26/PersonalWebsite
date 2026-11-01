"""arbour: a small rose arch over the path to the well (DESIGN.md section 13): two oak posts a side joined by rungs, a
round arch of bent withies over the 1.2 m path tied across by bars, and a climbing rose in clumps of leaves with red
and white Tudor roses. Real size, about 2.4 m tall, the path running through along Y; one mesh, one vertex-coloured
material."""

import math
import random

from mathutils import Vector

from island import flora, mesh, style

HALF_SPAN, HALF_DEPTH, POST = 0.62, 0.28, 1.8
ARCH_STEPS, ROSES = 8, 20


def build(seed=7, exposure=flora.INLAND):
    rng = random.Random(seed)
    frame, arch = _frame(), _arch_points()
    objs = frame + _hoops(arch) + _rose(rng, arch, flora.greens(exposure))
    return flora.finish("isl_arbour", objs)


def _frame():
    """Four oak posts and two rungs on each side between them."""
    oak = style.material("timber")
    objs = []
    for x in (-HALF_SPAN, HALF_SPAN):
        for y in (-HALF_DEPTH, HALF_DEPTH):
            objs.append(mesh.box("arbour_post", (0.08, 0.08, POST), at=(x, y, 0.0), origin="bottom", mat=oak))
        for z in (0.55, 1.15):
            objs.append(mesh.box("arbour_rung", (0.05, 2 * HALF_DEPTH, 0.05), at=(x, 0.0, z), mat=oak))
    return objs


def _arch_points():
    return [Vector((-HALF_SPAN * math.cos(math.pi * i / ARCH_STEPS), 0.0, POST + HALF_SPAN * math.sin(math.pi * i / ARCH_STEPS)))
            for i in range(ARCH_STEPS + 1)]


def _hoops(arch):
    """A bent hoop over each pair of posts and bars tying them across the top."""
    withy = style.material("plank")
    objs = []
    for y in (-HALF_DEPTH, HALF_DEPTH):
        line = [p + Vector((0.0, y, 0.0)) for p in arch]
        objs += [mesh.rod("hoop", a, b, 0.03, withy, segments=5, cap=False) for a, b in zip(line, line[1:])]
    for p in arch[1:-1:2]:
        objs.append(mesh.rod("tie_bar", p + Vector((0.0, -HALF_DEPTH - 0.04, 0.0)), p + Vector((0.0, HALF_DEPTH + 0.04, 0.0)), 0.022,
                             withy, segments=4))
    return objs


def _rose(rng, arch, colours):
    """A garland of small leaf clumps climbing the posts and over the hoops, starred with red and white roses."""
    spots = [Vector((s * HALF_SPAN, (1 if k % 2 else -1) * HALF_DEPTH, z)) for s in (-1, 1)
             for k, z in enumerate((0.35, 0.7, 1.05, 1.4, 1.7))]
    spots += [arch[i] + Vector((0.0, (1 if i % 2 else -1) * HALF_DEPTH, 0.02)) for i in range(1, ARCH_STEPS)]
    objs = []
    for spot in spots:
        size = rng.uniform(0.13, 0.18)
        objs.append(flora.clump(spot + Vector((rng.uniform(-0.04, 0.04), rng.uniform(-0.04, 0.04), 0.0)),
                                (size, size * 1.1, size * 0.85), rng, flora.leafy(colours, 0.9), rough=0.35))
    red, white, heart = style.linear("paint_red"), style.linear("white"), style.linear("petal_yellow")
    for k in range(ROSES):
        spot = spots[(k * 7) % len(spots)]
        a = rng.uniform(0.0, 2 * math.pi)
        rose = flora.pompom(0.085, rng, red if k % 3 else white, flora.scaled(red if k % 3 else heart, 0.75), layers=2, petals=4)
        rose.location = spot + Vector((math.cos(a) * 0.1, math.sin(a) * 0.1, rng.uniform(0.08, 0.14)))
        objs.append(rose)
    return objs
