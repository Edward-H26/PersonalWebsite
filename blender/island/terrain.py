"""Island v2 terrain (DESIGN.md section 17): one ground mesh built from the heightmap of heightmap.py, sampled densely
where the ground has detail (the roads and their cut and fill, the quay wall, the bailey's edge, terrace risers,
cliffs, the stream and the shore) and sparsely on meadow and sea floor, and triangulated by Delaunay so every
triangle stays well shaped; its ground painted twice: Col, the colour of the ground blended from four classes (grass,
rock, sand and path) for a plain vertex-colour material, and Splat, the weights of the four ground textures (grass,
earth, gravel and sand in R, G, B and A) for the site's blend. Water level is Z = 0; the mesh is in metres, X east and
Y north of the map centre.

Beside terrain.glb it writes the 16-bit heightmap the site places everything by, and terrain.json in the site's own
terms: map pixels with heights as fractions of the peak and the factors that turn them into scene units, the
heightmap's encoding, the road and stream profiles at every pixel with their arc length and t, the island's outline
with its quay wall and beach, the specification's checkpoints, and where each landmark lands and which way it faces.

Headless, from the repository root:
    /Applications/Blender.app/Contents/MacOS/Blender --background --python blender/island/terrain.py -- \\
        --out public/models/island --previews blender/previews"""

import argparse
import json
import math
import os
import re
import sys

BLENDER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BLENDER_DIR not in sys.path:
    sys.path.insert(0, BLENDER_DIR)

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402

from island import heightmap as hm  # noqa: E402
from island import mesh, rig, style  # noqa: E402

NAME = "isl_terrain"
GLB, HEIGHTMAP, MANIFEST = "terrain.glb", "terrain_height.png", "terrain.json"
SPLAT_ATTRIBUTE = "Splat"
# Col blends the colours of COLOUR_CLASSES; Splat holds the weights of the ground textures in SPLAT_CHANNELS (R G B A).
COLOUR_CLASSES = ("grass", "rock", "sand", "path")
SPLAT_CHANNELS = ("grass", "earth", "gravel", "sand")
# Scene units per metre (DESIGN.md section 17's factor 1.30), so a map pixel is M_PER_PX * UNITS_PER_METRE units.
UNITS_PER_METRE = 1.3
# Point spacing in px: the finest along roads and hard edges, detail where the ground bends or steepens, meadow and
# sea floor coarser; BEND thresholds are the height's Laplacian in metres per px squared, SLOPE_FINE rise over run.
FINEST_PX, DETAIL_PX, MEADOW_PX, COARSE_PX = 2, 4, 8, 32
BEND_FINE, BEND_FINEST, SLOPE_FINE = 0.012, 0.15, 0.35
# The road and its verges at the finest spacing, the rest of its cut and fill at the detail spacing.
ROAD_CORE_PX = 8.0
# The shore band sampled in detail: from the shelf just below the waterline to SHORE_TOP above it.
SHORE_SHELF, SHORE_TOP = -0.019, 0.035
STREAM_DETAIL_PX, STREAM_CORE_PX, QUAY_DETAIL_PX, BAILEY_DETAIL_PX = 14.0, 8.0, 8.0, 4.0
# Sculpted rock deeper than CRAG_DETAIL (fraction of the peak) is sampled at the detail spacing.
CRAG_DETAIL = 0.002
# Break lines the triangulation follows, sampled every BREAK_PX: the waterline, the quay wall's top and foot near the
# quay, the knoll cliff's top and foot, the bailey's rim and the foot of its bank, the pond's banks. Grid points
# closer than BREAK_CLEAR_PX to a break line give way to it.
BREAK_PX, BREAK_CLEAR_PX = 2.0, 1.5
QUAY_LEVELS, QUAY_REACH_PX = (0.05, -0.04), 12.0
CLIFF_LEVELS, CLIFF_REACH_PX = (0.385, 0.255), 52.0
# Coast loops enclosing less than this many px squared (single pixels at the waterline) are left out of the outline.
OUTLINE_MIN_AREA_PX = 20.0
# Ground painting. Rock where the ground is steeper than ROCK_SLOPE (rise over run) and on the high ridge.
ROCK_SLOPE, ROCK_HEIGHT = (0.55, 0.85), (0.6, 0.75)
# Sand below SAND_HEIGHT on gentle ground and on the sea floor; wet sand within WET_BAND of the waterline.
SAND_HEIGHT, WET_BAND = (0.022, 0.034), 0.005
# Every road is paved (cobbles in the village, gravel outside) fully within PAVED_PX[0] of its centreline, fading out
# by PAVED_PX[1], with worn earth verges fading into the grass by VERGE_PX[1]; the cobbled quay apron and square.
PAVED_PX, VERGE_PX, QUAY_APRON_PX, SQUARE_PX = (6.0, 8.0), (8.0, 12.0), (6.0, 10.0), (12.0, 16.0)
STREAM_BED_PX = (2.5, 5.0)
# The sea this many px out from the shore is painted like the shore beside it.
SHORE_PAINT_PX = 3
# The greens near the shore take SEA_GREENS_SHARE of the sea-greens, fading to the inland greens by SEA_GREENS_PX.
SEA_GREENS_PX, SEA_GREENS_SHARE = (20.0, 70.0), 0.6
NOISE_CELLS, NOISE_SEED = 24, 11
# The outline is simplified to this many px; the beach is the shore rising gentler than BEACH_SLOPE (rise over run).
OUTLINE_TOLERANCE_PX, BEACH_SLOPE = 0.5, 2.0
# Three fields (DESIGN.md section 17) on gentle ground by the ring's east leg, turned along the contours and clear of
# the roads, the stream and the hummocks' tops: centre in map px, size along and across, the long side's direction in
# degrees in map pixel axes (x east, y south), and whether every side is dry-stone wall or only the one nearest a road,
# which carries the gateway; the other sides are hedgerow. Each holds a haystack a third of the way in from either end.
FIELDS = (((628, 426), (46, 30), -41.7, "road"), ((630, 508), (58, 36), -28.2, "road"), ((668, 382), (46, 30), -88.7, "all"))
# The plan artifact's orchard rows, and the ring junction that gets a signpost.
ORCHARD_PX = tuple((440 + c * 13 + r * 5, 500 + r * 11) for r in range(3) for c in range(5))
SIGNPOST_PX = (490, 400)
# The pier runs from the quay into the bay (DESIGN.md section 17).
PIER_PX = ((365, 505), (305, 540))
# The barracks stands as the garrison house across the ring from the castle stair, clear of the road, facing it.
BARRACKS_PX = (646, 334)
# Previews: the overview from the south-west, and walks at eye height from one map point toward another.
OVERVIEW_VIEW, OVERVIEW_SIZE = (-28.0, 32.0), (1600, 1000)
WALK_EYE_M, WALK_LENS, WALK_SIZE = 1.7, 26.0, (1600, 900)
# (from, toward, eye height in metres): two walks on the ring, and two higher looks at the bay and the knoll.
WALKS = {"street": ((380, 470), (640, 275), WALK_EYE_M), "fields": ((595, 485), (700, 230), WALK_EYE_M),
         "bay": ((300, 640), (470, 430), 30.0), "knoll": ((560, 360), (650, 270), 12.0),
         "quay": ((318, 548), (380, 500), 5.0)}
