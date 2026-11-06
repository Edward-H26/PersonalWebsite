"""poppy: a clump of field poppies (DESIGN.md sections 13b and 18.3), cupped heads with dark blotches on hairy stems,
two buds still nodding, over cut leaves; about sixty centimetres tall. `variant` picks the colour: scarlet (poppy),
orange (poppy_orange) or the pink Shirley poppy (poppy_pink). One mesh, one textured material."""

import random

from island import flora, ground


def build(seed=7, variant="poppy", exposure=flora.INLAND, plan=None):
    return ground.flowers(random.Random(seed), "isl_poppy", "poppy", 6, (0.38, 0.56), 0.3, 8, "leaf_pinnate", 0.26,
                          exposure=exposure, plan=plan, buds=2, bud_cell="poppy_bud", variant=variant)
