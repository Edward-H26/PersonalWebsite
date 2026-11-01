"""sawmill: a long open saw shed in Tudor shed framing (DESIGN.md section 10), raised on a stone undercroft beside a
stream. Close-studded oak frames over plank cladding at the back and the right end, the front open behind a rail; a
shingle roof at shed pitch with carved bargeboards and moss on its seaward slope, and over the saw a Norse second
tier, a louvred saw house with its own steep roof; inside, a sash saw in its frame over a log carriage with a
half-sawn log; outside, an overshot water wheel fed by a flume on trestles, its tailrace running off underneath, a
log pile with a ramp up to the floor, a stack of sawn planks, a chopping block, the saw sign and the brand lantern."""

import math
import random

from mathutils import Vector

from island import mesh, parts

X0, X1, Y0, Y1 = -4.0, 4.0, -2.8, 2.8
FLOOR = 1.2
EAVE = FLOOR + parts.STOREY
PITCH = 40.0
WHEEL = (X1 + 0.62, -0.3, 2.0, 1.8)
TIER_X, TIER_SPAN, TIER_PITCH = (-0.9, 2.1), 1.8, 45.0
SHINGLE = {"exposure": 0.26, "run": (0.6, 1.5), "rafters": 1.0, "carved": True}


def build(seed=7):
    rng = random.Random(seed)
    ch = parts.character(seed)
    objs = _undercroft(rng) + _shed(rng, ch) + _roof(rng, ch) + _saw_house(rng, ch) + _saw(rng) + _wheel(rng) + _yard(rng)
    return mesh.finalize("isl_sawmill", objs)


def _undercroft(rng):
    """The stone base the saw floor stands on, with a low arched door, and the plank floor on top."""
    door = (-2.4, 0.0, 0.85, 1.05, True)
    objs, frames = parts.stone_storey(X0, X1, Y0, Y1, 0.0, FLOOR, rng, {"front": [door], "right": [], "back": [], "left": []},
                                      course=(0.24, 0.32), length=(0.45, 0.9), moss={"right": 0.5, "back": 0.3})
    cx, z0, w, h, _ = door
    objs += parts.place(parts.door(w, h, rng, arched=True, frame=False), frames["front"], (cx, 0.0, z0))
    objs += parts.place(parts.arch_surround(w, h, rng, ring=0.22, stones=7), frames["front"], (cx, 0.0, z0))
    objs.append(mesh.box("saw_floor", (X1 - X0 + 0.3, Y1 - Y0 + 0.3, 0.12), at=(0.0, 0.0, FLOOR), origin="bottom",
                         mat=parts.mat("plank")))
    return objs


def _shed(rng, ch):
    """Posts round the floor, close-studded frames over plank cladding at the back and the right end, a rail along
    the open front."""
    timber, plank = parts.mat("timber"), parts.mat("plank")
    z = FLOOR + 0.12
    height = EAVE - z
    objs = []
    for i in range(5):
        x = X0 + 0.12 + (X1 - X0 - 0.24) * i / 4
        objs += [mesh.box("shed_post", (0.22, 0.22, height), at=(x, y, z), origin="bottom", mat=timber)
                 for y in (Y0 + 0.12, Y1 - 0.12)]
    objs += [mesh.box("shed_plate", (X1 - X0, 0.22, 0.2), at=(0.0, y, EAVE - 0.1), mat=timber) for y in (Y0 + 0.12, Y1 - 0.12)]
    objs.append(mesh.box("front_rail", (X1 - X0 - 0.3, 0.1, 0.1), at=(0.4, Y0 + 0.12, z + 0.95), mat=timber))
    for face, bays in (("back", 5), ("right", 4)):
        m, width = parts.face_frame(face, X0, X1, Y0, Y1, z)
        wall, _ = parts.timber_wall(width - 0.2, height, rng, bays=bays, stud=ch.stud, patch_chance=0.0)
        objs += mesh.transform([mesh.box("plank_wall", (width - 0.2, 0.08, height), at=(0.0, 0.1, 0.0), origin="bottom",
                                         mat=plank)] + mesh.transform(wall, mesh.frame((0.0, 0.06, 0.0))), m)
    rise = (Y1 - Y0) / 2 * math.tan(math.radians(PITCH))
    for face in ("left", "right"):
        m, width = parts.face_frame(face, X0, X1, Y0, Y1, EAVE)
        objs += mesh.transform(parts.gable_wall(width, rise, rng, key="plank"), m)
    return objs


