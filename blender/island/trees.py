"""Trees and bushes of DESIGN.md section 13b grown from a branching skeleton. A species is a recipe: a trunk that flares
into roots at its foot, three or four orders of tapering, slightly twisting branches set round their parent at the
golden angle and bent by the species' habit (oak limbs reaching out, ash and apple arching up, birch twigs and spruce
boughs hanging), and leaf-cluster cards at the twig ends. Each first-order limb carries one of the crown's three to
six cluster centres; a card faces out from its cluster, is painted dark toward the middle of the crown, light at its
rim and warm toward the key light over the sea (+Y), and sways in the wind more the higher it hangs. Bark, leaves and
end grain all come from the foliage atlas, so a tree is one mesh with one material."""

import math

from mathutils import Matrix, Vector

from island import cards, flora, style

GOLDEN = math.radians(137.5)
UP = Vector((0.0, 0.0, 1.0))


class Branch:
    def __init__(self, points, radii, order, limb, tier=None):
        self.points, self.radii, self.order, self.limb, self.tier = points, radii, order, limb, tier
        self.lengths = [0.0]
        for a, b in zip(points, points[1:]):
            self.lengths.append(self.lengths[-1] + (b - a).length)

    @property
    def length(self):
        return self.lengths[-1]

    def at(self, t):
        """Point, unit tangent and radius at fraction t of the branch's length."""
        s = t * self.length
        i = 0
        while i < len(self.points) - 2 and self.lengths[i + 1] < s:
            i += 1
        span = max(1e-9, self.lengths[i + 1] - self.lengths[i])
        f = min(1.0, max(0.0, (s - self.lengths[i]) / span))
        return (self.points[i].lerp(self.points[i + 1], f), (self.points[i + 1] - self.points[i]).normalized(),
                self.radii[i] + (self.radii[i + 1] - self.radii[i]) * f)


def _path(rng, start, direction, length, steps, rise, droop, wobble):
    """A branch's centre line: from `start` along `direction`, turning toward the sky by `rise` and toward the ground
    by `droop` more the further out it gets, with a little random wander."""
    points, d, p = [start.copy()], direction.normalized(), start.copy()
    step = length / steps
    for i in range(steps):
        f = (i + 1) / steps
        jitter = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))) * wobble
        d = (d + (UP * (rise - droop * f) + jitter) * (step / max(length, 1e-6)) * steps * 0.25).normalized()
        p = p + d * step
        points.append(p.copy())
    return points


def _child_direction(tangent, angle, azimuth, spread):
    """The tangent swung `angle` degrees away from itself on the side given by `azimuth`, squeezed in plan by
    spread (x, y) so a crown can grow longer one way than the other."""
    side = tangent.cross(UP)
    if side.length < 1e-3:
        side = Vector((1.0, 0.0, 0.0))
    side = (Matrix.Rotation(azimuth, 3, tangent) @ side.normalized()).normalized()
    d = (Matrix.Rotation(math.radians(angle), 3, tangent.cross(side).normalized()) @ tangent).normalized()
    return Vector((d.x * spread[0], d.y * spread[1], d.z)).normalized()


def grow(rng, spec):
    """The skeleton of one tree: a list of Branch, the trunk first, each branch knowing its order and the index of
    the first-order limb it grows from."""
    t = spec["trunk"]
    lean = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), 0.0)) * math.tan(math.radians(t.get("lean", 2.0)))
    trunk_points = _path(rng, Vector((0.0, 0.0, 0.0)), UP + lean, t["height"], t["steps"], 0.0, 0.0, t.get("wobble", 0.04))
    trunk = Branch(trunk_points, [t["radius"] + (t["top"] - t["radius"]) * (i / t["steps"]) ** 0.7
                                  for i in range(t["steps"] + 1)], 0, -1)
    branches, parents = [trunk], [trunk]
    spread = spec.get("spread", (1.0, 1.0))
    for order, rule in enumerate(spec["orders"], start=1):
        children = []
        for parent in parents:
            count = rng.randint(*rule["count"])
            azimuth = rng.uniform(0, 2 * math.pi)
            whorls, per = rule.get("whorls", (count, 1))
            for k in range(whorls * per):
                level = k // per
                if whorls > 1:
                    along = rule["at"][0] + (rule["at"][1] - rule["at"][0]) * (level + rng.uniform(0.0, 0.6 if per == 1 else 0.15)) / whorls
                else:
                    along = rule["at"][1]
                point, tangent, radius = parent.at(min(1.0, along))
                if per > 1:
                    azimuth = 2 * math.pi * (k % per) / per + level * 0.6
                else:
                    azimuth += (2 * math.pi / count) if order == 1 and spec.get("fork") else GOLDEN
                azimuth += rng.uniform(-0.25, 0.25)
                angle = rng.uniform(*rule["angle"])
                direction = _child_direction(tangent, angle, azimuth, spread)
                scale = parent.length if order > 1 else spec["height"]
                length = scale * rng.uniform(*rule["length"]) * (1.0 - rule.get("taper", 0.0) * along)
                if length < 0.08:
                    continue
                points = _path(rng, point, direction, length, rule["steps"], rule.get("rise", 0.0), rule.get("droop", 0.0),
                               rule.get("wobble", 0.05))
                r0 = max(rule.get("min_radius", 0.006), radius * rule["radius"])
                r1 = max(rule.get("min_radius", 0.006) * 0.6, r0 * rule.get("tip", 0.35))
                radii = [r0 + (r1 - r0) * (i / rule["steps"]) ** 0.8 for i in range(rule["steps"] + 1)]
                limb = len(children) if order == 1 else parent.limb
                children.append(Branch(points, radii, order, limb, level if per > 1 else None))
        branches += children
        parents = children
    return branches


