"""bell_tower: the island's highest point (DESIGN.md sections 9 and 10), French colombage proportions on a stone base.
A stone ground stage holds the door, standing open on a wooden stair lit by the brand lantern, under a little timber
porch; above it a colombage stage with a fine diagonal lattice is jettied out on joist ends and bressummers; the
stone belfry opens in a round arch on every side round a bronze bell cast with 2026, Hanseatic stepped pinnacles
stand at its corners, and a lookout balcony with a brass spyglass on a tripod faces the sea from its back arch. A
steep slate cone carries the crown finial. The tower leans a fraction of a degree, its upper stages back the other
way, as far as the seed's character says."""

import math
import random

from mathutils import Matrix, Vector

from island import mesh, parts

HALF = 2.1
X0, X1, Y0, Y1 = -HALF, HALF, -HALF, HALF
BASE, STAGE = 5.2, parts.STOREY
BELFRY = BASE + STAGE
CORNICE = BELFRY + 2.3
OVERHANG = 0.25
WALL = 0.5
DOOR = (parts.DOOR[0] + 0.1, parts.DOOR[1] + 0.2)
ARCH = (1.75, 1.6)
ROOF = (2.85, 4.2)
STONES = {"course": (0.28, 0.4), "length": (0.5, 1.0)}
SLIT = (0.34, 1.0)


def build(seed=7):
    rng = random.Random(seed)
    ch = parts.character(seed)
    shaft = _base(rng, ch) + _interior(rng)
    top = _stage(rng, ch) + _belfry(rng) + _bell(rng) + _pinnacles(rng) + _lookout(rng) + _roof(rng)
    parts.lean(shaft + top, 0.0, ch.lean * 0.5, "X")
    parts.lean(top, BASE, -ch.lean * 0.6, "Y")
    return mesh.finalize("isl_bell_tower", shaft + top + _porch(rng))


def _base(rng, ch):
    """The stone ground stage: hollow walls round the open door, stone courses with the door and slit windows left
    open, quoins and a string course."""
    core = parts.mat("stone_dark")
    width, height = DOOR
    m, face_width = parts.face_frame("front", X0, X1, Y0, Y1)
    objs = mesh.transform([parts.arched_wall(face_width, BASE, WALL, [(0.0, width, height, True)], "stone_dark")], m)
    objs += [mesh.box("wall", (X1 - X0, WALL, BASE), at=(0.0, Y1 - WALL / 2, 0.0), origin="bottom", mat=core)]
    objs += [mesh.box("wall", (WALL, Y1 - Y0, BASE), at=(x, 0.0, 0.0), origin="bottom", mat=core)
             for x in (X0 + WALL / 2, X1 - WALL / 2)]
    objs.append(mesh.box("floor_slab", (X1 - X0, Y1 - Y0, 0.3), at=(0.0, 0.0, BASE - 0.3), origin="bottom", mat=core))
    for face in ("front", "right", "back", "left"):
        m, w = parts.face_frame(face, X0, X1, Y0, Y1)
        holes = [(0.0, 3.4, *SLIT, False)] + ([(0.0, 0.0, width, height, True)] if face == "front" else [])
        moss = ch.moss if face == "back" else 0.0
        objs += mesh.transform([parts.stone_face(w, BASE, rng, holes, moss=moss, **STONES)], m)
        objs += parts.place(parts.window(*SLIT, rng, panes=(1, 2), stone=True, shutters=(False, False),
                                         cracked=face == "left"), m, (0.0, 0.0, 3.4))
    m, _ = parts.face_frame("front", X0, X1, Y0, Y1)
    door = parts.door(width, height, rng, arched=True, frame=False, strap_end="scroll")
    swing = (Matrix.Translation((-width / 2, 0.0, 0.0)) @ Matrix.Rotation(math.radians(-105), 4, "Z")
             @ Matrix.Translation((width / 2, 0.0, 0.0)))
    objs += parts.place(mesh.transform(door, swing), m)
    objs += parts.place(parts.arch_surround(width, height, rng, ring=0.3, stones=9), m)
    objs += parts.quoins(X0, X1, Y0, Y1, 0.0, BASE, rng)
    return objs + parts.string_course(X0, X1, Y0, Y1, BASE - 0.12)


