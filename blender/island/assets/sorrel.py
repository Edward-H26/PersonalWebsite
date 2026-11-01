"""sorrel: a small clump of wood sorrel (DESIGN.md section 13b), trefoil leaves of three heart-shaped leaflets held
level on slender stalks, with a few small white flowers among them; about a third larger than the 3b clump. One mesh,
one textured material."""

import random

from island import flora, ground


def build(seed=7, exposure=flora.INLAND, plan=None):
    return ground.trefoils(random.Random(seed), "isl_sorrel", 16, 0.2, 0.11, 4, exposure=exposure, plan=plan)
