"""grass_bermuda: a young tuft of fine grass, a few narrow blades standing almost upright, taller than it is wide
(DESIGN.md section 13b); real size twice the 3b tuft, so it reads without the old 2x exception. One mesh, one
textured material."""

import random

from island import flora, ground


def build(seed=7, exposure=flora.INLAND, plan=None):
    return ground.grass(random.Random(seed), "isl_grass_bermuda", 0.3, 0.14, 6, ("grass_lawn",), exposure=exposure,
                        plan=plan, lean=(1.0, 8.0), spread=0.08, dry=0.05, bend=0.05)
