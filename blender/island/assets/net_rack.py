"""net_rack: fishing nets hung to dry on the quay (DESIGN.md section 17): two posts with knee braces carry a pole, and a
hemp net hangs over it on both sides in loose folds, its diamond mesh drawn as thin cord so the quay shows through,
cork floats along one hem; a fish basket and a coil of rope at the foot of one post. One mesh, the vertex-coloured
props' material."""

import math
import random

import bmesh
from mathutils import Vector

from island import mesh, parts, style

SPAN, POLE_Z, DROP = 3.4, 2.25, 1.65
MESH_PITCH, CORD = 0.26, 0.014
SLOPE = 0.55  # how far a diamond line runs along the pole per metre it hangs


def build(seed=7):
    rng = random.Random(seed)
    phase = rng.uniform(0.0, math.pi)
    with style.weathered():
        objs = _frame(rng) + [_net(phase)] + _floats(rng, phase) + _foot(rng)
    return mesh.finalize("isl_net_rack", objs)


def _frame(rng):
    """Two posts with knee braces and the pole across their tops."""
    timber = parts.mat("timber")
    objs = []
    for side in (-1, 1):
        x = side * SPAN / 2
        objs.append(mesh.box("rack_post", (0.12, 0.12, POLE_Z + 0.1), at=(x, 0.0, 0.0), origin="bottom", mat=timber,
                             rot=(0.0, math.radians(parts.jitter(rng, 1.5)), 0.0)))
        objs.append(mesh.beam("rack_brace", (x, 0.0, POLE_Z - 0.55), (x - side * 0.45, 0.0, POLE_Z - 0.02), 0.07, 0.07, timber))
    objs.append(mesh.rod("rack_pole", (-SPAN / 2 - 0.25, 0.0, POLE_Z + 0.04), (SPAN / 2 + 0.25, 0.0, POLE_Z + 0.04), 0.055, timber,
                         segments=8))
    return objs


def _drape(u, v, phase):
    """A point on the hanging net: u along the pole, v from -1 (bottom of one side) over the pole to 1 (the other)."""
    a = abs(v)
    side = 1.0 if v >= 0.0 else -1.0
    fold = 0.07 * math.sin(4.2 * u + phase) * a
    y = side * (0.07 + 0.22 * a * a) + fold
    z = POLE_Z + 0.06 - DROP * a - 0.12 * math.sin(math.pi * (u / SPAN + 0.5)) * a
    return Vector((u * (1.0 - 0.05 * a), y, z))


def _net(phase):
    """The diamond mesh as cords: two families of lines crossing at MESH_PITCH, each a thin ribbon over the drape."""
    bm = bmesh.new()
    half = SPAN / 2 - 0.15
    reach = SLOPE * DROP
    for family in (-1, 1):
        start = -half - reach
        while start <= half + reach:
            points = []
            for k in range(13):
                v = -1.0 + 2.0 * k / 12
                u = start + family * SLOPE * DROP * v
                if -half <= u <= half:
                    points.append(_drape(u, v, phase))
            for a, b in zip(points, points[1:]):
                along = (b - a).normalized()
                out = Vector((0.0, 1.0 if a.y >= 0.0 else -1.0, 0.0))
                side = along.cross(out).normalized() * CORD
                quad = [a - side, a + side, b + side, b - side]
                face = bm.faces.new([bm.verts.new(p) for p in quad])
                face.normal_update()
            start += MESH_PITCH
    return mesh.from_bmesh("net", bm, parts.mat("rope"))


def _floats(rng, phase):
    """Cork floats strung along the hem of the net's near side."""
    objs = []
    u = -SPAN / 2 + 0.3
    while u < SPAN / 2 - 0.25:
        p = _drape(u, -1.0, phase) + Vector((0.0, -0.03, -0.02))
        objs.append(mesh.cylinder("cork", 0.05, 0.11, at=p, rot=(0.0, math.pi / 2, 0.0), segments=6,
                                  mat=parts.mat("plank_light" if rng.random() < 0.8 else "paint_red")))
        u += 0.32
    return objs


def _foot(rng):
    """A fish basket and a coil of rope by the left post."""
    objs = mesh.transform(parts.basket(rng, radius=0.24, height=0.2, goods="stone_light", pieces=5), mesh.frame((-SPAN / 2 + 0.45, -0.55, 0.0)))
    return objs + mesh.transform(parts.rope_coil(radius=0.26, turns=2.5, thickness=0.022, sides=4), mesh.frame((SPAN / 2 - 0.5, -0.5, 0.0)))
