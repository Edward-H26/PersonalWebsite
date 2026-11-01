"""stable: a half-open stable in Tudor shed framing (DESIGN.md section 10) on a low stone base. Four stalls behind
split stable doors with their upper leaves swung open, a cart bay open to the front with a hand cart under the roof,
a hay loft over everything open along the front and stacked with hay, a gabled hay hood on the front slope, a loft
door with a hoist beam in the right gable, close-studded frames over light plank cladding, a shingle roof at shed
pitch with carved bargeboards, sagging along its ridge and mossy on its seaward slope; a trough, hay bales, a
pitchfork leaning on the wall, the horseshoe sign and the brand lantern."""

import math
import random

from mathutils import Matrix, Vector

from island import mesh, parts

X0, X1, Y0, Y1 = -5.3, 5.3, -3.4, 3.4
BASE, LOFT, EAVE = 0.25, 2.6, 3.6
PITCH = 40.0
BAY = -2.2
STALLS = 4
SHINGLE = {"exposure": 0.26, "run": (0.6, 1.5), "rafters": 1.2, "carved": True}


def build(seed=7):
    rng = random.Random(seed)
    ch = parts.character(seed)
    objs, _ = parts.stone_storey(X0, X1, Y0, Y1, 0.0, BASE, rng, {face: [] for face in parts.FACE_YAW},
                                 course=(0.12, 0.13), length=(0.4, 0.9))
    walls = _walls(rng, ch) + _front(rng) + _loft(rng)
    roof = _gables(rng) + _roof(rng, ch)
    parts.lean(walls + roof, BASE, rng.uniform(0.4, 0.8), "Y")
    parts.lean(roof, EAVE, -rng.uniform(0.5, 0.9), "Y")
    objs += walls + roof + _bay(rng) + _yard(rng)
    return mesh.finalize("isl_stable", objs)


def _walls(rng, ch):
    """Close-studded walls over plank cladding at the back and both ends; the cart bay and the stalls take the
    front."""
    plank = parts.mat("plank_light")
    height = EAVE - BASE
    objs = [mesh.box("core", (X1 - X0, 0.16, height), at=(0.0, Y1 - 0.08, BASE), origin="bottom", mat=plank)]
    objs += [mesh.box("core", (0.16, Y1 - Y0, height), at=(x, 0.0, BASE), origin="bottom", mat=plank) for x in (X0 + 0.08, X1 - 0.08)]
    objs += parts.corner_posts(X0, X1, Y0, Y1, BASE, EAVE, rng, size=0.26)
    for face, spec in (("back", {"bays": 5, "openings": {1: "window", 3: "window"}}),
                       ("left", {"bays": 3}), ("right", {"bays": 3, "openings": {1: "window"}})):
        m, width = parts.face_frame(face, X0, X1, Y0, Y1, BASE)
        wall, holes = parts.timber_wall(width, height, rng, sill=1.3, head=2.1, window_width=parts.WINDOW[0], patch_chance=0.0,
                                        stud=ch.stud * 1.4, **spec)
        objs += mesh.transform(wall, m)
        for _, cx, z0, w, h in holes:
            objs += parts.place(parts.window(w, h, rng, panes=(1, 2), lit=False, shutters=(True, False)), m, (cx, 0.0, z0))
    return objs


def _front(rng):
    """The stall front: a framed plank wall with four split doors, the upper leaves swung open."""
    width = X1 - BAY
    height = LOFT - BASE
    cx = (X1 + BAY) / 2
    frame = mesh.frame((cx, Y0, BASE))
    objs = mesh.transform([mesh.box("stall_wall", (width, 0.16, height), at=(0.0, 0.08, 0.0), origin="bottom",
                                    mat=parts.mat("plank"))], frame)
    wall, holes = parts.timber_wall(width, height, rng, bays=STALLS, openings={k: "door" for k in range(STALLS)},
                                    door_width=1.1, head=2.05, patch_chance=0.0)
    objs += mesh.transform(wall, frame)
    for _, x, z0, w, h in holes:
        objs += parts.place(_stable_door(rng, w, h), frame, (x, 0.0, z0))
    for k in range(1, STALLS):
        x = BAY + width * k / STALLS
        objs.append(mesh.box("stall_partition", (0.08, 2.4, 1.5), at=(x, Y0 + 1.4, BASE), origin="bottom", mat=parts.mat("plank")))
    return objs


