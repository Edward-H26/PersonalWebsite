"""fence: one roadside fence piece, two posts with weathered pointed tops and three split rails kinked a little
along their length. The site lays the pieces end to end, so the piece keeps the original's width to height and one
vertex-coloured material to stay instanceable. With hook=True (fence_b) the right-hand post carries an iron lantern
hook below its top, its eye at HOOK_EYE, for the road lanterns: the site lays fence_b as every third piece
(DESIGN.md section 13)."""

import math
import random

from island import mesh, parts

WIDTH, POST_HEIGHT, POST = 2.3, 0.9, 0.085
HOOK_EYE = (WIDTH / 2 - 0.12, -0.25, 0.72)
RAILS = (0.22, 0.48, 0.74)
RAIL_SECTION = ((-0.026, -0.055), (0.028, -0.05), (0.033, 0.034), (0.003, 0.062), (-0.033, 0.042))


def build(seed=7, hook=False):
    rng = random.Random(seed)
    objs = [_post(rng, x) for x in (-WIDTH / 2 + 0.12, WIDTH / 2 - 0.12)]
    objs += [_rail(rng, z) for z in RAILS]
    if hook:
        objs += _hook()
    return mesh.finalize("isl_fence", objs, vertex_colors=True)


def _hook():
    """A forged strap on the post's face, an arm out along -Y with a drop at its end and the eye a lantern hangs from."""
    iron = parts.mat("iron")
    x, y, z = HOOK_EYE
    face = -POST / 2
    eye = [(x, y + 0.03 * math.sin(2 * math.pi * k / 8), z - 0.03 + 0.03 * math.cos(2 * math.pi * k / 8)) for k in range(8)]
    return [mesh.box("hook_strap", (0.035, 0.012, 0.26), at=(x, face - 0.006, z - 0.02), origin="bottom", mat=iron),
            mesh.rod("hook_arm", (x, face, z + 0.2), (x, y, z + 0.2), 0.012, iron, segments=4),
            mesh.rod("hook_drop", (x, y, z + 0.2), (x, y, z), 0.01, iron, segments=4),
            parts.rope(eye, 0.007, key="iron", sides=4, closed=True, name="hook_eye")]


def _post(rng, x):
    """A square post narrowing to a blunt point, leaning a fraction of a degree; every post stands the same height so
    pieces with and without the hook fit to the same scale."""
    h = POST_HEIGHT
    s = POST / 2

    def square(half, z):
        return [(cx * half, cy * half, z) for cx, cy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]

    ob = mesh.loft("fence_post", [square(s, 0.0), square(s, h), square(0.006, h + 0.07)], mat=parts.mat("timber"))
    ob.location = (x, 0.0, 0.0)
    ob.rotation_euler = (math.radians(parts.jitter(rng, 0.3)), math.radians(parts.jitter(rng, 1.0)),
                         math.radians(parts.jitter(rng, 5.0)))
    return ob


def _rail(rng, z):
    """A split rail with an uneven five-sided section, kinked where it passes the middle of the piece."""
    xs = (-WIDTH / 2, parts.jitter(rng, 0.25), WIDTH / 2)
    rings = []
    for x in xs:
        dy, dz = parts.jitter(rng, 0.006), z + parts.jitter(rng, 0.015)
        rings.append([(x, y + dy, zz + dz) for y, zz in RAIL_SECTION])
    return mesh.loft("fence_rail", rings, mat=parts.mat("timber"))
