"""bracken: bracken under the copses, broad triangular fronds held level on tall stalks from a creeping root (DESIGN.md
section 18.3); the seed shapes it, three seeds per species. One mesh, one textured material."""

import random

from island import flora, ground


def build(seed=7, exposure=flora.INLAND):
    return ground.bracken(random.Random(seed), "isl_bracken", exposure=exposure)
