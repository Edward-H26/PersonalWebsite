"""spruce: a Norway spruce for the ridge (DESIGN.md section 13b), a straight trunk to the tip carrying whorls of
drooping boughs, its sprays laid in tiers that narrow to a cone; the seed grows its skeleton, exposure sets its
greens, size and lean (spruce_b stands at flora.SHORE, as on an exposed ridge). One mesh, one textured material."""

import random

from island import flora, trees


def build(seed=7, exposure=flora.INLAND, plan=None):
    return trees.build(random.Random(seed), trees.SPRUCE, "isl_spruce", exposure=exposure, plan=plan)
