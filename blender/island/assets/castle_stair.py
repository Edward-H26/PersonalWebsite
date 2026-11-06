"""castle_stair: the stone stair from the ring road up to the castle's south gate (DESIGN.md section 17), on the plan
heightmap.stair_plan lays out and set into the bailey's slope, which the terrain cuts for it: a top landing level with
the gate's threshold between the drum towers, an upper flight running west along the slope, a five-sided landing and a
lower flight running back down along the ring toward the gate vertex, both flights at one pitch no steeper than 35
degrees. The lower flight ends at the road's paving: a wall closes its end and its lowest steps open sideways onto the
road. Every flight and landing stands on a masonry base reaching under the ground, with a low wall along its open
sides under a coping of light stone; where the slope outside rises above a wall's plain height, the wall rises with
it and holds the cut. Built in the castle's frame (origin at the bailey's centre on its floor, north along +Y), so the
site sets it down with castle_keep; site() is the plan, with the foot where it meets the road."""

import math
import random

import numpy as np
from mathutils import Matrix, Vector

from island import heightmap as hm
from island import mesh, parts
from island.assets import castle_keep

# Each wall is WALL_T thick and stands WALL_H over the treads or the landing under a COPING; the flights are the
# stair's width between their walls. Bases reach BASE_DEPTH under the lowest ground beneath them, and a wall whose
# outside ground (sampled every WALL_STEP metres, OUTSIDE metres beyond its face) stands higher than its plain top
# rises to HOLD over that ground.
WALL_T, WALL_H, COPING, BASE_DEPTH, HOLD, WALL_STEP = hm.STAIR_WALL_M, 0.7, 0.1, 0.6, 0.05, 0.25
OUTSIDE = (0.05, 0.3)
WIDTH = 2 * (hm.STAIR_HALF - WALL_T)
STONES = {"course": (0.4, 0.6), "length": (0.8, 1.5), "keys": castle_keep.STONES["keys"]}


def site():
    """The stair's plan (heightmap.stair_plan): the bailey's floor, the shared pitch, the foot and its level, and the
    parts down from the gate."""
    return hm.cached()["stair"]


def _ground(x, y):
    """The terrain's height in metres from the bailey's floor under castle-frame point (x, y), as its mesh has it."""
    bx, by = hm.ANCHORS["bailey"]
    height = hm.mesh_ground(hm.cached(), np.array(bx + x / hm.M_PER_PX), np.array(by - y / hm.M_PER_PX))
    return float(height) * hm.PEAK_M - site()["floor"]


def _outline(part):
    """A part's outline in the castle's frame, counter-clockwise (heightmap.stair_outline), as vectors."""
    return [Vector(p) for p in hm.stair_outline(part)]


def _base_bottom(points):
    """The level a base reaches down to: BASE_DEPTH under the lowest ground beneath the given points."""
    return min(_ground(p.x, p.y) for p in points) - BASE_DEPTH


def _spread(a, b, step=0.5):
    """Points every `step` metres or closer from a to b, both ends included."""
    n = max(1, int(math.ceil((b - a).length / step)))
    return [a.lerp(b, k / n) for k in range(n + 1)]


def _area(outline, step=0.5):
    """Points over a convex outline: its corners, along its edges and through its middle."""
    edges = [p for a, b in zip(outline, outline[1:] + outline[:1]) for p in _spread(a, b, step)]
    centre = sum(outline, Vector((0.0, 0.0))) / len(outline)
    return edges + [p.lerp(centre, 0.5) for p in edges] + [centre]


def build(seed=7):
    rng = random.Random(seed)
    s = site()
    flights = [part for part in s["parts"] if "landing" not in part]
    objs = []
    for part in s["parts"]:
        objs += _landing(rng, part, flights) if "landing" in part else _flight(rng, part)
    return mesh.finalize("isl_castle_stair", objs, ground=False, centre=False)


def _prism(name, outline, z0, z1, key):
    """A slab over a plan outline from z0 up to z1."""
    slab = parts.extrude_xz(name, [(p.x, -p.y) for p in outline], z0, z1, key)
    return mesh.transform([slab], Matrix.Rotation(math.radians(90.0), 4, "X"))


def _landing(rng, part, flights):
    """A landing: a stone block from below the ground up to its level, paved in light stone, with walls along the
    stretches of its edges that it neither leaves open (the gate) nor a flight opens."""
    outline, level = _outline(part), part["level"]
    bottom = _base_bottom(_area(outline))
    objs = _prism("landing_core", outline, bottom, level - 0.04, "stone_dark")
    objs += _prism("landing_paving", outline, level - 0.04, level + 0.02, "stone_light")
    openings = [(outline[k], outline[(k + 1) % len(outline)]) for k in part["open"]]
    for flight in flights:
        corners = _outline(flight)
        openings += [(corners[0], corners[3]), (corners[1], corners[2])]
    for a, b in zip(outline, outline[1:] + outline[:1]):
        for u0, u1 in _closed_spans(a, b, openings):
            p, q = a.lerp(b, u0), a.lerp(b, u1)
            inward = Vector((-(q - p).y, (q - p).x)).normalized()
            objs += _wall(rng, p + inward * WALL_T / 2, q + inward * WALL_T / 2, lambda u: level + WALL_H, -inward, bottom)
            objs += _face(rng, p, q, bottom, level, -inward)
    return objs


