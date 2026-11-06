"""box: wild box, a dense rounded evergreen shrub of many stems from the ground with small glossy leaves (DESIGN.md
section 18.3); the seed shapes it, three seeds per species. One mesh, one textured material."""

import random

from island import flora, trees


def build(seed=7, exposure=flora.INLAND, plan=None):
    return trees.build(random.Random(seed), trees.BOX, "isl_box", exposure=exposure, plan=plan)
