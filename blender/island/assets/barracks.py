"""barracks: the guard house by the gate (DESIGN.md sections 9 and 10). A squat stone block with slit windows and an
arched gate up worn steps under the brand lantern; its front wall rises in stone through the watch floor to a
Hanseatic crow-stepped gable flying a Columbia blue and white flag; the watch floor behind it is French colombage
with a fine diagonal lattice in tinted plaster; a flat watch platform behind a plank parapet, a lookout on posts at
the back corner under a slate cone, a chimney of paired pots, a spear rack and barrels by the gate, and a cracked
lintel. The watch floor leans back from the gable, as far as the seed's character says."""

import random

from mathutils import Vector

from island import mesh, parts

X0, X1, Y0, Y1 = -3.5 * parts.BAY, 3.5 * parts.BAY, -4 * parts.BAY, 4 * parts.BAY
GROUND, UPPER = 3.0, parts.STOREY
TOP = GROUND + UPPER
DECK = 0.14
DOOR = (-0.6, 1.5, 2.6)
SLIT = (0.3, 1.0)
LOOKOUT = (X1 - 0.6, Y1 - 0.6, 0.85, 1.9)
STEPS, STEP_RISE = 4, 0.55
STONES = {"course": (0.3, 0.42), "length": (0.55, 1.1)}


def build(seed=7):
    rng = random.Random(seed)
    ch = parts.character(seed)
    ground = _ground(rng, ch)
    upper = _upper(rng, ch)
    top = _platform(rng) + _lookout(rng)
    parts.lean(upper + top, GROUND, ch.lean * 0.6, "Y")
    gable = _gable(rng) + _flag(rng)
    return mesh.finalize("isl_barracks", ground + upper + top + gable + _chimney(rng, ch) + _yard(rng))


def _ground(rng, ch):
    """The stone storey with its arched gate, slit windows behind iron bars, a string course, the shield sign and
    the brand lantern at the gate."""
    cx, w, h = DOOR
    openings = {"front": [(cx, 0.0, w, h, True), (2.4, 1.2, *SLIT, False), (-2.6, 1.2, *SLIT, False)],
                "right": [(-2.4, 1.2, *SLIT, False), (0.0, 1.2, *SLIT, False), (2.4, 1.2, *SLIT, False)],
                "back": [(0.6, 1.2, *SLIT, False)],
                "left": [(1.2, 1.2, *SLIT, False), (-1.8, 1.2, *SLIT, False)]}
    objs, frames = parts.stone_storey(X0, X1, Y0, Y1, 0.0, GROUND, rng, openings, moss={"back": ch.moss}, **STONES)
    for face, holes in openings.items():
        for hx, hz, hw, hh, arched in holes:
            if arched:
                objs += parts.place(parts.door(hw, hh, rng, arched=True, frame=False, strap_end="scroll"), frames[face],
                                    (hx, 0.0, hz))
                objs += parts.place(parts.arch_surround(hw, hh, rng, ring=0.34, stones=11), frames[face], (hx, 0.0, hz))
                objs += parts.place(parts.steps(2, hw + 0.7, 0.14, 0.38, rng), frames[face], (hx, 0.0, 0.0))
            else:
                window = parts.window(hw, hh, rng, panes=(1, 3), stone=True, shutters=(False, False), frame_key="iron",
                                      cracked=(face, hx) == ("right", 0.0))
                objs += parts.place(window, frames[face], (hx, 0.0, hz))
    objs += parts.string_course(X0, X1, Y0, Y1, GROUND - 0.1)
    objs += parts.place(parts.hanging_sign(arm=0.9, board=(0.5, 0.55), key="plank", emblem_key="columbia", iron=True,
                                           emblem="shield"), frames["front"], (cx - w / 2 - 0.9, -0.04, 2.55))
    return objs + parts.place(parts.lantern_bracket(), frames["front"], (cx + w / 2 + 0.55, -0.06, 2.6))


