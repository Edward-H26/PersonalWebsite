"""grass_mid: a knee-high clump of meadow grass with flowering heads standing over its blades (DESIGN.md section 18.3),
green, or dry and straw-coloured as the _dry variant. One mesh, one textured material."""

import random

from island import flora, ground

HEIGHT, BLADES, HEADS = 0.55, 17, 4
CELLS = {False: ("grass_meadow", "grass_seed"), True: ("grass_dry", "grass_meadow")}
HEAD_CELLS = ("heads_panicle", "heads_spike")


def build(seed=7, dry=False, exposure=flora.INLAND):
    return ground.meadow(random.Random(seed), "isl_grass_mid", HEIGHT, BLADES, HEADS, CELLS[dry], HEAD_CELLS, dry=dry,
                         exposure=exposure)