def _flare(spec):
    """Root flare: the trunk swells toward its foot into `roots` buttresses."""
    t = spec["trunk"]
    reach, roots, phase = t.get("flare_height", 0.9), t.get("roots", 5), t.get("root_phase", 0.4)
    amount = t.get("flare", 0.5)

    def shape(s, angle):
        if s >= reach:
            return 1.0
        f = (1.0 - s / reach) ** 2
        return 1.0 + amount * f * (0.45 + 0.55 * max(0.0, math.cos(roots * angle + phase)) ** 2)

    return shape


def _bark(spec, greens, exposure):
    """Corner colours on the wood: the bark cell's own colour darkened toward the ground and under the limbs, moss
    creeping up the seaward foot of the trunk."""
    moss = flora.moss(exposure)
    base = spec.get("bark_tint", (0.95, 0.95, 0.95))

    dark_base = spec.get("base_dark", 0.0)

    def shade(point, outward):
        ao = 0.72 + 0.28 * min(1.0, point.z / 1.2)
        ao *= 1.0 + 0.18 * min(0.0, outward.z)
        if dark_base:
            # A birch's foot is black and fissured below its white bark.
            ao *= 0.3 + 0.7 * min(1.0, max(0.0, point.z / dark_base)) ** 1.5
        colour = [c * ao for c in base]
        if spec.get("moss", True):
            m = max(0.0, outward.y) * max(0.0, 1.0 - point.z / 2.2) * 0.65
            colour = [c * (1 - m) + k * 4.0 * m for c, k in zip(colour, moss)]
        return tuple(colour)

    return shade


def _leaf_colour(greens, depth, height, facing, rng):
    """A card's colour: shade green deep in the crown, body green at mid depth, light green on the sunlit rim, warmed
    toward the dusk amber where it faces the key light."""
    rim = max(0.0, min(1.0, 0.55 * depth + 0.45 * height))
    colour = flora.mix(greens.shade, greens.body, flora.smoothstep(0.0, 0.6, rim))
    colour = flora.mix(colour, greens.light, flora.smoothstep(0.55, 1.0, rim) * (0.55 + 0.45 * max(0.0, facing)))
    colour = flora.mix(colour, style.rgb(style.DUSK), 0.14 * max(0.0, facing) * rim)
    jitter = rng.uniform(0.9, 1.1)
    return tuple(c * jitter for c in colour)


def _preshape(branches, spec, plan):
    """Stretch the skeleton in plan toward the scanned original's proportions before anything is built on it, so the
    cards keep their shape and the exact fit of the finished mesh only has a few percent left to do."""
    margin = spec["leaves"].get("puff", 0.0)
    points = [p for b in branches for p in b.points]
    w = max(p.x for p in points) - min(p.x for p in points) + 2 * margin
    d = max(p.y for p in points) - min(p.y for p in points) + 2 * margin
    h = max(p.z for p in points) + margin
    sx = min(1.6, max(0.5, (plan[0] / plan[2]) * h / w))
    sy = min(1.6, max(0.5, (plan[1] / plan[2]) * h / d))
    for b in branches:
        b.points = [Vector((p.x * sx, p.y * sy, p.z)) for p in b.points]
        b.lengths = [0.0]
        for a, c in zip(b.points, b.points[1:]):
            b.lengths.append(b.lengths[-1] + (c - a).length)


