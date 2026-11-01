"""house_01: a Cotswold-Tudor cottage (DESIGN.md section 10), long and low on a honey-stone plinth. Close-studded oak
framing on the 1.2 m module with curved braces in the corner bays, gables jettied out over both end walls on joist
ends and bressummers, a stone-tile roof under a deep shingled ridge, sagging and mossy on its seaward slope, with a
dormer and a chimney of paired pots on the ridge. The door stands up worn steps under a gabled porch whose tie beam
is carved 2022, beside the brand lantern; leaded front windows, an Alsace flower box, a pargeted panel, a
schoolhouse sign, a woodshed lean-to with a leaning post and a water butt. The walls lean one way and the roof the
other, as far as the seed's character says."""

import math
import random

from mathutils import Vector

from island import mesh, parts

LENGTH, DEPTH = 7 * parts.BAY, 4 * parts.BAY
PLINTH, WALL = 0.35, parts.STOREY
EAVE = PLINTH + WALL
PITCH = 50.0
GABLE_JETTY = parts.JETTY
STONE_TILES = {"keys": parts.STONE_SLATE_KEYS, "exposure": 0.2, "thickness": 0.04, "run": (0.3, 0.7), "ridge_key": "copper"}
ROW_TOP = 0.06 + 2.4 * 0.04


def build(seed=7):
    rng = random.Random(seed)
    ch = parts.character(seed)
    x0, x1, y0, y1 = -LENGTH / 2, LENGTH / 2, -DEPTH / 2, DEPTH / 2
    objs, _ = parts.stone_storey(x0, x1, y0, y1, 0.0, PLINTH, rng, {face: [] for face in parts.FACE_YAW},
                                 course=(0.16, 0.2), length=(0.35, 0.8), keys=parts.HONEY_KEYS, moss={"back": ch.moss})
    walls, doors = _walls(rng, ch, x0, x1, y0, y1)
    roof = _gables(rng, x0, x1, y0, y1) + _roof(rng, ch, x0, x1)
    parts.lean(walls + roof, PLINTH, ch.lean, "X")
    parts.lean(roof, EAVE, -ch.lean * 0.9, "X")
    parts.lean(roof, EAVE, ch.lean * 0.6, "Y")
    objs += walls + roof + _yard(rng, ch, doors[0], x0, x1, y0, y1)
    return mesh.finalize("isl_house_01", objs)


def _walls(rng, ch, x0, x1, y0, y1):
    """The close-studded storey with its windows, door and pargeted panel, the joisted jetties under both gables, the
    flower box under the right front window and the date on the door lintel."""
    stud = {"stud": ch.stud}
    storey, placed = parts.timber_storey(x0, x1, y0, y1, PLINTH, WALL, rng, {
        "front": {"bays": 7, "openings": {1: "window", 3: "door", 4: "panel", 5: "window"}, **stud},
        "right": {"bays": 4, "openings": {1: "window"}, **stud},
        "back": {"bays": 7, "openings": {2: "window", 4: "window"}, **stud},
        "left": {"bays": 4, **stud}}, core_key=parts.tint(ch, parts.TUDOR_PLASTER))
    openings, doors = parts.dress(placed, rng, door_kwargs={"strap_end": "scroll"}, leaded=("front",))
    storey += openings
    for face in ("left", "right"):
        m, width = parts.face_frame(face, x0, x1, y0, y1, EAVE)
        storey += parts.place(parts.jetty(rng, width, GABLE_JETTY, (-width / 2 + 0.35, width / 2 - 0.35)), m)
    front, _ = parts.face_frame("front", x0, x1, y0, y1, PLINTH)
    storey += parts.place(parts.flower_box(1.0, rng), front, (x0 + 5.5 * parts.BAY, -0.05, 0.62))
    m, cx, width, _ = doors[0]
    main_z = WALL + ROW_TOP / math.cos(math.radians(PITCH))
    storey += parts.place(parts.porch(width + 0.6, parts.BAY, WALL, -PLINTH, main_z, PITCH, rng,
                                      keys=parts.STONE_SLATE_KEYS, date="2022", roof_kwargs={"thickness": 0.04}), m, (cx, 0.0, 0.0))
    return storey, doors


def _gables(rng, x0, x1, y0, y1):
    """Both gables standing out over the end walls, the right one with an attic window."""
    rise = DEPTH / 2 * math.tan(math.radians(PITCH))
    objs = []
    for face, attic in (("left", None), ("right", (parts.WINDOW[0], 0.9, 0.7))):
        m, width = parts.face_frame(face, x0 - GABLE_JETTY, x1 + GABLE_JETTY, y0, y1, EAVE)
        objs += mesh.transform(parts.gable_wall(width, rise, rng, opening=attic), m)
        if attic:
            objs += parts.place(parts.window(attic[0], attic[1], rng, panes=(2, 3), shutters=(False, False)), m,
                                (0.0, 0.0, attic[2]))
    return objs


