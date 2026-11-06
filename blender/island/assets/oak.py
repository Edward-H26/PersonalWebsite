"""oak: the pedunculate oak of the copses and the ring, broad and layered on a thick trunk that forks low into reaching
limbs (DESIGN.md section 18.3), at its young or mature age or as the wind-shaped coastal form; the seed grows its
skeleton, exposure sets its greens, size and lean. One mesh, one textured material."""

import random

from island import flora, trees


def build(seed=7, age="mature", coastal=False, exposure=flora.INLAND, plan=None):
    return trees.build(random.Random(seed), trees.form(trees.OAK, age, coastal), "isl_oak", exposure=exposure,
                       plan=plan)
