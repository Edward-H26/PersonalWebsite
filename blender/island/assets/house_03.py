"""house_03: a long hall house with a cross wing, on the plan of Little Hall in Lavenham (DESIGN.md section 10). Stone
ground floors under close-studded oak upper floors on the 1.2 m module; the hall's upper floor jettied over its left
side on joist ends and a bressummer; a porch on posts on stone pads under the upper floor at the front gable; the
cross wing in Colmar-tinted plaster, its shingle roof meeting the hall roof in valleys, both roofs sagging, mossy on
the seaward side and finished with carved bargeboards; an outside stair to the wing's upper door; a lean-to shed
behind the wing; leaded windows, a pargeted panel, a cracked lintel, a house sign, the brand lantern and a chimney of
paired pots. The two upper storeys lean a little towards each other, as far as the seed's character says."""

import math
import random

from island import mesh, parts

# The hall spans five bays and the cross wing stands one bay proud of it, so the house keeps the original model's
# width and depth for its height (DESIGN.md section 3) at the real 2.1 m door and 2.4 m storey.
MAIN = (-2.5 * parts.BAY, 2.5 * parts.BAY, -4.5 * parts.BAY, 4.5 * parts.BAY)
WING = (2.5 * parts.BAY, 3.5 * parts.BAY, -parts.BAY, 3 * parts.BAY)
PORCH = 1.5 * parts.BAY
JETTY = parts.JETTY
GROUND, UPPER = 2.7, parts.STOREY
EAVE = GROUND + UPPER
PITCH = 58.0
SHINGLE = {"exposure": 0.33, "run": (0.8, 2.0), "rafters": 1.8, "carved": True}
STONES = {"course": (0.32, 0.46), "length": (0.7, 1.4)}
ROW_TOP = 0.06 + 2.4 * 0.035
STAIR = (MAIN[1] + 0.55, MAIN[2] + 0.25, -2.0)
WINDOW = (parts.WINDOW[0] + 0.3, parts.WINDOW[1] - 0.1)


def build(seed=7):
    rng = random.Random(seed)
    ch = parts.character(seed)
    objs = _main_ground(rng, ch) + _main_upper(rng, ch) + _wing(rng, ch) + _roofs(rng, ch)
    objs += _porch(rng) + _stair(rng) + _shed(rng)
    return mesh.finalize("isl_house_03", objs)


def _stone_openings(objs, frames, openings, rng, cracked=None):
    for face, holes in openings.items():
        for cx, z0, w, h, _ in holes:
            if z0 == 0.0:
                objs += parts.place(parts.door(w, h, rng, strap_end="scroll"), frames[face], (cx, 0.0, z0))
                objs += parts.place(parts.steps(1, w + 0.4, 0.12, 0.36, rng), frames[face], (cx, 0.0, 0.0))
            else:
                objs += parts.place(parts.window(w, h, rng, stone=True, cracked=(face, cx) == cracked), frames[face],
                                    (cx, 0.0, z0))


def _main_ground(rng, ch):
    x0, x1, y0, y1 = MAIN
    y0 += PORCH
    door = parts.DOOR
    openings = {"front": [(-1.2, 0.0, door[0], door[1], False), (1.5, 0.9, *WINDOW, False)],
                "left": [(-2.4, 0.9, *WINDOW, False), (2.4, 0.9, *WINDOW, False)],
                "back": [(1.2, 0.9, *WINDOW, False)]}
    objs, frames = parts.stone_storey(x0, x1, y0, y1, 0.0, GROUND, rng, openings, moss={"left": ch.moss, "back": ch.moss},
                                      **STONES)
    m, width = parts.face_frame("right", x0, x1, y0, WING[2])
    objs += mesh.transform([parts.stone_face(width, GROUND, rng, **STONES)], m)
    flaw = parts.chosen(ch, [(face, hole[0]) for face, holes in openings.items() for hole in holes if hole[1] > 0.0])
    _stone_openings(objs, frames, openings, rng, cracked=flaw)
    objs += parts.place(parts.lantern_bracket(), frames["front"], (-1.2 - 0.95, -0.06, 2.0))
    left, width = parts.face_frame("left", x0, x1, y0, y1, GROUND)
    return objs + parts.place(parts.jetty(rng, width, JETTY, (-width / 2 + 0.3, 0.0, width / 2 - 0.3)), left)


