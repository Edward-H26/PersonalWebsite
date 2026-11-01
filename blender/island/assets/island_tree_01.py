"""island_tree_01: the oak (DESIGN.md section 13b), a broad tree of layered leaf clusters on a thick trunk that forks
low into four or five reaching limbs, its roots flaring into the ground. The seed grows its skeleton; exposure,
flora.INLAND in this file and flora.SHORE in _b, sets its greens, its size and how hard the sea wind has leant it.
One mesh, one textured material."""

import random

from island import flora, trees


def build(seed=7, exposure=flora.INLAND, plan=None):
    return trees.build(random.Random(seed), trees.OAK, "isl_island_tree_01", exposure=exposure, plan=plan)
