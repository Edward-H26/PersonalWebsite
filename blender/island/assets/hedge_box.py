"""hedge_box: clipped box for doors and paths (DESIGN.md section 13b): a ball, or with form "cube" a block with softened
edges and a flat top, its clipped surface textured with dense evergreen foliage and lightly covered in small box
sprays; real size, one mesh, one textured material. The site gets the ball as hedge_box and the cube as
hedge_box_b."""

import random

from island import flora, trees

FORMS = {"ball": (0.7, 0.7, 0.66), "cube": (0.6, 0.6, 0.6)}


def build(seed=7, form="ball", exposure=flora.INLAND):
    return trees.box_bush(random.Random(seed), "isl_hedge_box", form, FORMS[form], exposure)
