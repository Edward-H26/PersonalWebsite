"""daisy: a clump of ox-eye daisies (DESIGN.md section 13b), white rays round yellow discs on wiry stems over a tuft
of narrow leaves; about half a metre tall, one mesh, one textured material."""

import random

from island import flora, ground


def build(seed=7, exposure=flora.INLAND, plan=None):
    return ground.flowers(random.Random(seed), "isl_daisy", "daisy", 7, (0.3, 0.46), 0.3, 6, "leaf_lance", 0.22,
                          exposure=exposure, plan=plan)
