"""poppy: a clump of field poppies (DESIGN.md section 13b), scarlet cupped heads with black blotches on hairy stems,
two buds still nodding, over cut leaves; about sixty centimetres tall, one mesh, one textured material."""

import random

from island import flora, ground


def build(seed=7, exposure=flora.INLAND, plan=None):
    return ground.flowers(random.Random(seed), "isl_poppy", "poppy", 6, (0.38, 0.56), 0.3, 8, "leaf_pinnate", 0.26,
                          exposure=exposure, plan=plan, buds=2, bud_cell="poppy_bud")