def build(rng, spec, name, exposure=flora.INLAND, plan=None):
    """Grow a species and write it as one textured object."""
    branches = grow(rng, spec)
    if plan:
        _preshape(branches, spec, plan)
    plant = cards.Plant("foliage")
    greens = flora.greens(exposure)
    height = spec["height"]
    shade = _bark(spec, greens, exposure)
    trunk_spec = spec["trunk"]
    for branch in branches:
        order = branch.order
        sides = trunk_spec["sides"] if order == 0 else spec["orders"][order - 1]["sides"]
        clear = trunk_spec["height"]
        phase = ((branch.limb + 1) * 0.618034) % 1.0

        def sway(p, order=order):
            return 0.0 if order == 0 else 0.3 * (max(0.0, p.z - clear * 0.6) / max(1e-3, height - clear * 0.6)) ** 2 * (0.6 + 0.4 * order / 3)

        plant.tube(branch.points, branch.radii, spec["bark"], shade, sway, phase, sides=sides,
                   tile=spec.get("tile", 1.0) * (1.0 if order == 0 else 0.5), sectors=spec.get("sectors", 2) if order == 0 else 1,
                   twist=spec.get("twist", 0.15), shape=_flare(spec) if order == 0 else None)
    if spec["trunk"].get("roots", 0):
        _roots(rng, plant, spec, shade)
    (_boughs if spec["leaves"].get("layout") == "boughs" else _leaves)(rng, plant, spec, branches, greens)
    # Shore trees grow about a fifth smaller than their inland kin, as the scanned pairs and the 3b builds did.
    height = spec["height"] * (1.0 - 0.33 * max(0.0, exposure - flora.INLAND))
    return plant.finish(name, plan=plan, exposure=exposure, height=height)


def _roots(rng, plant, spec, shade):
    """Surface roots running out from the buttresses and down into the ground."""
    t = spec["trunk"]
    r = t["radius"]
    for k in range(t.get("roots", 5)):
        angle = (2 * math.pi * k - t.get("root_phase", 0.4)) / t.get("roots", 5) + rng.uniform(-0.15, 0.15)
        out = Vector((math.cos(angle), math.sin(angle), 0.0))
        reach = r * rng.uniform(1.8, 2.4)
        points = [out * r * 0.55 + UP * r * 0.75, out * r * 1.05 + UP * r * 0.32, out * reach * 0.75 + UP * r * 0.1,
                  out * reach + UP * 0.01]
        plant.tube(points, [r * 0.42, r * 0.3, r * 0.17, r * 0.05], spec["bark"], shade, lambda p: 0.0, 0.0, sides=7,
                   tile=0.6)


def _leaves(rng, plant, spec, branches, greens):
    """Leaf-cluster cards gathered in puffs round the ends of the larger branches (the twigs reach into them). Each
    puff is a star of `core` cards crossing at its middle, so it holds its body from any side, under one card lying
    over its top, and the rest face out from it as a shell. A first-order limb and its puffs make one of the crown's
    cluster centres: card normals turn out from it and its middle is painted deepest."""
    leaf = spec["leaves"]
    levels = leaf.get("levels", (max(b.order for b in branches) - 1,))
    puffs = []
    for b in branches:
        if b.order in levels:
            at = leaf.get("at", 0.9)
            p, d, _ = b.at(at.get(b.order, 0.9) if isinstance(at, dict) else at)
            puffs.append((p + d * leaf["puff"] * 0.3, b.limb))
    if not puffs:
        return
    core = leaf.get("core", 3)
    if len(puffs) * (core + 1) > leaf["count"]:
        puffs = rng.sample(puffs, leaf["count"] // (core + 1))
    counts = [max(core + 1, leaf["count"] // len(puffs))] * len(puffs)
    spare = leaf["count"] - sum(counts)
    for i in rng.sample(range(len(puffs)), max(0, min(len(puffs), spare))):
        counts[i] += 1
    crown = sum((p for p, _ in puffs), Vector()) / len(puffs)
    limbs = {}
    for p, limb in puffs:
        limbs.setdefault(limb, []).append(p)
    centres = {limb: sum(ps, Vector()) / len(ps) for limb, ps in limbs.items()}
    reach = {limb: max(leaf["puff"], max((p - centres[limb]).length for p in ps) + leaf["puff"]) for limb, ps in limbs.items()}
    low = min(p.z for p, _ in puffs) - leaf["puff"]
    high = max(p.z for p, _ in puffs) + leaf["puff"]
    height = spec["height"]
    for (centre, limb), count in zip(puffs, counts):
        cluster = centres[limb]
        anchor = cluster.lerp(crown, leaf.get("crown_pull", 0.4))
        away = centre - cluster
        away = away.normalized() if away.length > 1e-3 else UP.copy()
        turn = rng.uniform(0.0, math.pi)
        for k in range(count):
            if k < core:
                a = turn + math.pi * k / core
                d = Vector((math.cos(a), math.sin(a), rng.uniform(-0.15, 0.25))).normalized()
                p = centre + Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))) * leaf["puff"] * 0.08
                normal = d
            elif k == core:
                d = (UP + away * 0.3).normalized()
                p = centre + d * leaf["puff"] * 0.35
                normal = (d + Vector((rng.gauss(0, 1), rng.gauss(0, 1), 0.0)) * 0.2).normalized()
            else:
                d = (Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))).normalized() + away * 0.6
                     + UP * leaf.get("lift", 0.5)).normalized()
                p = centre + d * leaf["puff"] * rng.uniform(0.35, 0.7)
                normal = (d + Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))) * leaf.get("jitter", 0.15)).normalized()
            up = UP if abs(normal.z) < 0.92 else Vector((away.x, away.y, 0.0)).normalized() if away.z < 0.99 else Vector((0.0, 1.0, 0.0))
            size = rng.uniform(*leaf["size"]) * (1.15 if k < core else 1.0)
            out = p - anchor
            depth = min(1.0, (p - cluster).length / reach[limb])
            rise = (p.z - low) / max(1e-3, high - low)
            facing = out.normalized().dot(flora.KEY_LIGHT) if out.length > 1e-3 else 0.0
            colour = _leaf_colour(greens, 0.7 * depth + 0.3 * (0.5 + 0.5 * d.z), rise, facing, rng)
            low_colour = tuple(c * leaf.get("bottom", 0.78) for c in colour)
            high_colour = tuple(min(1.0, c * leaf.get("top", 1.08)) for c in colour)
            sway = 0.35 + 0.65 * (p.z / height) ** 1.5
            plant.card(p, normal, up, size, size, rng.choice(leaf["cells"]), (low_colour, high_colour), (sway * 0.85, sway),
                       ((limb + 1) * 0.618034 + rng.uniform(-0.08, 0.08)) % 1.0, anchor, fold=leaf.get("fold", 0.5),
                       flip=rng.random() < 0.5)


