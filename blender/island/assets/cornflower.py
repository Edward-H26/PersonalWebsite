"""cornflower: a clump of cornflowers (DESIGN.md section 13b), slender stems topped by ragged blue heads round a deep
blue knot, a tuft of narrow leaves at the foot and a couple of small heads still opening; about half a metre tall,
one mesh, one textured material."""

import random

from island import flora, ground


def build(seed=7, exposure=flora.INLAND, plan=None):
    return ground.flowers(random.Random(seed), "isl_cornflower", "cornflower", 8, (0.36, 0.52), 0.26, 6, "leaf_lance", 0.26,
                          exposure=exposure, plan=plan, buds=2, bud_cell="cornflower_side")
