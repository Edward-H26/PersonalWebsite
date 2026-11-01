"""crate: a slatted wooden crate, 0.82 by 0.41 by 0.35 m, with corner frames and rope handles, the island's crest
stencilled on its lid (DESIGN.md section 13)."""

import math
import random

from mathutils import Matrix

from island import mesh, parts

SIZE = (0.82, 0.41, 0.35)
STENCIL = 0.3


def build(seed=7):
    objs = parts.crate(random.Random(seed), SIZE)
    mark = parts.stencil(STENCIL, "paint_red")
    lid_top = SIZE[2] + 0.02
    objs += mesh.transform([mark], Matrix.Translation((0.0, -STENCIL / 2, lid_top + 0.001)) @ Matrix.Rotation(-math.pi / 2, 4, "X"))
    return mesh.finalize("isl_crate", objs)