DEVIATIONS = ("The coast's softness turns from shore to cliff over 0.06 rad either side of 0.2 and 2.4 rad instead of "
              "in one step, which notched the coastline.",
              "The mill pond has a 3 px bank either side of its 16 px radius instead of a vertical wall.",
              "The bailey keeps its flat top to 28 px and falls to the knoll's slope over a 6 px bank outside it; the "
              "knoll cliff's line turns over 1 px either side and its cap's arc over 3 px, instead of in one step.",
              "Bare rock is sculpted: gullies up to heightmap.CRAG_DEPTH of the peak are carved into steep or high "
              "ground clear of the roads, the summit and the bailey; nothing rises above the specification.",
              "Each spur leaves the ring at the ring's relaxed height and eases into its own profile over 20 px.",
              "The roads leave the stream's channel open under the bridge and the watermill, and never fill the sea "
              "or the pond.")


def build(data):
    """The terrain object: the heightmap sampled at points spaced by how much detail the ground has there, joined by
    a Delaunay triangulation, its ground painted."""
    ob = _triangulate(data["height"], sample_points(data))
    _paint(ob, ground_maps(data))
    ob.data.materials.append(terrain_material())
    ob.data.polygons.foreach_set("use_smooth", np.ones(len(ob.data.polygons), bool))
    return ob


def spacing(data):
    """The point spacing in px the ground needs at every sample, a power of two: finest on the roads and their verges,
    the quay wall, the bailey's edge, the pond and sharp breaks of slope, detail on the roads' cut and fill, where
    the ground bends or steepens (terrace risers, cliffs), along the stream and on the shore, coarse on open meadow
    and where the sea floor shelves away under the water, and coarsest on the rest of the sea floor."""
    h = data["height"] * hm.PEAK_M
    xs, ys = hm.grid()
    bend = np.abs(np.gradient(np.gradient(h, axis=0), axis=0) + np.gradient(np.gradient(h, axis=1), axis=1))
    gy, gx = np.gradient(h, hm.M_PER_PX)
    slope = np.hypot(gx, gy)
    s = np.full(h.shape, COARSE_PX)
    underwater = data["height"] <= SHORE_SHELF
    bends = (bend > BEND_FINE) | (slope > SLOPE_FINE)
    s[~underwater | bends] = MEADOW_PX
    fine = (bends & ~underwater) | (data["stream_distance"] < STREAM_DETAIL_PX)
    fine |= (data["road_distance"] < hm.ROAD_FADE_PX + 2.0) | (data["crags"] > CRAG_DETAIL)
    fine |= (data["height"] > SHORE_SHELF) & (data["height"] < SHORE_TOP)
    s[fine] = DETAIL_PX
    finest = (bend > BEND_FINEST) | (data["road_distance"] < ROAD_CORE_PX) | (data["stream_distance"] < STREAM_CORE_PX)
    finest |= hm.segment(xs, ys, *hm.QUAY)[0] < QUAY_DETAIL_PX
    finest |= np.abs(np.hypot(xs - hm.KNOLL_CENTRE[0], ys - hm.KNOLL_CENTRE[1]) - hm.BAILEY_PX) < BAILEY_DETAIL_PX
    finest |= np.hypot(xs - hm.POND_CENTRE[0], ys - hm.POND_CENTRE[1]) < hm.POND_PX + 6.0
    s[finest] = FINEST_PX
    return s


def sample_points(data):
    """Map points on nested grids, a point of the grid every s px kept where the ground needs a spacing of s or finer,
    so each region ends up sampled at its own spacing, with the map's far edges added so the points cover it; then
    the break lines, which the grid points next to them give way to."""
    need = spacing(data)
    ys, xs = np.mgrid[0:hm.H:FINEST_PX, 0:hm.W:FINEST_PX]
    level = np.full(xs.shape, FINEST_PX)
    step = FINEST_PX * 2
    while step <= COARSE_PX:
        level[(xs % step == 0) & (ys % step == 0)] = step
        step *= 2
    keep = need[ys, xs] <= level
    lines = break_points(data)
    taken = np.zeros((hm.H, hm.W), bool)
    reach = int(math.ceil(BREAK_CLEAR_PX))
    for x, y in lines:
        i0, j0 = int(round(x)), int(round(y))
        window = taken[max(0, j0 - reach):j0 + reach + 1, max(0, i0 - reach):i0 + reach + 1]
        wy, wx = np.mgrid[max(0, j0 - reach):j0 + reach + 1, max(0, i0 - reach):i0 + reach + 1]
        window |= np.hypot(wx - x, wy - y) < BREAK_CLEAR_PX
    keep &= ~taken[ys, xs] | (level == COARSE_PX)
    points = set(zip(xs[keep].tolist(), ys[keep].tolist()))
    right, bottom = xs.max(), ys.max()
    points |= {(right, y) for y in range(0, bottom + 1, COARSE_PX)} | {(x, bottom) for x in range(0, right + 1, COARSE_PX)}
    points.add((right, bottom))
    return np.concatenate([np.array(sorted(points), float), lines])