def _stable_door(rng, width, height):
    """A split stable door in wall-local coordinates: the lower leaf shut with ledges and a brace, the upper leaf
    swung open against the wall and the dark stall showing above the lower leaf."""
    plank, timber = parts.mat("plank"), parts.mat("timber")
    lower = height * 0.56
    objs = [parts.plate("stall_dark", width, height - lower, (0.0, -0.005, lower + (height - lower) / 2), "timber_dark"),
            mesh.box("door_leaf", (width, 0.05, lower), at=(0.0, -0.03, 0.0), origin="bottom", mat=plank),
            mesh.box("door_brace", (math.hypot(width - 0.1, lower - 0.3), 0.02, 0.07), at=(0.0, -0.062, lower / 2),
                     rot=(0, -math.atan2(lower - 0.3, width - 0.1), 0), mat=timber)]
    for z in (0.15, lower - 0.15):
        objs.append(mesh.box("door_ledge", (width - 0.06, 0.02, 0.09), at=(0.0, -0.062, z), mat=timber))
    leaf = mesh.box("door_leaf_open", (width, 0.05, height - lower), at=(width / 2, -0.025, lower), origin="bottom", mat=plank)
    swing = math.radians(-rng.uniform(95.0, 120.0))
    objs += mesh.transform([leaf], Matrix.Translation((-width / 2, -0.06, 0.0)) @ Matrix.Rotation(swing, 4, "Z"))
    return objs


def _loft(rng):
    """The loft floor over stalls and cart bay, its front open between posts above a rail, and hay heaped inside."""
    timber = parts.mat("timber")
    objs = [mesh.box("loft_floor", (X1 - X0 - 0.3, Y1 - Y0 - 0.3, 0.12), at=(0.0, 0.0, LOFT - 0.12), origin="bottom",
                     mat=parts.mat("plank")),
            mesh.box("loft_beam", (X1 - X0, 0.24, 0.26), at=(0.0, Y0 + 0.12, LOFT - 0.2), mat=timber, bevel=0.015),
            mesh.box("loft_plate", (X1 - X0, 0.24, 0.2), at=(0.0, Y0 + 0.12, EAVE - 0.1), mat=timber),
            mesh.box("loft_rail", (X1 - X0, 0.1, 0.1), at=(0.0, Y0 + 0.08, LOFT + 0.42), mat=timber)]
    posts = 6
    for i in range(posts + 1):
        x = X0 + 0.13 + (X1 - X0 - 0.26) * i / posts
        objs.append(mesh.box("front_post", (0.22, 0.22, EAVE - LOFT), at=(x, Y0 + 0.12, LOFT), origin="bottom", mat=timber))
    for x in (X0 + 0.13, BAY):
        objs.append(mesh.box("bay_post", (0.24, 0.24, LOFT - BASE), at=(x, Y0 + 0.12, BASE), origin="bottom", mat=timber))
    for x, y, r in ((-3.4, 0.6, 1.3), (-0.6, 0.4, 1.5), (2.3, 0.5, 1.4), (4.2, -0.3, 1.0)):
        heap = parts.rock(rng, (2 * r, 2.4, 0.95), key="hay", rough=0.12)
        heap.location = (x, y, LOFT)
        objs.append(heap)
    return objs


def _gables(rng):
    """Plank-clad gables; the right one has the loft door open under a hoist beam with a pulley and rope."""
    rise = (Y1 - Y0) / 2 * math.tan(math.radians(PITCH))
    objs = []
    for face in ("left", "right"):
        m, width = parts.face_frame(face, X0, X1, Y0, Y1, EAVE)
        hatch = (1.1, 1.3, 0.25) if face == "right" else None
        objs += mesh.transform(parts.gable_wall(width, rise, rng, key="plank", opening=hatch), m)
        if hatch:
            w, h, z0 = hatch
            objs += parts.place([parts.plate("loft_hatch", w, h, (0.0, -0.02, z0 + h / 2), "timber_dark")], m)
            door = mesh.box("hatch_door", (w / 2, 0.05, h), at=(w / 4, -0.03, z0), origin="bottom", mat=parts.mat("plank"))
            objs += parts.place(mesh.transform([door], Matrix.Translation((-w / 2, -0.05, 0.0))
                                               @ Matrix.Rotation(math.radians(-110), 4, "Z")), m)
            objs += parts.place(_hoist(z0 + h + 0.35), m)
    return objs


