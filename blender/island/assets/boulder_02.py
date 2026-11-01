"""boulder_02: a long, low slate boulder lying along X (DESIGN.md section 13b), bedded into the ground, lichen on its
faces and a little moss on its crown. One mesh, one textured material."""

import random

from island import rocks

SIZE = (2.4, 1.2, 0.85)


def build(seed=7, plan=None):
    return rocks.rocks(random.Random(seed), "isl_boulder_02", [(SIZE, (0.0, 0.0), 4, 0.25)], plan=plan, height=SIZE[2])
