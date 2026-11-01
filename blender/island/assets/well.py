"""well: the village well in Cotswold stone and oak (DESIGN.md section 10). A round shaft of honey stone with jointed
coping stones and dark water deep inside, two oak posts on the coping with cross heads and knee braces carrying a
small stone-tiled roof, a windlass drum with rope wound round it, an iron crank on the front post and a hooped bucket
wound right up to the windlass, hanging in plain view between the posts (DESIGN.md section 13)."""

import math
import random

from mathutils import Matrix

from island import mesh, parts

OUTER, INNER, WALL = 0.74, 0.5, 0.8
POST_Y, POST_TOP, SPAN = 0.86, 2.25, 1.2
DRUM_Z = 1.5
BUCKET_SCALE = 1.2
PITCH = 50.0


def build(seed=7):
    rng = random.Random(seed)
    objs = _shaft(rng) + _frame() + _roof(rng) + _windlass(rng)
    return mesh.finalize("isl_well", objs)


def _shaft(rng):
    """The mortar core with water deep inside, stone courses round it and a ring of coping stones."""
    objs = [mesh.lathe("well_core", [(INNER, 0.3), (INNER, WALL), (OUTER - 0.02, WALL), (OUTER - 0.02, 0.0)],
                       segments=16, mat=parts.mat("stone_dark"), cap_bottom=False, cap_top=False),
            mesh.cylinder("well_water", INNER, 0.02, at=(0.0, 0.0, 0.32), mat=parts.mat("water"), segments=16),
            parts.stone_ring(OUTER - 0.02, WALL, rng, course=(0.17, 0.24), length=(0.3, 0.48), keys=parts.HONEY_KEYS, moss=0.5)]
    count = 10
    for k in range(count):
        a0, a1 = 2 * math.pi * (k + 0.03) / count, 2 * math.pi * (k + 0.97) / count
        h = 0.11 + parts.jitter(rng, 0.012)
        base = [parts.ring_point(r, a, WALL) for r, a in ((INNER - 0.04, a0), (OUTER + 0.05, a0), (OUTER + 0.05, a1),
                                                         (INNER - 0.04, a1))]
        key = parts.pick(rng, (("stone_honey_light", 0.7), ("stone_honey", 0.3)))
        objs.append(mesh.hexa("coping", base + [p.copy() for p in base], parts.mat(key)))
        for p in objs[-1].data.vertices[4:]:
            p.co.z += h
    return objs


def _frame():
    """Two posts just outside the ring with cross heads, knee braces and the wall plates of the roof."""
    timber = parts.mat("timber")
    objs = []
    for s in (-1, 1):
        y = s * POST_Y
        objs.append(mesh.box("well_post", (0.15, 0.15, POST_TOP - 0.1), at=(0.0, y, 0.1), origin="bottom", mat=timber))
        objs.append(parts.post_pad(0.0, y, size=0.26))
        objs.append(mesh.box("cross_head", (SPAN + 0.3, 0.16, 0.14), at=(0.0, y, POST_TOP), origin="bottom", mat=timber))
        for sx in (-1, 1):
            objs.append(mesh.beam("knee_brace", (0.0, y, POST_TOP - 0.45), (sx * 0.4, y, POST_TOP + 0.01), 0.07, 0.07,
                                  timber))
    for sx in (-1, 1):
        objs.append(mesh.box("wall_plate", (0.12, 2 * POST_Y + 0.4, 0.12), at=(sx * SPAN / 2, 0.0, POST_TOP + 0.14),
                             origin="bottom", mat=timber))
    return objs


def _roof(rng):
    """A small shingle roof with its ridge along Y and a pair of rafters showing at each open gable."""
    length = 2 * POST_Y + 0.4
    z = POST_TOP + 0.26
    roof = parts.gable_roof(length, SPAN, PITCH, rng, keys=parts.STONE_SLATE_KEYS, eave=0.22, gable=0.16, exposure=0.2,
                            thickness=0.03, run=(0.3, 0.65), rafters=0, barge_size=(0.13, 0.035), ridge_key="copper")
    objs = mesh.transform(roof, mesh.frame((0.0, -length / 2, z), math.pi / 2))
    rise = SPAN / 2 * math.tan(math.radians(PITCH))
    for y in (-length / 2 + 0.1, length / 2 - 0.1):
        objs += [mesh.beam("gable_rafter", (s * SPAN / 2, y, z), (0.0, y, z + rise - 0.04), 0.07, 0.09, parts.mat("timber"))
                 for s in (-1, 1)]
    return objs


def _windlass(rng):
    """The drum with rope wound on it, the rope down to the bucket and an iron crank outside the front post."""
    iron = parts.mat("iron")
    drum = parts.log(rng, 2 * POST_Y + 0.1, 0.09, bark="timber", ends=("plank", "plank"), segments=10)
    objs = mesh.transform([drum], mesh.frame((0.0, 0.0, DRUM_Z), math.pi / 2))
    objs.append(mesh.cylinder("wound_rope", 0.12, 0.42, at=(0.0, 0.12, DRUM_Z), rot=(math.pi / 2, 0, 0),
                              mat=parts.mat("rope"), segments=10, origin="center"))
    bucket_top = DRUM_Z - 0.2
    objs.append(mesh.rod("well_rope", (0.0, -0.02, DRUM_Z - 0.11), (0.0, -0.02, bucket_top + BUCKET_SCALE * 0.12), 0.012,
                         parts.mat("rope"), segments=4))
    bucket = _bucket()
    objs += mesh.transform(bucket, mesh.frame((0.0, -0.02, bucket_top - BUCKET_SCALE * 0.26)) @ Matrix.Scale(BUCKET_SCALE, 4))
    y = -POST_Y
    objs += [mesh.rod("crank_axle", (0.0, y + 0.1, DRUM_Z), (0.0, y - 0.2, DRUM_Z), 0.025, iron, segments=6),
             mesh.rod("crank_arm", (0.0, y - 0.18, DRUM_Z), (0.0, y - 0.18, DRUM_Z - 0.32), 0.02, iron, segments=4),
             mesh.rod("crank_grip", (0.0, y - 0.18, DRUM_Z - 0.32), (0.0, y - 0.38, DRUM_Z - 0.32), 0.022, parts.mat("timber"),
                      segments=6)]
    return objs


def _bucket():
    """A coopered bucket with two iron hoops, brim-full of water, and an iron bail."""
    profile = [(0.12, 0.0), (0.125, 0.03), (0.14, 0.2), (0.146, 0.235), (0.15, 0.26), (0.136, 0.26), (0.134, 0.22)]
    body = mesh.lathe("bucket", profile, segments=10, mat=[parts.mat("iron"), parts.mat("plank_light"), parts.mat("water")],
                      band_materials=[0, 1, 0, 1, 1, 2])
    bail = [(0.15 * math.cos(math.pi * i / 6), 0.0, 0.26 + 0.12 * math.sin(math.pi * i / 6)) for i in range(7)]
    return [body, parts.rope(bail, 0.008, key="iron", sides=4, name="bucket_bail")]
