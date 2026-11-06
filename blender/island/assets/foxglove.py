"""foxglove: a foxglove (DESIGN.md section 18.3), a rosette of broad soft leaves and tall one-sided spikes of drooping
bells, each spike a pair of crossed cards. `variant` picks purple (foxglove), pink (foxglove_pink) or white
(foxglove_white). One mesh, one textured material."""

import random

from island import flora, ground


def build(seed=7, variant="foxglove", exposure=flora.INLAND):
    return ground.spikes(random.Random(seed), "isl_foxglove", variant, "leaf_foxglove", 2, (1.0, 1.4), 7, 0.42,
                         exposure=exposure)
