"""planter_hydrangea: a half barrel of oak staves and iron hoops, filled with dark soil and a blue hydrangea in flower,
its mophead blooms mottled in Columbia blue tones over broad leaves (DESIGN.md section 9, a scene prop for the doors
of the dwellings and the inn); one mesh, one vertex-coloured material."""

import math
import random

from mathutils import Vector

from island import flora, mesh, style

RADIUS, TUB = 0.32, 0.36
BLUES = ("columbia", "hydrangea_light", "hydrangea_deep")


def build(seed=7):
    rng = random.Random(seed)
    objs = _tub() + _leaves(rng, flora.greens(flora.INLAND)) + _blooms(rng)
    return flora.finish("isl_planter_hydrangea", objs)


def _tub():
    """Half a barrel: staves bellying slightly, two iron hoops and soil a little below the rim."""
    profile = [(RADIUS * 0.86, 0.0), (RADIUS * 0.9, 0.04), (RADIUS * 0.97, 0.08), (RADIUS * 1.0, TUB * 0.55),
               (RADIUS * 0.99, TUB * 0.68), (RADIUS * 0.98, TUB), (RADIUS * 0.92, TUB)]
    tub = mesh.lathe("tub", profile, segments=10, mat=[style.material("iron"), style.material("plank")],
                     band_materials=[0, 1, 1, 0, 1, 1], cap_top=False, sharp_meridians=True)
    soil = mesh.cylinder("soil", RADIUS * 0.97, 0.02, at=(0.0, 0.0, TUB - 0.05), mat=style.material("soil"), segments=10)
    return [tub, soil]


def _leaves(rng, colours):
    """Broad pointed leaves fanning out over the rim."""
    objs = []
    for k in range(8):
        a = 2 * math.pi * (k + rng.uniform(-0.2, 0.2)) / 8
        base = Vector((math.cos(a) * 0.08, math.sin(a) * 0.08, TUB + 0.08))
        objs.append(flora.leaf(rng.uniform(0.22, 0.28), 0.06, base, (math.cos(a), math.sin(a), 0.0), 0.06, 0.1,
                               (colours.shade, colours.body if k % 2 else colours.light), segments=3))
    return objs


def _blooms(rng):
    """Four mophead blooms on short stems, each a lumpy ball of florets mottled in three blues."""
    blues = [style.linear(key) for key in BLUES]

    def mottled(c):
        return flora.scaled(blues[(c.index * 2654435761) % 3], 0.85 + 0.25 * max(0.0, c.face.z))

    objs = []
    for k in range(4):
        a = 2 * math.pi * k / 4 + rng.uniform(-0.3, 0.3)
        r = 0.0 if k == 0 else rng.uniform(0.13, 0.18)
        centre = Vector((math.cos(a) * r, math.sin(a) * r, TUB + rng.uniform(0.28, 0.36) + (0.06 if k == 0 else 0.0)))
        objs.append(mesh.rod("stem", Vector((centre.x * 0.5, centre.y * 0.5, TUB)), centre, 0.008, style.material("leaf_dark"),
                             segments=3, cap=False))
        objs.append(flora.clump(centre, (0.1, 0.1, 0.085), rng, mottled, subdivisions=2, rough=0.3))
    return objs
