"""blacksmith: an open Fachwerk forge (DESIGN.md section 10). Saltire-braced timber walls in tinted plaster on a
stone plinth at the sides, a stone fire wall at the back where the hearth glows under a brick Gothic arch and the
stone chimney rises through a terracotta roof with carved bargeboards and moss on its back slope; the open front
under a heavy lintel on braced posts on stone pads, with the anvil sign on a wrought-iron bracket and the brand
lantern; bellows, tools on iron hooks, the anvil on its stump, the quench trough and a water barrel, a grindstone, a
tiled pentice over the front and a lean-to store of logs and charcoal."""

import math
import random

from mathutils import Matrix, Vector

from island import mesh, parts, style

X0, X1, Y0, Y1 = -2.5 * parts.BAY, 2.5 * parts.BAY, -2.5 * parts.BAY, 2.5 * parts.BAY
PLINTH, WALL = 0.6, 0.6 + parts.STOREY
THICK = 0.5
PITCH, SHED_PITCH = 48.0, 40.0
TILES = {"keys": parts.TILE_KEYS, "exposure": 0.26, "thickness": 0.03, "run": (0.5, 1.2), "ridge_key": "tile_dark",
         "carved": True}
HEARTH = (-0.85, Y1 - THICK - 0.5)


def build(seed=7):
    rng = random.Random(seed)
    ch = parts.character(seed)
    objs = _walls(rng, ch) + _front(rng) + _roof(rng, ch) + _forge(rng) + _pentice(rng) + _store(rng) + _yard(rng)
    return mesh.finalize("isl_blacksmith", objs)


def _walls(rng, ch):
    """The stone fire wall at the back, the side walls of saltire-braced Fachwerk on a stone plinth, and a cobbled
    floor."""
    core = parts.mat("stone_dark")
    plaster = parts.tint(ch, parts.FACHWERK_PLASTER)
    objs = [mesh.box("back_wall", (X1 - X0, THICK, WALL), at=(0.0, Y1 - THICK / 2, 0.0), origin="bottom", mat=core),
            mesh.box("floor", (X1 - X0 - 0.3, Y1 - Y0 - THICK, 0.06), at=(0.0, (Y0 + Y1 - THICK) / 2, 0.0), origin="bottom",
                     mat=parts.mat("stone_light"))]
    m, width = parts.face_frame("back", X0, X1, Y0, Y1)
    objs += mesh.transform([parts.stone_face(width, WALL, rng, course=(0.28, 0.4), length=(0.5, 1.0), moss=ch.moss)], m)
    objs += parts.quoins(X0, X1, Y0, Y1, 0.0, WALL, rng, ends=(1,))
    for face, x in (("left", X0), ("right", X1)):
        objs.append(mesh.box("plinth", (0.3, Y1 - Y0 - THICK, PLINTH), at=(x - math.copysign(0.15, x), (Y0 + Y1 - THICK) / 2, 0.0),
                             origin="bottom", mat=core))
        m, width = parts.face_frame(face, X0, X1, Y0, Y1 - THICK)
        objs += mesh.transform([parts.stone_face(width, PLINTH, rng, course=(0.2, 0.3), length=(0.4, 0.8))], m)
        objs.append(mesh.box("panel_core", (0.14, Y1 - Y0 - THICK, WALL - PLINTH), at=(x - math.copysign(0.07, x), (Y0 + Y1 - THICK) / 2, PLINTH),
                             origin="bottom", mat=parts.mat(plaster)))
        frame, _ = parts.face_frame(face, X0, X1, Y0, Y1 - THICK, PLINTH)
        wall, _ = parts.timber_wall(width, WALL - PLINTH, rng, bays=3, frame="fachwerk", patch_chance=0.15)
        objs += mesh.transform(wall, frame)
    for x in (X0 + 0.13, X1 - 0.13):
        objs.append(mesh.box("corner_post", (0.26, 0.26, WALL - 0.1), at=(x, Y0 + 0.13, 0.1), origin="bottom",
                             mat=parts.mat("timber_dark")))
        objs.append(parts.post_pad(x, Y0 + 0.13, size=0.4))
    return objs


