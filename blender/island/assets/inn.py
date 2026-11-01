"""inn: a Fachwerk coaching inn round a courtyard (DESIGN.md section 10). The front range has a stone ground storey
with a carriage arch through to the yard between two brand lanterns, and wide Fachwerk bays above it with saltire
braces in tinted plaster and one pargeted panel, jettied over the street on joist ends and a bressummer. A Lavenham
two-storey porch stands before the door, open below on posts and arched braces with the brand lantern hanging over
the step, closed above with a leaded window, under a carved gable; the QH crest hangs from it on a wrought-iron
bracket. A terracotta roof with four dormers sized by the seed, moss on its yard slope and two chimneys of paired
pots; a balcony, a wing running back on the right, a yard wall, stacked barrels, a table and benches by the door,
and a cracked lintel."""

import math
import random

from mathutils import Matrix, Vector

from island import mesh, parts

X0, X1, FY0, FY1 = -5 * parts.BAY, 5 * parts.BAY, -3 * parts.BAY, 3 * parts.BAY
WX0, WY1 = parts.BAY, 6 * parts.BAY
GROUND, FIRST = 3.0, parts.STOREY
EAVE = GROUND + FIRST
JETTY = parts.JETTY
PITCH = 50.0
ARCH = (-3 * parts.BAY, 2 * parts.BAY, 2.9)
DOOR = (0.0, parts.DOOR[0], parts.DOOR[1] + 0.25)
PORCH = (2 * parts.BAY, 1.5 * parts.BAY)
TILES = {"keys": parts.TILE_KEYS, "exposure": 0.32, "thickness": 0.03, "run": (0.6, 1.5), "rafters": 1.6,
         "ridge_key": "tile_dark", "carved": True}
STONES = {"course": (0.32, 0.46), "length": (0.6, 1.2)}
ROW_TOP = 0.06 + 2.4 * 0.03
SPAN = FY1 - FY0 + JETTY
RIDGE_Y = (FY0 - JETTY + FY1) / 2
RISE = SPAN / 2 * math.tan(math.radians(PITCH))
FACHWERK = {"frame": "fachwerk", "window_width": 2 * parts.WINDOW[0]}


def build(seed=7):
    rng = random.Random(seed)
    ch = parts.character(seed)
    plaster = parts.tint(ch, parts.FACHWERK_PLASTER)
    ground = _ground(rng, ch) + _passage()
    upper = _first(rng, plaster)
    wing_ground, wing_upper = _wing(rng, ch, plaster)
    parts.lean(upper, GROUND, ch.lean * 0.8, "X")
    parts.lean(wing_upper, GROUND, -ch.lean * 0.6, "Y")
    objs = ground + upper + wing_ground + wing_upper + _gables(rng, plaster) + _roofs(rng, ch)
    objs += _porch(rng, plaster) + _yard_wall(rng) + _balcony(rng) + _street(rng)
    return mesh.finalize("isl_inn", objs)