def _hoist(z):
    """A hoist beam out of the gable with a pulley block and a rope hanging from it (wall-local)."""
    timber = parts.mat("timber")
    tip = Vector((0.0, -1.05, z))
    return [mesh.beam("hoist_beam", (0.0, 0.2, z), tip, 0.16, 0.18, timber, bevel=0.012),
            mesh.cylinder("pulley", 0.1, 0.06, at=tip + Vector((0.0, 0.05, -0.2)), rot=(0, math.pi / 2, 0),
                          mat=parts.mat("iron"), segments=10, origin="center"),
            mesh.rod("hoist_rope", tip + Vector((0.0, -0.05, -0.28)), tip + Vector((0.0, -0.05, -2.3)), 0.014,
                     parts.mat("rope"), segments=4),
            mesh.rod("hoist_rope", tip + Vector((0.0, 0.15, -0.28)), tip + Vector((0.0, 0.15, -1.2)), 0.014,
                     parts.mat("rope"), segments=4)]


def _roof(rng, ch):
    """The shingle roof with the hay hood on its front slope, sagging along its ridge."""
    frame = mesh.frame((X0, 0.0, EAVE))
    objs = mesh.transform(parts.gable_roof(X1 - X0, Y1 - Y0, PITCH, rng, missing=ch.wear, moss=(1, ch.moss), **SHINGLE), frame)
    at = frame @ parts.slope_point(Y1 - Y0, PITCH, -1, (X1 - X0) * 0.62, 3.9, 0.06 + 2.4 * 0.035)
    hood = parts.dormer(1.8, 1.2, PITCH, rng, pitch_deg=50.0, hatch=True, body_key="plank_light",
                        roof_kwargs={"carved": True, "exposure": 0.22})
    objs += mesh.transform(hood, mesh.frame(at))
    rise = (Y1 - Y0) / 2 * math.tan(math.radians(PITCH))
    return parts.bow(objs, "X", X0, X1, EAVE, EAVE + rise)


def _bay(rng):
    """The hand cart parked in the open bay, shafts out, and hay bales stacked beside it."""
    objs = mesh.transform(parts.hand_cart(rng), mesh.frame(((X0 + BAY) / 2, -0.3, BASE), math.radians(8)))
    for x, y, z in ((-4.7, 2.2, BASE), (-3.8, 2.3, BASE), (-4.25, 2.25, BASE + 0.4)):
        objs.append(mesh.box("hay_bale", (0.85, 0.5, 0.4), at=(x, y, z), origin="bottom", mat=parts.mat("hay"),
                             rot=(0, 0, math.radians(parts.jitter(rng, 8))), bevel=0.03))
    return objs


def _yard(rng):
    """A trough and a water barrel before the stalls, bales against the wall, a pitchfork, the horseshoe sign and a
    lantern by the doors."""
    objs = mesh.transform(parts.trough(1.8, width=0.55, height=0.55), mesh.frame((2.1, Y0 - 0.65, 0.0)))
    objs += mesh.transform(parts.barrel(rng, segments=12), mesh.frame((0.4, Y0 - 0.55, 0.0)))
    for x, z in ((X1 + 0.55, 0.0), (X1 + 0.55, 0.4)):
        objs.append(mesh.box("hay_bale", (0.5, 0.85, 0.4), at=(x, Y0 + 1.0, z), origin="bottom", mat=parts.mat("hay"),
                             rot=(0, 0, math.radians(parts.jitter(rng, 10))), bevel=0.03))
    foot, top = Vector((X1 + 0.35, Y0 + 2.0, 0.0)), Vector((X1 + 0.1, Y0 + 2.2, 1.6))
    objs.append(mesh.rod("fork_shaft", foot + Vector((0.0, 0.0, 0.25)), top, 0.02, parts.mat("timber"), segments=4))
    objs += [mesh.rod("fork_tine", foot + Vector((0.0, d, 0.25)), foot + Vector((0.0, d, 0.0)), 0.008, parts.mat("iron"), segments=3)
             for d in (-0.06, 0.0, 0.06)]
    front, _ = parts.face_frame("front", BAY, X1, Y0, Y1, BASE)
    objs += parts.place(parts.hanging_sign(arm=0.8, board=(0.5, 0.42), key="plank_light", emblem_key="iron", iron=True,
                                           emblem="horseshoe"), front, ((X1 - BAY) / 2 - 0.15, -0.1, 2.15))
    return objs + parts.place(parts.lantern_bracket(arm=0.45, size=0.7), front, (-(X1 - BAY) / 2 + 0.25, -0.1, 2.0))