def _roof(rng, ch):
    frame = mesh.frame((X0, 0.0, EAVE))
    objs = mesh.transform(parts.gable_roof(X1 - X0, Y1 - Y0, PITCH, rng, missing=ch.wear, moss=(1, ch.moss), **SHINGLE), frame)
    rise = (Y1 - Y0) / 2 * math.tan(math.radians(PITCH))
    return parts.bow(objs, "X", X0, X1, EAVE, EAVE + rise)


def _saw_house(rng, ch):
    """The Norse second tier over the saw: plank walls rising out of the ridge with louvre boards to let the dust
    out, under their own steeper roof with carved bargeboards."""
    x0, x1 = TIER_X
    half = TIER_SPAN / 2
    rise = (Y1 - Y0) / 2 * math.tan(math.radians(PITCH))
    z0 = EAVE + rise - half * math.tan(math.radians(PITCH)) - 0.1
    eave = EAVE + rise + 0.05
    plank = parts.mat("plank")
    objs = [mesh.box("tier_wall", (x1 - x0, 2 * half, eave - z0), at=((x0 + x1) / 2, 0.0, z0), origin="bottom",
                     mat=parts.mat("timber_dark"))]
    for face in ("front", "back"):
        m, width = parts.face_frame(face, x0, x1, -half, half, eave - 0.42)
        objs += mesh.transform([mesh.box("louvre", (width - 0.1, 0.05, 0.08), at=(0.0, -0.02 - 0.03 * i, 0.08 + 0.13 * i),
                                         rot=(math.radians(-35), 0, 0), mat=plank) for i in range(3)], m)
    for face in ("left", "right"):
        m, width = parts.face_frame(face, x0, x1, -half, half, eave)
        objs += mesh.transform(parts.gable_wall(width, half * math.tan(math.radians(TIER_PITCH)), rng, key="plank", depth=0.12), m)
    roof = parts.gable_roof(x1 - x0, 2 * half, TIER_PITCH, rng, eave=0.3, gable=0.3, missing=ch.wear, **SHINGLE)
    return objs + mesh.transform(roof, mesh.frame((x0, 0.0, eave)))


def _saw(rng):
    """The sash saw: two guide posts, the sash with its blade, the pitman down to the crank, and the log carriage
    with a half-sawn log on it."""
    timber, iron = parts.mat("timber"), parts.mat("iron")
    z = FLOOR + 0.12
    x = 0.6
    objs = [mesh.box("saw_post", (0.2, 0.2, 2.5), at=(x, y, z), origin="bottom", mat=timber) for y in (-0.75, 0.75)]
    objs.append(mesh.box("saw_head", (0.24, 1.75, 0.22), at=(x, 0.0, z + 2.5), mat=timber))
    sash_z = z + 0.95
    for y in (-0.5, 0.5):
        objs.append(mesh.box("sash_stile", (0.08, 0.1, 1.3), at=(x, y, sash_z), origin="bottom", mat=parts.mat("plank_light")))
    for dz in (0.0, 1.3):
        objs.append(mesh.box("sash_rail", (0.1, 1.1, 0.1), at=(x, 0.0, sash_z + dz), mat=parts.mat("plank_light")))
    objs.append(mesh.box("saw_blade", (0.012, 0.14, 1.3), at=(x, 0.0, sash_z), origin="bottom", mat=iron))
    objs.append(mesh.beam("pitman", (x, 0.0, sash_z), (x + 0.1, 0.0, 0.3), 0.1, 0.1, timber))
    for y in (-0.32, 0.32):
        objs.append(mesh.box("carriage_rail", (X1 - X0 - 1.0, 0.12, 0.14), at=(-0.2, y, z + 0.52), mat=timber))
        for xx in (-3.0, -1.0, 2.2):
            objs.append(mesh.box("carriage_trestle", (0.12, 0.12, 0.45), at=(xx, y, z), origin="bottom", mat=timber))
    log = parts.log(rng, 3.4, 0.24, ends=("plank_light", "plank_light"), segments=10)
    log.location = (-1.3, 0.04, z + 0.83)
    objs.append(log)
    objs.append(mesh.box("sawn_slab", (2.0, 0.07, 0.36), at=(-0.75, -0.24, z + 0.83), mat=parts.mat("plank_light")))
    return objs


