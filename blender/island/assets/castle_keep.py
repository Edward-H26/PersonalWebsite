"""castle_keep: the castle on the knoll (DESIGN.md section 17), the barracks grown into a keep, in the same grey stone,
slate and crow-stepped gables. On the bailey's flat top a curtain wall runs round the south in flat faces and straight
along the cliff's edge on the north, crenellated over its wall-walk; two drum towers under slate cones flank the
arched south gate, which carries the island's crest and the brand lantern; the square keep is built into the north
wall at the cliff's edge, four storeys of rough stone with slits below and lit arched windows above, a crenellated
parapet with a bartizan on each corner and a steep slate roof between two crow-stepped gables, the south one flying
the Columbia blue and white flag; a gravel courtyard with barrels by the keep door. Origin at the bailey's centre on
its floor, north along +Y; the towers' plinths reach down the bailey's bank below it."""

import math
import random

from mathutils import Matrix, Vector

from island import mesh, parts

# The bailey: its flat top reaches 16.8 m from the centre and stops 7.8 m north of it at the cliff's edge.
WALL_R, NORTH_Y = 15.5, 7.6
WALL_T, WALL_H = 1.3, 5.0
PARAPET_BASE, MERLON, MERLON_GAP, MERLON_H = 0.45, 0.8, 0.6, 0.75
ARC_SEGMENTS = 13
GATE = (3.0, 3.8)
TOWER_ANGLE_DEG, TOWER_R, TOWER_H, TOWER_ROOF, PLINTH = 16.5, 2.4, 9.0, 4.2, 4.5
KEEP = (-5.2, 5.2, NORTH_Y - 9.6, NORTH_Y)
STOREYS = (4.5, 3.6, 3.6, 3.6)
KEEP_TOP = sum(STOREYS)
ROOF_PITCH, GABLE_STEPS = 55.0, 5
# The plinth under the north wall and the keep reaches this far down the cliff, leaning out at its foot.
FOOTING, FOOTING_BATTER, FOOTING_DEPTH = 8.0, 1.2, 2.0
# Big ashlar courses and big slates: the castle is seen from across the island, and its stone stays within budget.
STONES = {"course": (0.45, 0.65), "length": (0.9, 1.7), "keys": (("stone", 0.7), ("stone_light", 0.16), ("stone_dark", 0.14))}
SLATES = {"keys": parts.SLATE_KEYS, "exposure": 0.42, "run": (0.5, 0.9)}


def build(seed=7):
    rng = random.Random(seed)
    ch = parts.character(seed)
    outline = _outline()
    objs = _courtyard(outline) + _curtain(rng, ch, outline) + _towers(rng) + _keep(rng, ch) + _footing(rng) + _yard(rng)
    return mesh.finalize("isl_castle_keep", objs, ground=False, centre=False)


def _outline():
    """The curtain wall's outer face in plan, counter-clockwise from the north-west: the arc round the south, then
    the straight north wall back to its start."""
    a = math.acos(-NORTH_Y / WALL_R)
    arc = [parts.ring_point(WALL_R, -a + 2 * a * k / ARC_SEGMENTS, 0.0).to_2d() for k in range(ARC_SEGMENTS + 1)]
    return arc


def _courtyard(outline):
    """A gravel floor inside the walls over the bailey's grass."""
    inner = [p * ((WALL_R - WALL_T) / WALL_R) for p in outline]
    points = [(p.x, min(p.y, NORTH_Y - WALL_T)) for p in inner]
    return [mesh.polygon("courtyard", points, 0.04, mat=parts.mat("stone_honey"))]


