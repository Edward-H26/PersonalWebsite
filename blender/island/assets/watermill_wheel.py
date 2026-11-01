"""watermill_wheel: the watermill's overshot wheel on its own (DESIGN.md section 17), so the site can turn it about its
axle: two spoked rims, sixteen paddles and an oak axle reaching from the house wall to the bearing on the far race
wall, origin at the middle of the axle with the axle along X. watermill.wheel_placement() gives its place and turn
relative to the watermill."""

import random

from island import mesh, parts
from island.assets import watermill


def build(seed=7):
    rng = random.Random(seed)
    wheel = parts.water_wheel(watermill.WHEEL_R, rng, half_width=watermill.WHEEL_HALF_WIDTH,
                              axle=(watermill.AXLE_LENGTH, 0.0))
    return mesh.finalize("isl_watermill_wheel", wheel, ground=False)