def _front(rng):
    """The open front: a lintel on two inner posts with knee braces, and the Fachwerk gables front and back."""
    timber = parts.mat("timber")
    objs = [mesh.box("lintel", (X1 - X0 + 0.1, 0.3, 0.32), at=(0.0, Y0 + 0.12, WALL - 0.32), origin="bottom", mat=timber,
                     bevel=0.02)]
    for x in (-parts.BAY, parts.BAY):
        objs.append(mesh.box("front_post", (0.26, 0.26, WALL - 0.42), at=(x, Y0 + 0.14, 0.1), origin="bottom", mat=timber,
                             bevel=0.015))
        objs.append(parts.post_pad(x, Y0 + 0.14, size=0.4))
        for s in (-1, 1):
            objs += parts.place(parts.curved_member((x, WALL - 1.05), (x + s * 0.6, WALL - 0.33), -s * 0.06, 0.12, rng, 0.07),
                                mesh.frame((0.0, Y0 + 0.14 + 0.13, 0.0)))
    rise = (X1 - X0) / 2 * math.tan(math.radians(PITCH))
    for face in ("front", "back"):
        m, width = parts.face_frame(face, X0, X1, Y0, Y1, WALL)
        objs += mesh.transform(parts.gable_wall(width, rise, rng, key="plaster_ochre"), m)
    return objs


def _roof(rng, ch):
    """The terracotta roof with its ridge running back from the open gable, sagging a little, and the chimney."""
    frame = mesh.frame((0.0, Y0, WALL), math.pi / 2)
    objs = mesh.transform(parts.gable_roof(Y1 - Y0, X1 - X0, PITCH, rng, missing=ch.wear, moss=(1, ch.moss), **TILES), frame)
    rise = (X1 - X0) / 2 * math.tan(math.radians(PITCH))
    parts.bow(objs, "Y", Y0, Y1, WALL, WALL + rise)
    x, y = HEARTH
    stack = parts.chimney(1.3, 1.0, WALL + rise + 0.7, rng, lean_deg=1.5 + ch.lean, pots=2)
    return objs + mesh.transform(stack, mesh.frame((x, Y1 - 0.5, 0.0)))


def _forge(rng):
    """The brick hearth with glowing coals under a pointed brick arch in the chimney breast, the bellows beside it,
    tools on iron hooks and the anvil."""
    x, y = HEARTH
    brick = parts.mat("brick")
    breast_front = y - 0.55
    objs = [mesh.box("hearth", (2.0, 1.1, 0.8), at=(x, y, 0.0), origin="bottom", mat=brick, bevel=0.02),
            mesh.box("hearth_bed", (1.4, 0.8, 0.06), at=(x, y, 0.8), origin="bottom", mat=parts.mat("iron"))]
    breast = parts.arched_wall(2.0, WALL - 0.85, 0.75, [(0.0, 1.3, 1.3, "pointed")], "brick")
    objs += mesh.transform([breast], mesh.frame((x, breast_front, 0.85)))
    objs += mesh.transform(parts.brick_arch(1.3, 1.3), mesh.frame((x, breast_front, 0.85)))
    coals = parts.rock(rng, (1.15, 0.6, 0.22), key=style.hearth_glow(), rough=0.25)
    coals.location = (x, y - 0.05, 0.84)
    objs.append(coals)
    for i in range(7):
        objs.append(parts.blob(rng, rng.uniform(0.05, 0.08), "iron", at=(x + parts.jitter(rng, 0.5), y + parts.jitter(rng, 0.25), 0.95)))
    objs += _bellows(x + 1.45, y)
    objs += _tools(rng, X0 + 0.15, 0.0)
    objs += mesh.transform(_anvil(rng), mesh.frame((-0.75, Y0 - 0.75, 0.0), math.radians(18)))
    return objs


