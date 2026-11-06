"""willow: the white willow by the stream, a short thick leaning trunk splitting into climbing limbs whose long twigs
hang with narrow silvery leaves (DESIGN.md section 18.3), at its young or mature age or as the wind-shaped coastal
form; the seed grows its skeleton, exposure sets its greens, size and lean. One mesh, one textured material."""

import random

from island import flora, trees


def build(seed=7, age="mature", coastal=False, exposure=flora.INLAND, plan=None):
    return trees.build(random.Random(seed), trees.form(trees.WILLOW, age, coastal), "isl_willow", exposure=exposure,
                       plan=plan)
