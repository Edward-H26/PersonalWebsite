"""watermill: the mill on the stream below the mill pond (DESIGN.md section 17), placed by the terrain itself: its origin
is the watermill anchor of heightmap.py on the ground there and its axes are the map's (X east, Y north), so the site
sets it down with no turn. A curved stone dam on the pond's low south-west rim holds the water at POND_LEVEL_M, and
the pond's surface is part of the asset, on a material slot of its own (style.POND_WATER) for the site's water shader;
at the dam a sluice lets the water into a wooden flume on trestles that runs down the line of the stream to an
overshot wheel at the foot of the terrace riser, where the ground falls far enough for one. The wheel is the separate
watermill_wheel asset so the site can turn it (wheel_placement() says where); this asset keeps the stone wheel race
with its water, the axle's bearings and the tailrace running on to the stream. The mill house straddles the riser
beside the wheel: a stone undercroft down the slope, a storey of honey stone and a Tudor timber-framed floor above
under a steep shingle roof, its door to the mill lane at the upstream end under the brand lantern and a sheaf sign,
sacks by the door and a chimney."""

import functools
import math
import random

import numpy as np
from mathutils import Matrix, Vector

from island import heightmap as hm
from island import mesh, parts, style

POND_LEVEL_M, DAM_CREST_M = 8.0, 8.3
# The dam runs round the pond's rim this far from its centre, over the arc where the rim lies below POND_LEVEL_M.
DAM_RADIUS_PX, DAM_ARC_DEG, DAM_THICKNESS, DAM_SEGMENTS, DAM_FOOT = 19.0, (120.0, 330.0), 1.0, 15, -1.5
# The wheel stands this far down the stream's line from the anchor, at the foot of the terrace riser.
WHEEL_PX, WHEEL_R, WHEEL_HALF_WIDTH, AXLE_LENGTH = 18.0, 1.35, 0.45, 2.5
# Water in the flume runs FLUME_DEPTH deep and falls FLUME_FALL along it; the wheel's top clears the flume's floor.
FLUME_DEPTH, FLUME_FALL, WHEEL_CLEARANCE = 0.3, 0.1, 0.1
RACE_WIDTH, RACE_FLOOR, RACE_WATER, RACE_RUN = 1.5, -0.45, -0.12, 3.0
HOUSE = (7.0, 6.0)  # along the stream, across it
HOUSE_STOREYS = (2.4, 2.4)
FLOOR = 0.2
PITCH = 52.0


def _height():
    return hm.cached()["height"]


def _ground(p):
    """The terrain's absolute height in metres under plan point p (metres east and north of the anchor)."""
    ax, ay = hm.ANCHORS["mill"]
    return float(_height()[int(round(ay - p.y / hm.M_PER_PX)), int(round(ax + p.x / hm.M_PER_PX))]) * hm.PEAK_M


@functools.lru_cache(maxsize=1)
def site():
    """Where everything stands, from the terrain, in metres about the anchor: the anchor's ground height, the stream's
    downstream direction and the axle's direction across it, the pond's centre, the wheel's centre, the ground under
    the wheel and the axle's height."""
    origin = Vector((0.0, 0.0))
    ground = _ground(origin)
    ax, ay = hm.ANCHORS["mill"]
    pond = Vector(((hm.POND_CENTRE[0] - ax) * hm.M_PER_PX, (ay - hm.POND_CENTRE[1]) * hm.M_PER_PX))
    down = (-pond).normalized()
    wheel = down * WHEEL_PX * hm.M_PER_PX
    axle_z = POND_LEVEL_M - FLUME_DEPTH - FLUME_FALL - WHEEL_CLEARANCE - WHEEL_R - ground
    return {"ground": ground, "down": down, "across": Vector((-down.y, down.x)), "pond": pond, "wheel": wheel,
            "wheel_ground": _ground(wheel) - ground, "axle_z": axle_z}


def wheel_placement():
    """Where the watermill_wheel asset goes relative to this one: its axle's centre, and the turn about Z that lays
    the wheel's own X axis (its axle) across the stream."""
    s = site()
    return s["wheel"].to_3d() + Vector((0.0, 0.0, s["axle_z"])), math.atan2(s["across"].y, s["across"].x)


