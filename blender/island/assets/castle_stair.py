"""castle_stair: the stone stair from the ring road up to the castle's south gate (DESIGN.md section 17). The road
passes the knoll's foot only a few metres below the gate, with a drum tower on either side of it, so the stair folds
along the bank: a top landing level with the gate's threshold, an upper flight running west along the foot of the west
tower, a landing, and a lower flight turning south down to the road's edge. Every flight and landing stands on a
masonry base reaching into the ground, with a low wall along each side under a coping of light stone. Built in the
castle's frame (origin at the bailey's centre on its floor, north along +Y), so the site sets it down with castle_keep;
site() says where it meets the road."""

import functools
import math
import random

import numpy as np
from mathutils import Matrix, Vector

from island import heightmap as hm
from island import mesh, parts
from island.assets import castle_keep

GATE_Y = -castle_keep.WALL_R
# The top landing spans TOP_HALF either side of the gate's axis and TOP_DEPTH out from the wall; the upper flight runs
# UPPER_RUN west from it; the flights are WIDTH between their walls, each wall WALL_T thick and WALL_H over the nosings.
TOP_HALF, TOP_DEPTH, UPPER_RUN = 1.5, 3.6, 4.0
WIDTH, WALL_T, WALL_H, COPING = 1.4, 0.35, 0.7, 0.1
# Steps rise about RISE; bases reach BASE_DEPTH under the lowest ground beneath them; the lower flight ends where the
# road's paving begins, ROAD_EDGE_PX from the ring's centreline.
RISE, BASE_DEPTH, ROAD_EDGE_PX = 0.18, 0.6, 6.0
STONES = {"course": (0.4, 0.6), "length": (0.8, 1.5), "keys": castle_keep.STONES["keys"]}


def _ground(x, y):
    """The terrain's height in metres under castle-frame point (x, y)."""
    bx, by = hm.ANCHORS["bailey"]
    return float(hm.at(hm.cached()["height"], np.array([[bx + x / hm.M_PER_PX, by - y / hm.M_PER_PX]]))[0]) * hm.PEAK_M


@functools.lru_cache(maxsize=1)
def site():
    """The stair's plan and heights in the castle's frame: the floor it is measured from (the bailey's), the upper
    flight's centre line, the landing's square, the lower flight's centre line down to the road's edge, and each
    flight's rise."""
    data = hm.cached()
    bx, by = hm.ANCHORS["bailey"]
    floor = float(data["height"][by, bx]) * hm.PEAK_M
    flight = WIDTH + 2 * WALL_T
    upper_y = GATE_Y - TOP_DEPTH + flight / 2
    upper = (-TOP_HALF, -TOP_HALF - UPPER_RUN)
    landing = (upper[1] - flight, upper[1], upper_y - flight / 2, upper_y + flight / 2)
    lower_x = (landing[0] + landing[1]) / 2
    # Walk down from the landing until the road's paving begins.
    y = landing[2]
    while hm.at(data["road_distance"], np.array([[bx + lower_x / hm.M_PER_PX, by - y / hm.M_PER_PX]]))[0] > ROAD_EDGE_PX:
        y -= 0.05
        if landing[2] - y > 20.0:
            raise RuntimeError("the castle stair's lower flight finds no road below the landing")
    foot = _ground(lower_x, y) - floor
    runs = (UPPER_RUN, landing[2] - y)
    upper_rise = -foot * runs[0] / sum(runs)
    return {"floor": floor, "upper_y": upper_y, "upper": upper, "landing": landing, "lower_x": lower_x,
            "lower": (landing[2], y), "foot": foot, "rises": (upper_rise, -foot - upper_rise), "runs": runs}


def build(seed=7):
    rng = random.Random(seed)
    s = site()
    top = (-TOP_HALF, TOP_HALF, GATE_Y - TOP_DEPTH, GATE_Y)
    objs = _block(rng, top, 0.0, s) + _block(rng, s["landing"], -s["rises"][0], s)
    # The upper flight runs west (-X) from the top landing; the lower one south (-Y) from the landing.
    objs += _flight(rng, Vector((s["upper"][0], s["upper_y"])), Vector((-1.0, 0.0)), s["runs"][0], 0.0, -s["rises"][0], s)
    objs += _flight(rng, Vector((s["lower_x"], s["lower"][0])), Vector((0.0, -1.0)), s["runs"][1], -s["rises"][0], s["foot"], s)
    objs += _top_walls(top)
    return mesh.finalize("isl_castle_stair", objs, ground=False, centre=False)


def _base_bottom(points, s):
    """The level a base reaches down to: BASE_DEPTH under the lowest ground beneath the given castle-frame points."""
    return min(_ground(x, y) for x, y in points) - s["floor"] - BASE_DEPTH


