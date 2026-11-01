"""mill: a tower windmill (DESIGN.md section 10). A round stone base with a battered wall, mossy on its seaward side,
an arched door up a worn step and small windows; a reefing stage on brackets round the foot of the tapered,
weatherboarded smock, reached by a steep wooden stair; a gabled cap in dark stave-church timber under shingles and
carved bargeboards, turned into the wind, its windshaft carrying four sails of lattice and canvas in a saltire, one
missing a bar; a tail pole ending in a carved dragon head, with struts running down to a cart wheel; a lit leaded
window, a miller's sign of a sheaf and flour sacks by the door. The sails are built here but exported on their own as
mill_sails, so the site can turn them; the mill keeps the origin it had with them on."""

import math
import random

import bpy
from mathutils import Matrix, Vector

from island import mesh, parts

BASE_R, BASE_TOP_R, BASE_H = 3.5, 3.1, 5.0
SMOCK_R, SMOCK_H = 2.5, 3.4
STAGE_R = 4.3
CAP_Z = BASE_H + SMOCK_H
CAP_SPAN, CAP_BACK = 3.3, 2.1
HUB = Vector((0.0, -3.05, 9.35))
SAIL_LENGTH, SAIL_LEAD, SAIL_TRAIL = 6.8, 0.35, 1.35
BATTER = math.atan2(BASE_R - BASE_TOP_R, BASE_H)


def assemble(seed=7):
    """The mill's parts in its build frame: the body, and apart from it the four sails; the sails' random layout is
    drawn in its old place in the sequence, so the body and the sails both come out as they always have."""
    rng = random.Random(seed)
    ch = parts.character(seed)
    body = _base(rng, ch) + _stage(rng) + _smock(rng) + _cap(rng, ch)
    sails = _sails(rng)
    return body + _tail(rng) + _yard(rng), sails


def finished(seed=7):
    """The mill joined and finalized without its sails, and the sails' parts still apart in its frame. The origin
    stays at the bottom centre of the mill with its sails on, where it always was, so the body keeps its place on the
    site and mill_sails its offset from it."""
    body, sails = assemble(seed)
    ob = mesh.finalize("isl_mill", body, centre=False)
    mesh.set_pivot(ob, around=[ob] + sails)
    return ob, sails


def build(seed=7):
    ob, sails = finished(seed)
    for part in sails:
        bpy.data.objects.remove(part, do_unlink=True)
    return ob


def _wall_frame(angle, z):
    """A wall-local frame on the battered base at `angle` and height z, its -Y facing out and its Z leaning in with
    the wall."""
    r = BASE_R + (BASE_TOP_R - BASE_R) * z / BASE_H
    return (Matrix.Translation(parts.ring_point(r - 0.02, angle, z)) @ Matrix.Rotation(angle, 4, "Z")
            @ Matrix.Rotation(-BATTER, 4, "X"))


def _base(rng, ch):
    """The stone base: core, courses round the door and windows, the door with its voussoirs, windows, steps and
    the string course under the stage."""
    door = (1.2, 2.3)
    windows = ((math.pi / 2, 2.6), (-math.pi / 2, 2.6), (math.pi, 2.6))
    holes = [(0.0, 0.0, *door)] + [(a, z, 0.6, 0.85) for a, z in windows]
    objs = [mesh.lathe("base_core", [(BASE_R - 0.02, 0.0), (BASE_TOP_R - 0.02, BASE_H)], segments=24, mat=parts.mat("stone_dark")),
            parts.stone_ring(BASE_R, BASE_H, rng, radius_top=BASE_TOP_R, course=(0.3, 0.42), length=(0.5, 1.0), openings=holes,
                             moss=ch.moss * 2)]
    m = _wall_frame(0.0, 0.0)
    objs += parts.place(parts.door(*door, rng, arched=True, frame=False), m)
    objs += parts.place(parts.arch_surround(*door, rng, ring=0.3, stones=9), m)
    objs += mesh.transform(parts.steps(1, door[0] + 0.6, 0.14, 0.45, rng), mesh.frame((0.0, -BASE_R + 0.02, 0.0)))
    objs += parts.place(parts.hanging_sign(arm=0.9, board=(0.55, 0.45), key="plank_light", emblem_key="paint_gold", iron=True,
                                           emblem="sheaf"), _wall_frame(math.radians(-32), 2.3))
    for a, z in windows:
        objs += parts.place(parts.window(0.6, 0.85, rng, panes=(2, 2), stone=True), _wall_frame(a, z))
    objs.append(mesh.lathe("base_band", [(BASE_TOP_R + 0.12, BASE_H - 0.22), (BASE_TOP_R + 0.14, BASE_H - 0.02)], segments=24,
                           mat=parts.mat("stone_light")))
    return objs


