"""lobster_pots: creels stacked on the quay (DESIGN.md section 17): four traditional pots, each a plank base under three
bent hoops with a hemp net stretched over them and a funnel ring at one end, two side by side, one across their tops
and one leant against them, beside a dan buoy, a cork float on a pole flying a small Columbia pennant, and a coil of
rope. One mesh, the vertex-coloured props' material."""

import math
import random

from mathutils import Matrix, Vector

from island import mesh, parts, style

POT = (0.62, 0.44, 0.34)  # length, width, height
HOOPS, HOOP_STEPS = 3, 8


def build(seed=7):
    rng = random.Random(seed)
    with style.weathered():
        objs = []
        for at, turn, tilt in (((-0.35, 0.0, 0.0), 0.0, 0.0), ((0.35, 0.02, 0.0), 0.04, 0.0), ((0.0, 0.0, POT[2] + 0.04), math.pi / 2, 0.0),
                               ((1.0, 0.08, 0.17), 0.1, -62.0)):
            pot = _pot(rng)
            place = Matrix.Translation(at) @ Matrix.Rotation(turn, 4, "Z") @ Matrix.Rotation(math.radians(tilt), 4, "Y")
            objs += mesh.transform(pot, place)
        objs += _buoy(rng) + mesh.transform(parts.rope_coil(radius=0.28, turns=2.5, thickness=0.02, sides=4), mesh.frame((-0.75, -0.65, 0.0)))
    return mesh.finalize("isl_lobster_pots", objs)


def _hoop(x, scale=1.0):
    """The points of a hoop across the pot at x: a half ellipse over the base."""
    length, width, height = POT
    return [Vector((x, -width / 2 * scale * math.cos(math.pi * k / HOOP_STEPS), height * scale * math.sin(math.pi * k / HOOP_STEPS) + 0.03))
            for k in range(HOOP_STEPS + 1)]


def _pot(rng):
    """One creel standing on its base, centred on the origin, long along X."""
    length, width, height = POT
    objs = [mesh.box("pot_base", (length, width, 0.03), origin="bottom", mat=parts.mat("plank"))]
    xs = [-length / 2 + 0.02 + (length - 0.04) * i / (HOOPS - 1) for i in range(HOOPS)]
    for x in xs:
        objs.append(parts.rope(_hoop(x), 0.014, key="timber", sides=4, name="pot_hoop"))
    rings = [[tuple(p) for p in _hoop(x, 0.985)] for x in (xs[0], 0.0, xs[-1])]
    objs.append(mesh.loft("pot_net", rings, mat=[parts.mat("rope"), parts.mat("canvas_dark")],
                          band_materials=[k % 2 for k in range(HOOP_STEPS)]))
    eye = [Vector((xs[-1] + 0.01, 0.07 * math.cos(a), height * 0.5 + 0.07 * math.sin(a))) for a in
           (2 * math.pi * k / 10 for k in range(10))]
    objs.append(parts.rope(eye, 0.012, key="timber", sides=4, closed=True, name="pot_funnel"))
    objs[0].rotation_euler = (0.0, 0.0, math.radians(parts.jitter(rng, 2.0)))
    return objs


def _buoy(rng):
    """The dan buoy laid against the stack: a cork float, its pole and the pennant at the top."""
    foot = Vector((0.75, -0.55, 0.0))
    top = foot + Vector((-0.35, 0.2, 1.55))
    objs = [mesh.rod("buoy_pole", foot, top, 0.025, parts.mat("timber"), segments=5)]
    float_at = foot.lerp(top, 0.18)
    objs.append(mesh.cylinder("buoy_float", 0.17, 0.26, at=float_at, segments=8, mat=parts.mat("paint_red"), origin="center"))
    objs.append(mesh.cylinder("buoy_band", 0.175, 0.07, at=float_at + Vector((0.0, 0.0, 0.08)), segments=8, mat=parts.mat("white"),
                              origin="center"))
    objs += mesh.transform(parts.pennant(0.42, 0.2, rng), mesh.frame(top - Vector((0.0, 0.0, 0.22))))
    return objs
