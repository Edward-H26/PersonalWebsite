"""boulder_01: a rounded boulder of slate (DESIGN.md section 13b), longer than it is wide, its beds showing as level
steps, lichen on its faces and a little moss on its crown and lee side. One mesh, one textured material."""

import random

from island import rocks

SIZE = (1.3, 1.85, 1.0)


def build(seed=7, plan=None):
    return rocks.rocks(random.Random(seed), "isl_boulder_01", [(SIZE, (0.0, 0.0), 4, 0.3)], plan=plan, height=SIZE[2])
