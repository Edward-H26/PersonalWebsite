"""tree_stump: the sawn stump of an old oak (DESIGN.md section 13b), a flared foot with roots running into the ground,
end grain and rings on the cut, moss on its seaward foot and a young shoot in leaf from its side. One mesh, one
textured material."""

import random

from island import flora, trees

HEIGHT = 0.7


def build(seed=7, exposure=flora.INLAND, plan=None):
    return trees.stump(random.Random(seed), "isl_tree_stump", exposure=exposure, plan=plan, height=HEIGHT)