def _circle(centre, radius):
    count = max(8, int(round(2 * math.pi * radius / BREAK_PX)))
    a = np.linspace(0.0, 2 * math.pi, count, endpoint=False)
    return np.stack([centre[0] + radius * np.cos(a), centre[1] + radius * np.sin(a)], axis=1)


def _near(points, centre_or_segment, reach):
    """The points within `reach` px of a point or of a segment ((x0, y0), (x1, y1))."""
    if len(points) == 0:
        return points
    if np.ndim(centre_or_segment[0]) == 0:
        d = np.hypot(points[:, 0] - centre_or_segment[0], points[:, 1] - centre_or_segment[1])
    else:
        d = hm.segment(points[:, 0], points[:, 1], *centre_or_segment)[0]
    return points[d < reach]


def break_points(data):
    """Points along the lines hard features run along, so the triangulation follows them instead of cutting across
    them in a zigzag: the waterline, the quay wall, the knoll cliff, the bailey's rim and bank foot and the pond's
    banks."""
    h = data["height"]
    lines = [hm.resample(loop, BREAK_PX) for loop in hm.coastline(h) if hm.loop_area(loop) >= OUTLINE_MIN_AREA_PX]
    for level in QUAY_LEVELS:
        lines += [_near(hm.resample(loop, BREAK_PX), hm.QUAY, QUAY_REACH_PX) for loop in hm.contours(h, level)]
    for level in CLIFF_LEVELS:
        knoll = [_near(hm.resample(loop, BREAK_PX), hm.KNOLL_CENTRE, CLIFF_REACH_PX) for loop in hm.contours(h, level)]
        lines += [pts[pts[:, 1] < hm.KNOLL_CLIFF_Y + 2.0] for pts in knoll]
    lines += [_circle(hm.KNOLL_CENTRE, r) for r in (hm.BAILEY_PX, hm.BAILEY_PX + hm.BAILEY_BANK_PX)]
    lines += [_circle(hm.POND_CENTRE, r) for r in (hm.POND_PX - hm.POND_BANK_PX, hm.POND_PX + hm.POND_BANK_PX)]
    return np.concatenate([pts for pts in lines if len(pts)])


def _triangulate(height, points):
    """One mesh of the points at their heights, triangulated by Delaunay in plan, faces turned up."""
    from mathutils.geometry import delaunay_2d_cdt
    coords, _, faces, _, _, _ = delaunay_2d_cdt([Vector(p) for p in points], [], [], 0, 1e-6)
    plan = np.array([tuple(c) for c in coords])
    x, y = to_mesh(plan[:, 0], plan[:, 1])
    z = _bilinear(height, plan[:, 0], plan[:, 1]) * hm.PEAK_M
    # Map y grows south, so a triangle counter-clockwise on the map is clockwise seen from above in the mesh.
    tris = np.array([f[::-1] for f in faces], np.int32)
    me = bpy.data.meshes.new(NAME)
    me.vertices.add(len(x))
    me.vertices.foreach_set("co", np.stack([x, y, z], 1).astype(np.float32).ravel())
    me.loops.add(tris.size)
    me.loops.foreach_set("vertex_index", tris.ravel())
    me.polygons.add(len(tris))
    me.polygons.foreach_set("loop_start", (np.arange(len(tris)) * 3).astype(np.int32))
    me.update()
    me.validate()
    if me.polygons[0].normal.z < 0.0:
        me.flip_normals()
    return mesh.link(bpy.data.objects.new(NAME, me))


def to_mesh(x, y):
    """Map pixels to mesh metres."""
    return (np.asarray(x, float) - hm.W / 2) * hm.M_PER_PX, (hm.H / 2 - np.asarray(y, float)) * hm.M_PER_PX


def to_map(x, y):
    """Mesh metres back to map pixels."""
    return np.asarray(x) / hm.M_PER_PX + hm.W / 2, hm.H / 2 - np.asarray(y) / hm.M_PER_PX