def _roof(rng, ch, x0, x1):
    """The stone-tile roof over both jettied gables with carved bargeboards, moss on the seaward slope, a dormer and
    a deep shingled ridge, sagging along its length, and a chimney with paired pots rising through the ridge."""
    length = LENGTH + 2 * GABLE_JETTY
    start = x0 - GABLE_JETTY
    frame = mesh.frame((start, 0.0, EAVE))
    objs = mesh.transform(parts.gable_roof(length, DEPTH, PITCH, rng, carved=True, missing=ch.wear, moss=(1, ch.moss),
                                           **STONE_TILES), frame)
    dormer_at = frame @ parts.slope_point(DEPTH, PITCH, -1, length * 0.3, 2.15, ROW_TOP)
    objs += mesh.transform(parts.dormer(parts.BAY, 1.0, PITCH, rng, keys=parts.STONE_SLATE_KEYS,
                                        roof_kwargs={"thickness": 0.04, "carved": True}), mesh.frame(dormer_at))
    ridge = EAVE + DEPTH / 2 * math.tan(math.radians(PITCH))
    objs += _deep_ridge(start - parts.OVERHANG, length + 2 * parts.OVERHANG, ridge, rng)
    parts.bow(objs, "X", start, start + length, EAVE, ridge)
    stack = parts.chimney(0.85, 0.7, ridge + 0.75 - 2.2, rng, lean_deg=2.0 + ch.lean, pots=2)
    return objs + mesh.transform(stack, mesh.frame((x1 - 1.8, 0.0, 2.2)))


def _deep_ridge(start, length, ridge, rng, sections=9):
    """A deep rounded ridge in shingles over the stone tiles, like a thatched ridge, its lower edges cut into
    points, lofted in sections so it sags with the roof."""
    p = math.radians(PITCH)
    reach, lift = 0.5, ROW_TOP + 0.02
    edge = [Vector((0.0, side * reach * math.cos(p), ridge - reach * math.sin(p) + lift)) for side in (-1, 1)]
    profile = [edge[0]] + [Vector((0.0, -reach * math.cos(p) * math.cos(a), ridge + lift + 0.24 * math.sin(a)))
                           for a in (math.pi * i / 6 for i in range(1, 6))] + [edge[1]]
    rings = [[(start + length * k / sections, q.y, q.z) for q in profile] for k in range(sections + 1)]
    roll = mesh.loft("deep_ridge", rings, mat=parts.mat("copper"))
    bm = parts.bmesh.new()
    teeth = int(length / 0.3)
    for side, q in zip((-1, 1), edge):
        down = Vector((0.0, side * math.cos(p), -math.sin(p))) * 0.14
        for i in range(teeth):
            x0, x1 = start + length * i / teeth, start + length * (i + 1) / teeth
            tri = [Vector((x0, q.y, q.z)), Vector((x1, q.y, q.z)), Vector(((x0 + x1) / 2, q.y, q.z)) + down]
            parts.add_face(bm, tri, (0.0, side * math.sin(p), math.cos(p)))
    return [roll, mesh.from_bmesh("ridge_points", bm, parts.mat("copper"))]


def _yard(rng, ch, door, x0, x1, y0, y1):
    """Worn steps and the brand lantern at the door, the schoolhouse sign, a water butt and the woodshed."""
    m, cx, width, _ = door
    objs = parts.place(parts.steps(2, width + 0.4, PLINTH / 2, 0.3, rng), m, (cx, 0.0, -PLINTH))
    objs += parts.place(parts.lantern_bracket(), m, (cx + width / 2 + 0.38, -0.05, 1.7))
    front, _ = parts.face_frame("front", x0, x1, y0, y1, PLINTH)
    objs += parts.place(parts.hanging_sign(arm=0.85, board=(0.52, 0.4), key="plank", emblem_key="canvas", iron=True,
                                           emblem="book"), front, (x0 + 0.6, -0.04, 2.05))
    objs += mesh.transform(parts.barrel(rng), mesh.frame((x1 - 0.55, y0 - 0.5, 0.0)))
    return objs + _woodshed(rng, ch, x0, x1, y0, y1)


def _woodshed(rng, ch, x0, x1, y0, y1):
    """A lean-to on two posts against the left end wall, shingled at 40 degrees, with split logs stacked under it;
    one of its posts, which one the character decides, has settled and leans."""
    depth, length, pitch = parts.BAY, DEPTH - 0.8, 40.0
    high = EAVE - 0.3
    low = high - depth * math.tan(math.radians(pitch))
    timber = parts.mat("timber")
    objs = []
    settled = parts.chosen(ch, (-1, 1))
    for y, tilt in ((-length / 2 + 0.1, 4.0 * (settled == -1)), (length / 2 - 0.1, -4.0 * (settled == 1))):
        objs.append(mesh.box("shed_post", (0.12, 0.12, low), at=(x0 - depth + 0.08, y, 0.0), origin="bottom", mat=timber,
                             rot=(math.radians(tilt), 0.0, 0.0)))
        objs.append(parts.post_pad(x0 - depth + 0.08, y, size=0.24))
    objs.append(mesh.box("shed_plate", (0.12, length, 0.12), at=(x0 - depth + 0.08, 0.0, low - 0.06), mat=timber))
    roof = parts.gable_roof(length, 2 * depth, pitch, rng, sides=(1,), eave=0.25, gable=0.12, exposure=0.22,
                            run=(0.4, 0.9), rafters=0, barge_size=(0.12, 0.03))
    objs += mesh.transform(roof, mesh.frame((x0, -length / 2, low), math.pi / 2))
    side, _ = parts.face_frame("left", x0, x1, y0, y1, 0.0)
    return objs + parts.place(parts.woodpile(rng, length=length - 0.4, rows=4, depth=0.6), side, (0.0, -0.02, 0.0))
