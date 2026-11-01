"""ship: a two-masted pinnace, 37.4 m from the bowsprit tip to the ensign staff, its bow towards -Y like the
original so village/harbor.ts keeps working. A lofted clinker hull with wales, a painted band and gunports;
keel, stem, sternpost and a strapped rudder whose stock rises behind the stern to a tiller over the open after
deck; a quarterdeck with a balustrade, ladders, a wheel and a lit stern cabin, with a lantern on each stern
corner; masts with tops, yards braced round with furled sails and a bowsprit; shrouds with ratlines every 0.8 m,
stays and backstays; three hatches, a capstan, coiled rope and an anchor at the cathead. Z = 0 is the waterline
and the keel reaches 2.41 m below it."""

import math
import random

from mathutils import Matrix, Vector

from island import mesh, parts, style

BOW, STERN = -14.6, 16.3
KEEL_DEPTH = -2.41
BILGE, TUMBLEHOME = 1.2, 0.06
STRAKES, WALES, PAINT = 12, (6, 9), (11,)
STATIONS = (0.0, 0.015, 0.04, 0.075, 0.12, 0.17, 0.23, 0.3, 0.37, 0.44, 0.51, 0.58, 0.65, 0.72, 0.78, 0.84, 0.89,
            0.93, 0.965, 1.0)
MASTS = ({"y": -7.5, "top": 15.0, "head": 26.0, "yards": ((12.8, 11.5, 0.24), (21.6, 8.5, 0.18))},
         {"y": 1.5, "top": 17.0, "head": 30.1, "yards": ((14.6, 13.0, 0.26), (24.6, 9.6, 0.19))})
BRACE = math.radians(45.0)
BOWSPRIT = (Vector((0.0, -10.5, 4.6)), Vector((0.0, -18.42, 7.6)))
QUARTER_T, QUARTER_Z = 0.72, 5.6
CABIN = (0.86, 0.94, 7.8)
TILLER_T = 0.95
ENSIGN_TIP = Vector((0.0, 18.8, 14.4))


def y_at(t):
    return BOW + (STERN - BOW) * t


def t_at(y):
    return (y - BOW) / (STERN - BOW)


def station(t):
    """Half-breadth, keel, rail and deck heights and section fullness along the hull (t = 0 at the stem)."""
    if t < 0.62:
        beam = 0.25 + 4.25 * math.sin(math.pi / 2 * min(1.0, t / 0.42)) ** 0.75
    else:
        beam = 4.5 - 0.95 * ((t - 0.62) / 0.38) ** 2
    fullness = 1.6 + 1.4 * math.sin(math.pi * t / 0.85) if t < 0.85 else 1.6 + 0.6 * (t - 0.85) / 0.15
    return {"beam": beam, "keel": -2.0 + 2.6 * max(0.0, (0.16 - t) / 0.16) ** 2, "bilge": BILGE,
            "rail": 4.2 + 1.0 * max(0.0, (0.3 - t) / 0.3) ** 2 + 0.9 * max(0.0, (t - 0.55) / 0.45) ** 2,
            "deck": 3.0 + 0.5 * max(0.0, (0.25 - t) / 0.25) ** 2 + 0.4 * max(0.0, (t - 0.6) / 0.4) ** 2,
            "fullness": fullness}


def side_x(t, z):
    st = station(t)
    return parts.hull_side_x(st["beam"], st["keel"], st["bilge"], st["rail"], st["fullness"], TUMBLEHOME, z)


def inner_x(t):
    return station(t)["beam"] * (1 - TUMBLEHOME) - 0.25


def build(seed=7):
    with style.weathered():
        return _build(random.Random(seed))


def _build(rng):
    stations = [dict(station(t), y=y_at(t)) for t in STATIONS]
    objs = parts.hull_loft(stations, strakes=STRAKES, wales=WALES, paint=PAINT, tumblehome=TUMBLEHOME, step=0.045)
    objs += _spine() + _gunports() + _quarterdeck(rng) + _deck_gear(rng) + _bowsprit()
    for mast in MASTS:
        objs += _mast(mast) + _shrouds(mast)
    objs += _stays() + _stern_board(rng) + _pennant(rng)
    return mesh.finalize("isl_ship", objs, ground=False)


