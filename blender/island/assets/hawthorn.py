"""hawthorn: a hawthorn bush for hedgerows and field edges, crooked stems from one foot spreading into a dense mound of
small lobed leaves, leafy down to the ground (DESIGN.md section 18.3); the seed shapes it, three seeds per species.
One mesh, one textured material."""

import random

from island import flora, trees


def build(seed=7, exposure=flora.INLAND, plan=None):
    return trees.build(random.Random(seed), trees.HAWTHORN, "isl_hawthorn", exposure=exposure, plan=plan)