def _closed_spans(a, b, openings, tolerance=0.05):
    """The stretches of edge a-b, as (u0, u1) in 0..1, that no opening segment lying along it covers."""
    run = b - a
    length = run.length
    along, side = run / length, Vector((-run.y, run.x)) / length
    covered = []
    for c, d in openings:
        if abs((c - a).dot(side)) < tolerance and abs((d - a).dot(side)) < tolerance:
            u0, u1 = sorted(((c - a).dot(along) / length, (d - a).dot(along) / length))
            covered.append((max(0.0, u0), min(1.0, u1)))
    spans, u = [], 0.0
    for u0, u1 in sorted(covered):
        if u0 - u > tolerance / length:
            spans.append((u, u0))
        u = max(u, u1)
    if 1.0 - u > tolerance / length:
        spans.append((u, 1.0))
    return spans


def _flight(rng, part):
    """A flight from its start along its direction, falling between its two levels: its steps on a stone base, and a
    wall with a coping along each side that follows the nosings or holds the slope above them. At the foot a wall
    closes its end, and on its open side the wall stops short of the lowest steps, which reach over its line."""
    start, along, run = Vector(part["start"]), Vector(part["along"]), part["run"]
    z0, z1 = part["levels"]
    count = part["steps"]
    rise, tread = (z0 - z1) / count, run / count
    side = Vector((-along.y, along.x))
    outline = _outline(part)
    length = (outline[1] - outline[0]).length
    bottom = _base_bottom(_area(outline))
    foot = part.get("foot")
    first_open = count - foot["steps"] if foot else count
    yaw = math.atan2(along.y, along.x)
    objs = []
    for k in range(count):
        top = z0 - (k + 1) * rise
        width, shift = (WIDTH + WALL_T, foot["side"] * WALL_T / 2) if k >= first_open else (WIDTH, 0.0)
        centre = start + along * tread * (k + 0.5) + side * shift
        step = mesh.box("step", (tread + 0.02, width, top - bottom), at=(0.0, 0.0, 0.0), origin="bottom",
                        mat=parts.mat(parts.pick(rng, (("stone_light", 0.5), ("stone", 0.5)))))
        objs += mesh.transform([step], mesh.frame((centre.x, centre.y, bottom), yaw))
    for sign in (-1, 1):
        reach = first_open * tread if foot and sign == foot["side"] else length
        offset = side * sign * (WIDTH / 2 + WALL_T / 2)
        a, b = start + offset, start + along * reach + offset
        objs += _wall(rng, a, b, lambda u, reach=reach: z0 + (z1 - z0) * min(u * reach / run, 1.0) + WALL_H,
                      side * sign, bottom)
        objs += _face(rng, a + side * sign * WALL_T / 2, b + side * sign * WALL_T / 2, bottom, min(z0, z1), side * sign)
    if foot:
        end = start + along * (run + WALL_T / 2)
        a, b = end - side * hm.STAIR_HALF, end + side * hm.STAIR_HALF
        objs += _wall(rng, a, b, lambda u: z1 + WALL_H, along, bottom)
        objs += _face(rng, a + along * WALL_T / 2, b + along * WALL_T / 2, bottom, z1, along)
    return objs


def _wall(rng, a, b, plain, outward, bottom):
    """A wall WALL_T thick centred on a-b from `bottom` up to its plain top plain(u) (u from 0 at a to 1 at b), or up to
    HOLD over the ground just outside it where that stands higher, under a coping."""
    length = (b - a).length
    us = np.linspace(0.0, 1.0, max(2, int(math.ceil(length / WALL_STEP)) + 1))
    tops = [max([plain(u)] + [_ground(*(a.lerp(b, u) + outward * (WALL_T / 2 + d))) + HOLD for d in OUTSIDE])
            for u in us]
    xs = [u * length for u in us]
    body = [(0.0, bottom), (length, bottom)] + [(x, z) for x, z in reversed(list(zip(xs, tops)))]
    coping = [(x, z) for x, z in zip(xs, tops)] + [(x, z + COPING) for x, z in reversed(list(zip(xs, tops)))]
    wall = parts.extrude_xz("stair_wall", body, -WALL_T / 2, WALL_T / 2, "stone")
    cap = parts.extrude_xz("stair_coping", coping, -WALL_T / 2 - 0.04, WALL_T / 2 + 0.04, "stone_light")
    return mesh.transform([wall, cap], mesh.frame((a.x, a.y, 0.0), math.atan2((b - a).y, (b - a).x)))


def _face(rng, a, b, bottom, top, outward):
    """Rough stone courses on the vertical face from a to b, standing out toward `outward`."""
    run = b - a
    face = parts.stone_face(run.length, top - bottom, rng, **STONES)
    # A wall frame's stones stand out along its -Y, the right of its run; turn it round when the face looks left.
    right = Vector((run.y, -run.x))
    yaw = math.atan2(run.y, run.x) + (0.0 if right.dot(outward) > 0 else math.pi)
    centre = (a + b) / 2
    return mesh.transform([face], mesh.frame((centre.x, centre.y, bottom), yaw))
