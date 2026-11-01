"""grass_medium_02: a tuft of meadow grass with seed heads standing above it (DESIGN.md section 13b); the "sprig" form
is a smaller, more upright tuft like the second scanned clump the site uses. One mesh, one textured material."""

import random

from island import flora, ground

FORMS = {"tuft": (0.56, 0.6, 11, ("grass_meadow", "grass_seed"), (4.0, 18.0)),
         "sprig": (0.5, 0.36, 7, ("grass_seed", "grass_lawn"), (2.0, 10.0))}


def build(seed=7, form="tuft", exposure=flora.INLAND, plan=None):
    height, width, count, cells, lean = FORMS[form]
    return ground.grass(random.Random(seed), "isl_grass_medium_02", height, width, count, cells, exposure=exposure,
                        plan=plan, lean=lean)
