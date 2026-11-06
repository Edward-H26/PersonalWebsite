"""apple: the orchard apple, a short trunk spreading into scaffold limbs under a round crown whose cards the site
overlays with blossom in spring and fruit in late summer (DESIGN.md section 18.3), at its young or mature age or as
the wind-shaped coastal form; the seed grows its skeleton, exposure sets its greens, size and lean. One mesh, one
textured material."""

import random

from island import flora, trees


def build(seed=7, age="mature", coastal=False, exposure=flora.INLAND, plan=None):
    return trees.build(random.Random(seed), trees.form(trees.APPLE, age, coastal), "isl_apple", exposure=exposure,
                       plan=plan)
