"""grass_short: a short tuft of fine meadow grass a hand high with a few spikes of seed standing out of it (DESIGN.md
section 18.3), green, or dry and straw-coloured as the _dry variant. One mesh, one textured material."""

import random

from island import flora, ground

HEIGHT, BLADES, HEADS = 0.28, 16, 3
CELLS = {False: ("grass_lawn",), True: ("grass_dry", "grass_lawn")}
HEAD_CELLS = ("heads_spike",)


def build(seed=7, dry=False, exposure=flora.INLAND):
    return ground.meadow(random.Random(seed), "isl_grass_short", HEIGHT, BLADES, HEADS, CELLS[dry], HEAD_CELLS, dry=dry,
                         exposure=exposure)
