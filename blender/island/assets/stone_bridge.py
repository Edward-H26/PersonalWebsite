"""stone_bridge: the humpback bridge that carries the ring road over the stream's mouth between the beach and the quay
(DESIGN.md section 17), in the honey stone of the village. The terrain humps the ring over the stream and the deck
follows that road surface exactly; under it two round segmental arches spring from just below the water either side of
a central pier whose pointed cutwaters part the stream, the arches' voussoirs standing proud of the rough stone courses
on both faces. Parapets with a coping follow the deck and end in squared posts where the cut and fill has brought the
ground up to the road. Its origin is the bridge anchor of heightmap.py on the ground there (the stream's bed) and it is
laid along the ring, so the site sets it down with no turn."""

import functools
import math
import random

import numpy as np
from mathutils import Matrix, Vector

from island import heightmap as hm
from island import mesh, parts

# Along the road: two arches of SPAN either side of a central pier PIER wide; the body runs END either side of the
# anchor, sampled at STATIONS points.
SPAN, PIER, END, STATIONS = 2.8, 1.0, 6.2, 63
# The arch ring's depth, the paving and fill over its crown, and how far below the water the arches spring.
RING, DECK, SPRING_UNDER_WATER = 0.32, 0.12, 0.12
WIDTH, PARAPET, PARAPET_T, POST = 3.6, 0.9, 0.35, 0.5
CUTWATER, FOOT, VOUSSOIRS = 0.9, -0.6, 9
STONES = {"keys": parts.WARM_HONEY_KEYS, "course": (0.3, 0.42), "length": (0.5, 1.0)}


@functools.lru_cache(maxsize=1)
def site():
    """The bridge's setting from the terrain, in metres about the anchor's ground: the ring's direction along it, the
    stations along it and the deck's height at each (the ring's surface, its hump included), the water's height,
    the arches' springing and each arch's centre and rise."""
    data = hm.cached()
    ax, ay = hm.ANCHORS["bridge"]
    bed = float(data["height"][ay, ax]) * hm.PEAK_M
    ring = data["roads"]["ring"]
    points = ring["points"]
    i = int(np.argmin(np.hypot(points[:, 0] - ax, points[:, 1] - ay)))
    a, b = points[i - 6], points[(i + 6) % len(points)]
    along = Vector((b[0] - a[0], -(b[1] - a[1]))).normalized()
    s, total = hm.arc_length(points, closed=True)
    xs = np.linspace(-END, END, STATIONS)
    # Local +X runs the way the ring does, so a station x metres along is x / M_PER_PX px further round it.
    deck = np.interp(s[i] + xs / hm.M_PER_PX, s, ring["road"], period=total) * hm.PEAK_M - bed
    spring = hm.STREAM_WATER_M - SPRING_UNDER_WATER
    arches = []
    for side in (-1, 1):
        centre = side * (PIER + SPAN) / 2
        arches.append((centre, float(np.interp(centre, xs, deck)) - DECK - RING - spring))
    return {"bed": bed, "along": along, "xs": xs, "deck": deck, "water": hm.STREAM_WATER_M, "spring": spring,
            "arches": arches}


def build(seed=7):
    rng = random.Random(seed)
    s = site()
    yaw = math.atan2(s["along"].y, s["along"].x)
    objs = _body(rng, s) + _cutwaters(rng) + _parapets(s)
    return mesh.finalize("isl_stone_bridge", mesh.transform(objs, Matrix.Rotation(yaw, 4, "Z")), ground=False, centre=False)


def _radius(rise):
    half = SPAN / 2
    return (half * half + rise * rise) / (2 * rise)


def _intrados(x, centre, rise, spring):
    """Height of an arch's underside at x along the bridge."""
    radius = _radius(rise)
    return spring + math.sqrt(max(0.0, radius * radius - (x - centre) ** 2)) - (radius - rise)


