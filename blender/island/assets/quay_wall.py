"""quay_wall: the harbour's stone quay on the north shore of the bay (DESIGN.md section 17), where the terrain falls
from the quay and the beach walk straight into the bay instead of down a beach: the bay cut's hard edge along the quay
segment and, east of it, the bank the walk's cut and fill leaves at the water as far as the stone bridge; past the
bridge it goes on as a revetment along the bank where the walk meets the water. Each run is a face of grey harbour stone
a little out from that stretch of the waterline, from below the bay floor up to a coping of light stone level with the
ground behind it, thick enough to hold the terrain's steep bank inside it; iron bollards stand along the quay's top and
a flight of stone steps runs down its face to the water. It is built in the terrain's own space (metres about the map's
centre, water level at Z = 0), so the site sets it down exactly where the terrain sits; line() and revetment_line()
give the two faces in map pixels."""

import functools
import math
import random

import numpy as np
from mathutils import Vector

from island import heightmap as hm
from island import mesh, parts

# The wall stands along the longest run of the waterline within QUAY_REACH_PX of the quay segment where the ground
# falls steeper than STEEP (rise over run); its face follows that run simplified to FACE_TOLERANCE_PX.
QUAY_REACH_PX, STEEP, FACE_TOLERANCE_PX = 25.0, 3.0, 0.2
# The revetment stands along the waterline beyond the bridge, away from the quay, where it is within REVETMENT_ROAD_PX
# of the beach walk's centreline and the ground falls steeper than REVETMENT_STEEP.
REVETMENT_ROAD_PX, REVETMENT_STEEP = 9.0, 2.0
# The face stands FACE_OUT metres out from the waterline and the body runs THICK metres back into the bank, from FOOT
# up to the highest ground behind the face.
FACE_OUT, THICK, FOOT = 0.5, 2.6, -3.2
COPING_DEPTH, COPING_H, COPING_OVER = 0.55, 0.16, 0.08
BOLLARD_SPACING, BOLLARD_BACK = 8.0, 0.6
# The steps start STEPS_AT of the way along the wall and run down its face to below the water.
STEPS_AT, STEP_RISE, STEP_RUN, STEP_WIDTH = 0.72, 0.3, 0.32, 1.2
STONES = {"course": (0.38, 0.55), "length": (0.7, 1.3)}


def _ground(x, y):
    """The terrain's height in metres at map point (x, y)."""
    return float(hm.at(hm.cached()["height"], np.array([[x, y]]))[0]) * hm.PEAK_M


def _coast():
    """The island's coast as a loop of map px without its repeated end, and the ground's slope (rise over run) there."""
    h = hm.cached()["height"]
    coast = np.array(max(hm.coastline(h), key=hm.loop_area))[:-1]
    gy, gx = np.gradient(h * hm.PEAK_M, hm.M_PER_PX)
    return coast, hm.at(np.hypot(gx, gy), coast)


def _longest_run(coast, keep):
    """The longest run of consecutive kept points round the loop, gaps of a point or two closed, west to east."""
    for grow in (True, True, False, False):
        keep = (keep | np.roll(keep, 1) | np.roll(keep, -1)) if grow else (keep & np.roll(keep, 1) & np.roll(keep, -1))
    order = np.roll(np.arange(len(coast)), -int(np.argmin(keep)))
    runs, run = [], []
    for k in order:
        if keep[k]:
            run.append(k)
        elif run:
            runs, run = runs + [run], []
    points = coast[max(runs + [run], key=len)]
    return points if points[0, 0] < points[-1, 0] else points[::-1]


@functools.lru_cache(maxsize=1)
def line():
    """The waterline the quay wall stands along, west to east, in map px: the longest steep run near the quay."""
    coast, slope = _coast()
    return _longest_run(coast, (slope > STEEP) & (hm.segment(coast[:, 0], coast[:, 1], *hm.QUAY)[0] < QUAY_REACH_PX))


@functools.lru_cache(maxsize=1)
def revetment_line():
    """The waterline the revetment stands along, in map px: the steep bank by the beach walk beyond the bridge."""
    coast, slope = _coast()
    walk = hm.cached()["roads"][hm.BRIDGE_ROAD]["points"]
    along, _ = hm.arc_length(walk, closed=False)
    nearest = [int(np.argmin(np.hypot(*(walk - p).T))) for p in coast]
    near = np.array([np.hypot(*(walk[i] - p)) <= REVETMENT_ROAD_PX for i, p in zip(nearest, coast)])
    beyond = along[nearest] > along[int(np.argmin(np.hypot(*(walk - np.array(hm.ANCHORS["bridge"])).T)))]
    return _longest_run(coast, near & beyond & (slope > REVETMENT_STEEP))