def _interior(rng):
    """A plank floor, the first flight of the wooden stair along the left wall and the brand lantern on the back
    wall, seen through the open door."""
    inner = HALF - WALL
    objs = [mesh.box("floor", (2 * inner, 2 * inner, 0.05), origin="bottom", mat=parts.mat("plank"))]
    objs += mesh.transform(parts.stair(rng, BASE - 1.6, 2.4, 0.75, rail_side=1), mesh.frame((-inner + 0.45, -inner + 0.15, 0.0)))
    m, _ = parts.face_frame("front", -inner, inner, inner, inner + 1.0)
    return objs + parts.place(parts.lantern_bracket(arm=0.3, size=0.6), m, (0.0, 0.0, 1.9))


def _stage(rng, ch):
    """The colombage stage, jettied out on every side, with a fine lattice in tinted plaster and a leaded window
    on each face."""
    x0, x1, y0, y1 = X0 - OVERHANG, X1 + OVERHANG, Y0 - OVERHANG, Y1 + OVERHANG
    spec = {"bays": 3, "openings": {1: "window"}, "frame": "colombage", "stud": 0.42, "head": 1.95, "sill": 0.85}
    storey, placed = parts.timber_storey(x0, x1, y0, y1, BASE, STAGE, rng, {face: dict(spec) for face in parts.FACE_YAW},
                                         core_key=parts.tint(ch, parts.COLMAR_PLASTER))
    windows, _ = parts.dress(placed, rng, window_kwargs={"shutters": (False, False)}, leaded=tuple(parts.FACE_YAW))
    objs = storey + windows
    for face in parts.FACE_YAW:
        m, width = parts.face_frame(face, X0, X1, Y0, Y1, BASE)
        objs += parts.place(parts.jetty(rng, width, OVERHANG, (-width / 2 + 0.3, width / 2 - 0.3), spacing=0.5), m)
    return objs


def _belfry(rng):
    """An arched stone slab on each face with stone courses and voussoirs, the corbel table and the cornice that
    carries the roof; the back arch opens onto the lookout."""
    width, height = ARCH
    sill = 0.55
    objs = [mesh.box("belfry_floor", (X1 - X0 + 2 * OVERHANG, Y1 - Y0 + 2 * OVERHANG, 0.16), at=(0.0, 0.0, BELFRY),
                     origin="bottom", mat=parts.mat("timber_dark"))]
    for face in parts.FACE_YAW:
        z = BELFRY + 0.16
        m, w = parts.face_frame(face, X0, X1, Y0, Y1, z)
        opening = [(0.0, width, height + (0.0 if face == "back" else sill), True)]
        slab = parts.arched_wall(w, CORNICE - z, WALL, opening, "stone_dark")
        stones = parts.stone_face(w, CORNICE - z, rng, [(0.0, 0.0, width, height + sill, True)], course=(0.24, 0.34),
                                  length=(0.45, 0.9))
        objs += mesh.transform([slab, stones], m)
        if face != "back":
            objs += parts.place([mesh.box("arch_sill", (width, WALL + 0.12, sill), at=(0.0, WALL / 2 - 0.06, 0.0),
                                          origin="bottom", mat=parts.mat("stone_dark")),
                                 mesh.box("arch_sill_cap", (width + 0.2, WALL + 0.16, 0.1), at=(0.0, WALL / 2 - 0.08, sill),
                                          mat=parts.mat("stone_light"))], m)
        objs += parts.place(parts.arch_surround(width, height + sill, rng, ring=0.24, stones=9), m)
        count = 8
        for i in range(count):
            x = -w / 2 + 0.2 + (w - 0.4) * i / (count - 1)
            objs += parts.place([mesh.box("corbel", (0.18, 0.24, 0.22), at=(x, -0.1, CORNICE - z - 0.22), origin="bottom",
                                          mat=parts.mat("stone_light"))], m)
    objs.append(mesh.box("cornice", (X1 - X0 + 0.5, Y1 - Y0 + 0.5, 0.25), at=(0.0, 0.0, CORNICE), origin="bottom",
                         mat=parts.mat("stone_light"), bevel=0.02))
    return objs


