"""buttercup: a clump of meadow buttercups (DESIGN.md section 18.3), glossy cupped heads on branching stems over
deeply cut leaves. `variant` picks golden (buttercup) or pale lemon (buttercup_lemon). One mesh, one textured
material."""

import random

from island import flora, ground


def build(seed=7, variant="buttercup", exposure=flora.INLAND, plan=None):
    return ground.flowers(random.Random(seed), "isl_buttercup", "buttercup", 9, (0.28, 0.46), 0.3, 6, "leaf_buttercup", 0.24,
                          exposure=exposure, plan=plan, variant=variant)