def build(seed=7):
    rng = random.Random(seed)
    ch = parts.character(seed)
    s = site()
    objs = _dam(rng, s) + _flume(s) + _race(rng, s) + _house(rng, ch, s)
    return mesh.finalize("isl_watermill", objs, ground=False, centre=False)


def _along_stream(s, at, z=0.0):
    """A frame at plan point `at` whose X runs across the stream and whose -Y faces downstream."""
    return mesh.frame((at.x, at.y, z), math.atan2(s["across"].y, s["across"].x))


def _dam(rng, s):
    """The curved dam: stone runs from a foot below the ground up to a coping at DAM_CREST_M round the pond's low rim,
    and the pond's water held behind it at POND_LEVEL_M."""
    radius = DAM_RADIUS_PX * hm.M_PER_PX
    crest = DAM_CREST_M - s["ground"]
    a0, a1 = (math.radians(a) for a in DAM_ARC_DEG)
    objs = []
    for k in range(DAM_SEGMENTS):
        t0, t1 = a0 + (a1 - a0) * k / DAM_SEGMENTS, a0 + (a1 - a0) * (k + 1) / DAM_SEGMENTS
        p0 = s["pond"] + radius * Vector((math.cos(t0), math.sin(t0)))
        p1 = s["pond"] + radius * Vector((math.cos(t1), math.sin(t1)))
        along = p1 - p0
        length = along.length + 0.2
        # Counter-clockwise round the pond, so each run's outer face (-Y) looks away from the water.
        frame = mesh.frame(((p0 + p1) / 2).to_3d() + Vector((0.0, 0.0, DAM_FOOT)), math.atan2(along.y, along.x))
        height = crest - DAM_FOOT
        run = [mesh.box("dam_core", (length, DAM_THICKNESS, height), at=(0.0, DAM_THICKNESS / 2, 0.0), origin="bottom",
                        mat=parts.mat("stone_dark")),
               parts.stone_face(length, height, rng, keys=parts.WARM_HONEY_KEYS, course=(0.35, 0.5), length=(0.6, 1.2)),
               mesh.box("dam_coping", (length, DAM_THICKNESS + 0.15, 0.14), at=(0.0, DAM_THICKNESS / 2, height), origin="bottom",
                        mat=parts.mat("stone_honey_light"))]
        objs += mesh.transform(run, frame)
    objs.append(mesh.polygon("pond_water", _shore(s), 0.02, at=(0.0, 0.0, POND_LEVEL_M - s["ground"] - 0.02),
                             mat=style.pond_water()))
    return objs


def _shore(s):
    """The pond's waterline: where the terrain rises to POND_LEVEL_M, closed by the dam's inner face, as plan points in
    metres about the anchor."""
    ax, ay = hm.ANCHORS["mill"]
    xs, ys = hm.grid()
    inside = np.hypot(xs - hm.POND_CENTRE[0], ys - hm.POND_CENTRE[1]) < DAM_RADIUS_PX - DAM_THICKNESS / hm.M_PER_PX * 0.5
    depth = np.where(inside, POND_LEVEL_M / hm.PEAK_M - _height(), -1.0)
    loop = max(hm.contours(depth, 0.0), key=hm.loop_area)
    return [((x - ax) * hm.M_PER_PX, (ay - y) * hm.M_PER_PX) for x, y in hm.simplify(loop[:-1], 0.3)]