def _ground(rng, ch):
    """The front range's stone storey: cores either side of the carriage way, stone courses round the arch, door
    and windows, quoins, a string course and the jetty along the front."""
    ax, aw, ah = ARCH
    dx, dw, dh = DOOR
    left, right = ax - aw / 2, ax + aw / 2
    core = parts.mat("stone_dark")
    objs = [mesh.box("core", (left - X0, FY1 - FY0, GROUND), at=((X0 + left) / 2, 0.0, 0.0), origin="bottom", mat=core),
            mesh.box("core", (X1 - right, FY1 - FY0, GROUND), at=((right + X1) / 2, 0.0, 0.0), origin="bottom", mat=core)]
    window = (2 * parts.WINDOW[0], parts.WINDOW[1])
    faces = {"front": [(ax, 0.0, aw, ah, True), (dx, 0.0, dw, dh, True), (-1.8, 1.0, *window, False),
                       (2.4, 1.0, *window, False), (4.8, 1.0, *window, False)],
             "right": [(-1.8, 1.0, *window, False), (1.8, 1.0, *window, False)],
             "left": [(0.6, 1.0, *window, False)]}
    frames = {}
    for face, holes in faces.items():
        m, w = parts.face_frame(face, X0, X1, FY0, FY1)
        frames[face] = m
        objs += mesh.transform([parts.stone_face(w, GROUND, rng, holes, moss=ch.moss if face == "left" else 0.0, **STONES)], m)
        for cx, z0, hw, hh, arched in holes:
            if not arched:
                objs += parts.place(parts.window(hw, hh, rng, panes=(3, 3), stone=True, shutters=(face != "front",) * 2,
                                                 cracked=(face, cx) == ("front", 4.8)), m, (cx, 0.0, z0))
    front = frames["front"]
    objs += parts.place(parts.door(dw, dh, rng, arched=True, frame=False, strap_end="scroll"), front, (dx, 0.0, 0.0))
    objs += parts.place(parts.arch_surround(dw, dh, rng), front, (dx, 0.0, 0.0))
    objs += parts.place(parts.steps(2, dw + 0.7, 0.14, 0.38, rng), front, (dx, 0.0, 0.0))
    objs += parts.place(parts.arch_surround(aw, ah, rng, ring=0.36, stones=13), front, (ax, 0.0, 0.0))
    objs += parts.quoins(X0, X1, FY0, FY1, 0.0, GROUND, rng, ends=(-1,))
    objs += parts.string_course(X0, X1, FY0, FY1, GROUND - 0.1)
    return objs + parts.place(parts.jetty(rng, X1 - X0, JETTY, (X0 + 0.5, -2.6, 2.6, X1 - 0.5)), front, (0.0, 0.0, GROUND))


def _passage():
    """The carriage way through the front range: an arched slab at each end, cobbles and a timber ceiling."""
    ax, aw, ah = ARCH
    width = aw + 0.6
    objs = []
    for face in ("front", "back"):
        m, _ = parts.face_frame(face, ax - width / 2, ax + width / 2, FY0, FY1)
        objs += mesh.transform([parts.arched_wall(width, GROUND, 0.5, [(0.0, aw, ah, True)], "stone_dark")], m)
    objs.append(mesh.box("passage_floor", (aw, FY1 - FY0, 0.05), at=(ax, 0.0, 0.0), origin="bottom",
                         mat=parts.mat("stone_light")))
    objs.append(mesh.box("passage_ceiling", (aw, FY1 - FY0, GROUND - ah), at=(ax, 0.0, ah), origin="bottom",
                         mat=parts.mat("timber_dark")))
    return objs


def _first(rng, plaster):
    """The front range's Fachwerk first floor, jettied over the street, with a door onto the balcony."""
    storey, placed = parts.timber_storey(X0, X1, FY0 - JETTY, FY1, GROUND, FIRST, rng, {
        "front": {"bays": 5, "openings": {0: "window", 1: "window", 2: "panel", 3: "door", 4: "window"},
                  "door_width": parts.DOOR[0],
                  **FACHWERK},
        "right": {"bays": 3, "openings": {0: "window", 2: "window"}, **FACHWERK},
        "left": {"bays": 3, "openings": {1: "window"}, **FACHWERK},
        "back": {"bays": 5, "openings": {1: "window", 3: "window"}, **FACHWERK}}, core_key=plaster)
    openings, _ = parts.dress(placed, rng, window_kwargs={"panes": (2, 3)}, leaded=("front",))
    return storey + openings


