"""house_02: a tall Lavenham town house (DESIGN.md section 10). A stone ground storey with an arched door up a worn
step, a wide shop window with a cracked lintel and the brand lantern; a close-studded oak first floor jettied over
the street on joist ends and a bressummer, with leaded windows and a pargeted panel over the door; the front gable
jettied out a second time under carved bargeboards; a Rothenburg corner turret with a slate spire; a steep slate
roof with two dormers, moss on its seaward slope and a chimney of paired pots; a merchant's sign on a wrought-iron
bracket and a water butt at the side. Each storey leans, the next one back the other way, as far as the seed's
character says."""

import math
import random

from island import mesh, parts

WIDTH, DEPTH = 5 * parts.BAY, 6 * parts.BAY
GROUND, FIRST = 2.8, parts.STOREY
JETTY = parts.JETTY
EAVE = GROUND + FIRST
PITCH = 55.0
SLATE = {"keys": parts.SLATE_KEYS, "exposure": 0.22, "thickness": 0.03, "run": (0.4, 1.2), "ridge_key": "roof_light"}
ROW_TOP = 0.06 + 2.4 * 0.03
DOOR = (-parts.BAY, parts.DOOR[0], parts.DOOR[1] + 0.2)
TURRET = 0.72


def build(seed=7):
    rng = random.Random(seed)
    ch = parts.character(seed)
    x0, x1, y0, y1 = -WIDTH / 2, WIDTH / 2, -DEPTH / 2, DEPTH / 2
    ground = _ground(rng, ch, x0, x1, y0, y1)
    first = _first(rng, ch, x0, x1, y0, y1)
    top = _gable_and_roof(rng, ch, x0, x1, y0 - 2 * JETTY, y1)
    parts.lean(ground + first + top, 0.0, ch.lean * 0.4, "Y")
    parts.lean(first + top, GROUND, ch.lean, "X")
    parts.lean(top, EAVE, -ch.lean * 0.85, "X")
    parts.lean(top, EAVE, -ch.lean * 0.7, "Y")
    return mesh.finalize("isl_house_02", ground + first + top + _turret(rng, x1, y0))


def _ground(rng, ch, x0, x1, y0, y1):
    """The stone storey with its arched door, windows and lantern, and the first jetty along the front."""
    cx, w, h = DOOR
    window = parts.WINDOW
    openings = {"front": [(cx, 0.0, w, h, True), (parts.BAY, 0.9, 2 * window[0], window[1], False)],
                "right": [(-1.8, 0.9, *window, False), (1.8, 0.9, *window, False)],
                "back": [(0.6, 0.9, *window, False)],
                "left": [(0.6, 0.9, *window, False)]}
    objs, frames = parts.stone_storey(x0, x1, y0, y1, 0.0, GROUND, rng, openings, moss={"back": ch.moss, "right": ch.moss})
    flaw = parts.chosen(ch, [(face, hole[0]) for face, holes in openings.items() for hole in holes if not hole[4]])
    for face, holes in openings.items():
        m = frames[face]
        for hx, hz, hw, hh, arched in holes:
            if arched:
                objs += parts.place(parts.door(hw, hh, rng, arched=True, frame=False, strap_end="scroll"), m, (hx, 0.0, hz))
                objs += parts.place(parts.arch_surround(hw, hh, rng), m, (hx, 0.0, hz))
                objs += parts.place(parts.steps(1, hw + 0.5, 0.12, 0.42, rng), m, (hx, 0.0, 0.0))
            else:
                shop = face == "front"
                objs += parts.place(parts.window(hw, hh, rng, stone=True, panes=(4, 3) if shop else (2, 3),
                                                 shutters=(True, True), cracked=(face, hx) == flaw), m, (hx, 0.0, hz))
    front = frames["front"]
    objs += mesh.transform(parts.barrel(rng, segments=12), mesh.frame((x1 + 0.5, y1 - 1.2, 0.0)))
    objs += parts.place(parts.lantern_bracket(), front, (cx + w / 2 + 0.42, -0.06, 2.35))
    objs += parts.place(parts.hanging_sign(arm=1.0, board=(0.62, 0.48), emblem_key="paint_gold", iron=True,
                                           emblem="sheaf"), front, (x0 + 0.5, -0.04, 2.35))
    return objs + parts.place(parts.jetty(rng, WIDTH, JETTY, (x0 + 0.05, 0.0, x1 - 0.05)), front, (0.0, 0.0, GROUND))


