"""The Island v2 heightmap of DESIGN.md section 17 in map space: 1000 by 700 px with north at the top, 1 px = 0.6 m,
heights as fractions of the 46 m peak. Every landform is the authoritative specification's, the numbers the plan
artifact draws: the superellipse island mask with its soft south-west and cliffed north-east edges, the harbour bay
with its quay wall, the base slope and its hummocks, the village terraces cut into it, the ridge, the peak, the castle
knoll, the headland, the stream and the mill pond, the sea floor, the sea stacks and the islet. The roads are then
relaxed to their grade limits, the ring humped over the stream's mouth for the stone bridge, and the ground is cut and
filled to them. Plain numpy, so it runs inside Blender and outside it;
terrain.py builds the mesh and the exports from it.

Edges the specification leaves sharp are softened, all away from every named point: the coast's softness changes
over a few hundredths of a radian where the cliffs begin and end, instead of in one step that notches the coastline;
the mill pond has a short bank instead of a vertical wall; and the bailey's rim and the knoll cliff's edges are
steep banks a sampled mesh can draw without a staircase, the bailey's flat top keeping its full radius. Last, the bare rock is sculpted: gullies
up to CRAG_DEPTH deep are carved into the cliffs, the peak's flanks and the knoll's sides, never near a road, the
summit or the bailey, so the rock breaks into ledges instead of standing as a smooth dome; it only ever cuts, so no
height rises above the specification's. Sample (i, j) of every array is the map point x = i, y = j."""

import functools
import math
import struct
import zlib

import numpy as np

W, H = 1000, 700
M_PER_PX, PEAK_M = 0.6, 46.0
# The island mask: a superellipse turned counter-clockwise, its edge soft on the south and west and steep where the
# cliffs stand on the north and east (the polar angle, y up, between CLIFF_ANGLES).
MASK_CENTRE, MASK_RADII, MASK_EXPONENT, MASK_TURN_DEG = (500.0, 360.0), (390.0, 265.0), 2.4, 12.0
SOFT_SHORE, SOFT_CLIFF, CLIFF_ANGLES, CLIFF_BLEND = 0.08, 0.03, (0.2, 2.4), 0.06
# The harbour bay: two ellipses cut out of the mask, a 2 px wall along the quay and a 16 px beach elsewhere.
BAY = (((330.0, 560.0), (80.0, 50.0)), ((268.0, 592.0), (92.0, 60.0)))
QUAY = ((340.0, 512.0), (392.0, 500.0))
BAY_CUT, BAY_WALL_PX, BAY_BEACH_PX, BAY_EDGE_REACH = 1.2, 2.0, 16.0, 30.0
# The land falls to the waterline across the outer COAST_RAMP of the mask. Outside the island the sea floor falls from
# the waterline to SEA_FLOOR across SEA_FALL of the superellipse radius beyond the coast's soft edge; in the bay it lies
# at SEA_FLOOR times the depth of the cut; the deeper of the two wins, so the shore has no step under the water.
SEA_FLOOR, SEA_FALL, COAST_RAMP = -0.3, 0.25, 0.6
# The land: a slope rising from the bay toward the knoll's foot along b = x - y, with hummocks.
SLOPE_BASE, SLOPE_RISE, SLOPE_SPAN = 0.05, 0.22, (-150.0, 330.0)
HUMMOCKS = ((575, 500), (480, 545), (615, 540), (380, 380), (300, 420), (760, 450), (260, 480), (340, 290), (520, 240),
            (660, 540), (780, 330))
HUMMOCK_SIGMA, HUMMOCK_HEIGHT = 55.0, 0.07
# The village terraces cut into the slope: risers 12 px wide at these values of b, faded out round the village.
RISERS, TERRACE_ENDS, RISER_HALF_PX = (-118, -62, -6, 50, 106), (-160, 170), 6.0
VILLAGE_CENTRE, VILLAGE_FADE_PX = (440.0, 445.0), (110.0, 170.0)
RIDGE = ((655.0, 262.0), (745.0, 200.0))
RIDGE_CREST, RIDGE_SIGMA = (0.30, 0.80), 55.0
PEAK_CENTRE, PEAK_SIGMA = (745.0, 200.0), 60.0
KNOLL_CENTRE, KNOLL_SIGMA, KNOLL_HEIGHT, BAILEY_PX = (640.0, 275.0), 55.0, 0.40, 28.0
# North of KNOLL_CLIFF_Y and inside KNOLL_CLIFF_PX the knoll is capped low: the 15 px cliff on its north side.
KNOLL_CLIFF_Y, KNOLL_CLIFF_PX, KNOLL_CLIFF_HEIGHT = 261.0, 48.0, 0.24
# Steep banks instead of steps, so a sampled mesh draws them without a staircase: the bailey keeps its flat top to
# BAILEY_PX and falls to the knoll's slope over BAILEY_BANK_PX outside it; the cliff turns over CLIFF_EDGE_PX either
# side of its straight north line and its cap over CAP_EDGE_PX either side of its arc.
BAILEY_BANK_PX, CLIFF_EDGE_PX, CAP_EDGE_PX = 6.0, 1.0, 3.0
HEADLAND_CENTRE, HEADLAND_SIGMA, HEADLAND_HEIGHT = (205.0, 335.0), 60.0, 0.24
STREAM = ((672, 356), (640, 366), (606, 388), (566, 412), (530, 428), (480, 462), (436, 496), (398, 524))
STREAM_DEPTH, STREAM_SIGMA = 0.03, 10.0
# The stream's water stands this many metres over its bed.
STREAM_WATER_M = 0.25
POND_CENTRE, POND_PX, POND_DEPTH, POND_BANK_PX = (530.0, 428.0), 16.0, 0.04, 3.0
OFFSHORE = (((905.0, 215.0), 12.0, 0.30), ((935.0, 265.0), 12.0, 0.25), ((900.0, 90.0), 25.0, 0.20))
# Each stands where its own Gaussian exceeds STACK_BASE, lowered by it, so no ridge joins them above the water.
STACK_BASE = 0.02
# The roads: the deck's closed ring round most of the island and five spurs, relaxed to these grades (rise over run).
# The beach walk runs on past model.py's end at (412, 540) along the inlet's shore to (418, 562), where its fall from
# the bridge meets the beach's own ground.
RING = ((365, 505), (380, 470), (415, 445), (450, 420), (490, 400), (520, 382), (552, 368), (584, 362), (612, 344),
        (640, 322), (602, 304), (590, 270), (575, 245), (540, 225), (470, 205), (400, 215), (330, 245), (290, 262),
        (250, 290), (222, 318), (205, 335), (235, 355), (255, 385), (240, 415), (265, 445), (300, 470), (335, 490),
        (365, 505))
