"""rowan: the rowan, a slender smooth grey trunk under an open oval crown of feathery leaves whose cards the site
overlays with berry bunches in late summer (DESIGN.md section 18.3), at its young or mature age or as the wind-
shaped coastal form; the seed grows its skeleton, exposure sets its greens, size and lean. One mesh, one textured
material."""

import random

from island import flora, trees


def build(seed=7, age="mature", coastal=False, exposure=flora.INLAND, plan=None):
    return trees.build(random.Random(seed), trees.form(trees.ROWAN, age, coastal), "isl_rowan", exposure=exposure,
                       plan=plan)
