"""breakwater: the stone arm that closes the harbour bay's south side and leaves its entrance open to the south-west
(DESIGN.md section 17). A rubble mound runs out from the land at the bay's south-east corner along PATH, on the edge of
the bay's shallow shelf, toward the north-west; armour stones are heaped along both flanks at the waterline, a paved
walk runs along its crown with a parapet of grey stone on its seaward side and mooring bollards on the harbour side,
and at its head stands the harbour light: a squat stone drum carrying the brand lantern lit at night. Below its
designed flanks the mound drops to the sea floor of the terrain, so it stands on the bottom wherever that falls away.
It is built in the terrain's own space (metres about the map's centre, water level at Z = 0), so the site sets it down
exactly where the terrain sits."""

import math
import random

import numpy as np
from mathutils import Vector

from island import heightmap as hm
from island import mesh, parts

# The arm's centreline in map pixels, from its root on the land at the bay's south-east corner along the edge of the
# bay's shallow shelf (the sea floor about 5 m down) to its head, about 55 m out from the shore.
PATH = ((398, 603), (384, 597), (360, 588), (333, 578), (307, 568))
CREST, CREST_WIDTH, FOOT, FOOT_WIDTH = 2.2, 4.0, -3.5, 13.0
# Below each flank's foot the mound drops to the sea floor, FLOOR_EMBED under it and FLOOR_SPREAD further out.
FLOOR_EMBED, FLOOR_SPREAD = 0.4, 1.0
PARAPET, PARAPET_T = 1.2, 0.8
ARMOUR_SPACING, BOLLARD_SPACING = 1.3, 12.0
LIGHT_R, LIGHT_H = 1.7, 3.6


def build(seed=7):
    rng = random.Random(seed)
    line = [Vector(hm.to_metres(x, y)) for x, y in hm.resample(PATH, 3.0 / hm.M_PER_PX).tolist() + [list(PATH[-1])]]
    frames = _frames(line)
    objs = _mound(frames) + _parapet(rng, frames) + _armour(rng, frames) + _bollards(rng, frames) + _light(rng, frames[-1])
    return mesh.finalize("isl_breakwater", objs, ground=False, centre=False)


def _frames(line):
    """(point, along, seaward) at every station: the seaward side is to the left of the arm going out, the bay's
    open south."""
    frames = []
    for i, p in enumerate(line):
        a, b = line[max(i - 1, 0)], line[min(i + 1, len(line) - 1)]
        along = (b - a).normalized()
        frames.append((p, along, Vector((-along.y, along.x))))
    return frames


def _floor(p):
    """The terrain's height in metres under plan point p (metres about the map's centre)."""
    x, y = p.x / hm.M_PER_PX + hm.W / 2, hm.H / 2 - p.y / hm.M_PER_PX
    return float(hm.at(hm.cached()["height"], np.array([[x, y]]))[0]) * hm.PEAK_M


def _section(p, out):
    """The mound's cross-section at a station, from the side `out` points away from across to the other: the floor
    below the first flank's foot, that foot, both crest edges, the other foot and the floor below it."""
    section = []
    for side in (-1, 1):
        foot = p + out * side * FOOT_WIDTH / 2
        floor = p + out * side * (FOOT_WIDTH / 2 + FLOOR_SPREAD)
        edge = [floor.to_3d() + Vector((0, 0, min(FOOT - 0.01, _floor(floor) - FLOOR_EMBED))),
                foot.to_3d() + Vector((0, 0, FOOT)), (p + out * side * CREST_WIDTH / 2).to_3d() + Vector((0, 0, CREST))]
        section += edge if side < 0 else edge[::-1]
    return section


def _mound(frames):
    """The rubble mound as one lofted body, its crest paved."""
    rings = [[tuple(v) for v in _section(p, -seaward)] for p, _, seaward in frames]
    body = mesh.loft("breakwater_mound", rings, mat=parts.mat("stone_dark"))
    walk = [[tuple(p.to_3d() + side * seaward.to_3d() * (CREST_WIDTH / 2 - 0.1) + Vector((0, 0, CREST + 0.04))) for side in (-1, 1)]
            for p, _, seaward in frames]
    paving = mesh.loft("breakwater_walk", [[a, b, (b[0], b[1], b[2] - 0.08), (a[0], a[1], a[2] - 0.08)] for a, b in walk],
                       mat=parts.mat("stone_light"))
    return [body, paving]