def _bellows(x, y):
    """Leather bellows on a timber frame, the nozzle pointing into the hearth."""
    timber = parts.mat("timber")
    bag = [(x + 0.45, y - 0.32, 0.72), (x - 0.4, y - 0.08, 0.72), (x - 0.4, y + 0.08, 0.72), (x + 0.45, y + 0.32, 0.72),
           (x + 0.45, y - 0.32, 1.02), (x - 0.4, y - 0.06, 0.84), (x - 0.4, y + 0.06, 0.84), (x + 0.45, y + 0.32, 1.02)]
    objs = [mesh.hexa("bellows", bag, parts.mat("hull_dark")),
            mesh.box("bellows_board", (0.9, 0.7, 0.04), at=(x + 0.03, y, 1.04), rot=(0, math.radians(10), 0), mat=timber),
            mesh.rod("bellows_nozzle", (x - 0.4, y, 0.8), (x - 0.75, y, 0.84), 0.04, parts.mat("iron"), segments=6),
            mesh.rod("bellows_handle", (x + 0.45, y, 1.06), (x + 0.95, y, 1.4), 0.03, timber, segments=4)]
    objs += [mesh.box("bellows_leg", (0.08, 0.08, 0.72), at=(x + dx, y + dy, 0.0), origin="bottom", mat=timber)
             for dx in (-0.3, 0.35) for dy in (-0.25, 0.25)]
    return objs


def _tools(rng, x, y):
    """Tongs and hammers hanging from iron hooks on a rail along the inside of the left wall."""
    timber, iron = parts.mat("timber"), parts.mat("iron")
    z = 2.2
    objs = [mesh.box("tool_rail", (0.08, 2.6, 0.1), at=(x + 0.04, y, z), mat=timber)]
    for i in range(6):
        ty = y - 1.1 + 0.44 * i + parts.jitter(rng, 0.05)
        hook = Vector((x + 0.12, ty, z - 0.05))
        objs.append(mesh.rod("tool_hook", hook + Vector((-0.04, 0.0, 0.05)), hook, 0.008, iron, segments=4))
        if i % 2:
            objs.append(mesh.rod("hammer_handle", hook, hook - Vector((0.0, 0.0, 0.42)), 0.018, timber, segments=4))
            objs.append(mesh.box("hammer_head", (0.07, 0.15, 0.07), at=hook - Vector((0.0, 0.0, 0.46)), mat=iron))
        else:
            for s in (-1, 1):
                objs.append(mesh.rod("tongs", hook, hook + Vector((0.0, s * 0.07, -0.55)), 0.012, iron, segments=4))
    return objs


def _anvil(rng):
    """An anvil on an elm stump, its horn pointing along +X, and a hammer lying on the face."""
    iron = parts.mat("iron")
    objs = [parts.log(rng, 0.62, 0.27, ends=("plank", "plank_light"))]
    objs[0].matrix_basis = Matrix.Translation((0.0, 0.0, 0.31))
    objs += [mesh.box("anvil_foot", (0.42, 0.26, 0.08), at=(0.0, 0.0, 0.62), origin="bottom", mat=iron),
             mesh.box("anvil_waist", (0.24, 0.14, 0.12), at=(0.0, 0.0, 0.7), origin="bottom", mat=iron),
             mesh.box("anvil_face", (0.5, 0.17, 0.12), at=(-0.03, 0.0, 0.82), origin="bottom", mat=iron, bevel=0.01),
             mesh.cylinder("anvil_horn", 0.07, 0.24, at=(0.22, 0.0, 0.9), rot=(0, math.pi / 2, 0), radius_top=0.012,
                           mat=iron, segments=8, origin="bottom"),
             mesh.rod("hammer", (-0.15, -0.05, 0.95), (0.05, -0.3, 0.95), 0.016, parts.mat("timber"), segments=4)]
    return objs