def _flume(s):
    """The sluice in the dam and the open flume from it down to the top of the wheel, on pairs of trestle legs."""
    head = s["pond"] + s["down"] * (DAM_RADIUS_PX * hm.M_PER_PX)
    tail = s["wheel"] - s["down"] * (WHEEL_R * 0.35)
    floor0 = POND_LEVEL_M - FLUME_DEPTH - s["ground"]
    floor1 = floor0 - FLUME_FALL
    run = tail - head
    length = run.length
    timber, plank = parts.mat("timber"), parts.mat("plank")
    trough = [mesh.box("flume_floor", (0.7, length, 0.08), at=(0.0, 0.0, -0.08), origin="bottom", mat=plank),
              mesh.box("flume_water", (0.56, length, 0.02), at=(0.0, 0.0, FLUME_DEPTH - 0.08), mat=parts.mat("water"))]
    trough += [mesh.box("flume_side", (0.07, length, FLUME_DEPTH + 0.1), at=(side * 0.33, 0.0, -0.08), origin="bottom",
                        mat=plank) for side in (-1, 1)]
    mid = (head + tail) / 2
    frame = mesh.frame((mid.x, mid.y, (floor0 + floor1) / 2), math.atan2(run.y, run.x) - math.pi / 2)
    objs = mesh.transform(trough, frame @ Matrix.Rotation(-math.atan2(FLUME_FALL, length), 4, "X"))
    legs = max(2, int(length // 2.6) + 1)
    for i in range(legs):
        u = (i + 0.5) / legs
        p = head.lerp(tail, u)
        top = floor0 - FLUME_FALL * u - 0.1
        foot = _ground(p) - s["ground"] - 0.3
        for side in (-1, 1):
            off = s["across"] * (side * 0.45)
            objs.append(mesh.beam("flume_leg", (p.x + off.x * 1.3, p.y + off.y * 1.3, foot), (p.x + off.x, p.y + off.y, top),
                                  0.12, 0.12, timber))
        a = s["across"] * 0.55
        objs.append(mesh.beam("flume_cross", (p.x - a.x, p.y - a.y, top - 0.06), (p.x + a.x, p.y + a.y, top - 0.06), 0.12,
                              0.12, timber))
    gate = [mesh.box("sluice_post", (0.16, 0.16, 2.4), at=(side * 0.5, 0.0, -1.0), origin="bottom", mat=timber)
            for side in (-1, 1)]
    gate += [mesh.box("sluice_board", (0.86, 0.06, 0.9), at=(0.0, 0.0, 0.5), origin="bottom", mat=plank),
             mesh.box("sluice_beam", (1.3, 0.14, 0.14), at=(0.0, 0.0, 1.45), mat=timber),
             mesh.rod("sluice_screw", (0.0, 0.0, 0.95), (0.0, 0.0, 1.85), 0.025, parts.mat("iron"), segments=6),
             mesh.box("sluice_handle", (0.4, 0.04, 0.04), at=(0.0, 0.0, 1.85), mat=parts.mat("iron"))]
    return objs + mesh.transform(gate, _along_stream(s, head, floor0 - 0.2))


def _race(rng, s):
    """The stone wheel race the wheel dips into, running on downstream as the tailrace, both with their water, and a
    bearing for the axle on each side: the house wall's and a pedestal on the far race wall."""
    length = 2 * WHEEL_R + 1.4 + RACE_RUN
    axle = s["axle_z"] - s["wheel_ground"]
    wall_top = RACE_FLOOR + 0.75
    objs = [mesh.box("race_wall", (0.35, length, 0.75), at=(side * (RACE_WIDTH / 2 + 0.17), -RACE_RUN / 2, RACE_FLOOR),
                     origin="bottom", mat=parts.mat(parts.pick(rng, parts.WARM_HONEY_KEYS))) for side in (-1, 1)]
    objs += [mesh.box("race_floor", (RACE_WIDTH, length, 0.1), at=(0.0, -RACE_RUN / 2, RACE_FLOOR), origin="bottom",
                      mat=parts.mat("stone_dark")),
             mesh.box("race_water", (RACE_WIDTH, length, 0.02), at=(0.0, -RACE_RUN / 2, RACE_WATER), mat=parts.mat("water")),
             mesh.box("axle_pedestal", (0.45, 0.6, axle - 0.13 - wall_top), at=(RACE_WIDTH / 2 + 0.17, 0.0, wall_top),
                      origin="bottom", mat=parts.mat("stone_honey_light")),
             mesh.box("axle_bearing", (0.3, 0.4, 0.3), at=(-(AXLE_LENGTH / 2 - 0.1), 0.0, axle - 0.15), origin="bottom",
                      mat=parts.mat("iron"))]
    return mesh.transform(objs, _along_stream(s, s["wheel"], s["wheel_ground"]))


def _house(rng, ch, s):
    """The mill house beside the wheel, its axle wall toward it, straddling the riser on a stone undercroft."""
    along, across = HOUSE
    centre = s["wheel"] - s["across"] * (across / 2 + AXLE_LENGTH / 2 - 0.25) - s["down"] * 0.8
    base = s["wheel_ground"] - 0.3
    x0, x1, y0, y1 = -across / 2, across / 2, -along / 2, along / 2
    honey = {"keys": parts.WARM_HONEY_KEYS, "course": (0.3, 0.42), "length": (0.5, 1.0), "core_key": "stone_honey_dark",
             "quoin_keys": parts.HONEY_QUOIN_KEYS}
    objs, _ = parts.stone_storey(x0, x1, y0, y1, base, FLOOR - base, rng, {"front": [], "right": [], "left": []}, **honey)
    holes = {"back": [(0.0, 0.0, 1.0, 2.1, True), (-1.6, 0.9, 0.6, 1.0, False)],
             "right": [(-1.5, 0.9, 0.6, 1.0, False), (1.5, 0.9, 0.6, 1.0, False)],
             "left": [(0.0, 0.9, 0.6, 1.0, False)], "front": [(0.0, 0.9, 0.6, 1.0, False)]}
    storey, frames = parts.stone_storey(x0, x1, y0, y1, FLOOR, HOUSE_STOREYS[0], rng, holes, **honey)
    objs += storey
    for face, openings in holes.items():
        for hx, hz, hw, hh, door in openings:
            m = frames[face]
            if door:
                objs += parts.place(parts.door(hw, hh, rng, arched=True, frame=False, strap_end="scroll"), m, (hx, 0.0, hz))
                objs += parts.place(parts.arch_surround(hw, hh, rng, key="stone_honey_light"), m, (hx, 0.0, hz))
                objs += parts.place(parts.lantern_bracket(), m, (hx + 1.0, -0.06, 2.3))
                objs += parts.place(parts.hanging_sign(arm=0.9, board=(0.55, 0.45), key="plank_light", emblem_key="paint_gold",
                                                       iron=True, emblem="sheaf"), m, (hx - 1.1, -0.04, 2.2))
            else:
                objs += parts.place(parts.window(hw, hh, rng, panes=(2, 2), stone=True), m, (hx, 0.0, hz))
    top = FLOOR + HOUSE_STOREYS[0]
    storey, placed = parts.timber_storey(x0, x1, y0, y1, top, HOUSE_STOREYS[1], rng, {
        "front": {"bays": 4, "openings": {1: "window"}}, "back": {"bays": 4, "openings": {2: "window"}},
        "right": {"bays": 5, "openings": {1: "window", 3: "window"}}, "left": {"bays": 5, "openings": {2: "window"}}},
        core_key=parts.tint(ch, parts.TUDOR_PLASTER))
    openings, _ = parts.dress(placed, rng)
    objs += storey + openings
    eave = top + HOUSE_STOREYS[1]
    rise = across / 2 * math.tan(math.radians(PITCH))
    roof = parts.gable_roof(along, across, PITCH, rng, keys=parts.SHINGLE_KEYS, exposure=0.26, run=(0.6, 1.4), carved=True,
                            moss=(1, ch.moss))
    objs += mesh.transform(roof, mesh.frame((0.0, y0, eave), math.pi / 2))
    for face in ("front", "back"):
        m, w = parts.face_frame(face, x0, x1, y0, y1, eave)
        objs += mesh.transform(parts.gable_wall(w, rise, rng), m)
    objs += mesh.transform(parts.chimney(0.8, 0.7, rise + 1.4, rng, lean_deg=1.2 + ch.lean), mesh.frame((x0 + 1.0, y1 - 1.6, eave - 0.6)))
    for k in range(3):
        objs += mesh.transform([parts.sack(rng, upright=True)], mesh.frame((x1 - 0.5 - 0.55 * k, y1 + 0.6, FLOOR)))
    return mesh.transform(objs, _along_stream(s, centre))