def _boughs(rng, plant, spec, branches, greens):
    """A conifer's foliage as tiers: at every whorl a ring of sprays radiates from the trunk out over the boughs,
    drooping like a skirt with the image's tip at the bough's end, so each tier shows its lit upper face from the
    side as well as from above, and a curtain of sprays hangs from the bough ends so the cone reads full at eye
    height; the leader carries a few upright sprays."""
    leaf = spec["leaves"]
    boughs = [b for b in branches if b.order == 1]
    height = spec["height"]
    axis = Vector((0.0, 0.0, 1.0))
    tiers = {}
    for b in boughs:
        tiers.setdefault(b.tier, []).append(b)
    per = leaf.get("per_tier", 8)
    placed = 0
    for tier in sorted(tiers):
        group = tiers[tier]
        z = sum(b.points[0].z for b in group) / len(group)
        reach = sum(Vector((b.points[-1].x - b.points[0].x, b.points[-1].y - b.points[0].y, 0.0)).length for b in group) / len(group)
        drop = sum(b.points[0].z - b.points[-1].z for b in group) / len(group)
        turn = rng.uniform(0.0, 2 * math.pi)
        for k in range(per):
            if placed >= leaf["count"] - 4:
                break
            a = turn + 2 * math.pi * k / per + rng.uniform(-0.15, 0.15)
            out = Vector((math.cos(a), math.sin(a), 0.0))
            length = max(0.45, reach * rng.uniform(1.0, 1.12))
            slope = math.atan2(drop + leaf.get("droop", 0.25) * length, length)
            slope = min(slope, math.asin(min(1.0, max(0.0, z - 0.3) / length)))
            along = (out * math.cos(slope) - axis * math.sin(slope)).normalized()
            normal = (axis * math.cos(slope) + out * math.sin(slope)).normalized()
            base = Vector((0.0, 0.0, z + 0.05))
            rise = z / height
            facing = out.dot(flora.KEY_LIGHT)
            colour = _leaf_colour(greens, 0.75 + 0.25 * rng.random(), rise, facing, rng)
            colour = tuple(c * leaf.get("tone", 1.0) for c in colour)
            width = min(length * leaf.get("aspect", 0.95), 2 * math.pi * length / per * 1.45)
            sway = 0.2 + 0.8 * rise ** 1.5
            plant.card(base + along * length * 0.02, normal, along, width, length, rng.choice(leaf["cells"]),
                       (tuple(c * 0.55 for c in colour), colour), (sway * 0.4, sway), rng.random(),
                       base - axis * 1.0, fold=leaf.get("fold", 0.5), pivot=0.0, flip=rng.random() < 0.5)
            placed += 1
        for k in range(leaf.get("skirts", 0)):
            if placed >= leaf["count"] - 4:
                break
            a = turn + 2 * math.pi * (k + 0.5) / leaf["skirts"]
            out = Vector((math.cos(a), math.sin(a), 0.0))
            hang = reach * 0.55
            top = Vector((0.0, 0.0, z)) + out * reach * 0.72
            if top.z - hang < 0.25:
                hang = max(0.2, top.z - 0.25)
            colour = tuple(c * leaf.get("tone", 1.0) * 0.85 for c in _leaf_colour(greens, 0.7, z / height, out.dot(flora.KEY_LIGHT), rng))
            sway = 0.2 + 0.8 * (z / height) ** 1.5
            plant.card(top, out, axis, 2 * math.pi * reach * 0.72 / leaf["skirts"] * 0.95, hang, rng.choice(leaf["cells"]),
                       (tuple(c * 0.5 for c in colour), colour), (sway * 0.6, sway), rng.random(), top - out, fold=0.35,
                       pivot=0.92, flip=rng.random() < 0.5)
            placed += 1
    top = Vector((0.0, 0.0, max(v.z for b in branches for v in b.points)))
    for k in range(min(4, leaf["count"] - placed)):
        a = math.pi * k / 2
        normal = Vector((math.cos(a), math.sin(a), 0.0))
        colour = tuple(c * leaf.get("tone", 1.0) for c in greens.body)
        plant.card(top - axis * 0.55, normal, axis, 0.7, 1.1, rng.choice(leaf["cells"]), (colour, colour), (0.9, 1.0),
                   rng.random(), top - axis * 0.55 - normal, fold=0.3, pivot=0.4)


