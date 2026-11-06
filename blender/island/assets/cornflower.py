"""cornflower: a clump of cornflowers (DESIGN.md sections 13b and 18.3), slender stems topped by ragged heads round a
darker knot, a tuft of narrow leaves at the foot and a couple of small heads still opening; about half a metre tall.
`variant` picks the colour: blue (cornflower), violet (cornflower_violet) or pink (cornflower_pink). One mesh, one
textured material."""

import random

from island import flora, ground


def build(seed=7, variant="cornflower", exposure=flora.INLAND, plan=None):
    return ground.flowers(random.Random(seed), "isl_cornflower", "cornflower", 8, (0.36, 0.52), 0.26, 6, "leaf_lance", 0.26,
                          exposure=exposure, plan=plan, buds=2, bud_cell=variant + "_side", variant=variant)