SPURS = {"viewpoint": ((640, 322), (668, 306), (690, 290), (692, 262)),
         "well": ((450, 420), (470, 445)),
         "mill": ((490, 400), (500, 422), (511, 441)),
         "stones": ((330, 245), (340, 282)),
         "beach": ((365, 505), (398, 524), (412, 540), (417, 547), (418, 562))}
RING_GRADE, SPUR_GRADE, ROAD_SMOOTH_PX = 0.10, 0.15, 15
# A spur leaves the ring at the ring's own height and eases into its relaxed profile over this many px.
SPUR_JOIN_PX = 20
# BRIDGE_ROAD, the beach walk, is not relaxed to the ground but laid as a causeway: from the quay it eases down in one
# grade to ABUTMENT_M at the near foot of the stone bridge's hump, stays level under the hump, which rises BRIDGE_RISE_M
# over BRIDGE_HALF_PX either side of the bridge and so clears the arches over the water, and falls at BEACH_GRADE from
# the hump's far foot to its end on the beach. The hump eases in and out over HUMP_EASE of its half-width around a
# straight flank, so it is nowhere steeper than SPUR_GRADE.
BRIDGE_ROAD, BRIDGE_RISE_M, BRIDGE_HALF_PX = "beach", 0.8, 12.0
ABUTMENT_M, BEACH_GRADE, HUMP_EASE = 3.2, 0.10, 0.25
# The ground is set to the road's height within ROAD_FLAT_PX of its centreline, fading to nothing at ROAD_FADE_PX.
ROAD_FLAT_PX, ROAD_FADE_PX = 6.0, 16.0
# Every road is paved fully within PAVED_PX[0] of its centreline, fading out by PAVED_PX[1] (terrain.py paints it).
PAVED_PX = (6.0, 8.0)
# The castle stair (assets/castle_stair.py builds it on this plan) climbs from the road at the gate vertex to the gate
# in two flights that switch back along the bailey's slope. In metres in the castle's frame (from the bailey's centre,
# x east and y north): a top landing from the gate's threshold at STAIR_GATE_Y down to the upper flight's south side,
# the upper flight running STAIR_UPPER_RUN due west along STAIR_UPPER_Y, a five-sided landing, and the lower flight
# running back down along the ring's leg toward the gate vertex as far as its road-side edge stays off the paving
# (searched every STAIR_SEARCH_M), a wall across its end and its lowest STAIR_OPEN_STEPS steps open to the road beside
# them. STAIR_HALF is half the stair's width over its walls, STAIR_WALL_M a wall's thickness; both flights share one
# pitch, no steeper than STAIR_MAX_DEG, from the bailey's floor to the ground at the foot, each step about STAIR_RISE_M.
# Outside the bailey the ground under the stair is cut STAIR_CUT_M below its paving and nosings, so the stair sits in
# the slope with its walls holding the cut.
STAIR_GATE_Y, STAIR_UPPER_Y, STAIR_HALF, STAIR_WALL_M = -15.5, -18.5, 1.05, 0.35
STAIR_UPPER_RUN, STAIR_SEARCH_M, STAIR_MAX_DEG = 2.6, 0.05, 35.0
STAIR_RISE_M, STAIR_OPEN_STEPS, STAIR_CUT_M = 0.18, 3, 0.25
# The bailey keeps every sample inside BAILEY_PX; where a road's edge comes within BAILEY_SLOPE_GAP_PX of its rim the
# ground between them is one straight slope from the rim down to the road (fading back to the plain cut and fill by
# the second value), instead of a step at the rim.
BAILEY_SLOPE_GAP_PX = (10.0, 16.0)
# The stone bridge and the watermill stand over the stream, so the roads leave its channel open there.
OPEN_CHANNELS = ((398.0, 524.0), (511.0, 441.0))
OPEN_CHANNEL_PX, OPEN_REACH_PX = (5.0, 9.0), (10.0, 16.0)
# The specification's checkpoints under the names of its report.json, and the sites of the field props beside them.
CHECKPOINTS = {"quay": (365, 505), "street": (380, 470), "street2": (415, 445), "square": (450, 420), "upper": (490, 400),
               "well": (470, 445), "beach": (405, 528), "pier_end": (305, 540), "bay_centre": (340, 545),
               "gate": (640, 322), "bailey": (640, 275), "knoll_e": (668, 306), "fields": (595, 485),
               "orchard": (460, 535), "mill": (511, 441), "pond": (530, 428), "spring": (672, 356), "mouth": (398, 524),
               "lighthouse": (205, 335), "viewpoint": (692, 262), "north_meadow": (470, 205), "west_foot": (590, 270),
               "peak": (745, 200), "stack1": (905, 215), "stack2": (935, 265),
               "islet": (900, 90), "bridge": (398, 524)}
