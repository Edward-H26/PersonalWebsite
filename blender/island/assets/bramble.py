"""bramble: a bramble thicket, prickly canes arching out from its middle to root at its rim with leaves, flowers and
blackberries along them, in the sprite's own colours (DESIGN.md section 18.3); the seed shapes it, three seeds per
species. One mesh, one textured material."""

import random

from island import flora, trees


def build(seed=7, exposure=flora.INLAND):
    return trees.bramble(random.Random(seed), "isl_bramble", exposure=exposure)