OAK = {
    "height": 10.0,
    "trunk": {"height": 2.7, "radius": 0.36, "top": 0.27, "sides": 14, "steps": 8, "lean": 2.5, "flare": 0.6,
              "roots": 5, "wobble": 0.05},
    "fork": True,
    "orders": [
        {"count": (4, 5), "at": (0.9, 1.0), "angle": (38.0, 62.0), "length": (0.42, 0.52), "radius": 0.66, "tip": 0.3,
         "rise": 0.25, "steps": 10, "sides": 9, "wobble": 0.12},
        {"count": (4, 5), "at": (0.3, 0.95), "angle": (35.0, 60.0), "length": (0.42, 0.55), "radius": 0.55, "tip": 0.35,
         "rise": 0.2, "droop": 0.15, "steps": 6, "sides": 6, "taper": 0.3},
        {"count": (3, 4), "at": (0.35, 1.0), "angle": (30.0, 55.0), "length": (0.45, 0.6), "radius": 0.6, "tip": 0.4,
         "rise": 0.15, "steps": 3, "sides": 4, "min_radius": 0.012},
    ],
    "bark": "bark_oak", "tile": 1.4, "sectors": 3, "twist": 0.12,
    "leaves": {"cells": ("oak_a", "oak_b"), "count": 120, "size": (1.7, 2.2), "puff": 1.5, "at": 0.92, "fold": 0.45,
               "lift": 0.45, "levels": (1, 2), "core": 3},
}


ASH = {
    "height": 7.7,
    "trunk": {"height": 3.1, "radius": 0.27, "top": 0.2, "sides": 12, "steps": 8, "lean": 2.0, "flare": 0.45,
              "roots": 4, "wobble": 0.04},
    "fork": True,
    "orders": [
        {"count": (4, 4), "at": (0.88, 1.0), "angle": (48.0, 66.0), "length": (0.66, 0.76), "radius": 0.68, "tip": 0.3,
         "rise": 0.35, "droop": 0.5, "steps": 10, "sides": 8, "wobble": 0.1},
        {"count": (4, 5), "at": (0.3, 0.95), "angle": (30.0, 55.0), "length": (0.4, 0.55), "radius": 0.5, "tip": 0.35,
         "rise": 0.4, "droop": 0.2, "steps": 6, "sides": 6, "taper": 0.3},
        {"count": (3, 4), "at": (0.4, 1.0), "angle": (25.0, 45.0), "length": (0.4, 0.5), "radius": 0.6, "tip": 0.4,
         "rise": 0.3, "steps": 3, "sides": 4, "min_radius": 0.01},
    ],
    "bark": "bark_oak", "bark_tint": (0.92, 0.94, 0.95), "tile": 1.2, "sectors": 3, "twist": 0.05,
    "leaves": {"cells": ("ash",), "count": 118, "size": (1.5, 2.0), "puff": 1.25, "at": {1: 0.55, 2: 0.9}, "fold": 0.45,
               "lift": 0.5, "levels": (1, 2), "core": 2, "jitter": 0.2},
}

BIRCH = {
    "height": 10.5, "width": 4.8,
    "trunk": {"height": 9.4, "radius": 0.2, "top": 0.05, "sides": 10, "steps": 14, "lean": 4.0, "flare": 0.3,
              "roots": 3, "wobble": 0.05},
    "orders": [
        {"count": (18, 22), "at": (0.22, 0.98), "angle": (40.0, 60.0), "length": (0.3, 0.4), "radius": 0.5, "tip": 0.3,
         "rise": 0.3, "droop": 0.75, "steps": 7, "sides": 6, "taper": 0.6, "wobble": 0.12},
        {"count": (3, 4), "at": (0.35, 1.0), "angle": (25.0, 45.0), "length": (0.45, 0.6), "radius": 0.55, "tip": 0.35,
         "droop": 1.0, "steps": 3, "sides": 4, "min_radius": 0.008},
    ],
    "bark": "bark_birch", "tile": 1.0, "sectors": 2, "twist": 0.02, "moss": False, "base_dark": 1.1,
    "leaves": {"cells": ("birch",), "count": 96, "size": (1.15, 1.5), "puff": 0.85, "at": 0.85, "fold": 0.4,
               "lift": 0.15, "levels": (1, 2), "core": 2, "jitter": 0.2, "crown_pull": 0.6},
}