def _main_upper(rng, ch):
    """The hall's close-studded upper floor with its pargeted panel and the two gables."""
    x0, x1, y0, y1 = MAIN
    x0 -= JETTY
    stud = {"stud": ch.stud}
    storey, placed = parts.timber_storey(x0, x1, y0, y1, GROUND, UPPER, rng, {
        "front": {"bays": 5, "openings": {1: "window", 2: "panel", 3: "window"}, **stud},
        "back": {"bays": 5, "openings": {2: "window"}, **stud},
        "left": {"bays": 9, "openings": {1: "window", 4: "window", 7: "window"}, **stud}},
        core_key=parts.tint(ch, parts.TUDOR_PLASTER))
    m, width = parts.face_frame("right", x0, x1, y0, WING[2], GROUND)
    wall, holes = parts.timber_wall(width, UPPER, rng, bays=3, openings={1: "window"}, stud=ch.stud)
    storey += mesh.transform(wall, m)
    placed["right"] = (m, holes, width)
    openings, _ = parts.dress(placed, rng, leaded=("front",))
    storey += openings
    rise = (x1 - x0) / 2 * math.tan(math.radians(PITCH))
    front, width = parts.face_frame("front", x0, x1, y0, y1, EAVE)
    attic = (parts.WINDOW[0] + 0.2, 0.95, 1.0)
    storey += mesh.transform(parts.gable_wall(width, rise, rng, opening=attic), front)
    storey += parts.place(parts.window(attic[0], attic[1], rng, shutters=(False, False), leaded=True), front,
                          (0.0, 0.0, attic[2]))
    back, width = parts.face_frame("back", x0, x1, y0, y1, EAVE)
    storey += mesh.transform(parts.gable_wall(width, rise, rng), back)
    parts.lean(storey, GROUND, ch.lean * 0.5, "X")
    return parts.lean(storey, GROUND, ch.lean * 0.7, "Y")


def _wing(rng, ch):
    """The cross wing: stone below, Colmar-tinted plaster in its close-studded upper floor, a door onto the stair."""
    x0, x1, y0, y1 = WING
    openings = {"right": [(0.6, 0.9, *WINDOW, False)]}
    objs, frames = parts.stone_storey(x0, x1, y0, y1, 0.0, GROUND, rng, openings, quoin_sides=(1,), **STONES)
    _stone_openings(objs, frames, openings, rng)
    stud = {"stud": ch.stud}
    storey, placed = parts.timber_storey(x0, x1, y0, y1, GROUND, UPPER, rng, {
        "front": {"bays": 1, "openings": {0: "door"}, **stud},
        "right": {"bays": 4, "openings": {1: "window"}, **stud},
        "back": {"bays": 3, **stud}}, core_key=parts.tint(ch, parts.COLMAR_PLASTER))
    openings, _ = parts.dress(placed, rng)
    storey += parts.place(parts.hanging_sign(arm=0.5, board=(0.5, 0.42), key="plank", emblem_key="paint_red", iron=True,
                                             emblem="shield"), placed["right"][0], (1.5, -0.04, 1.3))
    rise = (y1 - y0) / 2 * math.tan(math.radians(PITCH))
    m, width = parts.face_frame("right", x0, x1, y0, y1, EAVE)
    gable = mesh.transform(parts.gable_wall(width, rise, rng, key=parts.tint(ch, parts.COLMAR_PLASTER)), m)
    return objs + parts.lean(storey + openings + gable, GROUND, -ch.lean * 0.7, "Y")


def _roofs(rng, ch):
    x0, x1, y0, y1 = MAIN
    span = x1 - x0 + JETTY
    ridge_x = (x0 - JETTY + x1) / 2
    rise = span / 2 * math.tan(math.radians(PITCH))
    main = mesh.frame((ridge_x, y0, EAVE), math.pi / 2)
    objs = mesh.transform(parts.gable_roof(y1 - y0, span, PITCH, rng, missing=ch.wear, moss=(1, ch.moss), **SHINGLE), main)
    wx0, wx1, wy0, wy1 = WING
    tan = math.tan(math.radians(PITCH))
    reach = wx1 - ridge_x

    def under_main_roof(z):
        return -10.0, reach - (rise + ROW_TOP / math.cos(math.radians(PITCH)) - z) / tan + 0.12

    wing = mesh.frame((wx1, (wy0 + wy1) / 2, EAVE), math.pi)
    objs += mesh.transform(parts.gable_roof(reach, wy1 - wy0, PITCH, rng, extent=under_main_roof, barges=(True, False),
                                            missing=ch.wear, **SHINGLE), wing)
    parts.bow(objs, "Y", y0, y1, EAVE, EAVE + rise)
    base = EAVE + rise - 1.4 * tan - 0.3
    stack = parts.chimney(1.1, 0.9, EAVE + rise + 1.0 - base, rng, lean_deg=1.8 + ch.lean, pots=2)
    return objs + mesh.transform(stack, mesh.frame((ridge_x - 1.4, y1 - 2.2, base)))