ANCHORS = {**CHECKPOINTS, "standing_stones": (340, 290), "shrine": (598, 352)}
# Rock sculpting: gullies carved where the ground is steep (rise over run) or high, from value noise on cells of
# these sizes in px weighted coarse to fine; clear of the roads, the summit and the bailey by the given distances.
CRAG_DEPTH, CRAG_SEED = 0.06, 5
CRAG_CELLS_PX, CRAG_WEIGHTS = (64.0, 32.0, 16.0), (0.5, 0.3, 0.2)
CRAG_SLOPE, CRAG_HEIGHT = (0.5, 1.0), (0.62, 0.8)
CRAG_ROAD_CLEAR_PX, CRAG_SUMMIT_CLEAR_PX, CRAG_BAILEY_CLEAR_PX = (18.0, 28.0), (6.0, 14.0), (4.0, 12.0)
# The 16-bit heightmap spans the deepest sea floor to the peak.
PNG_RANGE = (SEA_FLOOR, 1.0)


def grid():
    """Map coordinates of every sample, as (xs, ys)."""
    ys, xs = np.mgrid[0:H, 0:W].astype(float)
    return xs, ys


def smooth(a, b, t):
    u = np.clip((t - a) / (b - a), 0.0, 1.0)
    return u * u * (3.0 - 2.0 * u)


def gauss(xs, ys, centre, sigma):
    return np.exp(-((xs - centre[0]) ** 2 + (ys - centre[1]) ** 2) / (2.0 * sigma * sigma))


def segment(xs, ys, a, b):
    """Distance from every point to the segment a-b, and how far along it the nearest point lies (0 to 1)."""
    vx, vy = b[0] - a[0], b[1] - a[1]
    t = np.clip(((xs - a[0]) * vx + (ys - a[1]) * vy) / (vx * vx + vy * vy), 0.0, 1.0)
    return np.hypot(xs - (a[0] + t * vx), ys - (a[1] + t * vy)), t


def polyline_distance(xs, ys, points):
    return np.minimum.reduce([segment(xs, ys, a, b)[0] for a, b in zip(points, points[1:])])


def superellipse(xs, ys):
    """The island's superellipse radius at every point (1 on its outline) and how soft the coast is there."""
    turn = math.radians(-MASK_TURN_DEG)
    dx, dy = xs - MASK_CENTRE[0], ys - MASK_CENTRE[1]
    rx, ry = dx * math.cos(turn) - dy * math.sin(turn), dx * math.sin(turn) + dy * math.cos(turn)
    r = (np.abs(rx / MASK_RADII[0]) ** MASK_EXPONENT + np.abs(ry / MASK_RADII[1]) ** MASK_EXPONENT) ** (1 / MASK_EXPONENT)
    angle = np.arctan2(-dy, dx)
    (a0, a1), blend = CLIFF_ANGLES, CLIFF_BLEND
    cliff = smooth(a0 - blend, a0 + blend, angle) * (1.0 - smooth(a1 - blend, a1 + blend, angle))
    return r, SOFT_SHORE + (SOFT_CLIFF - SOFT_SHORE) * cliff


def island_mask(xs, ys, r, soft):
    """1 inside the island, falling to 0 across its soft or cliffed edge, below 0 in the bay down to -1."""
    m = 1.0 - smooth(1.0 - soft, 1.0 + soft, r)
    e = np.minimum.reduce([np.hypot((xs - c[0]) / rad[0], (ys - c[1]) / rad[1]) for c, rad in BAY])
    quay = segment(xs, ys, *QUAY)[0]
    edge = (BAY_WALL_PX + (BAY_BEACH_PX - BAY_WALL_PX) * smooth(0.0, BAY_EDGE_REACH, quay)) / 60.0
    m = m - BAY_CUT * (1.0 - smooth(1.0, 1.0 + edge, e))
    return np.clip(m, -1.0, 1.0)


def rise(b):
    """The base slope's height at b = x - y."""
    return SLOPE_BASE + SLOPE_RISE * smooth(SLOPE_SPAN[0], SLOPE_SPAN[1], b)


def _terraced(xs, ys):
    """The base slope with its hummocks and the village terraces cut into it: inside the village every tread lies at
    the slope's height at its own middle, so the staircase never stands above the slope it is cut from."""
    b = xs - ys
    base = rise(b) + sum(HUMMOCK_HEIGHT * gauss(xs, ys, c, HUMMOCK_SIGMA) for c in HUMMOCKS)
    bounds = (TERRACE_ENDS[0],) + RISERS + (TERRACE_ENDS[1],)
    tread = np.full_like(b, rise(0.5 * (bounds[0] + bounds[1])))
    for lo, hi in zip(bounds[1:-1], bounds[2:]):
        tread = tread + (rise(0.5 * (lo + hi)) - tread) * smooth(lo - RISER_HALF_PX, lo + RISER_HALF_PX, b)
    village = 1.0 - smooth(*VILLAGE_FADE_PX, np.hypot(xs - VILLAGE_CENTRE[0], ys - VILLAGE_CENTRE[1]))
    return base + village * (tread - rise(b))