def _upper(rng, ch):
    """The colombage watch floor on the sides and back; the front is the stone gable wall."""
    spec = {"frame": "colombage", "stud": 0.45, "head": 1.95, "sill": 0.85}
    storey, placed = parts.timber_storey(X0, X1, Y0 + 0.5, Y1, GROUND, UPPER, rng, {
        "right": {"bays": 6, "openings": {1: "window", 4: "window"}, **spec},
        "back": {"bays": 5, "openings": {2: "window"}, **spec},
        "left": {"bays": 6, "openings": {2: "window"}, **spec}}, core_key=parts.tint(ch, parts.COLMAR_PLASTER))
    openings, _ = parts.dress(placed, rng, window_kwargs={"shutters": (False, False)}, leaded=("right",))
    return storey + openings


def _gable(rng):
    """The stone front wall through the watch floor and the crow-stepped gable above the platform, each step capped
    with a coping stone, a slit window in the wall and the stone faces on every block."""
    depth = 0.5
    width = X1 - X0
    blocks = [(width, GROUND, TOP + 0.35)]
    for i in range(STEPS):
        half = width / 2 * (1 - (i + 1) / (STEPS + 1))
        z0 = TOP + 0.35 + i * STEP_RISE
        blocks.append((2 * half, z0, z0 + STEP_RISE))
    objs = []
    for w, z0, z1 in blocks:
        objs.append(mesh.box("gable_block", (w, depth, z1 - z0), at=(0.0, Y0 + depth / 2, z0), origin="bottom",
                             mat=parts.mat("stone_dark")))
        m, _ = parts.face_frame("front", -w / 2, w / 2, Y0, Y0 + depth, z0)
        objs += mesh.transform([parts.stone_face(w, z1 - z0, rng, **STONES)], m)
        objs.append(mesh.box("gable_coping", (w + 0.1, depth + 0.1, 0.1), at=(0.0, Y0 + depth / 2, z1), mat=parts.mat("stone_light"),
                             bevel=0.01))
    m, _ = parts.face_frame("front", X0, X1, Y0, Y0 + depth, GROUND)
    return objs + parts.place(parts.window(*SLIT, rng, panes=(1, 3), stone=True, shutters=(False, False), frame_key="iron"),
                              m, (0.0, 0.0, 0.9))


def _platform(rng):
    """The flat roof laid as a plank deck behind the gable, with a parapet of upright boards on its other sides."""
    x0, x1, y0, y1 = X0 - 0.1, X1 + 0.1, Y0 + 0.5, Y1 + 0.1
    objs = [mesh.box("platform_deck", (x1 - x0, y1 - y0, DECK), at=((x0 + x1) / 2, (y0 + y1) / 2, TOP), origin="bottom",
                     mat=parts.mat("timber"))]
    for face in ("right", "back", "left"):
        m, width = parts.face_frame(face, x0, x1, y0, y1, TOP + DECK)
        objs += mesh.transform(_parapet(width, rng), m)
    return objs


def _parapet(width, rng):
    """One side of the parapet in wall-local coordinates: posts about a metre apart, upright boards of two heights
    between them like a palisade, and a rail behind the boards."""
    timber, plank = parts.mat("timber"), parts.mat("plank")
    posts = max(2, round(width / 1.15))
    objs = [mesh.box("parapet_post", (0.15, 0.15, 1.15), at=(-width / 2 + 0.075 + (width - 0.15) * i / posts, 0.06, 0.0),
                     origin="bottom", mat=timber) for i in range(posts + 1)]
    objs.append(mesh.box("parapet_rail", (width, 0.1, 0.1), at=(0.0, 0.14, 0.62), mat=timber))
    boards = round(width / 0.34)
    bw = width / boards
    for i in range(boards):
        h = (0.95 if i % 2 else 0.8) + parts.jitter(rng, 0.03)
        objs.append(mesh.box("parapet_board", (bw - 0.03, 0.05, h), at=(-width / 2 + bw * (i + 0.5), 0.0, 0.0),
                             origin="bottom", mat=plank))
    return objs


