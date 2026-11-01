"""barrels: a loose set of five barrels, three standing (one of them open) and two lying on chocks, every closed
head branded with the owner's QH (DESIGN.md section 13)."""

import math
import random

from mathutils import Matrix

from island import mesh, parts

STANDING = ((-1.85, 1.3, False), (-1.2, 1.02, True), (-1.62, 0.42, False))
LYING = ((0.35, -0.55, 0.25), (1.75, -1.0, 1.25))
BELLY = 0.31 + 0.008


def build(seed=7):
    rng = random.Random(seed)
    objs = []
    for x, y, open_top in STANDING:
        objs += mesh.transform(parts.barrel(rng, height=rng.uniform(0.88, 0.93), open_top=open_top, brand=True),
                               mesh.frame((x, y, 0.0)))
    for x, y, yaw in LYING:
        objs += _lying(rng, x, y, yaw)
    return mesh.finalize("isl_barrels", objs)


def _lying(rng, x, y, yaw):
    """A barrel on its side resting on its belly, with a wedge under each end."""
    barrel = parts.barrel(rng, brand=True)
    roll = Matrix.Translation((-0.45, 0.0, BELLY)) @ Matrix.Rotation(math.pi / 2, 4, "Y")
    objs = mesh.transform(barrel, roll)
    for end in (-0.32, 0.32):
        objs.append(mesh.box("chock", (0.08, 0.5, 0.07), at=(end, 0.0, 0.035), mat=parts.mat("timber"), bevel=0.01))
    return mesh.transform(objs, mesh.frame((x, y, 0.0), yaw))