def _first(rng, ch, x0, x1, y0, y1):
    """The close-studded first floor, jettied over the street, with the pargeted panel over the door and the
    second jetty under the gable."""
    stud = {"stud": ch.stud}
    storey, placed = parts.timber_storey(x0, x1, y0 - JETTY, y1, GROUND, FIRST, rng, {
        "front": {"bays": 5, "openings": {0: "window", 1: "panel", 2: "window", 3: "window"}, **stud},
        "right": {"bays": 6, "openings": {2: "window", 4: "window"}, **stud},
        "back": {"bays": 5, "openings": {2: "window"}, **stud},
        "left": {"bays": 6, "openings": {1: "window", 4: "window"}, **stud}}, core_key=parts.tint(ch, parts.TUDOR_PLASTER))
    openings, _ = parts.dress(placed, rng, window_kwargs={"shutters": (False, False)}, leaded=("front", "right"))
    storey += openings
    m, _ = parts.face_frame("front", x0, x1, y0 - JETTY, y1, EAVE)
    return storey + parts.place(parts.jetty(rng, WIDTH, JETTY, (x0 + 0.05, -0.6, 0.6, x1 - 0.05)), m)


def _gable_and_roof(rng, ch, x0, x1, front, back):
    """The jettied front gable with its attic window, the slate roof with carved bargeboards, two dormers and moss
    on the right slope, sagging along its ridge, and the chimney."""
    rise = WIDTH / 2 * math.tan(math.radians(PITCH))
    m, width = parts.face_frame("front", x0, x1, front, back, EAVE)
    window = (parts.WINDOW[0] + 0.2, 1.1, 1.0)
    objs = mesh.transform(parts.gable_wall(width, rise, rng, opening=window), m)
    objs += parts.place(parts.window(window[0], window[1], rng, shutters=(False, False), leaded=True), m, (0.0, 0.0, window[2]))
    length = back - front
    frame = mesh.frame((0.0, front, EAVE), math.pi / 2)
    objs += mesh.transform(parts.gable_roof(length, WIDTH, PITCH, rng, carved=True, missing=ch.wear, moss=(1, ch.moss),
                                            **SLATE), frame)
    for u in (length * 0.36, length * 0.72):
        at = frame @ parts.slope_point(WIDTH, PITCH, -1, u, 3.9, ROW_TOP)
        dormer = parts.dormer(parts.BAY, 1.1, PITCH, rng, keys=parts.SLATE_KEYS, pitch_deg=55.0,
                              roof_kwargs={"thickness": 0.03, "ridge_key": "roof_light", "carved": True})
        objs += mesh.transform(dormer, mesh.frame(at, math.pi / 2))
    parts.bow(objs, "Y", front, back, EAVE, EAVE + rise)
    base = EAVE + rise - 1.6 * math.tan(math.radians(PITCH)) - 0.3
    stack = parts.chimney(0.95, 0.8, EAVE + rise + 1.2 - base, rng, lean_deg=2.0 + ch.lean, pots=2)
    return objs + mesh.transform(stack, mesh.frame((-1.6, back - 1.8, base)))


def _turret(rng, x1, y0):
    """The corner turret, corbelled out from the top of the stone storey at the front right corner of the first
    floor and rising through the eave to its own spire."""
    centre = (x1 + 0.28, y0 - JETTY - 0.28, GROUND - 0.05)
    tower = parts.turret(TURRET, FIRST + 0.85, rng, windows=(0, 1, 2, 7), window_z=0.75, roof_height=2.5)
    return mesh.transform(tower, mesh.frame(centre, math.radians(-45.0) + math.pi / 8))
