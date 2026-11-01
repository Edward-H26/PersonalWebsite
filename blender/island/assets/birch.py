"""birch: a silver birch for the shore (DESIGN.md section 13b), a slender white trunk with dark lenticels and a black
foot, under a light crown of hanging twigs; the seed grows its skeleton, exposure sets its greens, size and lean
(birch_b stands at flora.SHORE). One mesh, one textured material."""

import random

from island import flora, trees


def build(seed=7, exposure=flora.INLAND, plan=None):
    return trees.build(random.Random(seed), trees.BIRCH, "isl_birch", exposure=exposure, plan=plan)