def land(xs, ys):
    """The land before the coast: landforms composed by maximum over the terraced base, the stream and pond carved
    afterwards."""
    d, t = segment(xs, ys, *RIDGE)
    ridge = (RIDGE_CREST[0] + (RIDGE_CREST[1] - RIDGE_CREST[0]) * t) * np.exp(-d * d / (2.0 * RIDGE_SIGMA ** 2))
    peak = gauss(xs, ys, PEAK_CENTRE, PEAK_SIGMA)
    dc = np.hypot(xs - KNOLL_CENTRE[0], ys - KNOLL_CENTRE[1])
    flat = 1.0 - smooth(BAILEY_PX, BAILEY_PX + BAILEY_BANK_PX, dc)
    knoll = KNOLL_HEIGHT * (flat + (1.0 - flat) * np.exp(-dc * dc / (2.0 * KNOLL_SIGMA ** 2)))
    capped = (smooth(KNOLL_CLIFF_Y + CLIFF_EDGE_PX, KNOLL_CLIFF_Y - CLIFF_EDGE_PX, ys)
              * (1.0 - smooth(KNOLL_CLIFF_PX - CAP_EDGE_PX, KNOLL_CLIFF_PX + CAP_EDGE_PX, dc)))
    knoll = knoll + capped * (np.minimum(knoll, KNOLL_CLIFF_HEIGHT) - knoll)
    headland = HEADLAND_HEIGHT * gauss(xs, ys, HEADLAND_CENTRE, HEADLAND_SIGMA)
    h = np.maximum.reduce([_terraced(xs, ys), ridge, peak, knoll, headland])
    h = h - STREAM_DEPTH * np.exp(-polyline_distance(xs, ys, STREAM) ** 2 / (2.0 * STREAM_SIGMA ** 2))
    pond = np.hypot(xs - POND_CENTRE[0], ys - POND_CENTRE[1])
    return h - POND_DEPTH * (1.0 - smooth(POND_PX - POND_BANK_PX, POND_PX + POND_BANK_PX, pond))


def natural(xs, ys):
    """The ground before the roads, and the island mask: the land falls to the waterline across the outer part of
    the mask's edge, the sea floor falls away from the waterline and deepens in the bay, and the sea stacks and the
    islet stand out of it."""
    r, soft = superellipse(xs, ys)
    m = island_mask(xs, ys, r, soft)
    sea = np.minimum(SEA_FLOOR * np.clip(-m, 0.0, 1.0), SEA_FLOOR * smooth(1.0 + soft, 1.0 + SEA_FALL + soft, r))
    stacks = np.maximum.reduce([peak * gauss(xs, ys, c, sigma) for c, sigma, peak in OFFSHORE])
    sea = np.where(stacks > STACK_BASE, stacks - STACK_BASE, sea)
    return np.where(m <= 1e-6, sea, land(xs, ys) * np.minimum(1.0, m / COAST_RAMP)), m


def sample_polyline(points, closed):
    """Points every 1 px along a polyline; a closed one does not repeat its start."""
    out = []
    for a, b in zip(points, points[1:]):
        n = max(1, int(round(math.hypot(b[0] - a[0], b[1] - a[1]))))
        out += [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n)]
    if not closed:
        out.append(points[-1])
    return np.array(out)


def bilinear(field, x, y):
    """Sample a 2D array at fractional (x, y) positions, x along columns and y along rows, clamped at the edges."""
    rows, cols = field.shape[:2]
    x = np.clip(x, 0.0, cols - 1.001)
    y = np.clip(y, 0.0, rows - 1.001)
    i, j = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x - i, y - j
    if field.ndim == 3:
        fx, fy = fx[..., None], fy[..., None]
    top = field[j, i] * (1 - fx) + field[j, i + 1] * fx
    bottom = field[j + 1, i] * (1 - fx) + field[j + 1, i + 1] * fx
    return top * (1 - fy) + bottom * fy


def at(height, points):
    """The height of the nearest sample under each point."""
    i = np.clip(np.round(points[:, 0]).astype(int), 0, W - 1)
    j = np.clip(np.round(points[:, 1]).astype(int), 0, H - 1)
    return height[j, i]


def relax(profile, grade, closed):
    """Clamp a height profile sampled every 1 px to `grade` height units per px: the mean of its lower and upper
    grade envelopes."""
    lo, hi = profile.copy(), profile.copy()
    n = len(profile)
    for _ in range(3):
        for i in range(1, n):
            lo[i], hi[i] = min(lo[i], lo[i - 1] + grade), max(hi[i], hi[i - 1] - grade)
        for i in range(n - 2, -1, -1):
            lo[i], hi[i] = min(lo[i], lo[i + 1] + grade), max(hi[i], hi[i + 1] - grade)
        if closed:
            lo[0], lo[-1] = min(lo[0], lo[-1] + grade), min(lo[-1], lo[0] + grade)
            hi[0], hi[-1] = max(hi[0], hi[-1] - grade), max(hi[-1], hi[0] - grade)
    return 0.5 * (lo + hi)


def _grade(rise_over_run):
    return rise_over_run * M_PER_PX / PEAK_M