def _curtain(rng, ch, outline):
    """Each flat run of the curtain wall: a core, rough stone on its outer face (the gate's arch cut into the south
    run, moss low on the seaward north), a parapet with merlons on its outer edge; the north runs stop at the keep."""
    objs = []
    runs = list(zip(outline, outline[1:]))
    east, west = outline[-1], outline[0]
    runs += [(east, Vector((KEEP[1], NORTH_Y))), (Vector((KEEP[0], NORTH_Y)), west)]
    for k, (p0, p1) in enumerate(runs):
        along = p1 - p0
        # Each run reaches a little past its corners so neighbouring runs close the outer joint.
        reach = WALL_T * math.tan(math.pi / ARC_SEGMENTS / 2) + 0.05
        length = along.length + 2 * reach
        frame = mesh.frame(((p0 + p1) / 2).to_3d(), math.atan2(along.y, along.x))
        gate = k == ARC_SEGMENTS // 2
        openings = [(0.0, 0.0, GATE[0], GATE[1], True)] if gate else []
        north = p0.y > NORTH_Y - 0.5 and p1.y > NORTH_Y - 0.5
        run = [mesh.box("curtain_core", (length, WALL_T, WALL_H), at=(0.0, WALL_T / 2, 0.0), origin="bottom",
                        mat=parts.mat("stone_dark")),
               parts.stone_face(length, WALL_H, rng, openings, moss=ch.moss if north else 0.0, **STONES)]
        run += _parapet(length, rng)
        if gate:
            run += _gate(rng)
        objs += mesh.transform(run, frame)
    return objs