def _spine():
    """Keel, a curved stem, the sternpost and the rudder with iron pintles and straps, its stock rising behind the
    stern to a tiller reaching forward over the open after deck."""
    dark = parts.mat("hull_dark")
    start = y_at(0.16)
    objs = [mesh.box("keel", (0.36, STERN + 0.25 - start, 0.5), at=(0.0, (start + STERN + 0.25) / 2, KEEL_DEPTH + 0.25),
                     mat=dark, bevel=0.02)]
    stem = [Vector((0.0, y_at(t) - 0.12, station(t)["keel"] - 0.2)) for t in (0.16, 0.11, 0.07, 0.035, 0.0)]
    stem.append(Vector((0.0, BOW - 0.45, station(0.0)["rail"] + 0.5)))
    objs += [mesh.beam("stem", a, b, 0.32, 0.4, dark) for a, b in zip(stem, stem[1:])]
    objs.append(mesh.beam("sternpost", (0.0, STERN + 0.12, KEEL_DEPTH), (0.0, STERN + 0.3, 5.6), 0.34, 0.34, dark))
    blade = [(0.0, KEEL_DEPTH + 0.05), (1.25, KEEL_DEPTH + 0.05), (0.85, 3.4), (0.0, 4.6)]
    rudder = parts.extrude_xz("rudder", blade, -0.14, 0.14, "hull")
    objs += mesh.transform([rudder], mesh.frame((0.0, STERN + 0.42, 0.0), math.pi / 2))
    iron = parts.mat("iron")
    for z, reach in ((-1.2, 1.17), (0.9, 1.02), (3.0, 0.88)):
        objs.append(mesh.box("pintle", (0.4, 0.5, 0.1), at=(0.0, STERN + 0.4, z), mat=iron))
        objs.append(mesh.box("rudder_strap", (0.33, reach * 0.8, 0.11), at=(0.0, STERN + 0.42 + reach * 0.4, z), mat=iron))
    head = Vector((0.0, STERN + 0.45, QUARTER_Z + 0.95))
    tip = Vector((0.0, y_at(TILLER_T), QUARTER_Z + 0.82))
    objs += [mesh.rod("rudder_stock", (0.0, STERN + 0.45, 4.3), head + Vector((0.0, 0.0, 0.12)), 0.13, dark, segments=8),
             mesh.beam("tiller", head, tip, 0.12, 0.14, parts.mat("timber"), bevel=0.012),
             mesh.cylinder("tiller_grip", 0.06, 0.22, at=tip - Vector((0.0, 0.05, 0.0)), rot=(math.pi / 2, 0, 0),
                           mat=parts.mat("plank_light"), segments=8, origin="center")]
    return objs


def _gunports():
    """Four ports a side below the painted band, their lids propped open."""
    objs = []
    for y in (-5.0, -1.5, 4.5, 7.5):
        t = t_at(y)
        for s in (-1, 1):
            x = side_x(t, 2.2) + 0.03
            port = [parts.plate("gunport", 0.55, 0.5, (0.0, 0.0, 0.0), "timber_dark")]
            lid = mesh.box("gunport_lid", (0.62, 0.06, 0.55), at=(0.0, -0.03, -0.275), mat=parts.mat("hull"))
            port += mesh.transform([lid], Matrix.Translation((0.0, -0.01, 0.28)) @ Matrix.Rotation(math.radians(-60), 4, "X"))
            objs += mesh.transform(port, mesh.frame((s * x, y, 2.2), s * math.pi / 2))
    return objs


