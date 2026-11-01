"""gazania: a clump of marigolds (DESIGN.md section 13b), double amber heads over finely cut leaves, each head a card on
its stem and a card seen from above; the "tall" form lifts the heads higher like the second scanned plant the site
uses. Real size about twice the 3b clump, readable at walk scale on its own. One mesh, one textured material."""

import random

from island import flora, ground

FORMS = {"low": {"heads": 10, "stem": (0.07, 0.11), "spread": 0.55, "leaves": 11, "leaf": 0.17, "tilt": (55.0, 76.0)},
         "tall": {"heads": 8, "stem": (0.1, 0.16), "spread": 0.5, "leaves": 10, "leaf": 0.17, "tilt": (45.0, 68.0)}}


def build(seed=7, form="low", exposure=flora.INLAND, plan=None):
    f = FORMS[form]
    return ground.flowers(random.Random(seed), "isl_gazania", "marigold", f["heads"], f["stem"], f["spread"], f["leaves"],
                          "leaf_pinnate", f["leaf"], exposure=exposure, plan=plan, head_scale=1.6, leaf_tilt=f["tilt"])