def _block(rng, rect, z, s):
    """A landing: a stone block from below the ground up to z, its top paved in light stone and its open faces
    coursed."""
    x0, x1, y0, y1 = rect
    corners = [(x, y) for x in np.linspace(x0, x1, 4) for y in np.linspace(y0, y1, 4)]
    bottom = _base_bottom(corners, s)
    objs = [mesh.box("landing_core", (x1 - x0, y1 - y0, z - bottom), at=((x0 + x1) / 2, (y0 + y1) / 2, bottom),
                     origin="bottom", mat=parts.mat("stone_dark")),
            mesh.box("landing_paving", (x1 - x0, y1 - y0, 0.06), at=((x0 + x1) / 2, (y0 + y1) / 2, z - 0.04), origin="bottom",
                     mat=parts.mat("stone_light"))]
    for a, b, out in (((x0, y0), (x1, y0), (0, -1)), ((x0, y0), (x0, y1), (-1, 0)), ((x1, y0), (x1, y1), (1, 0))):
        objs += _face(rng, Vector(a), Vector(b), bottom, z, Vector(out))
    return objs


def _face(rng, a, b, bottom, top, outward):
    """Rough stone courses on the vertical face from a to b, standing out toward `outward`."""
    run = b - a
    face = parts.stone_face(run.length, top - bottom, rng, **STONES)
    # A wall frame's stones stand out along its -Y, the right of its run; turn it round when the face looks left.
    right = Vector((run.y, -run.x))
    yaw = math.atan2(run.y, run.x) + (0.0 if right.dot(outward) > 0 else math.pi)
    centre = (a + b) / 2
    return mesh.transform([face], mesh.frame((centre.x, centre.y, bottom), yaw))


def _flight(rng, start, along, run, z0, z1, s):
    """A flight from `start` along `along` for `run` metres, falling from z0 to z1: its steps on a stone base, and a
    low wall with a coping on each side following the nosings."""
    count = max(1, round(abs(z0 - z1) / RISE))
    rise, tread = (z0 - z1) / count, run / count
    side = Vector((-along.y, along.x))
    yaw = math.atan2(along.y, along.x)
    corners = [start + along * run * u + side * (WIDTH / 2 + WALL_T) * v for u in (0.0, 0.5, 1.0) for v in (-1, 1)]
    bottom = _base_bottom([tuple(p) for p in corners], s)
    objs = []
    for k in range(count):
        top = z0 - (k + 1) * rise
        centre = start + along * tread * (k + 0.5)
        step = mesh.box("step", (tread + 0.02, WIDTH, top - bottom), at=(0.0, 0.0, 0.0), origin="bottom",
                        mat=parts.mat(parts.pick(rng, (("stone_light", 0.5), ("stone", 0.5)))))
        objs += mesh.transform([step], mesh.frame((centre.x, centre.y, bottom), yaw))
    for sign in (-1, 1):
        offset = side * sign * (WIDTH / 2 + WALL_T / 2)
        a, b = start + offset, start + along * run + offset
        profile = [(0.0, bottom), (run, bottom), (run, z1 + WALL_H), (0.0, z0 + WALL_H)]
        wall = parts.extrude_xz("stair_wall", profile, -WALL_T / 2, WALL_T / 2, "stone")
        cap = parts.extrude_xz("stair_coping", [(0.0, z0 + WALL_H), (run, z1 + WALL_H), (run, z1 + WALL_H + COPING),
                                                 (0.0, z0 + WALL_H + COPING)], -WALL_T / 2 - 0.04, WALL_T / 2 + 0.04, "stone_light")
        objs += mesh.transform([wall, cap], mesh.frame((a.x, a.y, 0.0), yaw))
        objs += _face(rng, a + side * sign * WALL_T / 2, b + side * sign * WALL_T / 2, bottom, min(z0, z1), side * sign)
    return objs


def _top_walls(top):
    """The low walls along the top landing's open south and east sides; the gate and the upper flight stay open."""
    x0, x1, y0, y1 = top
    objs = []
    for a, b in (((x0, y0 + WALL_T / 2), (x1, y0 + WALL_T / 2)), ((x1 - WALL_T / 2, y0), (x1 - WALL_T / 2, y1))):
        a, b = Vector(a), Vector(b)
        run = b - a
        wall = mesh.box("landing_wall", (run.length, WALL_T, WALL_H), at=(0.0, 0.0, 0.0), origin="bottom", mat=parts.mat("stone"))
        cap = mesh.box("landing_coping", (run.length + 0.08, WALL_T + 0.08, COPING), at=(0.0, 0.0, WALL_H), origin="bottom",
                       mat=parts.mat("stone_light"))
        centre = (a + b) / 2
        objs += mesh.transform([wall, cap], mesh.frame((centre.x, centre.y, 0.0), math.atan2(run.y, run.x)))
    return objs