SPRUCE = {
    "height": 13.0, "width": 5.8,
    "trunk": {"height": 12.6, "radius": 0.27, "top": 0.03, "sides": 10, "steps": 16, "lean": 1.0, "flare": 0.5,
              "roots": 5, "wobble": 0.015},
    "orders": [
        {"count": (1, 1), "whorls": (11, 5), "at": (0.08, 0.95), "angle": (84.0, 104.0), "length": (0.22, 0.27),
         "radius": 0.32, "tip": 0.25, "droop": 0.3, "rise": 0.12, "steps": 5, "sides": 5, "taper": 0.95, "wobble": 0.05,
         "min_radius": 0.012},
        {"count": (2, 2), "at": (0.35, 0.85), "angle": (45.0, 60.0), "length": (0.35, 0.45), "radius": 0.5, "tip": 0.4,
         "droop": 0.2, "steps": 2, "sides": 3, "min_radius": 0.006},
    ],
    "bark": "bark_spruce", "tile": 1.0, "sectors": 2, "twist": 0.03,
    "leaves": {"layout": "boughs", "cells": ("spruce",), "count": 116, "per_tier": 6, "skirts": 4, "aspect": 0.95,
               "fold": 0.45, "droop": 0.4, "tone": 0.5},
}

APPLE = {
    "height": 5.3, "spread": (0.68, 1.0),
    "trunk": {"height": 1.05, "radius": 0.16, "top": 0.13, "sides": 12, "steps": 5, "lean": 4.0, "flare": 0.35,
              "roots": 4, "wobble": 0.08},
    "fork": True,
    "orders": [
        {"count": (4, 5), "at": (0.85, 1.0), "angle": (36.0, 52.0), "length": (0.3, 0.36), "radius": 0.7, "tip": 0.3,
         "rise": 0.3, "droop": 0.3, "steps": 10, "sides": 10, "wobble": 0.18},
        {"count": (4, 5), "at": (0.2, 0.95), "angle": (35.0, 60.0), "length": (0.4, 0.55), "radius": 0.55, "tip": 0.35,
         "rise": 0.3, "droop": 0.25, "steps": 6, "sides": 7, "taper": 0.3, "wobble": 0.15},
        {"count": (2, 3), "at": (0.4, 1.0), "angle": (30.0, 55.0), "length": (0.4, 0.55), "radius": 0.6, "tip": 0.4,
         "rise": 0.1, "steps": 3, "sides": 4, "min_radius": 0.008},
    ],
    "bark": "bark_apple", "tile": 0.9, "sectors": 2, "twist": 0.2,
    "leaves": {"cells": ("apple",), "count": 100, "size": (0.9, 1.15), "puff": 0.95, "at": {1: 0.55, 2: 0.92},
               "fold": 0.45, "lift": 0.35, "levels": (1, 2), "core": 3},
}

HAWTHORN = {
    "height": 3.0,
    "trunk": {"height": 0.25, "radius": 0.09, "top": 0.08, "sides": 7, "steps": 2, "lean": 3.0, "flare": 0.3,
              "roots": 0, "wobble": 0.05},
    "fork": True,
    "orders": [
        {"count": (6, 7), "at": (0.9, 1.0), "angle": (25.0, 58.0), "length": (0.55, 0.72), "radius": 0.7, "tip": 0.3,
         "rise": 0.1, "droop": 0.3, "steps": 5, "sides": 5, "wobble": 0.2},
        {"count": (2, 3), "at": (0.35, 0.95), "angle": (35.0, 60.0), "length": (0.35, 0.5), "radius": 0.55, "tip": 0.4,
         "droop": 0.2, "steps": 2, "sides": 3, "min_radius": 0.008, "wobble": 0.2},
    ],
    "bark": "bark_apple", "tile": 0.8, "sectors": 1, "twist": 0.1,
    "leaves": {"cells": ("hawthorn",), "count": 60, "size": (0.7, 0.95), "puff": 0.6, "at": {1: 0.5, 2: 0.92},
               "fold": 0.45, "lift": 0.3, "levels": (1, 2), "core": 2},
}


