"""standing_stones: the stone ring on the hill west of the village (DESIGN.md section 17), the owner's mark among the
landscape. Nine rough monoliths of the island's slate stand in a ring, leaning a little, lichened on top and mossy on
their lee; the tallest, at the ring's south, has a dressed face toward the village carved with QH under a small crown;
one more lies fallen beside the ring. One mesh in the rock family's textured material."""

import math
import random

from mathutils import Matrix, Vector

from island import cards, parts, rocks

RADIUS, STONES = 4.6, 9
HEIGHTS, WIDTHS, THICKNESS = (1.3, 2.3), (0.7, 1.05), (0.38, 0.55)
QH_STONE = (1.15, 0.5, 2.8)  # width, thickness, height
CARVING = (0.14, 0.13, 0.12)  # the colour of the cut letters, a shadowed grey


def build(seed=7):
    rng = random.Random(seed)
    plant = cards.Plant("rock")
    for k in range(STONES):
        angle = 2 * math.pi * k / STONES + rng.uniform(-0.12, 0.12)
        at = parts.ring_point(RADIUS + rng.uniform(-0.3, 0.3), angle, 0.0)
        if k == 0:
            _monolith(rng, plant, QH_STONE, at, angle, 2.0, subdivisions=3, dressed=True)
            continue
        size = (rng.uniform(*WIDTHS), rng.uniform(*THICKNESS), rng.uniform(*HEIGHTS))
        _monolith(rng, plant, size, at, angle + rng.uniform(-0.3, 0.3), rng.uniform(-5.0, 5.0),
                  subdivisions=3 if size[2] > 1.8 else 2)
    fallen = parts.ring_point(RADIUS + 1.6, math.radians(200.0), 0.0)
    _monolith(rng, plant, (0.9, 0.45, 2.0), fallen, math.radians(140.0), 84.0, subdivisions=2)
    return plant.finish("isl_standing_stones")


def _monolith(rng, plant, size, at, facing, lean_deg, subdivisions, dressed=False):
    """One stone grown as a boulder at the origin, then turned to face out of the ring at `facing`, leant and set at
    `at`. A dressed stone has its outer face cut flat and the crest and QH carved on it."""
    first = len(plant.bm.verts)
    rocks.boulder(rng, plant, size, (0.0, 0.0), subdivisions=subdivisions, moss=0.35, strata=0.0, lump=0.12 if dressed else 0.2,
                  sink=0.05)
    plant.bm.verts.ensure_lookup_table()
    verts = plant.bm.verts[first:]
    face_y = -size[1] / 2 * 0.82
    if dressed:
        for v in verts:
            v.co.y = max(v.co.y, face_y)
        _carve(plant, size, face_y)
        plant.bm.verts.ensure_lookup_table()
        verts = plant.bm.verts[first:]
    place = (Matrix.Translation((at.x, at.y, 0.0)) @ Matrix.Rotation(facing, 4, "Z")
             @ Matrix.Rotation(math.radians(lean_deg), 4, "X"))
    for v in verts:
        v.co = place @ v.co
        # Bedded in the turf: whatever leans below the ground is cut off at it.
        v.co.z = max(0.0, v.co.z)


def _carve(plant, size, face_y):
    """QH under a small crown, cut into the dressed face (which looks along -Y before the stone is turned)."""
    height = size[2]
    letters = parts.lettering("QH", 0.42)
    crown = [[(x * 0.5, z * 0.5) for x, z in poly] for poly in parts.crest_shapes(1.0)["crown"]]
    polygons = [[(x, z + height * 0.48) for x, z in poly] for poly in letters]
    polygons += [[(x, z + height * 0.48) for x, z in poly] for poly in crown]
    normal = Vector((0.0, -1.0, 0.0))
    for poly in polygons:
        points = [Vector((x, face_y - 0.006, z)) for x, z in poly]
        verts = [plant.bm.verts.new(p) for p in points]
        face = plant.face(verts, [rocks.uv(p, normal) for p in points], [CARVING] * len(points), [(0.0, 0.0, 0.0)] * len(points))
        # The rock material culls back faces, so every cut letter must look out of the dressed face.
        face.normal_update()
        if face.normal.y > 0.0:
            face.normal_flip()
