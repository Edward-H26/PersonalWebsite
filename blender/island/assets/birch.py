"""birch: a silver birch for the shore and the copse edges, a slender white trunk with dark lenticels and a black foot
under a light crown of hanging twigs (DESIGN.md section 18.3), at its young or mature age or as the wind-shaped
coastal form; the seed grows its skeleton, exposure sets its greens, size and lean. One mesh, one textured material."""

import random

from island import flora, trees


def build(seed=7, age="mature", coastal=False, exposure=flora.INLAND, plan=None):
    return trees.build(random.Random(seed), trees.form(trees.BIRCH, age, coastal), "isl_birch", exposure=exposure,
                       plan=plan)
