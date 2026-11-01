"""tree_small: the orchard apple (DESIGN.md section 13b), a short trunk spreading into scaffold limbs under a round
crown of leaf clusters, longer than it is wide like the scanned tree it replaces. Its leaf cards show the apple cell,
which the site overlays with the blossom cell in spring and the fruit cell in late summer. The seed grows its
skeleton; exposure, flora.INLAND in this file and flora.SHORE in _b, sets its greens, its size and its lean. One mesh,
one textured material."""

import random

from island import flora, trees


def build(seed=7, exposure=flora.INLAND, plan=None):
    return trees.build(random.Random(seed), trees.APPLE, "isl_tree_small", exposure=exposure, plan=plan)
