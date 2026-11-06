"""spruce: a Norway spruce for the ridge, a straight trunk to the tip carrying whorls of drooping boughs, its sprays
laid in tiers that narrow to a cone (DESIGN.md section 18.3), at its young or mature age or as the wind-shaped
coastal form; the seed grows its skeleton, exposure sets its greens, size and lean. One mesh, one textured material."""

import random

from island import flora, trees


def build(seed=7, age="mature", coastal=False, exposure=flora.INLAND, plan=None):
    return trees.build(random.Random(seed), trees.form(trees.SPRUCE, age, coastal), "isl_spruce", exposure=exposure,
                       plan=plan)
