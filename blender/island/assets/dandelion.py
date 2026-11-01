"""dandelion: a rosette of toothed leaves lying open on the ground with yellow heads on hollow stalks, one gone to a
white seed clock (DESIGN.md section 13b); the "rosette" form is the flat rosette with two heads nestled in it,
like the second scanned plant the site uses. One mesh, one textured material."""

import random

from island import flora, ground

FORMS = {"head": {"heads": 4, "clocks": 1, "stem": (0.16, 0.26), "leaves": 12, "tilt": (62.0, 80.0)},
         "rosette": {"heads": 2, "clocks": 0, "stem": (0.03, 0.045), "leaves": 16, "tilt": (72.0, 84.0)}}


def build(seed=7, form="head", exposure=flora.INLAND, plan=None):
    f = FORMS[form]
    return ground.flowers(random.Random(seed), "isl_dandelion", "dandelion", f["heads"], f["stem"], 0.3, f["leaves"],
                          "leaf_dandelion", 0.2, exposure=exposure, plan=plan, clocks=f["clocks"], leaf_tilt=f["tilt"])