def _stage(rng):
    """The reefing stage: a plank ring on diagonal brackets with posts and a rail round its edge."""
    timber = parts.mat("timber")
    z = BASE_H
    objs = [mesh.lathe("stage_deck", [(SMOCK_R + 0.4, z - 0.12), (STAGE_R, z - 0.12), (STAGE_R, z), (SMOCK_R + 0.4, z)],
                       segments=24, mat=parts.mat("plank"), cap_bottom=False, cap_top=False)]
    for k in range(12):
        a = 2 * math.pi * (k + 0.5) / 12
        foot, head = parts.ring_point(BASE_TOP_R + 0.02, a, z - 0.95), parts.ring_point(STAGE_R - 0.15, a, z - 0.14)
        objs.append(mesh.beam("stage_bracket", foot, head, 0.12, 0.12, timber))
    posts = 16
    for k in range(posts):
        a = 2 * math.pi * k / posts
        objs.append(mesh.box("stage_post", (0.08, 0.08, 1.0), at=parts.ring_point(STAGE_R - 0.06, a, z), origin="bottom",
                             rot=(0, 0, a), mat=timber))
    ring = [parts.ring_point(STAGE_R - 0.06, 2 * math.pi * k / posts, z + 1.0) for k in range(posts)]
    objs.append(parts.rope(ring, 0.045, key="timber", sides=4, closed=True, name="stage_rail"))
    return objs


def _smock(rng):
    """The eight-sided timber body: weatherboards stepped out at every course, corner posts, a door onto the stage
    and a lit window over it."""
    boards = 9
    profile = []
    for k in range(boards):
        z0, z1 = BASE_H + SMOCK_H * k / boards, BASE_H + SMOCK_H * (k + 1) / boards

        def r(z):
            return BASE_TOP_R - 0.1 + (SMOCK_R - BASE_TOP_R + 0.1) * (z - BASE_H) / SMOCK_H
        profile += [(r(z0) + 0.05, z0), (r(z1) + 0.012, z1 - 0.01)]
    profile.append((SMOCK_R - 0.1, CAP_Z))
    bands = [0, 1] * boards
    body = mesh.lathe("smock", profile, segments=8, mat=[parts.mat("plank"), parts.mat("timber_dark")], band_materials=bands,
                      cap_bottom=False)
    body.rotation_euler = (0.0, 0.0, math.pi / 8)
    objs = [body]
    for k in range(8):
        a = 2 * math.pi * k / 8
        objs.append(mesh.beam("smock_post", parts.ring_point((BASE_TOP_R - 0.03) / math.cos(math.pi / 8), a, BASE_H),
                              parts.ring_point((SMOCK_R - 0.05) / math.cos(math.pi / 8), a, CAP_Z), 0.16, 0.16, parts.mat("timber")))
    for angle, kind in ((math.pi / 2, "door"), (math.radians(140), "window")):
        r = BASE_TOP_R - 0.06
        tilt = math.atan2(BASE_TOP_R - SMOCK_R, SMOCK_H)
        m = (Matrix.Translation(parts.ring_point(r * math.cos(math.pi / 8), angle, BASE_H)) @ Matrix.Rotation(angle, 4, "Z")
             @ Matrix.Rotation(-tilt, 4, "X"))
        if kind == "door":
            objs += parts.place(parts.door(0.85, 1.85, rng), m)
        else:
            objs += parts.place(parts.window(0.6, 0.75, rng, shutters=(False, False), leaded=True), m, (0.0, 0.0, 1.5))
    return objs


def _cap(rng, ch):
    """The cap in dark stave-church timber: a curb, a frame, plank gables front and back and a shingle roof with
    carved bargeboards, its ridge pointing into the wind."""
    timber = parts.mat("timber_dark")
    span, front, back = CAP_SPAN, -2.45, CAP_BACK
    objs = [mesh.lathe("curb", [(SMOCK_R + 0.05, CAP_Z - 0.05), (SMOCK_R + 0.08, CAP_Z + 0.2)], segments=16, mat=timber),
            mesh.box("cap_frame", (span - 0.2, back - front - 0.2, 0.32), at=(0.0, (front + back) / 2, CAP_Z + 0.15), origin="bottom",
                     mat=timber)]
    z = CAP_Z + 0.47
    rise = span / 2 * math.tan(math.radians(50.0))
    for face in ("front", "back"):
        m, width = parts.face_frame(face, -span / 2, span / 2, front + 0.1, back - 0.1, z)
        objs += mesh.transform(parts.gable_wall(width, rise, rng, key="timber"), m)
    roof = parts.gable_roof(back - front, span, 50.0, rng, eave=0.3, gable=0.25, exposure=0.22, run=(0.4, 0.9), rafters=0.7,
                            barge_key="timber_dark", ridge_key="timber_dark", carved=True, missing=ch.wear)
    objs += mesh.transform(roof, mesh.frame((0.0, front, z), math.pi / 2))
    shaft_end = Vector((0.0, 1.0, HUB.z - 0.35))
    objs.append(mesh.rod("windshaft", shaft_end, HUB, 0.17, timber, segments=10))
    objs.append(mesh.box("poll_end", (0.55, 0.6, 0.55), at=HUB, mat=parts.mat("iron"), bevel=0.02))
    return objs


