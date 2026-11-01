"""cypress: the Italian cypress, still the island's vertical accent (DESIGN.md section 13b): a short fibrous trunk
under a dense column of scale foliage that swells low and draws in to a point, carved in upright lobes, textured, its
outline broken by standing sprays. Exposure, flora.INLAND in this file and flora.SHORE in _b, sets its greens, its
size, its lean and how far its tip bends landward. One mesh, one textured material."""

import random

from island import flora, trees


def build(seed=7, exposure=flora.INLAND, plan=None):
    return trees.cypress(random.Random(seed), "isl_cypress", exposure=exposure, plan=plan)