def _column_shade(greens, height, tone, exposure):
    """Corner colours of a clipped or columnar evergreen body: deep green low and inside, lighter toward the top, warm
    on the side facing the key light."""
    def shade(point, outward):
        rise = max(0.0, min(1.0, point.z / height))
        colour = flora.mix(greens.shade, greens.body, 0.35 + 0.5 * rise)
        colour = flora.mix(colour, greens.light, 0.25 * max(0.0, outward.dot(flora.KEY_LIGHT)) * rise)
        colour = flora.mix(colour, style.rgb(style.DUSK), 0.08 * max(0.0, outward.dot(flora.KEY_LIGHT)))
        return tuple(c * tone for c in colour)
    return shade


def _fringe(rng, plant, count, radius_at, height, z_range, size, cells, greens, tone, axis_height=None):
    """Sprays standing out of an evergreen body's surface, facing out, so its outline is leafy rather than smooth."""
    for _ in range(count):
        z = rng.uniform(*z_range)
        a = rng.uniform(0.0, 2 * math.pi)
        out = Vector((math.cos(a), math.sin(a), 0.0))
        r = radius_at(z, a)
        centre = Vector((0.0, 0.0, z)) + out * r * rng.uniform(0.85, 1.0)
        normal = (out + UP * rng.uniform(-0.1, 0.35)).normalized()
        rise = z / height
        colour = flora.mix(greens.shade, greens.body, 0.45 + 0.45 * rise)
        colour = flora.mix(colour, greens.light, 0.3 * max(0.0, out.dot(flora.KEY_LIGHT)) * rise)
        colour = tuple(c * tone * rng.uniform(0.9, 1.1) for c in colour)
        s = size * (1.0 - 0.45 * rise) * rng.uniform(0.85, 1.15)
        sway = 0.2 + 0.8 * rise ** 1.5
        plant.card(centre, normal, UP, s * 0.85, s, rng.choice(cells), (tuple(c * 0.75 for c in colour), colour),
                   (sway * 0.8, sway), rng.random(), Vector((0.0, 0.0, axis_height if axis_height is not None else z)),
                   fold=0.4, flip=rng.random() < 0.5)


def cypress(rng, name, exposure=flora.INLAND, plan=None, height=13.0, radius=1.0):
    """The Italian cypress, still the island's vertical accent: a short fibrous trunk under a dense column of
    scale foliage that swells low and draws in to a point, its surface carved into upright flame-like lobes and
    textured with the cypress cell, its outline broken by sprays standing out of it."""
    plant = cards.Plant("foliage")
    greens = flora.greens(exposure)
    bark = _bark({"bark_tint": (0.9, 0.82, 0.78)}, greens, exposure)
    plant.tube([Vector((0.0, 0.0, z)) for z in (0.0, 0.5, 1.2)], [0.2, 0.16, 0.14], "bark_spruce", bark,
               lambda p: 0.0, 0.0, sides=10, tile=0.8, sectors=2, shape=_flare({"trunk": {"radius": 0.2, "flare": 0.5,
                                                                                      "roots": 4, "flare_height": 0.5}}))
    base, top = 0.75, height
    lobes, phase = rng.randint(5, 7), rng.uniform(0, 6)

    def profile(z):
        u = (z - base) / (top - base)
        return radius * (1.0 - u) ** 0.8 * min(1.0, 0.32 + u * 2.8)

    def lobed(s, angle):
        z = base + s
        return 1.0 + 0.11 * math.sin(lobes * angle + 0.7 * z + phase) + 0.06 * math.sin(2 * lobes * angle - 1.1 * z)

    stations = [base + (top - base) * i / 58 for i in range(59)]
    path = [Vector((0.0, 0.0, z)) for z in stations]
    radii = [max(0.02, profile(z)) for z in stations]
    plant.tube(path, radii, "cypress", _column_shade(greens, height, 0.85, exposure),
               lambda p: 0.18 * (p.z / height) ** 2, 0.3, sides=32, tile=1.4, sectors=4, twist=0.04, shape=lobed)
    _fringe(rng, plant, 104, lambda z, a: profile(z) * lobed(z - base, a), height, (base + 0.4, top - 0.6), 1.25,
            ("box",), greens, 0.8, axis_height=None)
    # The cypress keeps its full height on the shore and only leans, as the 3b build did, so the site's placement holds.
    return plant.finish(name, plan=plan, exposure=exposure, height=height)