def arc_length(points, closed):
    """The distance in px along a sampled polyline to each of its points, and its whole length (back to the start
    if closed)."""
    steps = np.hypot(*np.diff(np.vstack([points, points[:1]]) if closed else points, axis=0).T)
    along = np.concatenate([[0.0], np.cumsum(steps)])
    return along[:len(points)], along[-1]


def ease_through(t, ease):
    """A rise from 0 to 1 over t in [0, 1] that eases in and out over `ease` at either end and runs straight between;
    its steepest slope is 1 / (1 - ease)."""
    t = np.clip(t, 0.0, 1.0)
    span = 2.0 * ease * (1.0 - ease)
    return np.where(t < ease, t * t / span, np.where(t > 1.0 - ease, 1.0 - (1.0 - t) ** 2 / span, (t - ease / 2) / (1.0 - ease)))


def bridge_hump(points):
    """How far the stone bridge lifts BRIDGE_ROAD at each of its samples, as a fraction of the peak."""
    along, _ = arc_length(points, closed=False)
    i = int(np.argmin(np.hypot(*(points - ANCHORS["bridge"]).T)))
    return BRIDGE_RISE_M / PEAK_M * (1.0 - ease_through(np.abs(along - along[i]) / BRIDGE_HALF_PX, HUMP_EASE))


def causeway(points, start):
    """BRIDGE_ROAD's surface at each sample as a fraction of the peak, from `start` where it leaves the ring: one grade
    down to ABUTMENT_M at the near foot of the bridge's hump, level under the hump with the hump on top, then
    BEACH_GRADE down from the hump's far foot to the walk's end."""
    along, _ = arc_length(points, closed=False)
    crown = along[int(np.argmin(np.hypot(*(points - ANCHORS["bridge"]).T)))]
    near, far = crown - BRIDGE_HALF_PX, crown + BRIDGE_HALF_PX
    abutment = ABUTMENT_M / PEAK_M
    base = np.where(along < near, start + (abutment - start) * along / near, abutment)
    return base - np.clip(along - far, 0.0, None) * _grade(BEACH_GRADE) + bridge_hump(points)


def road_profiles(height):
    """Every road sampled at 1 px with the ground under it, smoothed over ROAD_SMOOTH_PX and relaxed: the ring
    closed at RING_GRADE, each spur at SPUR_GRADE and joined to the ring's height where it leaves it, except
    BRIDGE_ROAD, laid as its causeway from the ring's height. "relaxed" keeps each profile as the ground alone would
    relax it, before the join."""
    kernel = np.ones(ROAD_SMOOTH_PX) / ROAD_SMOOTH_PX
    half = ROAD_SMOOTH_PX // 2
    points = sample_polyline(RING, closed=True)
    ground = at(height, points)
    smoothed = np.convolve(np.concatenate([ground[-half:], ground, ground[:half]]), kernel, "valid")
    relaxed = relax(smoothed, _grade(RING_GRADE), closed=True)
    roads = {"ring": {"points": points, "ground": ground, "smoothed": smoothed, "relaxed": relaxed, "road": relaxed,
                      "closed": True}}
    for name, path in SPURS.items():
        points = sample_polyline(path, closed=False)
        ground = at(height, points)
        smoothed = np.convolve(np.pad(ground, half, "edge"), kernel, "valid")
        relaxed = relax(smoothed, _grade(SPUR_GRADE), closed=False)
        join = roads["ring"]["road"][int(np.argmin(np.hypot(*(roads["ring"]["points"] - points[0]).T)))]
        if name == BRIDGE_ROAD:
            road = causeway(points, join)
        else:
            road = relaxed + (join - relaxed[0]) * np.clip(1.0 - np.arange(len(relaxed)) / SPUR_JOIN_PX, 0.0, 1.0)
        roads[name] = {"points": points, "ground": ground, "smoothed": smoothed, "relaxed": relaxed, "road": road,
                       "closed": False}
    return roads


def road_field(roads):
    """For every sample, the distance to the nearest road centreline sample, that road's height there and which road
    it is, as its index in `roads`."""
    distance = np.full((H, W), np.inf)
    target = np.zeros((H, W))
    owner = np.full((H, W), -1)
    reach = int(math.ceil(ROAD_FADE_PX)) + 1
    for k, road in enumerate(roads.values()):
        for (x, y), h in zip(road["points"], road["road"]):
            i0, i1 = max(0, int(x) - reach), min(W, int(x) + reach + 1)
            j0, j1 = max(0, int(y) - reach), min(H, int(y) + reach + 1)
            ys, xs = np.mgrid[j0:j1, i0:i1]
            d = np.hypot(xs - x, ys - y)
            window = distance[j0:j1, i0:i1]
            nearer = d < window
            window[nearer] = d[nearer]
            target[j0:j1, i0:i1][nearer] = h
            owner[j0:j1, i0:i1][nearer] = k
    return distance, target, owner


def open_channel(xs, ys):
    """How fully the stream's channel is kept open under the bridge and the watermill: 1 in the channel there,
    fading to 0 away from the stream and away from them."""
    stream = polyline_distance(xs, ys, STREAM)
    kept = np.zeros_like(xs)
    for c in OPEN_CHANNELS:
        near = 1.0 - smooth(*OPEN_REACH_PX, np.hypot(xs - c[0], ys - c[1]))
        kept = 1.0 - (1.0 - kept) * (1.0 - near * (1.0 - smooth(*OPEN_CHANNEL_PX, stream)))
    return kept


