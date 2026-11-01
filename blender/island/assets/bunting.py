"""bunting: one string of twelve swallow-cut flags in alternating Columbia blue and white, hung on a rope with a
slight catenary sag between two iron eyes (DESIGN.md section 9, a scene prop the integration strings between
facades); one mesh, one vertex-coloured material. The eyes sit SPAN apart at the top of the model."""

import math
import random

from mathutils import Vector

from island import mesh, parts

SPAN, SAG, FLAGS = 8.0, 0.55, 12
FLAG = (0.32, 0.42)


def build(seed=7):
    rng = random.Random(seed)
    a, b = Vector((-SPAN / 2, 0.0, 0.0)), Vector((SPAN / 2, 0.0, 0.0))
    line = _catenary(a, b, 24)
    objs = [parts.rope(line, 0.008, sides=4, name="bunting_rope")]
    for end in (a, b):
        objs.append(parts.rope([end + Vector((0.0, 0.035 * math.cos(t), 0.035 * math.sin(t) + 0.035)) for t in
                                (2 * math.pi * k / 6 for k in range(6))], 0.006, key="iron", sides=4, closed=True, name="eye"))
    for k in range(FLAGS):
        u = (k + 0.5) / FLAGS
        top = _catenary(a, b, FLAGS * 8)[round(u * FLAGS * 8)]
        objs.append(_flag(rng, top, ("columbia", "white")[k % 2]))
    return mesh.finalize("isl_bunting", objs, vertex_colors=True)


def _catenary(a, b, samples):
    """Points along a rope hung from a to b that sags SAG at its middle, as a cosh curve."""
    k = 1.6
    return [a.lerp(b, i / samples) - Vector((0.0, 0.0, SAG * (math.cosh(k) - math.cosh(k * (2 * i / samples - 1))) / (math.cosh(k) - 1)))
            for i in range(samples + 1)]


def _flag(rng, top, key):
    """A swallow-cut flag hanging from the rope at `top`, turned a few degrees out of the line like cloth in a
    breeze."""
    w, h = FLAG
    notch = h * 0.72
    swing = math.radians(parts.jitter(rng, 12.0))
    out = Vector((0.0, math.sin(swing), 0.0)) * h * 0.3
    corners = [top + Vector((-w / 2, 0.0, 0.0)), top + Vector((w / 2, 0.0, 0.0)), top + Vector((w / 2, 0.0, -h)) + out,
               top + Vector((0.0, 0.0, -notch)) + out * 0.8, top + Vector((-w / 2, 0.0, -h)) + out]
    bm = parts.bmesh.new()
    verts = [bm.verts.new(c) for c in corners]
    bm.faces.new((verts[0], verts[1], verts[2], verts[3]))
    bm.faces.new((verts[0], verts[3], verts[4]))
    return mesh.from_bmesh("flag", bm, parts.mat(key))