def _wing(rng, ch, plaster):
    """The wing running back from the right end of the front range: stone below, Fachwerk above, a gable at the
    back."""
    window = (2 * parts.WINDOW[0], parts.WINDOW[1])
    holes = {"right": [(-1.2, 1.0, *window, False), (1.2, 1.0, *window, False)], "back": [(0.0, 1.0, *window, False)],
             "left": [(0.0, 0.0, parts.DOOR[0], parts.DOOR[1], False)]}
    ground, frames = parts.stone_storey(WX0, X1, FY1, WY1, 0.0, GROUND, rng, holes, quoin_ends=(1,),
                                        moss={"back": ch.moss}, **STONES)
    for face, face_holes in holes.items():
        for cx, z0, w, h, _ in face_holes:
            part = parts.door(w, h, rng, frame=False) if z0 == 0.0 else parts.window(w, h, rng, panes=(3, 3), stone=True)
            ground += parts.place(part, frames[face], (cx, 0.0, z0))
    upper, placed = parts.timber_storey(WX0, X1, FY1, WY1, GROUND, FIRST, rng, {
        "right": {"bays": 2, "openings": {1: "window"}, **FACHWERK},
        "back": {"bays": 2, "openings": {0: "window"}, **FACHWERK},
        "left": {"bays": 2, "openings": {0: "window"}, **FACHWERK}}, core_key=plaster)
    openings, _ = parts.dress(placed, rng, window_kwargs={"panes": (2, 3)})
    m, width = parts.face_frame("back", WX0, X1, FY1, WY1, EAVE)
    rise = (X1 - WX0) / 2 * math.tan(math.radians(PITCH))
    return ground, upper + openings + mesh.transform(parts.gable_wall(width, rise, rng, key=plaster), m)


def _gables(rng, plaster):
    """The front range's gables at both ends, each with an attic window."""
    objs = []
    attic = (parts.WINDOW[0] + 0.2, 1.0, 1.25)
    for face in ("left", "right"):
        m, width = parts.face_frame(face, X0, X1, FY0 - JETTY, FY1, EAVE)
        objs += mesh.transform(parts.gable_wall(width, RISE, rng, opening=attic, key=plaster), m)
        objs += parts.place(parts.window(attic[0], attic[1], rng, panes=(2, 3), shutters=(False, False)), m, (0.0, 0.0, attic[2]))
    return objs


def _roofs(rng, ch):
    """The front range's terracotta roof with four dormers, each sized by the seed, the wing's roof stopping against
    it in valleys, both sagging a little, and two chimneys of paired pots."""
    frame = mesh.frame((X0, RIDGE_Y, EAVE))
    objs = mesh.transform(parts.gable_roof(X1 - X0, SPAN, PITCH, rng, missing=ch.wear, moss=(1, ch.moss), **TILES), frame)
    for u in (1.8, 4.5, 7.4, 10.0):
        width, height = rng.uniform(1.0, 1.4), rng.uniform(0.9, 1.1)
        at = frame @ parts.slope_point(SPAN, PITCH, -1, u, 2.4, ROW_TOP)
        dormer = parts.dormer(width, height, PITCH, rng, keys=parts.TILE_KEYS,
                              roof_kwargs={"exposure": 0.28, "run": (0.5, 1.1), "thickness": 0.03, "carved": True,
                                           "ridge_key": "tile_dark"})
        objs += mesh.transform(dormer, mesh.frame(at))
    tan = math.tan(math.radians(PITCH))
    reach = WY1 - RIDGE_Y

    def under_main_roof(z):
        return -10.0, reach - (RISE + ROW_TOP / math.cos(math.radians(PITCH)) - z) / tan + 0.12

    wing = mesh.frame(((WX0 + X1) / 2, WY1, EAVE), -math.pi / 2)
    objs += mesh.transform(parts.gable_roof(reach, X1 - WX0, PITCH, rng, extent=under_main_roof, barges=(True, False),
                                            missing=ch.wear, **TILES), wing)
    parts.bow(objs, "X", X0, X1, EAVE, EAVE + RISE)
    for x, y in ((-4.2, RIDGE_Y + 1.1), (2.4, RIDGE_Y + 1.25)):
        base = EAVE + RISE - (y - RIDGE_Y + 0.6) * tan
        stack = parts.chimney(1.0, 0.85, EAVE + RISE + 0.85 - base, rng, lean_deg=1.8 + ch.lean, pots=2)
        objs += mesh.transform(stack, mesh.frame((x, y, base)))
    return objs


