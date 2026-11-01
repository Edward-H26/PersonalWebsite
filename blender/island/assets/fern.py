"""fern: a lady fern (DESIGN.md section 13b), a rosette of frond cards arching out from the crown and curling down at
their tips, the young ones in the middle standing more upright; real size, about half again the 3b fern, so it reads
from the path without the old 1.5x exception. One mesh, one textured material."""

import random

from island import flora, ground

FRONDS, LENGTH, RISE = 10, 0.95, 0.35


def build(seed=7, exposure=flora.INLAND, plan=None):
    return ground.fern(random.Random(seed), "isl_fern", FRONDS, LENGTH, RISE, exposure=exposure, plan=plan)
