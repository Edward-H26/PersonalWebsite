"""fire_pit: a ring of rough Cotswold stones (DESIGN.md section 10) round a bed of ash, a patch of embers glowing in
the lantern amber with lumps of charcoal on it, and three charred oak logs leaning together over the middle, burning
at their inner ends (DESIGN.md section 13); the glow is a material of its own, isl_hearth_glow."""

import math
import random

from mathutils import Matrix

from island import mesh, parts, style

STONES, RING, EMBERS = 10, 0.62, 0.27
LOG_TOP, LOG_FOOT = 0.33, 0.47


def build(seed=7):
    rng = random.Random(seed)
    objs = _ring(rng) + _hearth(rng) + _logs(rng)
    return mesh.finalize("isl_fire_pit", objs)


def _ring(rng):
    objs = []
    for k in range(STONES):
        a = 2 * math.pi * (k + parts.jitter(rng, 0.12)) / STONES
        stone = parts.rock(rng, (rng.uniform(0.36, 0.44), rng.uniform(0.26, 0.32), rng.uniform(0.2, 0.29)),
                           key=parts.pick(rng, parts.HONEY_KEYS))
        objs += mesh.transform([stone], mesh.frame(parts.ring_point(RING + parts.jitter(rng, 0.03), a, 0.0), a))
    return objs


def _hearth(rng):
    """Ash heaped a little in the middle, an irregular patch of embers glowing on it and black lumps of charcoal."""
    objs = [mesh.cylinder("ash", RING - 0.1, 0.06, mat=parts.mat("driftwood"), segments=16, radius_top=RING - 0.24)]
    rim = [(EMBERS * rng.uniform(0.7, 1.1) * math.cos(2 * math.pi * k / 12), EMBERS * rng.uniform(0.7, 1.1) * math.sin(2 * math.pi * k / 12))
           for k in range(12)]
    patch = mesh.polygon("embers", rim, 0.015, at=(0.0, 0.0, 0.055), mat=style.hearth_glow())
    objs.append(patch)
    for i in range(5):
        a, r = rng.uniform(0.0, 2 * math.pi), rng.uniform(0.12, 0.3)
        objs.append(parts.blob(rng, rng.uniform(0.03, 0.045), "iron", at=(r * math.cos(a), r * math.sin(a), 0.07)))
    return objs


def _logs(rng):
    """Three logs leaning in to meet over the embers, their inner ends glowing."""
    objs = []
    for k in range(3):
        a = 2 * math.pi * k / 3 + parts.jitter(rng, 0.25)
        radius = rng.uniform(0.06, 0.075)
        rise, run = LOG_TOP - LOG_FOOT * 0.18, LOG_FOOT
        tilt = math.atan2(rise, run)
        length = math.hypot(rise, run) + 0.12
        log = parts.log(rng, length, radius, bark="timber_dark", ends=(style.hearth_glow(), "plank"))
        centre = parts.ring_point(run / 2 + 0.02, a, LOG_FOOT * 0.09 + rise / 2 + radius)
        objs += mesh.transform([log], Matrix.Translation(centre) @ Matrix.Rotation(a - math.pi / 2, 4, "Z")
                               @ Matrix.Rotation(tilt, 4, "Y"))
    return objs
