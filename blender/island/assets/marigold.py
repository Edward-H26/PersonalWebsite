"""marigold: a clump of marigolds (DESIGN.md section 18.3), dense ruffled double heads on short stems over finely cut
leaves. `variant` picks orange (marigold) or yellow (marigold_yellow). One mesh, one textured material."""

import random

from island import flora, ground


def build(seed=7, variant="marigold", exposure=flora.INLAND, plan=None):
    return ground.flowers(random.Random(seed), "isl_marigold", "marigold", 9, (0.12, 0.2), 0.45, 10, "leaf_pinnate", 0.18,
                          exposure=exposure, plan=plan, head_scale=1.4, leaf_tilt=(50.0, 72.0), variant=variant)