def _pentice(rng):
    """A narrow tiled pentice on the front gable over the open front, on two posts on stone pads, with the anvil
    sign and the brand lantern hanging from it."""
    width, run = 3.4, 1.35
    high = WALL + 1.1
    low = high - run * math.tan(math.radians(SHED_PITCH))
    timber = parts.mat("timber")
    y = Y0 - run
    objs = []
    for x in (-width / 2 + 0.15, width / 2 - 0.15):
        objs.append(mesh.box("pentice_post", (0.18, 0.18, low - 0.1), at=(x, y + 0.1, 0.1), origin="bottom", mat=timber))
        objs.append(parts.post_pad(x, y + 0.1, size=0.3))
    objs.append(mesh.box("pentice_plate", (width, 0.16, 0.16), at=(0.0, y + 0.1, low - 0.08), mat=timber))
    roof = parts.gable_roof(width, 2 * run, SHED_PITCH, rng, sides=(-1,), eave=0.25, gable=0.15, exposure=0.24,
                            thickness=0.03, run=(0.5, 1.1), rafters=0.6, barge_size=(0.14, 0.035), keys=parts.TILE_KEYS,
                            ridge_key="tile_dark")
    objs += mesh.transform(roof, mesh.frame((-width / 2, Y0, low)))
    post = mesh.frame((width / 2 - 0.15 + 0.09, y + 0.1, 0.0), math.pi / 2)
    objs += parts.place(parts.hanging_sign(arm=0.9, board=(0.6, 0.45), key="plank_light", emblem_key="iron", iron=True,
                                           emblem="anvil"), post, (0.0, 0.0, low - 0.35))
    front = mesh.frame((-width / 2 + 0.15, y + 0.01, 0.0))
    return objs + parts.place(parts.lantern_bracket(arm=0.35, size=0.7), front, (0.0, 0.0, low - 0.45))


def _store(rng):
    """A lean-to against the left wall with logs and charcoal sacks under it."""
    depth, length = parts.BAY + 0.3, Y1 - Y0 - 0.6
    high = WALL - 0.45
    low = high - depth * math.tan(math.radians(SHED_PITCH))
    timber = parts.mat("timber")
    x = X0 - depth
    objs = []
    for y in (-length / 2 + 0.1, length / 2 - 0.1):
        objs.append(mesh.box("store_post", (0.14, 0.14, low - 0.1), at=(x + 0.1, y, 0.1), origin="bottom", mat=timber))
        objs.append(parts.post_pad(x + 0.1, y, size=0.26))
    objs.append(mesh.box("store_plate", (0.14, length, 0.14), at=(x + 0.1, 0.0, low - 0.07), mat=timber))
    roof = parts.gable_roof(length, 2 * depth, SHED_PITCH, rng, sides=(1,), eave=0.2, gable=0.12, exposure=0.24,
                            thickness=0.03, run=(0.5, 1.1), rafters=0, barge_size=(0.12, 0.03), keys=parts.TILE_KEYS,
                            ridge_key="tile_dark")
    objs += mesh.transform(roof, mesh.frame((X0, -length / 2, low), math.pi / 2))
    side, _ = parts.face_frame("left", X0, X1, Y0, Y1)
    objs += parts.place(parts.woodpile(rng, length=2.4, rows=4, depth=0.6), side, (0.7, -0.02, 0.0))
    for y in (-1.6, -1.15):
        objs += mesh.transform([parts.sack(rng, (0.45, 0.36, 0.6), key="hull_dark", upright=True)], mesh.frame((X0 - 0.45, y, 0.0)))
    return objs


def _yard(rng):
    """The quench trough by the anvil with a water barrel beside it, and a grindstone in its frame."""
    objs = mesh.transform(parts.trough(1.3, width=0.5, height=0.5), mesh.frame((0.95, Y0 - 0.85, 0.0)))
    objs += mesh.transform(parts.barrel(rng, segments=12), mesh.frame((1.95, Y0 - 0.6, 0.0)))
    return objs + mesh.transform(_grindstone(), mesh.frame((X1 + 0.75, Y0 - 0.5, 0.0), math.radians(-20)))


def _grindstone():
    """A sandstone wheel on an axle in an A-frame, with a crank."""
    timber = parts.mat("timber")
    objs = [mesh.cylinder("grindstone", 0.38, 0.13, at=(0.0, 0.0, 0.62), rot=(0, math.pi / 2, 0),
                          mat=parts.mat("stone_honey_light"), segments=14, origin="center"),
            mesh.rod("grind_axle", (-0.32, 0.0, 0.62), (0.36, 0.0, 0.62), 0.03, parts.mat("iron"), segments=6),
            mesh.rod("grind_crank", (0.36, 0.0, 0.62), (0.36, 0.0, 0.4), 0.02, parts.mat("iron"), segments=4)]
    for x in (-0.24, 0.24):
        for s in (-1, 1):
            objs.append(mesh.beam("grind_leg", (x, s * 0.4, 0.04), (x, 0.0, 0.66), 0.07, 0.07, timber))
    return objs
