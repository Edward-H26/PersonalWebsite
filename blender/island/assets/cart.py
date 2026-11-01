"""cart: a two-wheeled hand cart with spoked iron-tyred wheels, a load of sacks lashed down with rope and a striped
canopy on four poles like the market cart it replaces, its shafts resting on a prop leg, and a small Columbia blue
and white pennant tied to the front corner pole, flying forward under the canopy's edge so the cart keeps its height
and footprint (DESIGN.md section 13)."""

import math
import random

from mathutils import Matrix, Vector

from island import mesh, parts

HOIST = Vector((0.5, -0.5, 1.42))


def build(seed=7):
    rng = random.Random(seed)
    flag = parts.pennant(0.4, 0.17, rng)
    objs = parts.hand_cart(rng, canopy=True) + mesh.transform(flag, Matrix.Translation(HOIST) @ Matrix.Rotation(-math.pi / 2, 4, "Z"))
    return mesh.finalize("isl_cart", objs)