def _body(rng, s):
    """In bridge coordinates, X along the road and Y across it: the body with both arch openings, the rough stone
    courses and voussoirs on both faces and the paved deck."""
    xs, deck, spring = s["xs"], s["deck"], s["spring"]
    outline = list(zip(xs, deck))
    bottom = [(END, FOOT)]
    for centre, rise in sorted(s["arches"], reverse=True):
        right, left = centre + SPAN / 2, centre - SPAN / 2
        bottom += [(right, FOOT)] + [(x, _intrados(x, centre, rise, spring)) for x in np.linspace(right, left, 15)]
        bottom += [(left, FOOT)]
    half = WIDTH / 2 + PARAPET_T
    objs = [parts.extrude_xz("bridge_body", [(-END, FOOT)] + outline + bottom, -half, half, "stone_honey")]
    # Each face is laid out in its own wall coordinates (X along it, -Y out); the far face is turned half round, so
    # it is laid out mirrored along X.
    for y, turn, sign in ((-half, 0.0, 1.0), (half, math.pi, -1.0)):
        arches = [(sign * c, r) for c, r in s["arches"]]

        def inside(x, z):
            if z < FOOT or z > float(np.interp(sign * x, xs, deck)) - 0.05:
                return False
            return not any(abs(x - c) < SPAN / 2 + 0.02
                           and z < _intrados(min(max(x, c - SPAN / 2), c + SPAN / 2), c, r, spring) + RING
                           for c, r in arches)

        face = [parts.stone_patch(-END, END, FOOT, float(deck.max()), rng, inside, **STONES)]
        for centre, rise in arches:
            face += _voussoirs(rng, centre, rise, spring)
        objs += mesh.transform(face, Matrix.Translation((0.0, y, 0.0)) @ Matrix.Rotation(turn, 4, "Z"))
    paving = [(x, z + 0.02) for x, z in outline] + [(x, z - 0.1) for x, z in reversed(outline)]
    objs.append(parts.extrude_xz("deck", paving, -WIDTH / 2, WIDTH / 2, "stone_light"))
    return objs


def _voussoirs(rng, centre, rise, spring):
    """An arch ring's stones, cut radially round its opening and standing a little proud of the face (wall-local,
    -Y out)."""
    radius = _radius(rise)
    middle = spring - (radius - rise)
    start = math.asin((radius - rise) / radius)
    stones = []
    for k in range(VOUSSOIRS):
        a0 = start + (math.pi - 2 * start) * k / VOUSSOIRS + 0.004
        a1 = start + (math.pi - 2 * start) * (k + 1) / VOUSSOIRS - 0.004
        poly = [(centre + r * math.cos(a), middle + r * math.sin(a)) for r, a in
                ((radius, a0), (radius, a1), (radius + RING, a1), (radius + RING, a0))]
        key = "stone_honey_light" if k % 2 else parts.pick(rng, parts.WARM_HONEY_KEYS)
        stones.append(parts.extrude_xz("voussoir", poly, -0.05, 0.0, key))
    return stones


def _cutwaters(rng):
    """The pier's pointed cutwaters on both faces, from below the bed to above the water, each under a capping
    stone."""
    half = WIDTH / 2 + PARAPET_T
    top = hm.STREAM_WATER_M + 0.45
    objs = []
    for side in (-1, 1):
        nose = [(-PIER / 2, side * half), (PIER / 2, side * half), (0.0, side * (half + CUTWATER))]
        nose = nose if side > 0 else nose[::-1]
        cap = [(x * 1.12, side * half + (y - side * half) * 1.12) for x, y in nose]
        objs.append(mesh.polygon("cutwater", nose, top - FOOT, at=(0.0, 0.0, FOOT), mat=parts.mat(parts.pick(rng, parts.WARM_HONEY_KEYS))))
        objs.append(mesh.polygon("cutwater_cap", cap, 0.14, at=(0.0, 0.0, top), mat=parts.mat("stone_honey_light")))
    return objs


def _parapets(s):
    """Parapets with their copings along both edges of the deck, ending in squared posts."""
    outline = list(zip(s["xs"], s["deck"]))
    objs = []
    for y in (-WIDTH / 2 - PARAPET_T / 2, WIDTH / 2 + PARAPET_T / 2):
        wall = [(x, z) for x, z in outline] + [(x, z + PARAPET) for x, z in reversed(outline)]
        objs.append(parts.extrude_xz("parapet", wall, y - PARAPET_T / 2, y + PARAPET_T / 2, "stone_honey"))
        cap = [(x, z + PARAPET) for x, z in outline] + [(x, z + PARAPET + 0.12) for x, z in reversed(outline)]
        objs.append(parts.extrude_xz("parapet_coping", cap, y - PARAPET_T / 2 - 0.05, y + PARAPET_T / 2 + 0.05, "stone_honey_light"))
        for x, z in (outline[0], outline[-1]):
            post_x = x + (POST / 2 if x < 0 else -POST / 2)
            objs.append(mesh.box("parapet_post", (POST, PARAPET_T + 0.12, PARAPET + 0.3), at=(post_x, y, z), origin="bottom",
                                 mat=parts.mat("stone_honey_light")))
    return objs