def _lookout(rng):
    """A square lookout on four posts at the back right corner of the platform, railed at waist height, under a
    conical slate roof with an iron finial."""
    cx, cy, half, height = LOOKOUT
    z = TOP + DECK
    timber = parts.mat("timber")
    objs = [mesh.box("lookout_post", (0.16, 0.16, height), at=(cx + sx * half, cy + sy * half, z), origin="bottom",
                     mat=timber) for sx in (-1, 1) for sy in (-1, 1)]
    for face in ("front", "right", "back", "left"):
        m, w = parts.face_frame(face, cx - half, cx + half, cy - half, cy + half, z)
        objs += mesh.transform([mesh.box("lookout_rail", (w, 0.1, 0.1), at=(0.0, 0.0, 1.0), mat=timber),
                                mesh.box("lookout_plate", (w + 0.24, 0.18, 0.16), at=(0.0, 0.0, height), origin="bottom",
                                         mat=timber)], m)
    roof_z = z + height + 0.16
    objs += mesh.transform(parts.cone_roof(1.45, 2.2, rng, keys=parts.SLATE_KEYS, exposure=0.19), mesh.frame((cx, cy, roof_z)))
    tip = Vector((cx, cy, roof_z + 2.32))
    return objs + [mesh.rod("finial", tip, tip + Vector((0.0, 0.0, 0.32)), 0.025, parts.mat("iron"), segments=6),
                   parts.blob(rng, 0.05, "iron", squash=1.0, at=tip + Vector((0.0, 0.0, 0.2)))]


def _flag(rng):
    """A flag pole on the apex of the stepped gable flying a Columbia blue and white flag."""
    z = TOP + STEPS * STEP_RISE + 0.45
    top = z + 2.4
    objs = [mesh.rod("flag_pole", (0.0, Y0 + 0.25, z - 0.1), (0.0, Y0 + 0.25, top), 0.06, parts.mat("timber"), segments=8,
                     radius_b=0.04),
            parts.blob(rng, 0.07, "paint_gold", squash=1.0, at=(0.0, Y0 + 0.25, top + 0.05))]
    return objs + mesh.transform(parts.flag(1.3, 0.85, rng, keys=("columbia", "white")), mesh.frame((0.05, Y0 + 0.25, top - 0.9)))


def _chimney(rng, ch):
    stack = parts.chimney(0.95, 0.8, TOP + 1.7 - 5.0, rng, lean_deg=1.6 + ch.lean, pots=2)
    return mesh.transform(stack, mesh.frame((-2.4, 2.6, 5.0)))


def _yard(rng):
    """Barrels beside the door and a rack of spears against the wall."""
    cx, w, _ = DOOR
    objs = mesh.transform(parts.barrel(rng), mesh.frame((cx - w / 2 - 0.95, Y0 - 0.45, 0.0)))
    objs += mesh.transform(parts.barrel(rng, height=0.82), mesh.frame((cx - w / 2 - 1.55, Y0 - 0.55, 0.0)))
    x = 1.25
    timber, iron = parts.mat("timber"), parts.mat("iron")
    objs += [mesh.box("rack_post", (0.08, 0.08, 1.3), at=(x + dx, Y0 - 0.3, 0.0), origin="bottom", mat=timber)
             for dx in (-0.55, 0.55)]
    objs.append(mesh.box("rack_rail", (1.3, 0.08, 0.08), at=(x, Y0 - 0.3, 1.2), mat=timber))
    for i in range(4):
        foot = Vector((x - 0.42 + 0.28 * i, Y0 - 0.55, 0.0))
        head = Vector((x - 0.42 + 0.28 * i + parts.jitter(rng, 0.04), Y0 - 0.22, 2.1))
        objs.append(mesh.rod("spear", foot, head, 0.02, timber, segments=4))
        objs.append(mesh.rod("spear_tip", head, head + (head - foot).normalized() * 0.22, 0.03, iron, segments=4,
                             radius_b=0.002))
    return objs
