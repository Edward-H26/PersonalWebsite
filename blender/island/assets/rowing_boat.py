"""rowing_boat: a clinker-built rowing boat pulled up on the beach (DESIGN.md section 17), in the harbour's salt-greyed
timber: lapped strakes from a tarred bottom to a sheer strake painted Columbia blue (red on the _b boat), a flat
transom, a stem rising at the bow, floorboards, two thwarts with iron rowlocks, a pair of oars laid along them and a
painter from the bow ring trailing on the sand. It lies on its keel heeled a little onto one bilge."""

import math
import random

from mathutils import Matrix, Vector

from island import mesh, parts, style

LENGTH, BEAM, DEPTH = 4.2, 1.45, 0.62
STATIONS, STRAKES, LAP = 11, 5, 0.012
HEEL_DEG = 7.0
KEYS = ("hull_dark", "hull", "timber", "plank_light", "plank")


def build(seed=7, band="columbia"):
    rng = random.Random(seed)
    with style.weathered():
        objs = [_hull(band)] + _fittings(rng)
    objs = mesh.transform(objs, Matrix.Rotation(math.radians(HEEL_DEG), 4, "Y"))
    return mesh.finalize("isl_rowing_boat", objs)


def _shape(u):
    """Half-breadth, keel and sheer heights at u, -1 at the transom to 1 at the stem."""
    fine = (1.0 - u * u) ** (0.75 if u > 0.0 else 0.35)
    half = BEAM / 2 * max(0.04, fine) * (1.0 if u > 0.0 else 0.85 + 0.15 * fine)
    keel = 0.08 * u ** 4 + (0.25 * max(0.0, u) ** 6)
    sheer = DEPTH + 0.1 * u * u + 0.06 * max(0.0, u)
    return half, keel, sheer


def _section(u, band_key):
    """Half a cross-section, from the keel up the lapped strakes, over the gunwale and down the inside to the
    floorboards at the centreline, with a palette key per band."""
    half, keel, sheer = _shape(u)
    floor = keel + 0.13
    outside, keys = [(0.0, keel)], []
    for i in range(STRAKES):
        t0, t1 = i / STRAKES, (i + 1) / STRAKES
        z0, z1 = keel + (sheer - keel) * t0, keel + (sheer - keel) * t1
        x0 = parts.hull_side_x(half, keel, keel + (sheer - keel) * 0.45, sheer, 2.2, 0.0, z0)
        x1 = parts.hull_side_x(half, keel, keel + (sheer - keel) * 0.45, sheer, 2.2, 0.0, z1)
        if i > 0:
            outside.append((x0 + LAP, z0))
            keys.append("hull_dark")
        outside.append((x1, z1))
        keys.append(band_key if i == STRAKES - 1 else ("hull_dark" if i == 0 else "hull"))
    rail = outside[-1][0]
    ring = outside + [(rail + 0.03, sheer + 0.05), (rail - 0.07, sheer + 0.05), (rail - 0.07, sheer - 0.02)]
    keys += ["timber", "timber", "timber"]
    # Every station needs the same number of points for the loft, so the inside follows every strake, those below the
    # floorboards pressed up against them.
    inside = [(max(0.0, x * 0.9 - 0.04), max(z, floor + 0.03)) for x, z in reversed(outside[1:-1])]
    ring += inside + [(max(0.0, parts.hull_side_x(half, keel, keel + (sheer - keel) * 0.45, sheer, 2.2, 0.0, floor) * 0.9 - 0.05),
                       floor), (0.0, floor)]
    keys += ["plank"] * len(inside) + ["plank", "plank_light"]
    return ring, keys


def _hull(band):
    """The hull lofted through its stations and mirrored, closed by the transom and the stem."""
    names = KEYS + (band,)
    rings, band_keys = [], None
    for k in range(STATIONS):
        u = -1.0 + 2.0 * k / (STATIONS - 1) * 0.98
        section, keys = _section(u, band)
        rings.append([(x, LENGTH / 2 * u, z) for x, z in section])
        if k == STATIONS // 2:
            band_keys = keys
    return mesh.loft("rowing_hull", rings, mat=[parts.mat(k) for k in names], mirror_x=True,
                     band_materials=[names.index(k) for k in band_keys])


def _fittings(rng):
    """Thwarts, rowlocks, the oars laid along the thwarts, the stem post and the painter trailing from the bow."""
    timber, iron = parts.mat("timber"), parts.mat("iron")
    objs = []
    for u in (-0.32, 0.22):
        half, _, sheer = _shape(u)
        y = LENGTH / 2 * u
        objs.append(mesh.box("thwart", (2 * half * 0.86, 0.22, 0.05), at=(0.0, y, sheer - 0.2), mat=parts.mat("plank_light")))
        for side in (-1, 1):
            objs.append(mesh.rod("rowlock", (side * half * 0.97, y, sheer + 0.04), (side * half * 0.97, y, sheer + 0.14), 0.015, iron,
                                 segments=4))
    for side, lift in ((-1, 0.0), (1, 0.06)):
        a = Vector((side * 0.25, -LENGTH * 0.42, DEPTH - 0.12 + lift))
        b = Vector((side * 0.12, LENGTH * 0.32, DEPTH - 0.16 + lift))
        objs.append(mesh.rod("oar_shaft", a, b, 0.025, timber, segments=5))
        blade = mesh.box("oar_blade", (0.14, 0.62, 0.02), at=b + (b - a).normalized() * 0.3, mat=parts.mat("plank_light"))
        blade.rotation_euler = (0.0, 0.0, math.atan2(-(b - a).x, (b - a).y))
        objs.append(blade)
    half, keel, sheer = _shape(0.99)
    stem_top = Vector((0.0, LENGTH / 2 * 1.0, sheer + 0.12))
    objs.append(mesh.rod("stem", Vector((0.0, LENGTH / 2 * 0.9, keel)), stem_top, 0.05, timber, segments=5))
    ring = stem_top + Vector((0.0, 0.04, -0.12))
    painter = parts.sag(ring, ring + Vector((rng.uniform(-0.4, 0.4), 1.6, -sheer + 0.02)), 0.25, samples=6)
    objs.append(parts.rope(painter, 0.018, key="rope", sides=4, name="painter"))
    objs += mesh.transform(parts.rope_coil(radius=0.22, turns=2.5, thickness=0.018, sides=4), mesh.frame(painter[-1] + Vector((0.0, 0.25, 0.0))))
    return objs