def _quarterdeck(rng):
    """The raised aft deck with a balustrade and ladders, the stern cabin with lit windows, the stern lantern
    and the ensign staff."""
    ts = [QUARTER_T + (1.0 - QUARTER_T) * i / 7 for i in range(8)]
    right = [(inner_x(t), y_at(t)) for t in ts]
    outline = right + [(-x, y) for x, y in reversed(right)]
    deck_z = station(QUARTER_T)["deck"]
    objs = [mesh.polygon("quarterdeck", outline, QUARTER_Z - deck_z, at=(0.0, 0.0, deck_z), mat=parts.mat("hull")),
            mesh.polygon("quarterdeck_floor", outline, 0.05, at=(0.0, 0.0, QUARTER_Z), mat=parts.mat("plank_light"))]
    objs += _balustrade(right, QUARTER_Z) + _balustrade([(-x, y) for x, y in right], QUARTER_Z)
    front = y_at(QUARTER_T)
    face = mesh.frame((0.0, front, deck_z))
    objs += parts.place(parts.door(0.9, 1.9, rng), face, (0.0, 0.0, 0.0))
    for x in (-1.5, 1.5):
        objs += parts.place(parts.window(0.55, 0.6, rng, shutters=(False, False)), face, (x, 0.0, 1.1))
    for x in (-2.7, 2.7):
        objs += mesh.transform(parts.stair(rng, QUARTER_Z - deck_z, 1.7, 0.7, rail_side=1 if x > 0 else -1),
                               mesh.frame((x, front - 1.75, deck_z)))
    return objs + _cabin(rng)


def _balustrade(edge, z, spacing=0.45):
    """Turned balusters along a polyline of (x, y) points with a rail on top."""
    timber = parts.mat("timber")
    objs = []
    for (x0, y0), (x1, y1) in zip(edge, edge[1:]):
        a, b = Vector((x0, y0, z)), Vector((x1, y1, z))
        count = max(1, int((b - a).length / spacing))
        for i in range(count):
            foot = a.lerp(b, (i + 0.5) / count)
            objs.append(mesh.rod("baluster", foot, foot + Vector((0.0, 0.0, 0.85)), 0.045, timber, segments=4, cap=False))
        objs.append(mesh.beam("rail", a + Vector((0.0, 0.0, 0.88)), b + Vector((0.0, 0.0, 0.88)), 0.12, 0.08, timber))
    return objs


def _cabin(rng):
    t0, t1, roof = CABIN
    y0, y1 = y_at(t0), y_at(t1)
    half = inner_x(t1) - 0.3
    objs = [mesh.box("cabin", (2 * half, y1 - y0, roof - QUARTER_Z), at=(0.0, (y0 + y1) / 2, QUARTER_Z), origin="bottom",
                     mat=parts.mat("hull")),
            mesh.box("cabin_roof", (2 * half + 0.3, y1 - y0 + 0.3, 0.1), at=(0.0, (y0 + y1) / 2, roof + 0.05),
                     mat=parts.mat("plank_light"), bevel=0.015)]
    for face in ("left", "right", "back"):
        m, width = parts.face_frame(face, -half, half, y0, y1, QUARTER_Z)
        for x in ((-width / 4, width / 4) if face != "back" else (-0.8, 0.8)):
            objs += parts.place(parts.window(0.6, 0.75, rng, panes=(2, 2), shutters=(False, False)), m, (x, 0.0, 0.9))
    m, _ = parts.face_frame("front", -half, half, y0, y1, QUARTER_Z)
    objs += parts.place(parts.door(0.8, 1.8, rng), m, (0.0, 0.0, 0.0))
    timber = parts.mat("timber")
    corner = inner_x(0.985) - 0.35
    for x in (-corner, corner):
        foot = Vector((x, y_at(0.985), QUARTER_Z))
        objs.append(mesh.beam("lantern_post", foot, foot + Vector((0.0, 0.0, 1.3)), 0.16, 0.16, timber, bevel=0.012))
        objs += mesh.transform(parts.lantern(size=1.8), mesh.frame(foot + Vector((0.0, 0.0, 1.3))))
    objs.append(mesh.rod("ensign_staff", (0.0, y1 - 0.3, roof + 0.1), ENSIGN_TIP, 0.08, timber, segments=6, radius_b=0.04))
    return objs


