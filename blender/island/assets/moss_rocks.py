"""moss_rocks: a mossy rock thick with moss on its crown and down its lee side, two small stones at its foot
(DESIGN.md section 13b). The "long" form draws the group out along Y like the second scanned rock the site uses. One
mesh, one textured material."""

import random

from island import rocks

FORMS = {
    "round": (1.05, [((1.6, 1.5, 1.05), (0.1, 0.0), 4, 0.9), ((0.7, 0.6, 0.45), (-0.75, 0.55), 3, 0.8),
                     ((0.55, 0.5, 0.32), (0.55, -0.7), 3, 0.8)]),
    "long": (1.25, [((1.5, 2.1, 1.25), (0.0, 0.2), 4, 0.9), ((0.75, 0.7, 0.5), (0.45, -1.05), 3, 0.8),
                    ((0.5, 0.55, 0.35), (-0.6, -0.6), 3, 0.8)]),
}


def build(seed=7, form="round", plan=None):
    height, pieces = FORMS[form]
    return rocks.rocks(random.Random(seed), "isl_moss_rocks", pieces, plan=plan, height=height)