def box_bush(rng, name, form="ball", size=(0.7, 0.7, 0.66), exposure=flora.INLAND):
    """Clipped box by the doors: a ball, or a block with softened edges and a flat top, its clipped surface textured
    with the dense evergreen cell and a fringe of small box sprays breaking the outline."""
    plant = cards.Plant("foliage")
    greens = flora.greens(exposure)
    w, d, h = size
    r = max(w, d) * 0.5
    stations = [h * (0.02 + 0.96 * (i / 14)) for i in range(15)]
    if form == "cube":
        def profile(z):
            u = z / h
            return r * (1.0 if u < 0.86 else math.sqrt(max(0.0, 1.0 - ((u - 0.86) / 0.14) ** 2)) * 0.9 + 0.1)

        def shape(s, angle):
            c, n = abs(math.cos(angle)), abs(math.sin(angle))
            return 1.0 / max(1e-3, (c ** 5 + n ** 5)) ** 0.2
    else:
        def profile(z):
            u = (z - h * 0.5) / (h * 0.5)
            return r * math.sqrt(max(0.0, 1.0 - u * u * 0.98))

        def shape(s, angle):
            return 1.0 + 0.04 * math.sin(5 * angle + s * 9.0)
    path = [Vector((0.0, 0.0, z)) for z in stations]
    shade = _column_shade(greens, h, 0.8, exposure)
    plant.tube(path, [max(0.03, profile(z)) for z in stations], "cypress", shade, lambda p: 0.04 * p.z / h, 0.0,
               sides=16, tile=0.45, sectors=4, shape=shape)
    plant.disc(Vector((0.0, 0.0, stations[-1])), UP, max(0.04, profile(stations[-1])) * 1.05, "cypress",
               lambda p, n: shade(p, n), sides=10)
    # Small sprays lying just proud of the clipped surface, following its curve, give it leafy relief.
    centre = Vector((0.0, 0.0, h * 0.5))
    for _ in range(38):
        a = rng.uniform(0.0, 2 * math.pi)
        if form == "cube":
            if rng.random() < 0.25:
                normal = UP.copy()
                p = Vector((rng.uniform(-0.75, 0.75) * r, rng.uniform(-0.75, 0.75) * r, h * 0.99))
            else:
                k = rng.randrange(4)
                normal = Vector(((1, 0, 0), (0, 1, 0), (-1, 0, 0), (0, -1, 0))[k])
                p = normal * r * 1.0 + normal.cross(UP) * rng.uniform(-0.75, 0.75) * r + UP * rng.uniform(0.15, 0.82) * h
        else:
            lat = math.asin(rng.uniform(-0.55, 0.97))
            normal = Vector((math.cos(lat) * math.cos(a), math.cos(lat) * math.sin(a), math.sin(lat)))
            p = centre + Vector((normal.x * r, normal.y * r, normal.z * h * 0.5))
        colour = shade(p, normal)
        up = UP if abs(normal.z) < 0.9 else Vector((math.cos(a), math.sin(a), 0.0))
        s = rng.uniform(0.2, 0.27)
        plant.card(p + normal * 0.012, normal, up, s, s, "box", (tuple(c * 0.85 for c in colour), colour), (0.03, 0.05),
                   rng.random(), p - normal, fold=0.3, flip=rng.random() < 0.5)
    return plant.finish(name)


def stump(rng, name, exposure=flora.INLAND, plan=None, height=0.7):
    """The sawn stump of an old oak: a flared foot with roots running into the ground, the cut showing its end grain
    and rings, moss on its seaward foot, and a young shoot already in leaf from its side."""
    plant = cards.Plant("foliage")
    greens = flora.greens(exposure)
    trunk = {"radius": 0.42, "flare": 0.75, "roots": 6, "flare_height": 0.45, "root_phase": rng.uniform(0, 3)}
    spec = {"trunk": trunk, "bark": "bark_oak"}
    shade = _bark(spec, greens, exposure)
    path = [Vector((0.0, 0.0, z)) for z in (0.0, 0.18, 0.4, 0.6)]
    plant.tube(path, [0.42, 0.4, 0.385, 0.375], "bark_oak", shade, lambda p: 0.0, 0.0, sides=18, tile=0.6, sectors=3,
               shape=_flare(spec))
    plant.disc(Vector((0.0, 0.0, 0.6)), UP, 0.375, "end_grain", lambda p, n: (0.95, 0.93, 0.9), sides=18)
    _roots(rng, plant, spec, shade)
    a = rng.uniform(0.0, 2 * math.pi)
    out = Vector((math.cos(a), math.sin(a), 0.0))
    base = out * 0.36 + UP * 0.3
    tip = base + out * 0.22 + UP * 0.32
    plant.tube([base, base.lerp(tip, 0.5) + out * 0.04, tip], [0.025, 0.018, 0.01], "bark_oak", shade,
               lambda p: 0.3 * p.z, 0.4, sides=5, tile=0.4)
    for k in range(5):
        p = tip + Vector((rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.08)))
        normal = (p - base).normalized()
        colour = flora.mix(greens.body, greens.light, rng.uniform(0.2, 0.6))
        plant.card(p, normal, UP, 0.38, 0.38, "oak_a", (tuple(c * 0.75 for c in colour), colour), (0.6, 0.9), rng.random(),
                   base, fold=0.4, flip=rng.random() < 0.5)
    return plant.finish(name, plan=plan, height=height)
