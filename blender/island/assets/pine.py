"""pine: the Scots pine of the ridge and the headland, a tall clean trunk turning orange high up under a flat-topped
crown of level limbs with pads of needles at their ends (DESIGN.md section 18.3), at its young or mature age or as
the wind-shaped coastal form; the seed grows its skeleton, exposure sets its greens, size and lean. One mesh, one
textured material."""

import random

from island import flora, trees


def build(seed=7, age="mature", coastal=False, exposure=flora.INLAND, plan=None):
    return trees.build(random.Random(seed), trees.form(trees.PINE, age, coastal), "isl_pine", exposure=exposure,
                       plan=plan)