def _bell(rng):
    """The bronze bell cast with the year 2026, hung from a headstock on two trestles, with its clapper, the
    ringing wheel and the rope."""
    timber = parts.mat("timber")
    floor = BELFRY + 0.16
    head_z = floor + 1.75
    objs = []
    for x in (-1.0, 1.0):
        for s in (-1, 1):
            objs.append(mesh.beam("bell_frame", (x, s * 0.7, floor), (x, 0.0, head_z - 0.05), 0.14, 0.14, timber))
    objs.append(mesh.box("headstock", (2.3, 0.22, 0.24), at=(0.0, 0.0, head_z), mat=timber, bevel=0.015))
    profile = [(0.44, 0.08), (0.53, 0.0), (0.56, 0.04), (0.5, 0.18), (0.42, 0.36), (0.37, 0.6), (0.3, 0.72), (0.12, 0.78)]
    bell = mesh.lathe("bell", profile, segments=16, mat=parts.mat("bronze"))
    bell_foot = head_z - 0.12 - 0.78
    bell.location = (0.0, 0.0, bell_foot)
    objs.append(bell)
    date = parts.text("2026", 0.09, 0.03, "paint_gold")
    objs += mesh.transform(date, mesh.frame((0.0, -0.405, bell_foot + 0.36)) @ Matrix.Rotation(math.radians(-12), 4, "X"))
    objs.append(mesh.rod("clapper", (0.0, 0.0, head_z - 0.2), (0.0, 0.0, head_z - 0.8), 0.025, parts.mat("iron"), segments=4))
    objs.append(parts.blob(rng, 0.07, "iron", squash=1.0, at=(0.0, 0.0, head_z - 0.82)))
    wheel = parts.wheel(0.62, 0.06, rng, spokes=6, key="timber", felloe=0.06, hub=0.09, spoke=0.025)
    objs += mesh.transform(wheel, mesh.frame((1.25, 0.0, head_z)))
    objs.append(mesh.rod("bell_rope", (1.25, -0.62, head_z), (1.25, -0.62, floor - 0.2), 0.015, parts.mat("rope"), segments=4))
    return objs


def _pinnacles(rng):
    """Hanseatic stepped brick pinnacles on the four corners of the belfry, each three diminishing stages under a
    little pyramid."""
    brick = parts.mat("brick")
    objs = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (HALF - 0.05), sy * (HALF - 0.05)
            z = CORNICE + 0.25
            for size, height in ((0.56, 0.55), (0.46, 0.45), (0.36, 0.35)):
                objs.append(mesh.box("pinnacle", (size, size, height), at=(x, y, z), origin="bottom", mat=brick))
                objs.append(mesh.box("pinnacle_band", (size + 0.06, size + 0.06, 0.06), at=(x, y, z + height),
                                     mat=parts.mat("stone_light")))
                z += height
            objs.append(mesh.cylinder("pinnacle_cap", 0.25, 0.5, at=(x, y, z), radius_top=0.01, segments=4,
                                      rot=(0, 0, math.pi / 4), mat=brick))
    return objs


def _lookout(rng):
    """The lookout balcony on the seaward (+Y) side at the belfry floor: a plank deck on three brackets, a rail on
    posts and balusters, and a brass spyglass on a tripod looking out to sea."""
    timber, plank = parts.mat("timber"), parts.mat("plank")
    y0, depth, half = Y1, 1.1, 1.3
    z = BELFRY
    y1 = y0 + depth
    objs = [mesh.box("lookout_deck", (2 * half, depth, 0.12), at=(0.0, y0 + depth / 2, z), origin="bottom", mat=plank)]
    for x in (-half + 0.15, 0.0, half - 0.15):
        objs.append(mesh.beam("lookout_bracket", (x, Y1 + OVERHANG - 0.05, z - 1.2), (x, y1 - 0.12, z - 0.02), 0.12, 0.12,
                              timber))
    corners = [Vector((-half, y0 + 0.1, z)), Vector((-half, y1, z)), Vector((half, y1, z)), Vector((half, y0 + 0.1, z))]
    for a, b in zip(corners, corners[1:]):
        objs.append(mesh.beam("lookout_rail", a + Vector((0.0, 0.0, 1.05)), b + Vector((0.0, 0.0, 1.05)), 0.09, 0.07, timber))
        count = max(2, int((b - a).length / 0.28))
        for i in range(count + 1):
            p = a.lerp(b, i / count)
            objs.append(mesh.box("baluster", (0.06, 0.06, 1.0), at=p + Vector((0.0, 0.0, 0.1)), origin="bottom", mat=timber))
    return objs + mesh.transform(_spyglass(), mesh.frame((0.75, y1 - 0.45, z + 0.12)))