@functools.lru_cache(maxsize=2)
def stations(run="quay"):
    """Along the simplified face of the quay ("quay") or the revetment ("revetment"), west to east: the face's point and
    seaward direction in metres and the height of the wall's top, the highest ground across its thickness."""
    points = np.array(hm.simplify([tuple(p) for p in (line() if run == "quay" else revetment_line())], FACE_TOLERANCE_PX))
    result = []
    for k, (x, y) in enumerate(points):
        a, b = points[max(k - 1, 0)], points[min(k + 1, len(points) - 1)]
        along = (b - a) / np.hypot(*(b - a))
        normal = np.array([-along[1], along[0]])
        if _ground(*(points[k] + normal * 2.0)) > _ground(*(points[k] - normal * 2.0)):
            normal = -normal
        reach = np.linspace(0.0, (THICK - FACE_OUT) / hm.M_PER_PX, 8)
        top = max(_ground(*(points[k] - normal * r)) for r in reach) + 0.03
        face = Vector(hm.to_metres(x, y)) + Vector((normal[0], -normal[1])) * FACE_OUT
        result.append((face, Vector((normal[0], -normal[1])), top))
    return result


def build(seed=7):
    rng = random.Random(seed)
    quay, revetment = stations("quay"), stations("revetment")
    objs = _body(quay) + _faces(rng, quay) + _ends(rng, quay) + _bollards(quay) + _steps(rng, quay)
    objs += _body(revetment) + _faces(rng, revetment) + _ends(rng, revetment)
    return mesh.finalize("isl_quay_wall", objs, ground=False, centre=False)


def _body(st):
    """The wall's core, lofted along the face from FOOT to its top and paved on top, and the coping overhanging the
    face."""
    rings, coping = [], []
    for p, out, top in st:
        back = p - out * THICK
        rings.append([tuple(p.to_3d() + Vector((0, 0, FOOT))), tuple(p.to_3d() + Vector((0, 0, top))),
                      tuple(back.to_3d() + Vector((0, 0, top))), tuple(back.to_3d() + Vector((0, 0, FOOT)))])
        lip, inner = p + out * COPING_OVER, p - out * (COPING_DEPTH - COPING_OVER)
        coping.append([tuple(lip.to_3d() + Vector((0, 0, top - 0.04))), tuple(lip.to_3d() + Vector((0, 0, top + COPING_H))),
                       tuple(inner.to_3d() + Vector((0, 0, top + COPING_H))), tuple(inner.to_3d() + Vector((0, 0, top - 0.04)))])
    return [mesh.loft("quay_core", rings, mat=[parts.mat("stone_dark"), parts.mat("stone_light")], band_materials=[0, 1, 0]),
            mesh.loft("quay_coping", coping, mat=parts.mat("stone_light"))]


def _faces(rng, st):
    """Rough stone courses on each straight run of the face, from just below the water to the coping."""
    objs = []
    for (p0, _, top0), (p1, _, top1) in zip(st, st[1:]):
        run = p1 - p0
        base = -0.4
        face = parts.stone_face(run.length, min(top0, top1) - base, rng, **STONES)
        objs += mesh.transform([face], mesh.frame(((p0 + p1) / 2).to_3d() + Vector((0, 0, base)), math.atan2(run.y, run.x)))
    return objs


def _ends(rng, st):
    """Rough stone courses on the wall's two square ends, each facing out along the wall."""
    objs = []
    for (p, out, top), inward in ((st[0], st[1][0] - st[0][0]), (st[-1], st[-2][0] - st[-1][0])):
        centre = p - out * (THICK / 2)
        base = -0.4
        face = parts.stone_face(THICK, top - base, rng, **STONES)
        # A wall frame's stones stand out along its -Y, so turning it a quarter less than `inward` faces them out.
        objs += mesh.transform([face], mesh.frame(centre.to_3d() + Vector((0, 0, base)), math.atan2(inward.y, inward.x) - math.pi / 2))
    return objs


def _along(st, distance):
    """The point `distance` metres along the face, its run's direction and seaward side, and the top there."""
    for (p0, out0, top0), (p1, _, top1) in zip(st, st[1:]):
        run = p1 - p0
        if distance <= run.length:
            u = distance / run.length
            return p0.lerp(p1, u), run.normalized(), out0, top0 + (top1 - top0) * u
        distance -= run.length
    p, out, top = st[-1]
    return p, (st[-1][0] - st[-2][0]).normalized(), out, top


def _length(st):
    return sum((b[0] - a[0]).length for a, b in zip(st, st[1:]))


def _bollards(st):
    """Iron bollards along the top, set back from the face."""
    objs = []
    total = _length(st)
    for k in range(int(total // BOLLARD_SPACING)):
        p, _, out, top = _along(st, BOLLARD_SPACING * (k + 0.5) + (total % BOLLARD_SPACING) / 2)
        at = p - out * BOLLARD_BACK
        objs += mesh.transform(parts.bollard(), mesh.frame((at.x, at.y, top)))
    return objs


def _steps(rng, st):
    """A flight of stone steps against the face, running down along it from the quay's level to below the water."""
    p, along, out, top = _along(st, _length(st) * STEPS_AT)
    count = int(math.ceil((top + 0.3) / STEP_RISE))
    frame = mesh.frame(p.to_3d(), math.atan2(along.y, along.x))
    steps = []
    for k in range(count):
        tread = top - (k + 1) * STEP_RISE
        key = parts.pick(rng, parts.STONE_KEYS)
        steps.append(mesh.box("quay_step", (STEP_RUN + 0.02, STEP_WIDTH + 0.15, tread + 0.6),
                              at=((k + 0.5) * STEP_RUN, -(STEP_WIDTH - 0.15) / 2, -0.6), origin="bottom", mat=parts.mat(key)))
    return mesh.transform(steps, frame)
