"""pier: the harbour's timber pier (DESIGN.md section 17), straight out from the quay wall's face across the bay to its
head at HEAD, on the line from the quay's point that runs 42 m to it, with its deck level with the quay wall's coping so
the quay walks straight onto it. Bents of two round posts stand on the bay floor every BENT_SPACING, braced crosswise
above the water under their cap beams; stringers carry a plank deck with a plank or two missing. A rope rail on posts
runs along the south side and iron bollards along the north side, where the ship lies alongside the head; an iron
ladder goes down the head into the water, a lantern post stands at each end and barrels and coils of rope wait on the
deck. It is built in the terrain's own space (metres about the map's centre, water level at Z = 0), so the site sets it
down exactly where the terrain sits; placement() gives its root, head, deck and berth in map pixels."""

import functools
import math
import random

import numpy as np
from mathutils import Matrix, Vector
from mathutils.geometry import intersect_line_line_2d

from island import heightmap as hm
from island import mesh, parts, style
from island.assets import quay_wall

# The pier's line (DESIGN.md section 17), from the quay's point out to the head; the pier starts where it crosses the
# quay wall's face and its deck runs DECK_ONTO back over the coping.
QUAY_POINT, HEAD = (365.0, 505.0), (305.0, 540.0)
HALF_WIDTH, BENT_SPACING, FIRST_BENT, DECK_ONTO = 1.6, 2.4, 0.5, 0.35
# Posts stand FOOT_EMBED into the bay floor and are wet up to WET above the water.
POST_R, FOOT_EMBED, WET = 0.16, 0.4, 1.0
PLANK = (0.25, 0.07)
RAIL_H, RAIL_EVERY = 1.0, 2
# The berth: bollards along the north side this far back from the head's end.
BERTH_BOLLARDS = (1.6, 9.0, 16.4)


def _px(p):
    """A point in mesh metres as map pixels."""
    return np.array([[p.x / hm.M_PER_PX + hm.W / 2, hm.H / 2 - p.y / hm.M_PER_PX]])


def _angle(v):
    """The map angle (north 0, clockwise) of a direction in mesh metres."""
    return math.degrees(math.atan2(v.x, v.y)) % 360.0


@functools.lru_cache(maxsize=1)
def site():
    """The pier in mesh metres: its root where the line crosses the quay wall's face, its direction out along the line
    and the side that faces north (the berth's), its length to the head, the deck's top (the coping's) and the berth's
    bollards, each as a distance back from the head's end."""
    start, end = Vector(hm.to_metres(*QUAY_POINT)), Vector(hm.to_metres(*HEAD))
    stations = quay_wall.stations()
    for (p0, _, top0), (p1, _, top1) in zip(stations, stations[1:]):
        root = intersect_line_line_2d(start, end, p0, p1)
        if root is not None:
            u = (root - p0).length / (p1 - p0).length
            deck = top0 + (top1 - top0) * u + quay_wall.COPING_H
            break
    else:
        raise ValueError("the pier's line misses the quay wall")
    along = (end - root).normalized()
    left = Vector((-along.y, along.x))
    return {"root": root, "along": along, "north": 1.0 if left.y > 0 else -1.0, "length": (end - root).length,
            "deck": deck}


def floor(s, x, y):
    """The bay floor's height in metres under the point x along the pier and y to its left."""
    p = s["root"] + s["along"] * x + Vector((-s["along"].y, s["along"].x)) * y
    return float(hm.at(hm.cached()["height"], _px(p))[0]) * hm.PEAK_M


def placement():
    """The pier for terrain.json: its root and the berth's bollards in map pixels, the deck's top in metres, the map
    angle out along it to the head and the map angle the berth faces."""
    s = site()
    left = Vector((-s["along"].y, s["along"].x))
    bollards = [s["root"] + s["along"] * (s["length"] - d) + left * s["north"] * (HALF_WIDTH - 0.3) for d in BERTH_BOLLARDS]
    return {"root": _px(s["root"])[0], "deck": s["deck"], "facing": _angle(s["along"]),
            "bollards": [_px(p)[0] for p in bollards], "berthFacing": _angle(left * s["north"])}


def build(seed=7):
    with style.weathered():
        return _build(random.Random(seed))


def _build(rng):
    s = site()
    length, deck = s["length"], s["deck"]
    count = max(2, round((length - FIRST_BENT - 0.3) / BENT_SPACING))
    bents = [FIRST_BENT + k * (length - FIRST_BENT - 0.3) / count for k in range(count + 1)]
    objs = []
    for k, x in enumerate(bents):
        objs += _bent(rng, s, x, rail=k % RAIL_EVERY == 0)
    objs += _stringers(s) + _planks(rng, s) + _rope_rail(rng, s, bents[::RAIL_EVERY]) + _ladder(s)
    objs += _bollards(s) + _cargo(rng, s)
    objs += _lantern_post(0.3, -s["north"] * (HALF_WIDTH - 0.28), deck)
    objs += _lantern_post(length - 0.4, -s["north"] * (HALF_WIDTH - 0.28), deck)
    place = Matrix.Translation(s["root"].to_3d()) @ Matrix.Rotation(math.atan2(s["along"].y, s["along"].x), 4, "Z")
    return mesh.finalize("isl_pier", mesh.transform(objs, place), ground=False, centre=False)