def _spyglass():
    """A brass spyglass on a timber tripod, pointing out along +Y and a little up."""
    head = Vector((0.0, 0.0, 1.15))
    timber = parts.mat("timber")
    objs = [mesh.rod("tripod_leg", head, Vector((0.32 * math.cos(a), 0.32 * math.sin(a), 0.0)), 0.018, timber, segments=4)
            for a in (math.radians(90 + 120 * k) for k in range(3))]
    direction = Vector((0.0, 1.0, 0.18)).normalized()
    objs.append(mesh.rod("spyglass", head - direction * 0.35, head + direction * 0.45, 0.042, parts.mat("bronze"), segments=8,
                         radius_b=0.03))
    objs.append(mesh.rod("spyglass_draw", head + direction * 0.45, head + direction * 0.62, 0.026, parts.mat("bronze"), segments=8))
    return objs


def _roof(rng):
    """The steep slate cone on the cornice and the crown finial on its point."""
    radius, height = ROOF
    z = CORNICE + 0.25
    roof = parts.cone_roof(radius, height, rng, keys=parts.SLATE_KEYS, exposure=0.2, thickness=0.03)
    objs = mesh.transform(roof, mesh.frame((0.0, 0.0, z)))
    tip = Vector((0.0, 0.0, z + height + 0.15))
    objs.append(mesh.rod("finial_rod", tip, tip + Vector((0.0, 0.0, 0.3)), 0.03, parts.mat("iron"), segments=6))
    return objs + mesh.transform(parts.crown(0.26, 0.55, rng), mesh.frame(tip + Vector((0.0, 0.0, 0.28))))


def _porch(rng):
    """A small open timber porch with a shingled gable over the door, its posts on stone pads, two worn steps, the
    brand lantern beside the door and a barrel at the corner."""
    timber = parts.mat("timber")
    depth, span, top = 1.45, 2.0, 2.75
    y = Y0 - depth + 0.1
    objs = []
    for x in (-0.85, 0.85):
        objs.append(mesh.box("porch_post", (0.16, 0.16, top - 0.1), at=(x, y, 0.1), origin="bottom", mat=timber, bevel=0.012))
        objs.append(parts.post_pad(x, y, size=0.26))
    objs.append(mesh.box("porch_beam", (span + 0.1, 0.16, 0.18), at=(0.0, y, top), origin="bottom", mat=timber))
    objs += [mesh.box("porch_plate", (0.14, depth, 0.16), at=(x, Y0 - depth / 2, top), origin="bottom", mat=timber)
             for x in (-0.95, 0.95)]
    rise = span / 2 * math.tan(math.radians(52.0))
    z = top + 0.16
    objs += [mesh.beam("porch_rafter", (s * span / 2, y, z), (0.0, y, z + rise - 0.05), 0.08, 0.12, timber) for s in (-1, 1)]
    objs.append(mesh.beam("king_post", (0.0, y, z), (0.0, y, z + rise - 0.1), 0.1, 0.1, timber))
    roof = parts.gable_roof(depth + 0.05, span, 52.0, rng, eave=0.25, gable=0.2, exposure=0.18, run=(0.3, 0.7),
                            rafters=0, barges=(True, False), barge_size=(0.16, 0.035), carved=True)
    objs += mesh.transform(roof, mesh.frame((0.0, Y0 - depth, z), math.pi / 2))
    m, _ = parts.face_frame("front", X0, X1, Y0, Y1)
    objs += parts.place(parts.lantern_bracket(arm=0.35, size=0.7), m, (-1.35, -0.06, 2.2))
    objs += mesh.transform(parts.barrel(rng, segments=12), mesh.frame((X1 - 0.2, Y0 - 0.65, 0.0)))
    return objs + parts.place(parts.steps(2, 1.5, 0.12, 0.42, rng), m, (0.0, 0.0, 0.0))