def cut_and_fill(xs, ys, height, roads):
    """Set the land to the roads' heights near their centrelines, leaving the sea, the mill pond, the bailey (the
    castle's curtain wall stands on its rim) and the stream's channel under the bridge and the watermill as they are;
    where a road passes close below the bailey, the ground from its edge up to the rim is one straight slope."""
    distance, target, owner = road_field(roads)
    weight = (1.0 - smooth(ROAD_FLAT_PX, ROAD_FADE_PX, distance)) * (1.0 - open_channel(xs, ys))
    pond = np.hypot(xs - POND_CENTRE[0], ys - POND_CENTRE[1])
    weight *= smooth(POND_PX + POND_BANK_PX, POND_PX + POND_BANK_PX + 4.0, pond)
    bailey = np.hypot(xs - KNOLL_CENTRE[0], ys - KNOLL_CENTRE[1])
    weight *= (bailey > BAILEY_PX) & (height >= 0.0)
    cut = height + weight * (target - height)
    # Across the gap between the rim and the road's edge, measured out from the bailey's centre as the distance past
    # the rim plus the distance short of the road's edge, the slope runs straight from the rim's height to the road's,
    # cutting the bailey's bank where it bulges above that line and filling it where it sags below.
    outside = np.maximum(bailey - BAILEY_PX, 0.0)
    gap = outside + np.maximum(distance - ROAD_FLAT_PX, 0.0)
    to_rim = BAILEY_PX / np.maximum(bailey, 1e-6)
    rim = at(height, np.stack([KNOLL_CENTRE[0] + (xs - KNOLL_CENTRE[0]) * to_rim,
                               KNOLL_CENTRE[1] + (ys - KNOLL_CENTRE[1]) * to_rim], -1).reshape(-1, 2)).reshape(height.shape)
    with np.errstate(invalid="ignore"):
        slope = rim + np.where(gap > 0.0, outside / np.where(gap > 0.0, gap, 1.0), 1.0) * (target - rim)
    reach = (bailey > BAILEY_PX) * (1.0 - smooth(*BAILEY_SLOPE_GAP_PX, gap))
    return cut + reach * (slope - cut), distance, owner


def stair_plan(roads, height, road_distance):
    """The castle stair's plan in the castle's frame, on the ground cut and filled to the roads: the bailey's floor in
    metres, the pitch the flights share, the foot (the middle of the lower flight's opening to the road) and its
    level, and the parts in order down from the gate, each either a landing (a convex outline, the level of its paving
    and the edges it leaves open) or a flight (its start, unit direction, run, step count and the levels it falls
    between; the lower flight also its foot: the side, -1 for its right, its lowest steps open on and how many), levels
    in metres from the floor."""
    bx, by = ANCHORS["bailey"]
    floor = KNOLL_HEIGHT * PEAK_M

    def sample(field, p):
        return float(bilinear(field, bx + p[0] / M_PER_PX, by - p[1] / M_PER_PX))

    vertex, leg_end = (np.array(p, float) for p in RING[9:11])
    down = vertex - leg_end
    down = np.array([down[0], -down[1]]) / np.hypot(*down)
    left = np.array([-down[1], down[0]])
    half, upper_y = STAIR_HALF, STAIR_UPPER_Y
    turn = -half - STAIR_UPPER_RUN
    lower = np.array([turn, upper_y - half]) - half * left
    road_side = lower - half * left
    # The lower flight heads for the gate vertex, where the roads meet, so its road-side edge reaches the paving.
    reach = 0.0
    while sample(road_distance, road_side + down * (reach + STAIR_SEARCH_M)) >= PAVED_PX[0]:
        reach += STAIR_SEARCH_M
    run = reach - STAIR_WALL_M
    foot = sample(height, road_side + down * run) * PEAK_M - floor
    pitch = -foot / (STAIR_UPPER_RUN + run)
    if pitch > math.tan(math.radians(STAIR_MAX_DEG)):
        raise ValueError("the castle stair's flights would climb at %.1f degrees" % math.degrees(math.atan(pitch)))
    mid = -STAIR_UPPER_RUN * pitch
    steps = [max(1, round(drop / STAIR_RISE_M)) for drop in (-mid, mid - foot)]
    opening = run * STAIR_OPEN_STEPS / steps[1]
    parts = [{"landing": [(-half, STAIR_GATE_Y), (-half, upper_y - half), (half, upper_y - half), (half, STAIR_GATE_Y)],
              "level": 0.0, "open": [3]},
             {"start": (-half, upper_y), "along": (-1.0, 0.0), "run": STAIR_UPPER_RUN, "steps": steps[0],
              "levels": (0.0, mid)},
             {"landing": [(turn, upper_y + half), (turn - 2 * half, upper_y + half), (turn - 2 * half, upper_y - half),
                          tuple(lower - half * left), (turn, upper_y - half)], "level": mid, "open": []},
             {"start": tuple(lower), "along": tuple(down), "run": run, "steps": steps[1], "levels": (mid, foot),
              "foot": {"side": -1, "steps": STAIR_OPEN_STEPS}}]
    return {"floor": floor, "pitch": pitch, "foot_xy": tuple(road_side + down * (run - opening / 2)), "foot": foot,
            "parts": parts}


