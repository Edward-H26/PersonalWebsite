"""grass_tall: a tall clump of rough meadow grass, long blades bowing over under nodding and spiked heads (DESIGN.md
section 18.3), green, or dry and straw-coloured as the _dry variant. One mesh, one textured material."""

import random

from island import flora, ground

HEIGHT, BLADES, HEADS = 0.9, 18, 5
CELLS = {False: ("grass_tall", "grass_meadow"), True: ("grass_dry", "grass_tall")}
HEAD_CELLS = ("heads_nodding", "heads_panicle", "heads_spike")


def build(seed=7, dry=False, exposure=flora.INLAND):
    return ground.meadow(random.Random(seed), "isl_grass_tall", HEIGHT, BLADES, HEADS, CELLS[dry], HEAD_CELLS, dry=dry,
                         exposure=exposure)
