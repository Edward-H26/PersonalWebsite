"""espalier: a fan-trained fruit tree flat against a wall on an oak trellis, for the inn's south wall (DESIGN.md
section 13): a short trunk opening into a fan of seven tied branches over a diamond lattice, clusters of leaves along
them and apples in the brand red with a few golden pears. Real size, 2.4 m wide and tall on the carpenter's module,
its back on the wall plane (+Y), facing out along -Y; one mesh, one vertex-coloured material."""

import math
import random

import bmesh
from mathutils import Vector

from island import flora, mesh, parts, style

SPAN, LATH, BRANCHES = 2.4, 0.035, 7
TRUNK_TOP = 0.45


def build(seed=7, exposure=flora.INLAND):
    rng = random.Random(seed)
    objs = _trellis() + _tree(rng, flora.greens(exposure))
    return flora.finish("isl_espalier", objs)


def _trellis():
    """An oak frame with a diamond lattice of laths a little proud of the wall."""
    oak = style.material("timber")
    objs = [mesh.box("trellis_post", (0.07, 0.06, SPAN), at=(x, -0.03, 0.0), origin="bottom", mat=oak) for x in (-SPAN / 2, SPAN / 2)]
    objs.append(mesh.box("trellis_rail", (SPAN + 0.07, 0.06, 0.07), at=(0.0, -0.03, SPAN - 0.035), mat=oak))
    lath = style.material("plank_light")
    step = SPAN / 4
    for k in range(-3, 4):
        for sign in (-1, 1):
            a = Vector((k * step - SPAN / 2 * sign, -0.05, 0.25))
            b = Vector((k * step + SPAN / 2 * sign, -0.05, SPAN - 0.1))
            a, b = _clip(a, b)
            if a is not None:
                objs.append(mesh.beam("lath", a, b, LATH, 0.015, lath))
    return objs


def _clip(a, b):
    """The part of the segment a-b between the posts, or (None, None) when too little of it is."""
    lo, hi = -SPAN / 2 + 0.05, SPAN / 2 - 0.05
    ta, tb = (lo - a.x) / (b.x - a.x), (hi - a.x) / (b.x - a.x)
    t0, t1 = max(0.0, min(ta, tb)), min(1.0, max(ta, tb))
    return (a.lerp(b, t0), a.lerp(b, t1)) if t1 - t0 > 0.05 else (None, None)


def _tree(rng, colours):
    """The trunk, the fan of branches tied flat in front of the lattice, leaf clusters and fruit."""
    bark = style.material("bark")
    root = Vector((0.0, -0.1, 0.0))
    fork = Vector((0.0, -0.1, TRUNK_TOP))
    objs = [mesh.rod("trunk", root, fork, 0.06, bark, segments=6, radius_b=0.045)]
    leaves = bmesh.new()
    layer = flora.colour_layer(leaves)
    fruit = []
    for i in range(BRANCHES):
        a = math.radians(15.0 + 150.0 * i / (BRANCHES - 1)) + rng.uniform(-0.05, 0.05)
        reach = (SPAN / 2 - 0.12) / max(0.35, abs(math.cos(a))) if abs(math.cos(a)) > 0.35 else SPAN - TRUNK_TOP - 0.2
        tip = fork + Vector((math.cos(a), 0.0, math.sin(a))) * min(reach, SPAN - TRUNK_TOP - 0.15) * rng.uniform(0.85, 1.0)
        bend = fork.lerp(tip, 0.5) + Vector((0.0, 0.0, 0.05))
        objs += [mesh.rod("branch", fork, bend, 0.03, bark, segments=5, radius_b=0.022, cap=False),
                 mesh.rod("branch", bend, tip, 0.022, bark, segments=5, radius_b=0.01, cap=False)]
        for t in (0.25, 0.36, 0.47, 0.58, 0.69, 0.8, 0.91, 1.0):
            _leaf_pair(leaves, layer, fork.lerp(tip, t), a, rng, colours)
        if i % 2 == 0 or rng.random() < 0.3:
            spot = fork.lerp(tip, rng.uniform(0.4, 0.85)) + Vector((0.0, -0.05, -0.06))
            key = "paint_red" if rng.random() < 0.75 else "paint_gold"
            fruit.append(parts.blob(rng, 0.045, key, squash=1.0, at=spot))
    objs.append(mesh.from_bmesh("leaves", leaves, style.vertex_colour_material()))
    return objs + fruit


def _leaf_pair(bm, layer, at, angle, rng, colours):
    """Two pointed leaves either side of a branch, facing out from the wall."""
    along = Vector((math.cos(angle), 0.0, math.sin(angle)))
    across = Vector((-math.sin(angle), 0.0, math.cos(angle)))
    tint = flora.mix(colours.body, colours.light, rng.random() * 0.6)
    for side in (-1, 1):
        base = at + Vector((0.0, -0.03, 0.0))
        tip = base + (across * side * 0.15 + along * 0.06) * rng.uniform(0.8, 1.15)
        mid = base.lerp(tip, 0.45)
        wing = along * 0.035
        face = bm.faces.new([bm.verts.new(p) for p in (base, mid - wing, tip, mid + wing)])
        face.normal_update()
        if face.normal.y > 0.0:
            face.normal_flip()
        for loop in face.loops:
            loop[layer] = (*tint, 1.0)