def stair_outline(part):
    """A stair part's outline in the castle's frame, counter-clockwise: a landing's own, a flight's rectangle over its
    walls and, at the foot, the wall across its end."""
    if "landing" in part:
        return np.array(part["landing"], float)
    start, along = np.array(part["start"], float), np.array(part["along"], float)
    side = np.array([-along[1], along[0]]) * STAIR_HALF
    end = start + along * (part["run"] + (STAIR_WALL_M if "foot" in part else 0.0))
    return np.array([start - side, end - side, end + side, start + side])


def inside_outline(outline, xs, ys):
    """Whether points (xs, ys) lie inside a convex counter-clockwise outline or on its edges."""
    inside = np.ones(np.shape(xs), bool)
    for a, b in zip(outline, np.roll(outline, -1, axis=0)):
        inside &= (b[0] - a[0]) * (ys - a[1]) - (b[1] - a[1]) * (xs - a[0]) >= 0.0
    return inside


def stair_cut(plan, xs, ys):
    """The level the ground under the castle stair is cut to at map points (xs, ys), as a fraction of the peak:
    STAIR_CUT_M under the paving or the nosings above each point outside the bailey, infinite elsewhere."""
    bx, by = ANCHORS["bailey"]
    cx, cy = (xs - bx) * M_PER_PX, (by - ys) * M_PER_PX
    outside = np.hypot(xs - bx, ys - by) > BAILEY_PX
    cut = np.full(np.shape(xs), np.inf)
    for part in plan["parts"]:
        inside = outside & inside_outline(stair_outline(part), cx, cy)
        if "landing" in part:
            level = part["level"]
        else:
            start, along = np.array(part["start"]), np.array(part["along"])
            run = np.clip((cx - start[0]) * along[0] + (cy - start[1]) * along[1], 0.0, part["run"])
            z0, z1 = part["levels"]
            level = z0 + (z1 - z0) * run / part["run"]
        cut = np.where(inside, np.minimum(cut, (plan["floor"] + level - STAIR_CUT_M) / PEAK_M), cut)
    return cut


def mesh_ground(data, xs, ys):
    """The ground at map points (xs, ys) as the terrain's mesh has it, a fraction of the peak: the samples interpolated
    between, with the castle stair's cut taken at the points themselves so its edges stay sharp."""
    return np.minimum(bilinear(data["height"] + data["bench"], xs, ys), stair_cut(data["stair"], xs, ys))


def value_noise(seed, cell):
    """Smooth noise in 0..1 over the map: random values every `cell` px, blended with smoothstep weights."""
    rng = np.random.default_rng(seed)
    values = rng.random((int(H / cell) + 3, int(W / cell) + 3))
    xs, ys = grid()
    u, v = xs / cell, ys / cell
    i, j = np.floor(u).astype(int), np.floor(v).astype(int)
    fx, fy = u - i, v - j
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    top = values[j, i] * (1 - fx) + values[j, i + 1] * fx
    bottom = values[j + 1, i] * (1 - fx) + values[j + 1, i + 1] * fx
    return top * (1 - fy) + bottom * fy


def crags(xs, ys, height, road_distance):
    """How deep the rock sculpting cuts at every sample: gullies where the noise runs low or high, ridges left
    standing where it crosses the middle, only on steep or high land clear of the roads, the summit and the bailey."""
    gy, gx = np.gradient(height * PEAK_M, M_PER_PX)
    where = np.maximum(smooth(*CRAG_SLOPE, np.hypot(gx, gy)), smooth(*CRAG_HEIGHT, height))
    where *= smooth(*CRAG_ROAD_CLEAR_PX, road_distance)
    where *= smooth(*CRAG_SUMMIT_CLEAR_PX, np.hypot(xs - PEAK_CENTRE[0], ys - PEAK_CENTRE[1]))
    knoll = np.hypot(xs - KNOLL_CENTRE[0], ys - KNOLL_CENTRE[1])
    where *= smooth(BAILEY_PX + CRAG_BAILEY_CLEAR_PX[0], BAILEY_PX + CRAG_BAILEY_CLEAR_PX[1], knoll)
    where *= height > 0.0
    gullies = sum(weight * np.abs(2.0 * value_noise(CRAG_SEED + k, cell) - 1.0) ** 2
                  for k, (cell, weight) in enumerate(zip(CRAG_CELLS_PX, CRAG_WEIGHTS)))
    return CRAG_DEPTH * where * gullies


def compute():
    """The whole heightmap: the natural ground, the mask, the relaxed roads, the ground cut and filled to them, the
    castle stair's plan and the cut for it, its rock sculpted, and for each sample the distance to the nearest road,
    which road that is (its index in roads), the distance to the stream, how deep the sculpting cut and how deep the
    stair's cut."""
    xs, ys = grid()
    ground, mask = natural(xs, ys)
    roads = road_profiles(ground)
    height, road_distance, road_owner = cut_and_fill(xs, ys, ground, roads)
    stair = stair_plan(roads, height, road_distance)
    benched = np.minimum(height, stair_cut(stair, xs, ys))
    carved = crags(xs, ys, benched, road_distance)
    return {"height": benched - carved, "natural": ground, "mask": mask, "roads": roads,
            "road_distance": road_distance, "road_owner": road_owner, "stream_distance": polyline_distance(xs, ys, STREAM),
            "crags": carved, "stair": stair, "bench": height - benched}


@functools.lru_cache(maxsize=1)
def cached():
    """compute() once per process for everything built on the terrain (the terrain itself and the landmarks that
    stand on it); read only."""
    return compute()