def _sails(rng):
    """Four sails in a saltire: a whip on each arm of the two stocks, bars across it, a hemlath and a leading
    board, with canvas spread on two of them and reefed half way on the others."""
    timber, plank = parts.mat("timber"), parts.mat("plank_light")
    objs = []
    offset = math.radians(45.0 + rng.uniform(-6.0, 6.0))
    for k in range(4):
        a = offset + k * math.pi / 2
        d = Vector((math.cos(a), 0.0, math.sin(a)))
        p = Vector((-math.sin(a), 0.0, math.cos(a)))
        y = Vector((0.0, -0.12, 0.0))
        objs.append(mesh.beam("stock", HUB + d * 0.2, HUB + d * SAIL_LENGTH, 0.2, 0.2, timber))
        bars = 13
        broken = rng.randrange(4, bars) if k == 3 else None
        for i in range(bars):
            if i == broken:
                continue
            c = HUB + d * (1.6 + (SAIL_LENGTH - 1.75) * i / (bars - 1)) + y
            objs.append(mesh.beam("sail_bar", c - p * SAIL_LEAD, c + p * SAIL_TRAIL, 0.06, 0.05, plank))
        for off, size in ((SAIL_TRAIL, 0.08), (-SAIL_LEAD, 0.07)):
            edge = HUB + p * off + y * 1.6
            objs.append(mesh.beam("hemlath", edge + d * 1.55, edge + d * SAIL_LENGTH, size, size, plank))
        reach = SAIL_LENGTH - 0.2 if k % 2 == 0 else 1.6 + (SAIL_LENGTH - 1.6) * 0.5
        objs.append(_canvas(HUB + y * 2.2, d, p, 1.7, reach, rng))
    return objs


def _canvas(origin, d, p, start, end, rng):
    """Sail canvas spread over the trailing part of the lattice, billowing a little, double-sided."""
    bm = parts.bmesh.new()
    rows = 4
    for i in range(rows):
        s0, s1 = start + (end - start) * i / rows, start + (end - start) * (i + 1) / rows
        quad = [origin + d * s + p * w + Vector((0.0, -0.06 * math.sin(math.pi * w / SAIL_TRAIL), 0.0))
                for s, w in ((s0, 0.1), (s1, 0.1), (s1, SAIL_TRAIL - 0.05), (s0, SAIL_TRAIL - 0.05))]
        parts._two_sided(bm, quad, (0.0, -1.0, 0.0), 0)
    return mesh.from_bmesh("sail_canvas", bm, parts.mat("canvas"))


def _tail(rng):
    """The tail pole from the back of the cap down to a cart wheel on the ground, with two struts, and the carved
    dragon head on the cap's back gable above it, looking out behind the mill."""
    timber = parts.mat("timber_dark")
    top, foot = Vector((0.0, 2.05, CAP_Z + 0.3)), Vector((0.0, 4.85, 0.55))
    objs = [mesh.beam("tail_pole", top, foot, 0.22, 0.22, timber)]
    apex = Vector((0.0, CAP_BACK + 0.2, CAP_Z + 0.47 + CAP_SPAN / 2 * math.tan(math.radians(50.0)) + 0.05))
    objs += mesh.transform(parts.dragon_head(0.95, thickness=0.16), Matrix.Translation(apex)
                           @ Matrix.Rotation(math.pi / 2, 4, "Z") @ Matrix.Rotation(math.radians(-25.0), 4, "Y"))
    joint = top.lerp(foot, 0.45)
    objs += [mesh.beam("tail_strut", Vector((s * 1.45, 1.5, CAP_Z + 0.2)), joint, 0.12, 0.12, timber) for s in (-1, 1)]
    objs += mesh.transform(parts.wheel(0.44, 0.08, rng, spokes=8), mesh.frame((0.0, foot.y + 0.08, 0.44)))
    return objs


def _yard(rng):
    """The steep stair up to the stage on the right, and flour sacks by the door."""
    objs = mesh.transform(parts.stair(rng, BASE_H - 0.1, 4.4, 0.8, rail_side=1), mesh.frame((3.95, -2.65, 0.0)))
    for x, y, upright in ((1.3, -3.4, True), (1.8, -3.05, True), (-1.35, -3.35, False)):
        objs += mesh.transform([parts.sack(rng, (0.4, 0.36, 0.55) if upright else (0.62, 0.4, 0.3), key="canvas", upright=upright)],
                               mesh.frame((x, y, 0.0), rng.uniform(0.0, math.pi)))
    return objs
