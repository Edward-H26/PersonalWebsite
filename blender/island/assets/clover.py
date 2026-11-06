"""clover: a patch of white clover (DESIGN.md section 18.3), trefoil leaves held level just above the ground and
round white heads on short stalks over them. One mesh, one textured material."""

import random

from island import flora, ground


def build(seed=7, exposure=flora.INLAND):
    return ground.clover(random.Random(seed), "isl_clover", exposure=exposure)