def _bent(rng, s, x, rail):
    """Two posts on the bay floor, a cap beam and a cross of braces above the water; on the rail side (south) every
    other post rises above the deck as a rail post."""
    deck = s["deck"]
    cap = deck - PLANK[1] - 0.2
    objs = []
    for y in (-HALF_WIDTH, HALF_WIDTH):
        foot = floor(s, x, y) - FOOT_EMBED
        top = deck + RAIL_H if rail and y * s["north"] < 0 else cap
        objs += mesh.transform(parts.pier_post(foot, top, POST_R, rng, water=WET), mesh.frame((x, y, 0.0)))
    timber = parts.mat("driftwood")
    objs.append(mesh.box("cap_beam", (0.22, 2 * HALF_WIDTH + 0.4, 0.25), at=(x, 0.0, cap - 0.125), mat=timber, bevel=0.015))
    for sy in (-1, 1):
        objs.append(mesh.beam("cross_brace", (x + 0.17, sy * HALF_WIDTH, 0.3), (x + 0.17, -sy * HALF_WIDTH, cap - 0.35),
                              0.05, 0.2, timber))
    return objs


def _stringers(s):
    z = s["deck"] - PLANK[1] - 0.1
    return [mesh.box("stringer", (s["length"] + DECK_ONTO, 0.14, 0.2), at=((s["length"] - DECK_ONTO) / 2, y, z),
                     mat=parts.mat("timber")) for y in (-1.2, -0.4, 0.4, 1.2)]


def _planks(rng, s):
    """Deck planks laid across from the coping to the head, each a little crooked; two are missing."""
    x0, x1, top = -DECK_ONTO, s["length"], s["deck"]
    count = int((x1 - x0) / (PLANK[0] + 0.03))
    gaps = {count // 3, count // 3 + 3}
    objs = []
    for i in range(count):
        if i in gaps:
            continue
        x = x0 + (i + 0.5) * (x1 - x0) / count
        width = 2 * HALF_WIDTH + 0.1 + parts.jitter(rng, 0.08)
        key = parts.pick(rng, (("driftwood", 0.55), ("plank", 0.45)))
        objs.append(mesh.box("deck_plank", (PLANK[0] + parts.jitter(rng, 0.015), width, PLANK[1]),
                             at=(x, parts.jitter(rng, 0.05), top - PLANK[1] / 2 + parts.jitter(rng, 0.006)),
                             rot=(math.radians(parts.jitter(rng, 0.6)), 0, math.radians(parts.jitter(rng, 1.2))),
                             mat=parts.mat(key)))
    return objs


def _rope_rail(rng, s, posts):
    y, z = -s["north"] * HALF_WIDTH, s["deck"] + RAIL_H - 0.1
    return [parts.rope(parts.sag((a, y, z), (b, y, z), 0.16 + parts.jitter(rng, 0.03), 6), 0.025, sides=4,
                       name="rail_rope") for a, b in zip(posts, posts[1:])]


def _bollards(s):
    y = s["north"] * (HALF_WIDTH - 0.3)
    objs = []
    for d in BERTH_BOLLARDS:
        objs += mesh.transform(parts.bollard(height=0.5, radius=0.11, segments=10), mesh.frame((s["length"] - d, y, s["deck"])))
    return objs


def _cargo(rng, s):
    """Barrels by the quay and coils of rope beside the berth's bollards."""
    deck, north = s["deck"], s["north"]
    objs = mesh.transform(parts.barrel(rng, segments=12), mesh.frame((1.3, north * 0.7, deck)))
    objs += mesh.transform(parts.barrel(rng, segments=12), mesh.frame((2.1, north * 1.05, deck)))
    for d in BERTH_BOLLARDS[:2]:
        coil = parts.rope_coil(radius=rng.uniform(0.26, 0.34), turns=2.5, sides=4, per_turn=12)
        objs += mesh.transform(coil, mesh.frame((s["length"] - d - 1.1, north * 0.6, deck), rng.uniform(0.0, 2 * math.pi)))
    return objs


def _lantern_post(x, y, deck):
    """A tall post with an arm reaching over the deck and a lantern hanging from it on a short chain."""
    timber = parts.mat("timber")
    top = deck + 3.68
    inward = -math.copysign(1.0, y)
    objs = [mesh.beam("lantern_post", (x, y, deck), (x, y, top), 0.2, 0.2, timber, bevel=0.015),
            mesh.beam("lantern_arm", (x, y - inward * 0.1, top - 0.2), (x, y + inward * 0.95, top - 0.2), 0.12, 0.14,
                      timber, bevel=0.012),
            mesh.beam("lantern_brace", (x, y, top - 0.85), (x, y + inward * 0.6, top - 0.26), 0.08, 0.08, timber),
            mesh.box("post_cap", (0.28, 0.28, 0.08), at=(x, y, top + 0.04), mat=timber, bevel=0.012)]
    hook = Vector((x, y + inward * 0.78, top - 0.27))
    objs.append(mesh.rod("lantern_chain", hook, hook - Vector((0.0, 0.0, 0.25)), 0.01, parts.mat("iron"), segments=4))
    return objs + mesh.transform(parts.lantern(size=1.5, hook=False), mesh.frame(hook - Vector((0.0, 0.0, 0.25 + 0.55 * 1.5))))


def _ladder(s):
    """An iron ladder down the head's end into the water."""
    iron = parts.mat("iron")
    x, top = s["length"] + 0.06, s["deck"]
    objs = [mesh.rod("ladder_rail", (x, y, -0.6), (x, y, top + 0.5), 0.02, iron, segments=6) for y in (-0.22, 0.22)]
    for i in range(int((top + 0.3) / 0.3)):
        z = -0.3 + i * 0.3
        objs.append(mesh.rod("ladder_rung", (x, -0.22, z), (x, 0.22, z), 0.014, iron, segments=4))
    return objs