def _deck_gear(rng):
    """Hatches with gratings, a capstan, the wheel, rope coils and the anchor hanging from its cathead."""
    objs = []
    for y, size in ((-10.2, 1.3), (-3.6, 1.8), (4.2, 1.8)):
        z = station(t_at(y))["deck"]
        objs.append(mesh.box("hatch_coaming", (size + 0.4, size, 0.36), at=(0.0, y, z), origin="bottom",
                             mat=parts.mat("hull_dark"), bevel=0.02))
        objs.append(mesh.box("hatch_grating", (size + 0.2, size - 0.2, 0.06), at=(0.0, y, z + 0.36), origin="bottom",
                             mat=parts.mat("plank_light")))
        bars = round(size / 0.36)
        for i in range(bars):
            objs.append(mesh.box("grating_bar", (size + 0.2, 0.06, 0.05),
                                 at=(0.0, y - (size - 0.2) / 2 + (size - 0.2) * (i + 0.5) / bars, z + 0.42), origin="bottom",
                                 mat=parts.mat("timber")))
    objs += _capstan(Vector((0.0, 6.4, station(t_at(6.4))["deck"])))
    objs += _wheel(Vector((0.0, y_at(0.77), QUARTER_Z)))
    for x, y, z in ((1.9, -6.0, None), (-2.0, 2.9, None), (1.9, y_at(0.8), QUARTER_Z + 0.05)):
        z = station(t_at(y))["deck"] if z is None else z
        objs += mesh.transform(parts.rope_coil(radius=rng.uniform(0.28, 0.36)), mesh.frame((x, y, z), rng.uniform(0, 6.28)))
    return objs + _anchor()


def _capstan(at):
    timber = parts.mat("timber")
    profile = [(0.55, 0.0), (0.5, 0.12), (0.36, 0.2), (0.32, 0.85), (0.48, 0.95), (0.46, 1.1), (0.15, 1.15)]
    drum = mesh.lathe("capstan", profile, segments=12, mat=timber, cap_bottom=False)
    drum.location = at
    bar_z = at + Vector((0.0, 0.0, 1.02))
    return [drum, mesh.rod("capstan_bar", bar_z - Vector((1.2, 0.0, 0.0)), bar_z + Vector((1.2, 0.0, 0.0)), 0.04, timber, segments=6),
            mesh.rod("capstan_bar", bar_z - Vector((0.0, 1.2, 0.0)), bar_z + Vector((0.0, 1.2, 0.0)), 0.04, timber, segments=6)]


def _wheel(at):
    """A ship's wheel facing the bow: rim, hub, eight spokes ending in handles and a pedestal behind it."""
    timber = parts.mat("timber")
    centre = at + Vector((0.0, 0.0, 1.25))
    rim = [centre + Vector((0.72 * math.cos(a), 0.0, 0.72 * math.sin(a))) for a in (2 * math.pi * k / 16 for k in range(16))]
    objs = [parts.rope(rim, 0.05, key="plank_light", sides=4, closed=True, name="wheel_rim"),
            mesh.rod("wheel_hub", centre - Vector((0.0, 0.14, 0.0)), centre + Vector((0.0, 0.5, 0.0)), 0.11, timber, segments=8),
            mesh.box("wheel_pedestal", (0.36, 0.4, 1.2), at=at + Vector((0.0, 0.55, 0.0)), origin="bottom", mat=timber, bevel=0.02)]
    for k in range(8):
        a = math.pi * k / 4
        objs.append(mesh.rod("wheel_spoke", centre, centre + Vector((0.98 * math.cos(a), 0.0, 0.98 * math.sin(a))), 0.03,
                             timber, segments=4))
    return objs


