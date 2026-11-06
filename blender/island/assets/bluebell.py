"""bluebell: a clump of bluebells under the copses (DESIGN.md section 18.3), strap leaves and arching stems hung along
one side with narrow bells, each stem a pair of crossed cards. `variant` picks blue (bluebell), white
(bluebell_white) or pink (bluebell_pink). One mesh, one textured material."""

import random

from island import flora, ground


def build(seed=7, variant="bluebell", exposure=flora.INLAND):
    return ground.spikes(random.Random(seed), "isl_bluebell", variant, "leaf_bluebell", 3, (0.3, 0.42), 5, 0.32,
                         exposure=exposure)