def _value_noise(seed, cells):
    """Smooth noise in 0..1 over the map: random values on a coarse grid of `cells` across, bilinearly upsampled."""
    rng = np.random.default_rng(seed)
    coarse = rng.random((cells * hm.H // hm.W + 2, cells + 2))
    ys, xs = hm.grid()
    return _bilinear(coarse, xs / hm.W * cells, ys / hm.W * cells)


def _bilinear(field, x, y):
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


def ground_maps(data):
    """Per pixel, the weights of the four ground textures (grass, earth, gravel, sand) and the painted colour of the
    ground, blended from its four classes (grass, rock, sand, path)."""
    h, smooth = data["height"], hm.smooth
    xs, ys = hm.grid()
    gy, gx = np.gradient(h * hm.PEAK_M, hm.M_PER_PX)
    slope = np.hypot(gx, gy)
    sea = h < 0.0
    rock = np.maximum(smooth(*ROCK_SLOPE, slope), smooth(*ROCK_HEIGHT, h) * smooth(0.25, 0.5, slope)) * ~sea
    sand = np.where(sea, 1.0, (1.0 - smooth(*SAND_HEIGHT, h)) * (1.0 - smooth(0.25, 0.45, slope)))
    distance = data["road_distance"]
    # Under the bridge and at the watermill the stream's bed stays earth instead of the road's paving above it.
    road = (1.0 - smooth(*PAVED_PX, distance)) * (1.0 - hm.open_channel(xs, ys))
    apron = (1.0 - smooth(*QUAY_APRON_PX, hm.segment(xs, ys, *hm.QUAY)[0])) * (h > 0.0)
    square = 1.0 - smooth(*SQUARE_PX, np.hypot(xs - hm.ANCHORS["square"][0], ys - hm.ANCHORS["square"][1]))
    paved = np.maximum.reduce([road, apron, square]) * ~sea
    bed = 1.0 - smooth(*STREAM_BED_PX, data["stream_distance"])
    pond = 1.0 - smooth(hm.POND_PX - 1.0, hm.POND_PX + 2.0, np.hypot(xs - hm.POND_CENTRE[0], ys - hm.POND_CENTRE[1]))
    worn = np.maximum.reduce([1.0 - smooth(*VERGE_PX, distance), bed, pond]) * ~sea
    rock_w, path_w, sand_w, grass_w = _shares(rock, np.maximum.reduce([paved, bed, pond]), sand)
    colour = _colours(data, np.stack([grass_w, rock_w, sand_w, path_w], axis=-1), xs, ys)
    # Bare rock takes the gravel texture under its own colour; the roads' cores are pure gravel.
    gravel_w, earth_w, sand_w, grass_w = _shares(np.maximum(paved, rock), worn, sand)
    weights = np.stack([grass_w, earth_w, gravel_w, sand_w], axis=-1)
    # The waterline's vertices fall between land and sea samples, so the sea next to the shore takes the shore's paint
    # and a quay wall or a cliff stays stone down to the water instead of fading to the sea floor's sand.
    weights, colour = (_extend_land(values, ~sea, SHORE_PAINT_PX) for values in (weights, colour))
    return {"weights": weights, "colour": colour}


def _shares(*layers):
    """Weights summing to 1 from layers in priority order, each taking its share of what the layers before it left,
    and the remainder (the grass) last."""
    left = np.ones_like(layers[0])
    shares = []
    for layer in layers:
        shares.append(layer * left)
        left = left * (1.0 - layer)
    return (*shares, left)


def _extend_land(values, land, steps):
    """`values` with each sea sample within `steps` px of land set to the mean of its painted neighbours, ring by
    ring outward from the shore."""
    values, valid = values.copy(), land.copy()
    for _ in range(steps):
        total = np.zeros_like(values)
        count = np.zeros(valid.shape)
        for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            shifted = np.roll(valid, (dj, di), axis=(0, 1))
            total += np.roll(values, (dj, di), axis=(0, 1)) * shifted[..., None]
            count += shifted
        grow = ~valid & (count > 0)
        values[grow] = total[grow] / count[grow][:, None]
        valid |= grow
    return values


def _colours(data, weights, xs, ys):
    """The painted ground: greens shifting from the sea-greens of the shore to the inland greens, broken by a soft
    noise between body and light; slate rock, sand darkening at the waterline, cobbles in the village and worn earth
    outside it, dark earth in the stream bed."""
    h = data["height"]
    noise = _value_noise(NOISE_SEED, NOISE_CELLS)
    inland = 1.0 - SEA_GREENS_SHARE * (1.0 - hm.smooth(*SEA_GREENS_PX, _coast_distance(h)))[..., None]
    sea_body, sea_light = (np.array(style.rgb(style.SEA_GREENS[k])) for k in ("body", "light"))
    land_body, land_light = (np.array(style.rgb(style.INLAND_GREENS[k])) for k in ("body", "light"))
    lift = 0.12 + 0.2 * noise[..., None]
    grass = (sea_body + (sea_light - sea_body) * lift) * (1 - inland) + (land_body + (land_light - land_body) * lift) * inland
    rock = np.array(style.linear("driftwood")) + (np.array(style.linear("stone_light")) - np.array(style.linear("driftwood"))) * noise[..., None]
    wet = (1.0 - hm.smooth(0.0, WET_BAND, np.abs(h)))[..., None]
    sand = np.array(style.linear("sand")) * (1 - wet) + np.array(style.linear("sand_wet")) * wet
    village = (1.0 - hm.smooth(*hm.VILLAGE_FADE_PX, np.hypot(xs - hm.VILLAGE_CENTRE[0], ys - hm.VILLAGE_CENTRE[1])))[..., None]
    pond = 1.0 - hm.smooth(hm.POND_PX - 1.0, hm.POND_PX + 2.0, np.hypot(xs - hm.POND_CENTRE[0], ys - hm.POND_CENTRE[1]))
    bed = np.maximum(1.0 - hm.smooth(*STREAM_BED_PX, data["stream_distance"]), pond)[..., None]
    cobble = 0.5 * (np.array(style.linear("stone_honey")) + np.array(style.linear("stone_light")))
    ground = cobble * village + np.array(style.linear("ground")) * (1 - village)
    path = ground * (1 - bed) + np.array(style.linear("soil")) * bed
    parts = (grass, rock, sand, path)
    return sum(weights[..., k:k + 1] * parts[k] for k in range(4))


def _coast_distance(h):
    """A cheap distance in px from every land sample to the sea: repeated 3 x 3 erosions of the land, capped."""
    land = h > 0.0
    distance = np.zeros(h.shape)
    current = land.copy()
    for step in range(1, int(SEA_GREENS_PX[1]) + 1):
        distance += current
        shrunk = current.copy()
        shrunk[1:, :] &= current[:-1, :]
        shrunk[:-1, :] &= current[1:, :]
        shrunk[:, 1:] &= current[:, :-1]
        shrunk[:, :-1] &= current[:, 1:]
        current = shrunk
        if not current.any():
            break
    return distance


def _paint(ob, maps):
    """Write Col and Splat on every vertex, sampled from the pixel maps under it."""
    me = ob.data
    co = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    x, y = to_map(co[0::3], co[1::3])
    for name, values in ((style.COLOR_ATTRIBUTE, np.concatenate([_bilinear(maps["colour"], x, y), np.ones((len(x), 1))], 1)),
                         (SPLAT_ATTRIBUTE, _bilinear(maps["weights"], x, y))):
        attr = me.color_attributes.new(name, "FLOAT_COLOR", "POINT")
        attr.data.foreach_set("color", values.astype(np.float32).ravel())
    me.color_attributes.active_color = me.color_attributes[style.COLOR_ATTRIBUTE]


def terrain_material():
    """The terrain's one material, named for the site's ground blend, drawing the painted Col until the site binds
    its textures."""
    m = bpy.data.materials.get(NAME)
    if m is not None:
        return m
    m = bpy.data.materials.new(NAME)
    nodes, links = m.node_tree.nodes, m.node_tree.links
    colour = nodes.new("ShaderNodeVertexColor")
    colour.layer_name = style.COLOR_ATTRIBUTE
    bsdf = nodes.get("Principled BSDF")
    links.new(colour.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.95
    m.use_backface_culling = True
    return m


def export_glb(ob, path):
    """The terrain alone as a draco GLB, Col as COLOR_0 and Splat as COLOR_1; returns its size in bytes."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    mesh.select([ob])
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_apply=True, export_yup=True,
                              use_selection=True, export_draco_mesh_compression_enable=True,
                              export_draco_mesh_compression_level=6, export_materials="EXPORT", export_normals=True,
                              use_active_scene=True, export_vertex_color="NAME",
                              export_vertex_color_name=style.COLOR_ATTRIBUTE, export_all_vertex_colors=True)
    return os.path.getsize(path)


def _px(x, y, h):
    """A map point and a height as a fraction of the peak, rounded for the JSON."""
    return [round(float(x), 2), round(float(y), 2), round(float(h), 5)]


def _rows(points, heights, closed):
    """Profile rows [x, y, h, s, t]: the map point, the height as a fraction of the peak, the plan distance in px
    from the first point and its share of the whole length; a closed profile ends on its first point again at t = 1."""
    along, total = hm.arc_length(points, closed)
    if closed:
        points, heights = np.vstack([points, points[:1]]), np.concatenate([heights, heights[:1]])
        along = np.append(along, total)
    return [_px(x, y, h) + [round(float(s), 2), round(float(s / total), 6)] for (x, y), h, s in zip(points, heights, along)]


def stream_water(data):
    """The stream's line sampled every 1 px and its water surface there as a fraction of the peak: STREAM_WATER_M
    (heightmap's) over the bed and never rising downstream, level with the mill pond where the pond backs up the stream as far as
    the watermill's dam, then falling again from the dam to the sea."""
    from island.assets import watermill
    points = hm.sample_polyline(hm.STREAM, closed=False)
    along, _ = hm.arc_length(points, closed=False)
    dam = along[int(np.argmin(np.hypot(*(points - hm.POND_CENTRE).T)))] + watermill.DAM_RADIUS_PX
    free = hm.at(data["height"], points) + hm.STREAM_WATER_M / hm.PEAK_M
    level = watermill.POND_LEVEL_M / hm.PEAK_M
    above = along <= dam
    water = np.empty_like(free)
    water[above] = np.maximum(np.minimum.accumulate(free[above]), level)
    water[~above] = np.minimum.accumulate(np.minimum(free[~above], level))
    return points, water


def _facing(a, b):
    """The map angle in degrees (north 0, clockwise) from map point a toward map point b."""
    return math.degrees(math.atan2(b[0] - a[0], a[1] - b[1])) % 360.0


def _landing(x, y, h, facing=180.0, **extra):
    """A landmark's landing point and the map angle its front (the GLB's +Z, Blender's -Y) faces; an asset set down
    unturned faces south, 180."""
    return {"at": _px(x, y, h), "facing": round(facing % 360.0, 1), **extra}


def _beside_road(data, at_px, offset_px, uphill=True):
    """A map point offset_px off the ring beside map point at_px, on its uphill (or downhill) side, and the map angle
    that faces an asset's front toward the road."""
    ring = data["roads"]["ring"]["points"]
    i = int(np.argmin(np.hypot(ring[:, 0] - at_px[0], ring[:, 1] - at_px[1])))
    a, b = ring[i - 3], ring[(i + 3) % len(ring)]
    along = (b - a) / np.hypot(*(b - a))
    side = np.array([-along[1], along[0]])
    probe = [ring[i] + side * offset_px * k for k in (1, -1)]
    up = [hm.at(data["height"], p[None])[0] for p in probe]
    pick = 0 if (up[0] >= up[1]) == uphill else 1
    x, y = probe[pick]
    return x, y, float(hm.at(data["height"], np.array([[x, y]]))[0]), _facing(probe[pick], ring[i])


def landmarks(data):
    """Where each Island v2 landmark's origin lands on this terrain and which way its front faces, each origin being
    as its module describes: the castle and its stair on the bailey (with the stair's foot at the road's edge), the
    barracks across the ring from the stair facing the road, the watermill on its anchor and its wheel at the axle it
    turns about, the bridge on the stream's bed under the ring, the lighthouse on its anchor, the standing stones with their
    QH stone toward the square, the shrine and a signpost beside the ring facing it; the breakwater and the quay wall
    are built in the terrain's own space and land on the map's origin. The two ends of the breakwater's arm and of
    the pier face along them, out from the shore."""
    from island.assets import breakwater, castle_stair, watermill
    h = data["height"]

    def anchor(name):
        x, y = hm.ANCHORS[name]
        return x, y, float(h[y, x])

    mill_x, mill_y, mill_h = anchor("mill")
    offset, turn = watermill.wheel_placement()
    ring = data["roads"]["ring"]
    along, total = hm.arc_length(ring["points"], closed=True)
    crown = along[int(np.argmin(np.hypot(*(ring["points"] - hm.ANCHORS["bridge"]).T)))]
    arm, crest = breakwater.PATH, breakwater.CREST / hm.PEAK_M
    pier = _facing(*PIER_PX)
    origin = (hm.W / 2, hm.H / 2, 0.0)
    stair = castle_stair.site()
    bx, by = hm.ANCHORS["bailey"]
    foot = (bx + stair["lower_x"] / hm.M_PER_PX, by - stair["lower"][1] / hm.M_PER_PX)
    road_by_barracks = ring["points"][int(np.argmin(np.hypot(*(ring["points"] - BARRACKS_PX).T)))]
    # The mill lane leaves downhill, so the signpost stands across the ring from it with its side arm pointing down it.
    return {"castle_keep": _landing(*anchor("bailey")),
            "castle_stair": _landing(*anchor("bailey"), foot=_px(*foot, (stair["floor"] + stair["foot"]) / hm.PEAK_M)),
            "barracks": _landing(*BARRACKS_PX, float(h[BARRACKS_PX[1], BARRACKS_PX[0]]), _facing(BARRACKS_PX, road_by_barracks)),
            "watermill": _landing(mill_x, mill_y, mill_h, pondLevel=round(watermill.POND_LEVEL_M / hm.PEAK_M, 5),
                                  damCrest=round(watermill.DAM_CREST_M / hm.PEAK_M, 5)),
            "watermill_wheel": _landing(mill_x + offset.x / hm.M_PER_PX, mill_y - offset.y / hm.M_PER_PX,
                                        mill_h + offset.z / hm.PEAK_M, 180.0 - math.degrees(turn),
                                        spinsAbout="its own x axis"),
            "stone_bridge": _landing(*anchor("bridge"), ringT=[round(float((crown - hm.BRIDGE_HALF_PX) / total), 6),
                                                                round(float((crown + hm.BRIDGE_HALF_PX) / total), 6)]),
            "breakwater": _landing(*origin),
            "breakwater_root": _landing(*arm[0], crest, _facing(arm[0], arm[1])),
            "breakwater_head": _landing(*arm[-1], crest, _facing(arm[-2], arm[-1])),
            "quay_wall": _landing(*origin),
            "pier_root": _landing(*PIER_PX[0], float(h[PIER_PX[0][1], PIER_PX[0][0]]), pier),
            "pier_head": _landing(*PIER_PX[1], 0.0, pier),
            "lighthouse": _landing(*anchor("lighthouse")),
            "standing_stones": _landing(*anchor("standing_stones"),
                                        _facing(hm.ANCHORS["standing_stones"], hm.ANCHORS["square"])),
            "shrine": _landing(*_beside_road(data, hm.ANCHORS["shrine"], 7.0)),
            "signpost": _landing(*_beside_road(data, SIGNPOST_PX, 6.0))}


def fields(data):
    """Each field's corners, its four sides with the kind of edge each takes (the side nearest a road a dry-stone wall
    with the gateway at its middle) and its haystacks, in map px with heights as fractions of the peak."""
    out = []
    for (cx, cy), (along, across), angle, walls in FIELDS:
        u = np.array([math.cos(math.radians(angle)), math.sin(math.radians(angle))])
        v = np.array([-u[1], u[0]])
        centre = np.array([cx, cy], float)
        corners = [centre + u * a * along / 2 + v * b * across / 2 for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        sides = [(corners[k], corners[(k + 1) % 4]) for k in range(4)]
        road = int(np.argmin([hm.at(data["road_distance"], ((a + b) / 2)[None])[0] for a, b in sides]))
        edges = [{"from": [round(float(c), 2) for c in a], "to": [round(float(c), 2) for c in b],
                  "kind": "wall" if walls == "all" or k == road else "hedge",
                  "gate": [round(float(c), 2) for c in (a + b) / 2] if k == road else None}
                 for k, (a, b) in enumerate(sides)]
        stacks = [centre + u * s * along / 6 for s in (-1, 1)]
        out.append({"corners": [[round(float(c), 2) for c in p] for p in corners], "edges": edges,
                    "haystacks": [_px(x, y, hm.at(data["height"], np.array([[x, y]]))[0]) for x, y in stacks]})
    return out


def _nearest(loop, point):
    return int(np.argmin(np.hypot(*(loop - np.asarray(point, float)).T)))


def _forward(n, a, b, through):
    """[a, b] or [b, a]: whichever walks forward round a loop of n points through index `through`."""
    return [a, b] if (through - a) % n <= (b - a) % n else [b, a]


def _beach(data, outline, start, end):
    """The longest run of the outline walked forward from index `start` to `end` whose shore rises gentler than
    BEACH_SLOPE: the beach, without the stream's mouth or the bank the road's cut and fill leaves at the water."""
    gy, gx = np.gradient(data["height"] * hm.PEAK_M, hm.M_PER_PX)
    span = [(start + k) % len(outline) for k in range((end - start) % len(outline) + 1)]
    gentle = hm.at(np.hypot(gx, gy), outline[span]) < BEACH_SLOPE
    runs, run = [], []
    for k, ok in zip(span, gentle):
        if ok:
            run.append(k)
        elif run:
            runs, run = runs + [run], []
    run = max(runs + [run], key=len)
    return [run[0], run[-1]]


def coast(data):
    """The island's outline at the waterline with its bay, counter-clockwise on the map, the islets' loops, and the
    stretches of it the quay wall and the beach take, as index ranges walked forward: the quay wall from end to end,
    the beach the gentle shore between it and the breakwater's root."""
    from island.assets import breakwater, quay_wall
    loops = [hm.simplify(loop, OUTLINE_TOLERANCE_PX)[:-1] for loop in hm.coastline(data["height"])
             if hm.loop_area(loop) >= OUTLINE_MIN_AREA_PX]
    # Counter-clockwise as drawn with north up: with y growing south its shoelace sum is negative.
    loops = [lp if _shoelace(lp) < 0 else lp[::-1] for lp in loops]
    outline = np.array(max(loops, key=hm.loop_area))
    wall = quay_wall.line()
    quay = _forward(len(outline), _nearest(outline, wall[0]), _nearest(outline, wall[-1]),
                    _nearest(outline, wall[len(wall) // 2]))
    beach = _beach(data, outline, quay[1], _nearest(outline, breakwater.PATH[0]))

    def ends(span):
        return {"from": [round(float(v), 2) for v in outline[span[0]]], "to": [round(float(v), 2) for v in outline[span[1]]],
                "outlineIndex": span}

    return {"outline": [[round(float(x), 2), round(float(y), 2)] for x, y in outline],
            "islands": [[[round(float(x), 2), round(float(y), 2)] for x, y in lp] for lp in loops
                        if not np.array_equal(np.array(lp), outline)],
            "quayWall": ends(quay), "beach": ends(beach)}


def _shoelace(loop):
    pts = np.asarray(loop, float)
    return 0.5 * float(np.dot(pts[:, 0], np.roll(pts[:, 1], -1)) - np.dot(np.roll(pts[:, 0], -1), pts[:, 1]))


def manifest(data, ob, glb_bytes):
    """terrain.json: everything the site needs to set the island on this ground, in map pixels (x east, y south) with
    heights as fractions of the peak, and the factors that turn them into scene units."""
    from island.assets import watermill
    lo, hi = hm.PNG_RANGE
    units_per_px = hm.M_PER_PX * UNITS_PER_METRE
    columns = ["x", "y", "h", "s", "t"]
    profiles = {}
    for name, road in data["roads"].items():
        steps = np.hypot(*np.diff(road["points"], axis=0).T)
        _, total = hm.arc_length(road["points"], road["closed"])
        profiles[name] = {"closed": road["closed"], "lengthPx": round(float(total), 2),
                          "maxGrade": round(float((np.abs(np.diff(road["road"])) * hm.PEAK_M / (steps * hm.M_PER_PX)).max()), 3),
                          "points": _rows(road["points"], road["road"], road["closed"])}
    stream, water = stream_water(data)
    return {
        "map": {"sizePx": [hm.W, hm.H], "metresPerPx": hm.M_PER_PX, "unitsPerMetre": UNITS_PER_METRE,
                "unitsPerPx": round(units_per_px, 4), "origin": [hm.W / 2, hm.H / 2],
                "heightScale": round(hm.PEAK_M * UNITS_PER_METRE, 4), "peakMetres": hm.PEAK_M, "waterLevel": 0.0,
                "toScene": "scene x = (x - origin[0]) * unitsPerPx, scene z = (y - origin[1]) * unitsPerPx, "
                           "scene y = h * heightScale; map x runs east and map y south, h is a fraction of the peak",
                "angles": "map angles in degrees, north 0 and clockwise (east 90, south 180, west 270); "
                          "an asset whose front faces `facing` takes rotation.y = (180 - facing) degrees"},
        "heightmap": {"file": HEIGHTMAP, "bits": 16, "sizePx": [hm.W, hm.H], "range": [lo, hi],
                      "decode": "h = range[0] + grey / 65535 * (range[1] - range[0])",
                      "seaLevelGrey": round(-lo / (hi - lo) * 65535.0, 2),
                      "sample": "pixel (i, j) holds h at map point x = i, y = j; row 0 is the north edge"},
        "mesh": {"file": GLB, "bytes": glb_bytes, "triangles": len(ob.data.polygons), "material": NAME,
                 "units": "metres about the map origin, X east, Y up, Z south; scale by unitsPerMetre",
                 "COLOR_0": {"attribute": style.COLOR_ATTRIBUTE, "holds": "the painted ground colour, blended from "
                             "four classes", "classes": list(COLOUR_CLASSES)},
                 "COLOR_1": {"attribute": SPLAT_ATTRIBUTE, "holds": "the four ground textures' weights in R, G, B, A, "
                             "summing to 1", "channels": list(SPLAT_CHANNELS),
                             "textures": {"grass": "ground.png", "earth": "ground_earth.png",
                                          "gravel": {"village": "ground_cobble.png", "outside": "ground_gravel.png"},
                                          "sand": "ground_sand.png"},
                             "village": {"centre": list(hm.VILLAGE_CENTRE), "fadePx": list(hm.VILLAGE_FADE_PX),
                                         "notes": "cobbles fully within fadePx[0] of the centre, gravel beyond fadePx[1], "
                                                  "the same window that paints Col's path cobbled"},
                             "notes": "gravel is 1 within %g px of every road's centreline (cobbles in the village, "
                                      "gravel outside) and on the quay apron and the square, and also takes the bare "
                                      "rock of the cliffs and crags; earth is the worn verges out to %g px, the "
                                      "stream's bed (kept under the bridge and at the watermill) and the pond; sand "
                                      "is the beach and the sea floor" % (PAVED_PX[0], VERGE_PX[1])}},
        "roads": {"columns": columns, "units": "x, y map px; h a fraction of the peak; s the plan distance in px "
                  "from the first row; t = s / lengthPx",
                  "notes": "every row is 1 px apart; h is the road surface after relaxation, camber not included. The "
                           "ring starts at the quay (365, 505) and runs in the document's order, with the stone "
                           "bridge's hump (%g m at (398, 524), easing out over %g px either side); each spur's first "
                           "row lies on the ring" % (hm.BRIDGE_RISE_M, hm.BRIDGE_HALF_PX),
                  "ring": profiles.pop("ring"), "spurs": profiles},
        "stream": {"columns": columns, "points": _rows(stream, water, closed=False),
                   "notes": "h is the water surface, not the bed: %g m over the bed, never rising downstream, level "
                            "with the pond from where it backs up the stream to the watermill's dam" % hm.STREAM_WATER_M,
                   "pond": {"centre": list(hm.POND_CENTRE), "radiusPx": hm.POND_PX,
                            "level": round(watermill.POND_LEVEL_M / hm.PEAK_M, 5),
                            "notes": "the watermill GLB carries the pond's water surface"}},
        "coast": coast(data),
        "points": {name: _px(x, y, data["height"][y, x]) for name, (x, y) in hm.CHECKPOINTS.items()},
        "landmarks": landmarks(data),
        "layout": {"fields": fields(data), "orchard": [[x, y] for x, y in ORCHARD_PX]},
        "deviations": list(DEVIATIONS)}


def _water():
    """A plain sea at the waterline for the previews; never exported."""
    bpy.ops.mesh.primitive_plane_add(size=1.0)
    plane = bpy.context.active_object
    plane.name = "preview_sea"
    plane.scale = (hm.W * hm.M_PER_PX * 1.6, hm.H * hm.M_PER_PX * 1.6, 1.0)
    plane.data.materials.append(style.material("water", roughness=0.2))
    return plane


def _look(cam, eye, target, lens):
    cam.data.type = "PERSP"
    cam.data.lens = lens
    cam.location = eye
    cam.rotation_euler = (Vector(target) - Vector(eye)).to_track_quat("-Z", "Y").to_euler()


def _over_ground(data, x, y, eye):
    """A point `eye` metres over the ground (or the sea) at map point (x, y)."""
    mx, my = to_mesh(x, y)
    return Vector((float(mx), float(my), max(0.0, float(data["height"][int(y), int(x)])) * hm.PEAK_M + eye))


def _render(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def render_previews(ob, data, folder):
    """The overview from the south-west by night and by day, a top view to set beside the plan's hillshade, two
    walks at eye height on the ring and two higher looks at the bay and the castle knoll."""
    cam = rig.setup()
    _water()
    render = bpy.context.scene.render
    render.resolution_x, render.resolution_y = OVERVIEW_SIZE
    rig.frame_camera(ob, OVERVIEW_VIEW)
    paths = [_render(os.path.join(folder, "terrain_overview.png"))]
    with rig.daylight():
        paths.append(_render(os.path.join(folder, "day", "terrain_overview.png")))
        render.resolution_x, render.resolution_y = hm.W, hm.H
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = hm.W * hm.M_PER_PX
        cam.location, cam.rotation_euler = (0.0, 0.0, 300.0), (0.0, 0.0, 0.0)
        paths.append(_render(os.path.join(folder, "day", "terrain_top.png")))
        render.resolution_x, render.resolution_y = WALK_SIZE
        for name, (start, end, eye) in WALKS.items():
            _look(cam, _over_ground(data, *start, eye), _over_ground(data, *end, WALK_EYE_M), WALK_LENS)
            paths.append(_render(os.path.join(folder, "day", "terrain_walk_%s.png" % name)))
    return paths


def check(glb, png, height):
    """Prove the exports decode: the GLB comes back as one mesh under the terrain material carrying Col and Splat,
    and the heightmap reads back within one 16-bit step."""
    found = rig.reimport_check(glb)
    surface = rig.glb_surface(glb)
    names, _ = rig.glb_materials(glb)
    lo, hi = hm.PNG_RANGE
    step = (hi - lo) / 65535.0
    error = float(np.abs(hm.read_png16(png, lo, hi) - np.clip(height, lo, hi)).max())
    if found["meshes"] != 1 or names != [NAME] or not {"COLOR_0", "COLOR_1"} <= set(surface["streams"]) or error > step:
        raise RuntimeError("terrain exports failed their check: %s %s %s png error %.6f" % (found, names, surface, error))
    return "re-import: 1 mesh, %d tris, size %s, streams %s; heightmap error %.2e of a %.2e step" % (
        found["tris"], found["size"], surface["streams"], error, step)


def _json_text(doc):
    """JSON indented for reading, with every array of plain numbers (a profile row, a point) kept on one line."""
    text = json.dumps(doc, indent=1)
    return re.sub(r"\[\s+([-\d.eE,\s]+?)\s+\]", lambda m: "[" + " ".join(m.group(1).split()) + "]", text) + "\n"


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0] if __doc__ else None)
    parser.add_argument("--out", default="public/models/island", help="folder for terrain.glb, the heightmap and json")
    parser.add_argument("--previews", default=None, help="folder for the terrain renders (omit to skip rendering)")
    args = parser.parse_args(argv)
    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)
    if bpy.app.background:
        for ob in list(bpy.data.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
    data = hm.cached()
    mesh.use_collection("terrain", clear=True)
    ob = build(data)
    glb = os.path.join(out, GLB)
    glb_bytes = export_glb(ob, glb)
    lo, hi = hm.PNG_RANGE
    png = os.path.join(out, HEIGHTMAP)
    hm.write_png16(png, data["height"], lo, hi)
    with open(os.path.join(out, MANIFEST), "w") as f:
        f.write(_json_text(manifest(data, ob, glb_bytes)))
    print("terrain %d tris, glb %d bytes; %s" % (len(ob.data.polygons), glb_bytes, check(glb, png, data["height"])))
    if args.previews:
        render_previews(ob, data, os.path.abspath(args.previews))


if __name__ == "__main__":
    main()