def _wheel(rng):
    """An overshot wheel of two spoked rims and sixteen paddles on a log axle into the end wall, the flume on
    trestles that feeds it from behind, and the tailrace channel under it."""
    x, y, z, r = WHEEL
    timber, plank = parts.mat("timber"), parts.mat("plank")
    objs = mesh.transform(parts.water_wheel(r, rng), mesh.frame((x, y, z)))
    top = z + r + 0.25
    objs.append(mesh.box("flume", (0.6, 3.7, 0.36), at=(x, 1.45, top), origin="bottom", mat=plank))
    objs.append(mesh.box("flume_water", (0.48, 3.65, 0.02), at=(x, 1.45, top + 0.28), mat=parts.mat("water")))
    for fy in (1.3, 3.0):
        for s in (-1, 1):
            objs.append(mesh.beam("flume_leg", (x + s * 0.55, fy, 0.0), (x + s * 0.3, fy, top), 0.12, 0.12, timber))
        objs.append(mesh.box("flume_cross", (0.9, 0.12, 0.12), at=(x, fy, top - 0.08), mat=timber))
    objs.append(mesh.box("tailrace", (1.0, 4.2, 0.24), at=(x, y - 0.3, 0.0), origin="bottom", mat=plank))
    objs.append(mesh.box("tailrace_water", (0.86, 4.15, 0.02), at=(x, y - 0.3, 0.18), mat=parts.mat("water")))
    return objs


def _yard(rng):
    """The log pile with a ramp of two skids up to the floor, a stack of sawn planks on bearers, a chopping block
    with an axe in it and a lantern on the corner post."""
    objs = mesh.transform(parts.log_pile(rng, length=3.0, rows=3, radius=0.2), mesh.frame((-1.9, Y0 - 1.25, 0.0)))
    timber = parts.mat("timber")
    for x in (0.15, 0.95):
        objs.append(mesh.beam("skid", (x, Y0 - 1.5, 0.08), (x, Y0 + 0.05, FLOOR + 0.1), 0.12, 0.14, timber))
    for x in (2.0, 3.3):
        objs.append(mesh.box("bearer", (0.12, 0.9, 0.1), at=(x, Y0 - 1.0, 0.0), origin="bottom", mat=timber))
    for i in range(6):
        objs.append(mesh.box("plank_stack", (2.2, 0.3, 0.05), at=(2.65 + parts.jitter(rng, 0.05), Y0 - 1.15 + (i % 2) * 0.32,
                             0.1 + 0.055 * (i // 2)), origin="bottom", mat=parts.mat("plank_light")))
    block = parts.log(rng, 0.55, 0.3, ends=("plank", "plank_light"), segments=10)
    block.matrix_basis = mesh.frame((1.55, Y0 - 1.7, 0.275))
    blade = Vector((1.6, Y0 - 1.7, 0.62))
    objs += [block, mesh.box("axe_head", (0.05, 0.2, 0.14), at=blade, rot=(math.radians(25), 0, 0), mat=parts.mat("iron")),
             mesh.rod("axe_haft", blade, blade + Vector((0.0, -0.55, 0.45)), 0.02, parts.mat("plank_light"), segments=4)]
    front, _ = parts.face_frame("front", X0, X1, Y0, Y1, FLOOR + 0.12)
    objs += parts.place(parts.hanging_sign(arm=0.85, board=(0.6, 0.42), key="plank_light", emblem_key="iron", iron=True,
                                           emblem="saw"), front, (X0 + 0.12, -0.12, 2.15))
    return objs + parts.place(parts.lantern_bracket(arm=0.4, size=0.7), front, (X1 - 0.12, -0.12, 2.0))