def _anchor():
    """An iron anchor with a timber stock hanging from a cathead on the starboard bow."""
    iron, timber = parts.mat("iron"), parts.mat("timber")
    top, crown = Vector((2.62, -12.3, 4.75)), Vector((2.78, -12.25, 2.3))
    objs = [mesh.beam("cathead", (1.5, -12.0, 4.88), (2.75, -12.3, 4.98), 0.22, 0.25, timber, bevel=0.015),
            mesh.rod("anchor_shank", top, crown, 0.07, iron, segments=6),
            mesh.rod("anchor_stock", top + Vector((0.0, -0.65, -0.25)), top + Vector((0.0, 0.65, -0.25)), 0.065, timber, segments=6)]
    for s in (-1, 1):
        tip = crown + Vector((0.0, s * 0.7, 0.5))
        objs.append(mesh.rod("anchor_arm", crown, tip, 0.06, iron, segments=6))
        objs.append(mesh.box("anchor_fluke", (0.06, 0.26, 0.2), at=tip, rot=(math.radians(s * 35), 0, 0), mat=iron))
    return objs


def _stern_board(rng):
    """The carved stern board between the stern lanterns, facing aft over the taffrail: REVA in gilded letters above
    the island's crest (DESIGN.md section 9)."""
    y = y_at(1.0) - 0.15
    z = QUARTER_Z + 1.2
    width, height = 3.2, 1.45
    board = [mesh.box("stern_board", (width, 0.1, height), at=(0.0, 0.05, 0.0), origin="bottom", mat=parts.mat("hull_dark"),
                      bevel=0.02),
             mesh.box("stern_board_rim", (width + 0.12, 0.08, 0.1), at=(0.0, 0.0, height), mat=parts.mat("paint_gold"))]
    board += mesh.transform(parts.text("REVA", 0.26, 0.03, "paint_gold"), Matrix.Translation((0.0, 0.0, height - 0.38)))
    board += mesh.transform(parts.crest(0.95, 0.03), Matrix.Translation((0.0, 0.0, 0.1)))
    return mesh.transform(board, mesh.frame((0.0, y, z), math.pi))


def _pennant(rng):
    """A swallow-tailed pennant in Columbia blue and white flying aft from the main topmast under the truck."""
    main = MASTS[1]
    flag = parts.pennant(4.6, 0.9, rng)
    return mesh.transform(flag, mesh.frame((0.0, main["y"] + 0.12, main["head"] - 1.25), math.pi / 2))


def _bowsprit():
    """The bowsprit with a spritsail yard and its furled sail hanging under it."""
    timber = parts.mat("timber")
    a, b = BOWSPRIT
    objs = [mesh.rod("bowsprit", a, b, 0.26, timber, segments=8, radius_b=0.11)]
    hang = a.lerp(b, 0.8)
    yard = (hang + Vector((-3.0, 0.0, -0.75)), hang + Vector((3.0, 0.0, -0.75)))
    objs.append(mesh.rod("spritsail_yard", yard[0], yard[1], 0.1, timber, segments=6))
    objs.append(mesh.rod("spritsail_sling", hang, (yard[0] + yard[1]) / 2, 0.025, parts.mat("rope"), segments=4))
    sail = parts.sag(yard[0] + Vector((0.4, 0.0, -0.2)), yard[1] + Vector((-0.4, 0.0, -0.2)), 0.18, 8)
    return objs + [parts.rope(sail, 0.17, key="canvas_dark", sides=6, name="furled_sail")]