def _parapet(length, rng, z=WALL_H):
    """The parapet on the outer edge of a wall top at height z (wall-local): a low wall and merlons with crenels
    between."""
    objs = [mesh.box("parapet", (length, 0.45, PARAPET_BASE), at=(0.0, 0.22, z), origin="bottom",
                     mat=parts.mat("stone"))]
    count = max(1, int(length // (MERLON + MERLON_GAP)))
    pitch = length / count
    for i in range(count):
        x = -length / 2 + pitch * (i + 0.5)
        h = MERLON_H + parts.jitter(rng, 0.04)
        objs.append(mesh.box("merlon", (MERLON, 0.5, h), at=(x, 0.22, z + PARAPET_BASE), origin="bottom",
                             mat=parts.mat(parts.pick(rng, STONES["keys"]))))
    return objs


def _gate(rng):
    """The gate in the south run (wall-local): oak doors under a voussoir arch, the crest carved over it and the
    brand lantern on a bracket beside it, worn steps up to the threshold."""
    w, h = GATE
    objs = parts.door(w, h, rng, arched=True, frame=False, strap_end="scroll")
    objs += parts.arch_surround(w, h, rng, ring=0.4, stones=11)
    objs += mesh.transform(parts.crest(1.1, 0.06), mesh.frame((0.0, -0.02, h + 0.55)))
    objs += parts.place(parts.lantern_bracket(arm=0.5, size=0.9), mesh.frame((0.0, 0.0, 0.0)), (w / 2 + 0.75, -0.02, 2.7))
    return objs


def _towers(rng):
    """The two drum towers flanking the gate: battered plinths down the bank, rough stone courses, slits facing out,
    a lit window high up, a corbelled ring under a slate cone and a pennant on the finial."""
    objs = []
    for side in (-1, 1):
        angle = math.radians(side * TOWER_ANGLE_DEG)
        centre = parts.ring_point(WALL_R - 0.6, angle, 0.0)
        tower = [mesh.lathe("tower_core", [(TOWER_R + 0.35, -PLINTH), (TOWER_R - 0.02, 0.0), (TOWER_R - 0.02, TOWER_H)],
                            segments=20, mat=parts.mat("stone_dark")),
                 parts.stone_ring(TOWER_R, TOWER_H, rng, course=(0.45, 0.6), length=(0.8, 1.3), keys=STONES["keys"],
                                  openings=[(angle, 2.2, 0.35, 1.1), (angle, 5.4, 0.7, 1.3)]),
                 mesh.lathe("tower_plinth", [(TOWER_R + 0.37, -PLINTH), (TOWER_R + 0.02, 0.0)], segments=20,
                            mat=parts.mat("stone"), cap_bottom=False, cap_top=False),
                 mesh.lathe("tower_corbel", [(TOWER_R - 0.02, TOWER_H - 0.5), (TOWER_R + 0.3, TOWER_H - 0.05),
                                             (TOWER_R + 0.3, TOWER_H + 0.1)], segments=20, mat=parts.mat("stone_light"))]
        for z, size, lit in ((2.2, (0.35, 1.1), False), (5.4, (0.7, 1.3), True)):
            m = (mesh.frame(parts.ring_point(TOWER_R + 0.02, angle, z), angle))
            tower += mesh.transform(parts.window(*size, rng, panes=(1, 2), lit=lit, shutters=(False, False), stone=True,
                                                 frame_key="iron"), m)
        tower += mesh.transform(parts.cone_roof(TOWER_R + 0.55, TOWER_ROOF, rng, **SLATES), mesh.frame((0.0, 0.0, TOWER_H + 0.1)))
        tip = Vector((0.0, 0.0, TOWER_H + 0.1 + TOWER_ROOF + 0.15))
        tower += [mesh.rod("tower_finial", tip, tip + Vector((0.0, 0.0, 1.4)), 0.03, parts.mat("iron"), segments=6)]
        tower += mesh.transform(parts.pennant(1.2, 0.42, rng), mesh.frame(tip + Vector((0.0, 0.0, 0.9)), math.radians(-60)))
        objs += mesh.transform(tower, mesh.frame(centre))
    return objs


def _keep(rng, ch):
    """The keep: four stone storeys with string courses, its door to the courtyard under the brand lantern, slits on
    the ground floor and lit arched windows above, a parapet on its east and west walls with a bartizan on each
    corner, crow-stepped gables south and north and the slate roof between them, and the flag on the south gable."""
    x0, x1, y0, y1 = KEEP
    floors = [sum(STOREYS[:i]) for i in range(len(STOREYS))]
    south = [(0.0, 0.0, 1.4, 2.8, True)] + [(x, z + 0.7, 0.9, 1.7, True) for z in floors[1:] for x in (-2.7, 2.7)]
    side = [(0.0, 1.6, 0.35, 1.2, False)] + [(0.0, z + 0.7, 0.9, 1.7, True) for z in floors[1:]]
    north = [(x, z + 1.0, 0.35, 1.3, False) for z in floors for x in (-2.0, 2.0)]
    openings = {"front": south, "right": side, "back": north, "left": side}
    objs, frames = parts.stone_storey(x0, x1, y0, y1, 0.0, KEEP_TOP, rng, openings, core_key="stone_dark", quoin_sides=(),
                                      moss={"back": ch.moss}, **STONES)
    objs += parts.quoins(x0, x1, y0, y1, 0.0, KEEP_TOP, rng, course=(0.5, 0.65), long=0.85, short=0.5)
    for face, holes in openings.items():
        for k, (hx, hz, hw, hh, arched) in enumerate(holes):
            if face == "front" and k == 0:
                objs += parts.place(parts.door(hw, hh, rng, arched=True, frame=False, strap_end="scroll"), frames[face], (hx, 0.0, hz))
                objs += parts.place(parts.arch_surround(hw, hh, rng, ring=0.3, stones=9), frames[face], (hx, 0.0, hz))
                objs += parts.place(parts.steps(2, hw + 0.8, 0.15, 0.4, rng), frames[face], (hx, 0.0, 0.0))
                objs += parts.place(parts.lantern_bracket(), frames[face], (hx + hw / 2 + 0.6, -0.06, 2.6))
                continue
            lit = hw > 0.5
            window = parts.window(hw, hh, rng, panes=(2, 3) if lit else (1, 3), lit=lit, shutters=(False, False),
                                  stone=True, frame_key="iron" if not lit else "timber", leaded=lit and face == "front")
            objs += parts.place(window, frames[face], (hx, 0.0, hz))
    for z in floors[1:]:
        objs += parts.string_course(x0, x1, y0, y1, z - 0.12)
    objs += _keep_top(rng)
    return objs


def _keep_top(rng):
    """Parapets on the east and west walls, a bartizan on each corner, the crow-stepped gables and the roof."""
    x0, x1, y0, y1 = KEEP
    width, depth = x1 - x0, y1 - y0
    objs = []
    for face in ("right", "left"):
        m, w = parts.face_frame(face, x0, x1, y0, y1, 0.0)
        objs += mesh.transform(_parapet(w, rng, KEEP_TOP), m)
    rise = (width / 2) * math.tan(math.radians(ROOF_PITCH))
    for face in ("front", "back"):
        m, _ = parts.face_frame(face, x0, x1, y0, y1, KEEP_TOP)
        objs += mesh.transform(parts.stepped_gable(width, 0.6, rise + 0.6, GABLE_STEPS, rng, **STONES), m)
    roof = parts.gable_roof(depth - 1.2, width - 1.4, ROOF_PITCH, rng, eave=0.1, gable=0.0, rafters=0,
                            barges=(False, False), ridge_key="roof_light", **SLATES)
    objs += mesh.transform(roof, mesh.frame((0.0, y0 + 0.6, KEEP_TOP + 0.1), math.pi / 2))
    for cx in (x0, x1):
        for cy in (y0, y1):
            objs += mesh.transform(_bartizan(rng), mesh.frame((cx, cy, KEEP_TOP - 0.6)))
    apex = Vector((0.0, y0 + 0.3, KEEP_TOP + rise + 0.75))
    objs += [mesh.rod("flag_pole", apex, apex + Vector((0.0, 0.0, 3.2)), 0.07, parts.mat("timber"), segments=8, radius_b=0.05),
             parts.blob(rng, 0.09, "paint_gold", squash=1.0, at=apex + Vector((0.0, 0.0, 3.25)))]
    objs += mesh.transform(parts.flag(2.0, 1.3, rng, keys=("columbia", "white")), mesh.frame(apex + Vector((0.06, 0.0, 1.8))))
    return objs


def _bartizan(rng):
    """A corner turret on stone corbels: a short stone drum with a slit under a small slate cone."""
    r, h = 1.0, 2.2
    objs = [mesh.lathe("bartizan_corbel", [(0.15, -1.1), (0.55, -0.7), (r - 0.05, -0.15), (r + 0.06, 0.0)], segments=12,
                       mat=parts.mat("stone_light"), cap_top=False),
            mesh.lathe("bartizan", [(r, 0.0), (r, h)], segments=12, mat=parts.mat("stone")),
            mesh.lathe("bartizan_rim", [(r + 0.06, h - 0.05), (r + 0.06, h + 0.12)], segments=12, mat=parts.mat("stone_light"))]
    objs += mesh.transform(parts.cone_roof(r + 0.3, 2.0, rng, keys=parts.SLATE_KEYS, exposure=0.34, run=(0.4, 0.7)),
                           mesh.frame((0.0, 0.0, h + 0.1)))
    tip = Vector((0.0, 0.0, h + 2.25))
    return objs + [mesh.rod("bartizan_finial", tip, tip + Vector((0.0, 0.0, 0.5)), 0.02, parts.mat("iron"), segments=6)]


def _footing(rng):
    """The north wall and the keep stand at the cliff's edge, so their base runs on down the cliff as a battered
    plinth of rough stone that the knoll's rock closes round (wall-local on the north line, out along -Y)."""
    half = WALL_R * math.sin(math.acos(-NORTH_Y / WALL_R)) + 0.5
    section = [(-FOOTING_BATTER, -FOOTING), (0.0, 0.0), (FOOTING_DEPTH, 0.0), (FOOTING_DEPTH, -FOOTING)]
    plinth = mesh.loft("footing", [[(x, y, z) for y, z in section] for x in (-half, half)], mat=parts.mat("stone_dark"))
    stones = parts.stone_face(2 * half, FOOTING, rng, **STONES)
    # Down to the plinth's foot, then leant out with its batter: y moves FOOTING_BATTER per FOOTING of depth.
    batter = Matrix.Identity(4)
    batter[1][2] = FOOTING_BATTER / FOOTING
    stones.data.transform(batter @ Matrix.Translation((0.0, 0.0, -FOOTING)))
    return mesh.transform([plinth, stones], mesh.frame((0.0, NORTH_Y, 0.0), math.pi))


def _yard(rng):
    """Barrels by the keep door."""
    _, _, y0, _ = KEEP
    objs = mesh.transform(parts.barrel(rng, brand=True), mesh.frame((-2.3, y0 - 0.7, 0.0)))
    objs += mesh.transform(parts.barrel(rng, height=0.82), mesh.frame((-3.0, y0 - 1.2, 0.0)))
    return objs
