"""signpost: the fingerpost at each junction of the island's roads (DESIGN.md section 17). A square oak post with
chamfered corners bedded in a few honey stones, a pyramid cap with an iron finial, and three pointed arms for a plain
T junction: one each way along the road and one down the side road, each lettered on both faces in burnt strokes and
held to the post by an iron band. The site turns the post so its two long arms follow the road."""

import math
import random

from mathutils import Matrix

from island import mesh, parts

POST, POST_TOP, CAP = 0.14, 2.45, 0.2
ARM_HEIGHT, ARM_THICKNESS, ARM_TIP = 0.16, 0.034, 0.13
# (yaw in degrees, length, height of the arm's centre): right and left along the road, the side road straight ahead.
ARMS = ((0.0, 0.86, 2.14), (180.0, 0.8, 1.94), (-90.0, 0.74, 1.74))


def build(seed=7):
    rng = random.Random(seed)
    objs = _post(rng) + _footing(rng)
    for yaw, length, z in ARMS:
        arm = _arm(rng, length * (1 + parts.jitter(rng, 0.04)))
        droop = Matrix.Rotation(math.radians(parts.jitter(rng, 1.5)), 4, "Y")
        objs += mesh.transform(arm, Matrix.Translation((0.0, 0.0, z)) @ Matrix.Rotation(math.radians(yaw), 4, "Z") @ droop)
    parts.lean(objs, 0.0, parts.jitter(rng, 1.2), "X")
    return mesh.finalize("isl_signpost", objs)


def _post(rng):
    """The post with chamfered corners, its cap board and pyramid roof, and the iron finial."""
    s, c = POST / 2, 0.022

    def octagon(half, z):
        return [(x, y, z) for x, y in ((-half + c, -half), (half - c, -half), (half, -half + c), (half, half - c),
                                       (half - c, half), (-half + c, half), (-half, half - c), (-half, -half + c))]

    post = mesh.loft("signpost_post", [octagon(s, 0.0), octagon(s, POST_TOP)], mat=parts.mat("timber"))
    cap = CAP / 2
    roof = mesh.loft("signpost_cap", [octagon(cap, POST_TOP), octagon(cap, POST_TOP + 0.04), octagon(0.012, POST_TOP + 0.16)],
                     mat=parts.mat("timber_dark"))
    tip = POST_TOP + 0.16
    finial = [mesh.rod("finial", (0.0, 0.0, tip - 0.01), (0.0, 0.0, tip + 0.1), 0.012, parts.mat("iron"), segments=6),
              parts.blob(rng, 0.03, "iron", squash=1.0, at=(0.0, 0.0, tip + 0.11))]
    return [post, roof] + finial


def _footing(rng):
    """Three honey stones packed round the foot of the post."""
    stones = []
    for k in range(3):
        a = 2 * math.pi * (k / 3 + rng.uniform(-0.08, 0.08))
        size = (rng.uniform(0.22, 0.3), rng.uniform(0.18, 0.24), rng.uniform(0.12, 0.17))
        stone = parts.rock(rng, size, key=rng.choice(("stone_honey", "stone_honey_light")), rough=0.15)
        stone.location = (0.15 * math.cos(a), 0.15 * math.sin(a), 0.0)
        stone.rotation_euler = (0.0, 0.0, a)
        stones.append(stone)
    return stones


def _arm(rng, length):
    """One arm along +X from inside the post, `length` beyond the post's face, its point at the far end, burnt
    lettering on both faces and an iron band at the post."""
    h = ARM_HEIGHT / 2
    x0, x1 = -POST / 2 + 0.02, POST / 2 + length
    outline = [(x0, -h), (x1 - ARM_TIP, -h), (x1, 0.0), (x1 - ARM_TIP, h), (x0, h)]
    t = ARM_THICKNESS / 2
    objs = [parts.extrude_xz("signpost_arm", outline, -t, t, "plank_light")]
    strokes = _lettering(rng, POST / 2 + 0.08, x1 - ARM_TIP - 0.05)
    for turn in (0.0, math.pi):
        decal = parts.decal(strokes, "burnt", lift=0.002, name="arm_lettering")
        objs += mesh.transform([decal], Matrix.Rotation(turn, 4, "X") @ Matrix.Translation((0.0, -t, 0.0)))
    band = POST / 2 + 0.035
    objs.append(mesh.box("arm_band", (0.035, ARM_THICKNESS + 0.012, ARM_HEIGHT + 0.012), at=(band, 0.0, 0.0),
                         mat=parts.mat("iron")))
    return objs


def _lettering(rng, x0, x1):
    """Burnt lettering as it reads from the road: words of narrow letters, each one or two stems at x-height or with
    an ascender, and a bar across the top of some, on one line between x0 and x1."""
    strokes, x, z = [], x0, -0.024
    while x < x1 - 0.03:
        for _ in range(rng.randint(3, 6)):
            stems = rng.choice((1, 2, 2))
            tall = 0.064 if rng.random() < 0.3 else 0.046
            width = 0.012 + 0.02 * (stems - 1)
            if x + width > x1:
                break
            for k in range(stems):
                sx = x + k * (width - 0.011)
                strokes.append([(sx, z), (sx + 0.011, z), (sx + 0.011, z + tall), (sx, z + tall)])
            if stems == 2 and rng.random() < 0.5:
                strokes.append([(x, z + 0.035), (x + width, z + 0.035), (x + width, z + 0.046), (x, z + 0.046)])
            x += width + 0.016
        x += 0.04
    return strokes