def _parapet(rng, frames):
    """The seaward parapet: a run of stone wall between each pair of stations with a light coping."""
    objs = []
    for (p0, _, s0), (p1, _, s1) in zip(frames, frames[1:]):
        a = p0 + s0 * (CREST_WIDTH / 2 - PARAPET_T / 2)
        b = p1 + s1 * (CREST_WIDTH / 2 - PARAPET_T / 2)
        run = b - a
        frame = mesh.frame(((a + b) / 2).to_3d() + Vector((0.0, 0.0, CREST)), math.atan2(run.y, run.x))
        length = run.length + 0.1
        wall = [mesh.box("parapet_core", (length, PARAPET_T, PARAPET), at=(0.0, 0.0, 0.0), origin="bottom",
                         mat=parts.mat("stone_dark")),
                mesh.box("parapet_coping", (length, PARAPET_T + 0.12, 0.14), at=(0.0, 0.0, PARAPET), origin="bottom",
                         mat=parts.mat("stone_light"))]
        for side in (-1, 1):
            face = parts.stone_face(length, PARAPET, rng, course=(0.35, 0.5), length=(0.6, 1.2))
            wall += mesh.transform([face], mesh.frame((0.0, side * -PARAPET_T / 2, 0.0), 0.0 if side > 0 else math.pi))
        objs += mesh.transform(wall, frame)
    return objs


def _armour(rng, frames):
    """Armour stones heaped along both flanks round the waterline, bigger on the seaward side."""
    objs = []
    total = sum((b[0] - a[0]).length for a, b in zip(frames, frames[1:]))
    count = int(total / ARMOUR_SPACING)
    for k in range(count):
        u = (k + rng.random()) / count * (len(frames) - 1)
        i = min(int(u), len(frames) - 2)
        t = u - i
        p = frames[i][0].lerp(frames[i + 1][0], t)
        seaward = frames[i][2]
        for side, scale in ((1, 1.0), (-1, 0.75)):
            reach = rng.uniform(CREST_WIDTH / 2 + 0.6, CREST_WIDTH / 2 + 2.6)
            z = CREST - (reach - CREST_WIDTH / 2) * (CREST - FOOT) / ((FOOT_WIDTH - CREST_WIDTH) / 2) + rng.uniform(-0.2, 0.5)
            at = (p + seaward * side * reach).to_3d() + Vector((0.0, 0.0, z))
            objs.append(parts.blob(rng, rng.uniform(0.55, 0.95) * scale, parts.pick(rng, parts.STONE_KEYS), squash=0.7, at=at))
    return objs


def _bollards(rng, frames):
    """Iron bollards along the harbour edge of the walk."""
    objs = []
    total, travelled, next_at = 0.0, 0.0, BOLLARD_SPACING / 2
    for (p0, _, s0), (p1, _, _) in zip(frames, frames[1:]):
        step = (p1 - p0).length
        while next_at <= travelled + step:
            p = p0.lerp(p1, (next_at - travelled) / step) - s0 * (CREST_WIDTH / 2 - 0.35)
            objs += mesh.transform(parts.bollard(), mesh.frame((p.x, p.y, CREST)))
            next_at += BOLLARD_SPACING
        travelled += step
    return objs


def _light(rng, head):
    """The harbour light at the arm's head: a stone drum on the walk's end with a coping, the brand lantern on it and
    a small slate cap."""
    p, along, _ = head
    centre = p - along * 1.2
    objs = [mesh.lathe("light_drum", [(LIGHT_R + 0.15, 0.0), (LIGHT_R, 0.4), (LIGHT_R - 0.1, LIGHT_H)], segments=16,
                       mat=parts.mat("stone")),
            parts.stone_ring(LIGHT_R - 0.02, LIGHT_H - 0.4, rng, radius_top=LIGHT_R - 0.12, course=(0.3, 0.45), length=(0.5, 0.9)),
            mesh.lathe("light_coping", [(LIGHT_R + 0.05, LIGHT_H), (LIGHT_R + 0.05, LIGHT_H + 0.18)], segments=16,
                       mat=parts.mat("stone_light"))]
    objs[1].location = (0.0, 0.0, 0.4)
    objs += mesh.transform(parts.lantern(size=2.4, hook=False), mesh.frame((0.0, 0.0, LIGHT_H + 0.18)))
    return mesh.transform(objs, mesh.frame((centre.x, centre.y, CREST)))
