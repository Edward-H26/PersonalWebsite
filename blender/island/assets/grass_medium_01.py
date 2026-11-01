"""grass_medium_01: a dense round tuft of lawn and meadow grass about as wide as it is tall (DESIGN.md section 13b),
nine blade cards dark at the root and light at the tip, a few dried to straw. One mesh, one textured material."""

import random

from island import flora, ground


def build(seed=7, exposure=flora.INLAND, plan=None):
    return ground.grass(random.Random(seed), "isl_grass_medium_01", 0.42, 0.42, 9, ("grass_lawn", "grass_meadow"),
                        exposure=exposure, plan=plan)
