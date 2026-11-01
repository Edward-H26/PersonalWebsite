"""shrine: a wayside shrine on the road out of the village (DESIGN.md section 17), the Alsatian kind: a chamfered
pillar of honey stone on two worn steps carries a stone niche under a small roof of stone tiles; the brand lantern
stands lit in the niche against its smoke-dark back, the island's crest is carved in the gable over it, and a pot of
blue and red flowers sits on the lower step."""

import math
import random

from island import mesh, parts

STEPS = ((0.92, 0.17), (0.64, 0.15))
SHAFT, SHAFT_TOP = (0.3, 0.27), 1.38
NICHE_W, NICHE_D, NICHE_H, WALL = 0.58, 0.44, 0.64, 0.07
PITCH = 45.0


def build(seed=7):
    rng = random.Random(seed)
    floor = SHAFT_TOP + 0.08
    objs = _base(rng) + _niche(rng, floor) + _roof(rng, floor + NICHE_H) + _flowers(rng)
    objs += mesh.transform(parts.lantern(size=0.62, hook=False), mesh.frame((0.0, 0.02, floor)))
    parts.lean(objs, 0.0, parts.jitter(rng, 0.6), "X")
    return mesh.finalize("isl_shrine", objs)


def _octagon(half, z, c):
    return [(x, y, z) for x, y in ((-half + c, -half), (half - c, -half), (half, -half + c), (half, half - c),
                                   (half - c, half), (-half + c, half), (-half, half - c), (-half, -half + c))]


def _base(rng):
    """Two worn steps, the chamfered shaft tapering a little and the capital slab the niche stands on."""
    objs, z = [], 0.0
    for (width, rise), key in zip(STEPS, ("stone_honey_light", "stone_honey")):
        step = parts._worn_step(width, width, z, z + rise, 0.02 * rng.uniform(0.7, 1.2), key)
        step.location = (parts.jitter(rng, 0.015), width / 2, 0.0)
        objs.append(step)
        z += rise
    objs.append(mesh.loft("shrine_shaft", [_octagon(SHAFT[0] / 2, z, 0.035), _octagon(SHAFT[1] / 2, SHAFT_TOP, 0.03)],
                          mat=parts.mat("stone_honey")))
    objs.append(mesh.box("shrine_capital", (NICHE_W + 0.08, NICHE_D + 0.08, 0.08), at=(0.0, 0.0, SHAFT_TOP), origin="bottom",
                         mat=parts.mat("stone_honey_light"), bevel=0.012))
    return objs


def _niche(rng, floor):
    """The niche: back and side walls of dressed stone, a lintel over the open front and the gable above it with
    the crest carved on its face."""
    honey = parts.mat("stone_honey")
    x, y = NICHE_W / 2 - WALL / 2, NICHE_D / 2 - WALL / 2
    objs = [mesh.box("niche_back", (NICHE_W, WALL, NICHE_H), at=(0.0, y, floor), origin="bottom", mat=honey),
            mesh.box("niche_lintel", (NICHE_W, WALL + 0.02, 0.09), at=(0.0, -y, floor + NICHE_H - 0.09), origin="bottom",
                     mat=parts.mat("stone_honey_light"), bevel=0.01)]
    objs += [mesh.box("niche_side", (WALL, NICHE_D, NICHE_H), at=(s * x, 0.0, floor), origin="bottom", mat=honey)
             for s in (-1, 1)]
    # A smoke-dark back panel behind the lantern makes its light read from the road.
    objs.append(mesh.box("niche_soot", (NICHE_W - 2 * WALL, 0.01, NICHE_H - 0.12), at=(0.0, y - WALL / 2 - 0.005, floor),
                         origin="bottom", mat=parts.mat("stone_dark")))
    rise = NICHE_W / 2 * math.tan(math.radians(PITCH))
    objs.append(mesh.prism("niche_gable", NICHE_W, rise, WALL, at=(0.0, -y, floor + NICHE_H), mat=parts.mat("stone_honey_light")))
    objs += mesh.transform(parts.crest(rise * 0.82, 0.012), mesh.frame((0.0, -y - WALL / 2, floor + NICHE_H + 0.02)))
    return objs


def _roof(rng, z):
    """Stone tiles on a small gable roof with its ridge running back from the carved gable, and an iron finial."""
    length = NICHE_D + 0.04
    roof = parts.gable_roof(length, NICHE_W, PITCH, rng, keys=parts.STONE_SLATE_KEYS, eave=0.08, gable=0.07, exposure=0.12,
                            thickness=0.02, run=(0.12, 0.22), missing=0.0, rafters=0, barges=(False, False),
                            ridge_key="stone_honey_light")
    objs = mesh.transform(roof, mesh.frame((0.0, -length / 2, z), math.pi / 2))
    ridge = z + NICHE_W / 2 * math.tan(math.radians(PITCH)) + 0.07
    objs.append(parts.blob(rng, 0.035, "iron", squash=1.0, at=(0.0, -length / 2 - 0.03, ridge)))
    return objs


def _flowers(rng):
    """A terracotta pot on the lower step with blue and red flowers over a few leaves."""
    pot = mesh.lathe("flower_pot", [(0.07, 0.0), (0.1, 0.15), (0.115, 0.155), (0.115, 0.17), (0.095, 0.17), (0.09, 0.15)],
                     segments=10, mat=parts.mat("tile"))
    pot.location = (0.27, -0.33, STEPS[0][1])
    objs = [pot]
    top = pot.location.z + 0.16
    for k in range(7):
        a = 2 * math.pi * k / 7 + rng.uniform(-0.3, 0.3)
        r = rng.uniform(0.02, 0.07)
        at = (pot.location.x + r * math.cos(a), pot.location.y + r * math.sin(a), top + rng.uniform(0.02, 0.09))
        key = ("hydrangea_deep", "paint_red", "columbia")[k % 3] if k < 5 else "leaf"
        objs.append(parts.blob(rng, rng.uniform(0.03, 0.045), key, at=at))
    return objs
