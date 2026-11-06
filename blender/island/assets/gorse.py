"""gorse: coastal gorse, a spiny mound of green shoots gold with pea flowers, its cards in the sprite's own colours
(DESIGN.md section 18.3); the seed shapes it, three seeds per species. One mesh, one textured material."""

import random

from island import flora, trees


def build(seed=7, exposure=flora.INLAND, plan=None):
    return trees.build(random.Random(seed), trees.GORSE, "isl_gorse", exposure=exposure, plan=plan)