def _mast(m):
    """Lower mast, top, cap and topmast, with yards braced round, furled sails and lifts."""
    timber = parts.mat("timber")
    y = m["y"]
    deck = station(t_at(y))["deck"]
    objs = [mesh.rod("mast", (0.0, y, deck - 0.4), (0.0, y, m["top"] + 0.7), 0.32, timber, segments=10, radius_b=0.25),
            mesh.box("mast_top", (2.3, 1.8, 0.14), at=(0.0, y, m["top"]), mat=parts.mat("plank"), bevel=0.02),
            mesh.box("mast_cap", (0.8, 0.5, 0.28), at=(0.0, y, m["top"] + 0.7), mat=timber, bevel=0.02),
            mesh.rod("topmast", (0.0, y, m["top"] - 1.2), (0.0, y, m["head"]), 0.2, timber, segments=8, radius_b=0.1),
            mesh.cylinder("truck", 0.14, 0.16, at=(0.0, y, m["head"]), mat=timber, segments=8)]
    along = Vector((math.cos(BRACE), math.sin(BRACE), 0.0))
    for z, length, sail_radius in m["yards"]:
        centre = Vector((0.0, y, z))
        ends = (centre - along * length / 2, centre + along * length / 2)
        objs += [mesh.rod("yard", centre, end, 0.17, timber, segments=6, radius_b=0.08) for end in ends]
        drop = Vector((0.0, 0.0, sail_radius + 0.05))
        sail = parts.sag(ends[0] + along * 0.5 - drop, ends[1] - along * 0.5 - drop, 0.22, 10)
        objs.append(parts.rope(sail, sail_radius, key="canvas_dark", sides=6, name="furled_sail"))
        lift = Vector((0.0, y, m["top"] + 0.6 if z < m["top"] else m["head"] - 0.4))
        objs += [mesh.rod("yard_lift", end, lift, 0.018, parts.mat("rope"), segments=4, cap=False) for end in ends]
    return objs


def _shrouds(m):
    """Four shrouds a side from the channels to the masthead with ratlines every 0.8 m, topmast shrouds from the
    top's rim and a backstay a side."""
    rope = parts.mat("rope")
    y = m["y"]
    t = t_at(y)
    rail = station(t)["rail"]
    foot_z = rail - 0.4
    x = side_x(t, foot_z) + 0.36
    objs = []
    for s in (-1, 1):
        objs.append(mesh.box("channel", (0.42, 3.8, 0.12), at=(s * (x - 0.16), y, foot_z), mat=parts.mat("hull_dark"),
                             bevel=0.015))
        feet = [Vector((s * x, y - 1.7 + i * 1.1, foot_z)) for i in range(4)]
        head = Vector((s * 0.32, y, m["top"] - 0.1))
        objs += [mesh.rod("shroud", foot, head, 0.03, rope, segments=4, cap=False) for foot in feet]
        z = foot_z + 0.8
        while z < m["top"] - 1.0:
            points = [foot.lerp(head, (z - foot.z) / (head.z - foot.z)) for foot in feet]
            objs += [mesh.rod("ratline", a, b, 0.016, rope, segments=4, cap=False) for a, b in zip(points, points[1:])]
            z += 0.8
        top_head = Vector((s * 0.12, y, m["head"] - 1.4))
        objs += [mesh.rod("topmast_shroud", Vector((s * 1.0, y - 0.6 + i * 0.6, m["top"] + 0.07)), top_head, 0.022, rope,
                          segments=4, cap=False) for i in range(3)]
        aft = t_at(y + 4.0)
        foot = Vector((s * (side_x(aft, station(aft)["rail"]) + 0.1), y + 4.0, station(aft)["rail"]))
        objs.append(mesh.rod("backstay", foot, Vector((s * 0.1, y, m["head"] - 0.6)), 0.03, rope, segments=4, cap=False))
    return objs


def _stays():
    """Forestays to the bowsprit and the mainstays forward to the foremast."""
    rope = parts.mat("rope")
    fore, main = MASTS
    a, b = BOWSPRIT
    fore_foot = Vector((0.0, fore["y"] + 0.6, station(t_at(fore["y"]))["deck"] + 0.4))
    lines = ((Vector((0.0, fore["y"], fore["top"] - 0.1)), a.lerp(b, 0.45)),
             (Vector((0.0, fore["y"], fore["head"] - 0.5)), a.lerp(b, 0.97)),
             (Vector((0.0, main["y"], main["top"] - 0.1)), fore_foot),
             (Vector((0.0, main["y"], main["head"] - 0.5)), Vector((0.0, fore["y"], fore["top"] + 0.4))))
    return [mesh.rod("stay", p, q, 0.04, rope, segments=4, cap=False) for p, q in lines]