def to_metres(x, y):
    """A map point in mesh metres: X east and Y north of the map centre."""
    return (x - W / 2) * M_PER_PX, (H / 2 - y) * M_PER_PX


def anchor_to_px(anchor, east, north):
    """The map point `east` and `north` metres from the map point `anchor`."""
    return anchor[0] + east / M_PER_PX, anchor[1] - north / M_PER_PX


def coastline(height):
    """The coast: the loops where the ground crosses the waterline."""
    return contours(height, 0.0)


def contours(field, level):
    """The lines where a field crosses `level`, by marching squares on the sample grid, each a list of map points
    (a closed loop ends where it starts), longest first."""
    above = field > level

    def crossing(p, q):
        # Interpolated from the lower-indexed corner, so the two cells sharing an edge produce the same point.
        p, q = min(p, q), max(p, q)
        vp, vq = field[p[1], p[0]], field[q[1], q[0]]
        t = (level - vp) / (vq - vp)
        return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)

    segments = []
    for j in range(field.shape[0] - 1):
        top, bottom = above[j], above[j + 1]
        cells = np.nonzero((top[:-1] ^ top[1:]) | (bottom[:-1] ^ bottom[1:]) | (top[:-1] ^ bottom[:-1]))[0]
        for i in cells:
            corners = ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))
            states = [above[cj, ci] for ci, cj in corners]
            points = [crossing(corners[k], corners[(k + 1) % 4]) for k in range(4) if states[k] != states[(k + 1) % 4]]
            if len(points) == 2:
                segments.append(tuple(points))
            elif len(points) == 4:
                # A saddle: the diagonal on the same side as the cell's centre stays joined, so the contour cuts off
                # the other two corners.
                centre = sum(field[cj, ci] for ci, cj in corners) / 4 > level
                pairs = ((0, 1), (2, 3)) if centre == states[0] else ((0, 3), (1, 2))
                segments += [(points[a], points[b]) for a, b in pairs]
    return _link(segments)


def _link(segments):
    """Chain segments sharing end points into loops."""
    ends = {}
    for k, (a, b) in enumerate(segments):
        ends.setdefault(a, []).append(k)
        ends.setdefault(b, []).append(k)
    used = [False] * len(segments)
    loops = []
    for start in range(len(segments)):
        if used[start]:
            continue
        used[start] = True
        a, b = segments[start]
        loop = [a, b]
        while True:
            nxt = next((k for k in ends[loop[-1]] if not used[k]), None)
            if nxt is None:
                break
            used[nxt] = True
            p, q = segments[nxt]
            loop.append(q if p == loop[-1] else p)
        loops.append(loop)
    return sorted(loops, key=len, reverse=True)


def resample(points, spacing):
    """Points every `spacing` px along a polyline, its first point kept."""
    pts = np.asarray(points, float)
    if len(pts) < 2:
        return pts
    steps = np.hypot(*np.diff(pts, axis=0).T)
    along = np.concatenate([[0.0], np.cumsum(steps)])
    stations = np.arange(0.0, along[-1], spacing)
    return np.stack([np.interp(stations, along, pts[:, 0]), np.interp(stations, along, pts[:, 1])], axis=1)


def loop_area(loop):
    """The area a closed loop of map points encloses, in px squared."""
    pts = np.asarray(loop, float)
    return 0.5 * abs(float(np.dot(pts[:-1, 0], pts[1:, 1]) - np.dot(pts[1:, 0], pts[:-1, 1])))


def simplify(points, tolerance):
    """Douglas-Peucker on an open or closed list of map points."""
    if len(points) < 3:
        return list(points)
    pts = np.array(points)
    keep = np.zeros(len(pts), bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i0, i1 = stack.pop()
        if i1 <= i0 + 1:
            continue
        a, b = pts[i0], pts[i1]
        ab = b - a
        seg = pts[i0 + 1:i1] - a
        length = np.hypot(*ab)
        d = np.abs(ab[0] * seg[:, 1] - ab[1] * seg[:, 0]) / length if length > 1e-9 else np.hypot(seg[:, 0], seg[:, 1])
        k = int(np.argmax(d))
        if d[k] > tolerance:
            keep[i0 + 1 + k] = True
            stack += [(i0, i0 + 1 + k), (i0 + 1 + k, i1)]
    return [tuple(p) for p in pts[keep]]


def write_png16(path, values, lo, hi):
    """A 16-bit greyscale PNG of `values` mapped from lo..hi to 0..65535, row 0 at the top (north)."""
    data = np.round((np.clip(values, lo, hi) - lo) / (hi - lo) * 65535.0).astype(">u2")
    rows = b"".join(b"\x00" + row.tobytes() for row in data)

    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", data.shape[1], data.shape[0], 16, 0, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b""))


def read_png16(path, lo, hi):
    """Read back a PNG written by write_png16 as heights."""
    with open(path, "rb") as f:
        data = f.read()
    pos, idat, size = 8, b"", None
    while pos < len(data):
        length, kind = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + length]
        if kind == b"IHDR":
            size = struct.unpack(">II", body[:8])
        elif kind == b"IDAT":
            idat += body
        pos += 12 + length
    width, height = size
    raw = np.frombuffer(zlib.decompress(idat), np.uint8).reshape(height, 1 + 2 * width)
    values = raw[:, 1:].copy().view(">u2").astype(float)
    return lo + values / 65535.0 * (hi - lo)
