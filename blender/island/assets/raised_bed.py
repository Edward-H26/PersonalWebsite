"""raised_bed: a wattle-edged raised bed, one per dwelling (DESIGN.md section 13): hazel stakes round a 2.4 by 1.2 m
bed, the carpenter's module, with withies woven in and out between them, dark soil and three rows of herbs, grey-green
sage, sage with lavender in flower and bright parsley; real size, one mesh, one vertex-coloured material."""

import math
import random

import bmesh
from mathutils import Vector

from island import flora, mesh, style

LENGTH, WIDTH, HEIGHT = 2.4, 1.2, 0.4
STAKE, COURSES, COURSE = 0.4, 5, 0.058
WEAVE = 0.02


def build(seed=7, exposure=flora.INLAND):
    rng = random.Random(seed)
    stakes = _stakes()
    objs = [mesh.box("stake", (0.04, 0.04, HEIGHT + 0.06), at=(p.x, p.y, 0.0), origin="bottom", mat=style.material("plank"))
            for p, _ in stakes]
    objs += [_withy(rng, stakes, c) for c in range(COURSES)]
    objs += [_soil()] + _herbs(rng, flora.greens(exposure))
    return flora.finish("isl_raised_bed", objs)


def _stakes():
    """Stakes every STAKE metres round the rectangle, each with the outward normal of its side."""
    corners = [Vector((-LENGTH / 2, -WIDTH / 2, 0.0)), Vector((LENGTH / 2, -WIDTH / 2, 0.0)),
               Vector((LENGTH / 2, WIDTH / 2, 0.0)), Vector((-LENGTH / 2, WIDTH / 2, 0.0))]
    stakes = []
    for a, b in zip(corners, corners[1:] + corners[:1]):
        side = b - a
        out = Vector((side.y, -side.x, 0.0)).normalized()
        count = round(side.length / STAKE)
        stakes += [(a.lerp(b, i / count), out) for i in range(count)]
    return stakes


def _withy(rng, stakes, course):
    """One woven course: a ribbon passing each stake on the inside and the next on the outside, the other way round
    on every other course."""
    bm = bmesh.new()
    layer = flora.colour_layer(bm)
    z = 0.04 + course * (HEIGHT - 0.06) / COURSES
    tint = style.linear(("plank_light", "plank")[course % 2])
    points = []
    for i, (p, out) in enumerate(stakes):
        q, _ = stakes[(i + 1) % len(stakes)]
        side = 1 if (i + course) % 2 else -1
        points += [p + out * (side * WEAVE + 0.02), p.lerp(q, 0.5) + out * 0.02]
    rows = [(bm.verts.new(p + Vector((0.0, 0.0, z))), bm.verts.new(p + Vector((0.0, 0.0, z + COURSE)))) for p in points]
    for (a0, a1), (b0, b1) in zip(rows, rows[1:] + rows[:1]):
        face = bm.faces.new((a0, b0, b1, a1))
        for loop in face.loops:
            loop[layer] = (*flora.scaled(tint, 0.9 + 0.2 * rng.random()), 1.0)
    return mesh.from_bmesh("withy", bm, style.vertex_colour_material())


def _soil():
    """The soil a hand below the top course."""
    return mesh.box("soil", (LENGTH - 0.06, WIDTH - 0.06, 0.04), at=(0.0, 0.0, HEIGHT - 0.1), mat=style.material("soil"))


def _herbs(rng, colours):
    """Three rows along the bed: sage mounds, lavender with purple spikes, parsley."""
    sage = (style.linear("sage"), flora.scaled(style.linear("sage"), 0.7), flora.scaled(style.linear("sage"), 1.2))
    parsley = flora.Greens(*(flora.scaled(c, 1.05) for c in colours))
    rows = ((-0.35, sage, 0.13), (0.0, sage, 0.11), (0.35, parsley, 0.1))
    objs = []
    for row, (y, tints, size) in enumerate(rows):
        for i in range(5):
            x = -LENGTH / 2 + 0.3 + i * (LENGTH - 0.6) / 4 + rng.uniform(-0.04, 0.04)
            centre = Vector((x, y + rng.uniform(-0.03, 0.03), HEIGHT - 0.08 + size * 0.6))
            objs.append(flora.clump(centre, (size, size, size * 0.75), rng, flora.leafy(flora.Greens(*tints))))
            if row == 1:
                objs += _spikes(rng, centre, size)
    return objs


def _spikes(rng, centre, size):
    """Lavender spikes standing out of a mound."""
    purple = style.material("lavender")
    objs = []
    for k in range(4):
        a = 2 * math.pi * k / 4 + rng.uniform(-0.3, 0.3)
        foot = centre + Vector((math.cos(a) * size * 0.3, math.sin(a) * size * 0.3, size * 0.3))
        tip = foot + Vector((math.cos(a) * 0.04, math.sin(a) * 0.04, size * 1.1))
        objs.append(mesh.rod("lavender", foot, tip, 0.012, purple, segments=4, radius_b=0.004))
    return objs
