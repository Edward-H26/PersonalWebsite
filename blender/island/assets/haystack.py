"""haystack: a round hay rick in the fields (DESIGN.md section 17): a straw body that swells a little above its foot
under a steep thatched cap, roughened so the straw catches the light, a rope net over the cap held down by stones
hanging on the rope ends, and a pole through the top. One mesh, one vertex-coloured material, so the site can
instance it."""

import math
import random

from mathutils import Vector

from island import mesh, parts

RADIUS, BODY_H, CAP_H = 1.6, 2.0, 1.7
SEGMENTS, ROPES = 18, 6


def build(seed=7):
    rng = random.Random(seed)
    radius = RADIUS * rng.uniform(0.92, 1.08)
    body_h, cap_h = BODY_H * rng.uniform(0.9, 1.1), CAP_H * rng.uniform(0.9, 1.1)
    objs = [_rick(rng, radius, body_h, cap_h)] + _net(rng, radius, body_h, cap_h)
    tip = Vector((0.0, 0.0, body_h + cap_h - 0.1))
    objs.append(mesh.rod("rick_pole", tip, tip + Vector((parts.jitter(rng, 0.08), parts.jitter(rng, 0.08), 0.75)), 0.04,
                         parts.mat("timber"), segments=5))
    return mesh.finalize("isl_haystack", objs, vertex_colors=True)


def _profile(radius, body_h, cap_h):
    """The rick's outline from foot to apex as (radius, height): a foot drawn in, a swelling body, the eave's overhang
    and the thatched cap."""
    return [(radius * 0.92, 0.0), (radius * 1.0, body_h * 0.35), (radius * 1.04, body_h * 0.75), (radius * 1.12, body_h),
            (radius * 0.98, body_h + 0.08), (radius * 0.72, body_h + cap_h * 0.38), (radius * 0.4, body_h + cap_h * 0.75),
            (0.08, body_h + cap_h)]


def _rick(rng, radius, body_h, cap_h):
    """The straw body and the thatched cap, every ring roughened so the straw reads at walk height."""
    ob = mesh.lathe("rick", _profile(radius, body_h, cap_h), segments=SEGMENTS,
                    mat=[parts.mat("hay"), parts.mat("grass_dry")], band_materials=[0, 0, 0, 1, 1, 1, 1])
    for v in ob.data.vertices:
        r = math.hypot(v.co.x, v.co.y)
        if r > 0.1:
            scale = 1.0 + parts.jitter(rng, 0.035)
            v.co.x *= scale
            v.co.y *= scale
            v.co.z += parts.jitter(rng, 0.03)
    return ob


def _net(rng, radius, body_h, cap_h):
    """Ropes from the apex down over the cap to the eave and hanging on, each weighted by a stone."""
    profile = _profile(radius, body_h, cap_h)
    objs = []
    for k in range(ROPES):
        a = 2 * math.pi * (k + rng.uniform(-0.1, 0.1)) / ROPES
        out = Vector((math.cos(a), math.sin(a), 0.0))
        points = [out * (r + 0.04) + Vector((0.0, 0.0, z)) for r, z in reversed(profile[3:])]
        end = points[-1] + Vector((0.0, 0.0, -0.55)) + out * 0.08
        points.append(end)
        objs.append(parts.rope(points, 0.022, key="rope", sides=4, name="rick_rope"))
        objs.append(parts.blob(rng, rng.uniform(0.12, 0.16), parts.pick(rng, parts.STONE_KEYS), squash=0.85,
                               at=end - Vector((0.0, 0.0, 0.1))))
    return objs