def _porch(rng, plaster):
    """The two-storey porch before the door: open below between two posts on stone pads with arched braces and the
    brand lantern hanging over the step, a Fachwerk upper storey with a leaded window, a carved gable and a
    terracotta roof running back into the main roof, and the crest sign hanging from its corner."""
    width, depth = PORCH
    x0, x1, y0, y1 = -width / 2, width / 2, FY0 - depth, FY0
    timber = parts.mat("timber")
    objs = []
    for x in (x0 + 0.1, x1 - 0.1):
        objs.append(mesh.box("porch_post", (0.22, 0.22, GROUND - 0.1), at=(x, y0 + 0.1, 0.1), origin="bottom", mat=timber,
                             bevel=0.015))
        objs.append(parts.post_pad(x, y0 + 0.1))
        objs.append(mesh.beam("porch_plate", (x, y0, GROUND - 0.1), (x, y1, GROUND - 0.1), 0.16, 0.2, timber))
    front = mesh.frame((0.0, y0 + 0.1, 0.0))
    objs += parts.place([parts.member((x0 + 0.1, GROUND - 0.1), (x1 - 0.1, GROUND - 0.1), 0.24, rng, 0.06)], front)
    for s in (-1, 1):
        objs += parts.place(parts.curved_member((s * (width / 2 - 0.2), GROUND - 1.1), (0.0, GROUND - 0.25), s * 0.2, 0.14,
                                                rng, 0.08), front)
    storey, placed = parts.timber_storey(x0, x1, y0, y1 - JETTY, GROUND, FIRST, rng, {
        "front": {"bays": 2, "openings": {0: ("window", 0.55)}, "window_width": 2 * parts.WINDOW[0], "frame": "fachwerk"},
        "left": {"bays": 1, "frame": "fachwerk"},
        "right": {"bays": 1, "frame": "fachwerk"}}, core_key=plaster)
    windows, _ = parts.dress(placed, rng, window_kwargs={"shutters": (False, False)}, leaded=("front",))
    objs += storey + windows
    rise = width / 2 * math.tan(math.radians(52.0))
    m, gable_width = parts.face_frame("front", x0, x1, y0, y1, EAVE)
    objs += mesh.transform(parts.gable_wall(gable_width, rise, rng, key=plaster), m)
    main_z = EAVE + ROW_TOP / math.cos(math.radians(PITCH))
    tan_main = math.tan(math.radians(PITCH))
    reach = depth

    def into_main_roof(z):
        return -10.0, reach + JETTY + (EAVE + z - main_z) / tan_main + 0.12

    roof = parts.gable_roof(reach + 3.0, width, 52.0, rng, extent=into_main_roof, barges=(True, False), eave=0.3, gable=0.3,
                            exposure=0.24, thickness=0.03, run=(0.45, 1.0), rafters=0, keys=parts.TILE_KEYS,
                            ridge_key="tile_dark", carved=True)
    objs += mesh.transform(roof, mesh.frame((0.0, y0, EAVE), math.pi / 2))
    sign = parts.hanging_sign(arm=1.35, board=(1.05, 1.1), key="plank_light", iron=True, emblem="crest")
    side, _ = parts.face_frame("right", x0, x1, y0, y1)
    objs += parts.place(sign, side, (-depth / 2 + 0.45, 0.0, GROUND + 0.6))
    hook = Vector((0.0, y0 + 0.6, GROUND - 0.12))
    objs.append(mesh.rod("lantern_chain", hook, hook - Vector((0.0, 0.0, 0.3)), 0.01, parts.mat("iron"), segments=4))
    return objs + mesh.transform(parts.lantern(size=0.8, hook=False), mesh.frame(hook - Vector((0.0, 0.0, 0.3 + 0.44))))


