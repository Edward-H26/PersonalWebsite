"""island_tree_02: the ash (DESIGN.md section 13b), a tall clear bole under an open, airy crown of feathered leaf
sprays on limbs that arch out and turn up at their tips, kept as broad as the scanned tree it replaces. The seed grows
its skeleton; exposure, flora.INLAND in this file and flora.SHORE in _b, sets its greens, its size and its lean. One
mesh, one textured material."""

import random

from island import flora, trees


def build(seed=7, exposure=flora.INLAND, plan=None):
    return trees.build(random.Random(seed), trees.ASH, "isl_island_tree_02", exposure=exposure, plan=plan)
