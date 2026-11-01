"""sea_marker: a red lateral buoy, a conical body on a float with an iron cage and a lantern on top. The waterline
is Z = 0 and the float reaches 1.12 m below it, like the original."""

import math

from island import mesh, parts, style

DRAFT = 1.12
CAGE = (3.35, 4.85)


def build(seed=7):
    with style.weathered():
        return _build()


def _build():
    objs = _float() + _body() + _cage()
    objs += mesh.transform(parts.lantern(size=1.28), mesh.frame((0.0, 0.0, CAGE[1] + 0.02)))
    return mesh.finalize("isl_sea_marker", objs, ground=False)


def _float():
    profile = [(0.9, -DRAFT), (1.38, -0.8), (1.5, -0.25), (1.5, 0.32), (1.36, 0.5), (0.95, 0.6)]
    hull = mesh.lathe("buoy_float", profile, segments=16, mat=[parts.mat("hull_dark"), parts.mat("paint_red")],
                      band_materials=[0, 0, 1, 1, 1])
    ring = [(1.53 * math.cos(a), 1.53 * math.sin(a), 0.12) for a in (2 * math.pi * k / 16 for k in range(16))]
    return [hull, parts.rope(ring, 0.06, key="iron", sides=4, closed=True, name="buoy_fender")]


def _body():
    profile = [(0.88, 0.58), (0.4, 3.1), (0.34, CAGE[0])]
    body = mesh.lathe("buoy_body", profile, segments=12, mat=parts.mat("paint_red"), cap_bottom=False)
    straps = []
    for z in (1.15, 2.2):
        r = 0.88 + (0.4 - 0.88) * (z - 0.58) / (3.1 - 0.58) + 0.012
        ring = [(r * math.cos(a), r * math.sin(a), z) for a in (2 * math.pi * k / 12 for k in range(12))]
        straps.append(parts.rope(ring, 0.022, key="iron", sides=4, closed=True, name="buoy_strap"))
    return [body] + straps


def _cage():
    """Four splayed legs, two rings and diagonal braces carrying the lantern."""
    iron = parts.mat("iron")
    bottom, top = CAGE
    objs = []
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        foot = (0.3 * math.cos(a), 0.3 * math.sin(a), bottom - 0.05)
        head = (0.42 * math.cos(a), 0.42 * math.sin(a), top)
        objs.append(mesh.rod("cage_leg", foot, head, 0.035, iron, segments=6))
        b = a + math.pi / 2
        objs.append(mesh.rod("cage_brace", foot, (0.42 * math.cos(b), 0.42 * math.sin(b), top - 0.05), 0.02, iron, segments=4))
    for z, r in ((bottom + 0.55, 0.35), (top, 0.43)):
        ring = [(r * math.cos(a), r * math.sin(a), z) for a in (2 * math.pi * k / 16 for k in range(16))]
        objs.append(parts.rope(ring, 0.028, key="iron", sides=4, closed=True, name="cage_ring"))
    objs.append(mesh.cylinder("cage_deck", 0.48, 0.05, at=(0.0, 0.0, top - 0.03), mat=iron, segments=12))
    return objs