def _yard_wall(rng):
    """The stone wall closing the yard on the left and at the back, with coping stones."""
    h, t = 2.2, 0.45
    objs = []
    for x0, x1, y0, y1, face in ((X0, X0 + t, FY1, WY1, "left"), (X0, WX0, WY1 - t, WY1, "back")):
        objs.append(mesh.box("yard_wall", (x1 - x0, y1 - y0, h), at=((x0 + x1) / 2, (y0 + y1) / 2, 0.0), origin="bottom",
                             mat=parts.mat("stone_dark")))
        m, w = parts.face_frame(face, x0, x1, y0, y1)
        objs += mesh.transform([parts.stone_face(w, h, rng, course=(0.26, 0.36), length=(0.5, 1.0))], m)
        objs.append(mesh.box("coping", (x1 - x0 + 0.1, y1 - y0 + 0.1, 0.12), at=((x0 + x1) / 2, (y0 + y1) / 2, h),
                             origin="bottom", mat=parts.mat("stone_light")))
    return objs


def _balcony(rng):
    """A timber balcony on the first floor at the balcony door: a plank deck on brackets and a rail on sawn
    balusters."""
    timber, plank = parts.mat("timber"), parts.mat("plank")
    front = FY0 - JETTY
    x0, x1, depth = 2 * parts.BAY - 0.2, 4 * parts.BAY + 0.2, 0.95
    z = GROUND + 0.08
    y = front - depth
    objs = [mesh.box("balcony_deck", (x1 - x0, depth + 0.1, 0.1), at=((x0 + x1) / 2, front - depth / 2 + 0.05, z), mat=plank)]
    for x in (x0 + 0.15, (x0 + x1) / 2, x1 - 0.15):
        objs.append(mesh.beam("balcony_bracket", (x, FY0 + 0.02, z - 1.05), (x, y + 0.12, z - 0.06), 0.12, 0.12, timber))
    edges = (((x0, y), (x1, y)), ((x0, y), (x0, front)), ((x1, y), (x1, front)))
    for (ax, ay), (bx, by) in edges:
        a, b = Vector((ax, ay, z)), Vector((bx, by, z))
        objs.append(mesh.beam("balcony_rail", a + Vector((0.0, 0.0, 1.0)), b + Vector((0.0, 0.0, 1.0)), 0.1, 0.08, timber))
        count = max(2, int((b - a).length / 0.24))
        for i in range(count + 1):
            p = a.lerp(b, i / count)
            objs.append(mesh.box("baluster", (0.07, 0.035, 0.95), at=p + Vector((0.0, 0.0, 0.05)), origin="bottom",
                                 rot=(0, 0, math.atan2(b.y - a.y, b.x - a.x)), mat=plank))
    return objs


def _street(rng):
    """Brand lanterns either side of the carriage arch, barrels by the door and a table with two benches."""
    ax, aw, _ = ARCH
    front, _ = parts.face_frame("front", X0, X1, FY0, FY1)
    objs = []
    for s in (-1, 1):
        objs += parts.place(parts.lantern_bracket(), front, (ax + s * (aw / 2 + 0.55), -0.06, 2.55))
    for x, z in ((1.75, 0.0), (2.4, 0.0)):
        barrel = parts.barrel(rng, segments=10)
        roll = (Matrix.Translation((x, FY0 - 0.6, z + 0.318)) @ Matrix.Rotation(math.pi / 2, 4, "X")
                @ Matrix.Translation((0.0, 0.0, -0.45)))
        objs += mesh.transform(barrel, roll)
    table = mesh.frame((-2.1, FY0 - 1.25, 0.0), math.pi / 2)
    objs += mesh.transform(parts.trestle_table(2.0, 0.78, 0.78, rng, key="plank"), table)
    for s in (-1, 1):
        objs += mesh.transform(parts.bench(1.9, rng), table @ Matrix.Translation((0.0, s * 0.68, 0.0)))
    return objs