def _porch(rng):
    """Posts on stone pads carrying the upper floor over the recessed front, a joisted ceiling, paving and a
    bench."""
    x0, x1, y0, _ = MAIN
    wall = y0 + PORCH
    timber, dark = parts.mat("timber"), parts.mat("timber_dark")
    objs = [mesh.box("porch_ceiling", (x1 - x0, PORCH, 0.08), at=(0.0, y0 + PORCH / 2, GROUND - 0.04), mat=dark)]
    for x in (x0 + 0.15, 0.0, x1 - 0.15):
        objs.append(mesh.beam("porch_post", (x, y0 + 0.15, 0.1), (x, y0 + 0.15, GROUND - 0.08), 0.22, 0.22, timber, bevel=0.015))
        objs.append(parts.post_pad(x, y0 + 0.15))
        for s in (-1, 1):
            if x0 + 0.5 < x + s * 0.7 < x1 - 0.5:
                objs += parts.place(parts.curved_member((x, GROUND - 0.8), (x + s * 0.7, GROUND - 0.12), s * 0.08, 0.12, rng,
                                                        0.06), parts.mesh.frame((0.0, y0 + 0.15 + 0.03, 0.0)))
    for i in range(6):
        x = x0 + 0.3 + (x1 - x0 - 0.6) * i / 5
        objs.append(mesh.box("porch_joist", (0.12, PORCH, 0.14), at=(x, y0 + PORCH / 2, GROUND - 0.15), mat=timber))
    slabs = int((x1 - x0) // 1.8)
    for i in range(slabs):
        size = (rng.uniform(1.6, 1.75), PORCH - 0.06, 0.07)
        x = (i - (slabs - 1) / 2) * 1.8 + parts.jitter(rng, 0.04)
        objs.append(mesh.box("paving", size, at=(x, y0 + PORCH / 2, 0.035), rot=(0, 0, math.radians(parts.jitter(rng, 2.0))),
                             mat=parts.mat("stone_light")))
    objs += mesh.transform(parts.bench(1.5, rng), mesh.frame((1.9, wall - 0.3, 0.0)))
    return objs


def _stair(rng):
    """The outside stair along the main block's right wall up to a landing at the wing's upper door."""
    x, foot, top = STAIR
    objs = mesh.transform(parts.stair(rng, GROUND, top - foot, 0.95), mesh.frame((x, foot, 0.0)))
    timber = parts.mat("timber")
    objs.append(mesh.box("landing", (1.25, WING[2] - top, 0.1), at=(x + 0.05, (top + WING[2]) / 2, GROUND - 0.05),
                         mat=parts.mat("plank"), bevel=0.01))
    for y in (top + 0.08, WING[2] - 0.08):
        objs.append(mesh.beam("landing_post", (x + 0.62, y, 0.1), (x + 0.62, y, GROUND + 1.0), 0.12, 0.12, timber, bevel=0.012))
        objs.append(parts.post_pad(x + 0.62, y, size=0.24))
    objs.append(mesh.beam("landing_rail", (x + 0.62, top, GROUND + 0.92), (x + 0.62, WING[2] - 0.05, GROUND + 0.92),
                          0.07, 0.06, timber, bevel=0.01))
    return objs


def _shed(rng):
    """A plank lean-to against the hall's right wall behind the wing, with a shingle roof falling away from the wall,
    a door at its outer end and a barrel by the hall's back wall."""
    x0, y0, y1 = MAIN[1], WING[3] + 0.1, MAIN[3] - 0.2
    depth, low, high = WING[1] - MAIN[1] - 0.1, 1.85, 2.44
    body = parts.extrude_xz("shed", [(0.0, 0.0), (depth, 0.0), (depth, low), (0.0, high)], y0, y1, "plank")
    objs = mesh.transform([body], mesh.frame((x0, 0.0, 0.0)))
    for y in (y0 + 0.05, (y0 + y1) / 2, y1 - 0.05):
        objs.append(mesh.box("shed_batten", (0.05, 0.1, low), at=(x0 + depth + 0.02, y, 0.0), origin="bottom",
                             mat=parts.mat("timber")))
    pitch = math.degrees(math.atan2(high - low, depth))
    roof = parts.gable_roof(y1 - y0, 2 * depth, pitch, rng, sides=(-1,), eave=0.3, gable=0.2, exposure=0.22,
                            run=(0.6, 1.4), rafters=0, barge_size=(0.14, 0.035))
    objs += mesh.transform(roof, mesh.frame((x0, y0, low), math.pi / 2))
    side, _ = parts.face_frame("right", x0, x0 + depth, y0, y1)
    objs += parts.place(parts.door(0.8, 1.6, rng, frame=False), side, (0.0, 0.0, 0.0))
    return objs + mesh.transform(parts.barrel(rng), mesh.frame((x0 - 0.9, MAIN[3] + 0.35, 0.0)))
