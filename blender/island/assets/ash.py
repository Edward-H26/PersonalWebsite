"""ash: the ash, a tall clear bole under an open crown of feathered leaves on limbs that arch out and turn up at their
tips (DESIGN.md section 18.3), at its young or mature age or as the wind-shaped coastal form; the seed grows its
skeleton, exposure sets its greens, size and lean. One mesh, one textured material."""

import random

from island import flora, trees


def build(seed=7, age="mature", coastal=False, exposure=flora.INLAND, plan=None):
    return trees.build(random.Random(seed), trees.form(trees.ASH, age, coastal), "isl_ash", exposure=exposure,
                       plan=plan)
