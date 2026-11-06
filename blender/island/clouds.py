"""The cloud atlas of DESIGN.md section 18.2: eight cumulus rendered in Blender as volumes by Cycles with multiple
scattering, lit from the sun's side so the tops are bright and the bases shaded, and three cirrus, packed into one RGBA
atlas, clouds.png, whose cells atlas.write_manifest records in atlases.json. A cumulus is a cluster of soft-blended
ellipsoid puffs standing on a flat base, bulged and eroded by billow noise, built as a numpy grid, written as OpenVDB
and photographed from the side and a little below by an orthographic camera on a transparent film; Cycles renders on
the GPU when there is one and denoises on the CPU. A cirrus is a thin slab of fine streaks, some curling into hooks,
seen from straight below; it is thin enough that its look is its optical depth, so its density is integrated through
the slab in numpy, near white where thin and a little blue-grey where thick.

Headless, from the repository root:
    /Applications/Blender.app/Contents/MacOS/Blender --background --python blender/island/clouds.py -- \\
        --out public/models/island --previews blender/previews"""

import argparse
import math
import os
import sys
import tempfile

BLENDER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BLENDER_DIR not in sys.path:
    sys.path.insert(0, BLENDER_DIR)

import bpy  # noqa: E402
import numpy as np  # noqa: E402
import openvdb  # noqa: E402
from mathutils import Vector  # noqa: E402

from island import atlas, textures  # noqa: E402

FILE, SIZE = "clouds.png", (2048, 2048)
# Cumulus cells two to a row from the top of the atlas, the cirrus strips two to a row below them.
CUMULUS_CELL, CIRRUS_CELL = (1024, 448), (1024, 128)
STUDIO = "cloud_studio"
# Grids in Blender units (one unit stands for about 100 m of cloud), VOXEL on a side.
VOXEL = 0.016
# The cumulus frame: the camera looks along +Y, TILT_DEG up from a little below, CUMULUS_WIDTH across; every cumulus
# stands on its flat base at height 0, BASE_MARGIN above the bottom of its cell.
CUMULUS_WIDTH, CUMULUS_DEPTH, TILT_DEG, BASE_MARGIN = 4.8, 2.8, 3.0, 0.12
CUMULUS_HEIGHT = CUMULUS_WIDTH * CUMULUS_CELL[1] / CUMULUS_CELL[0]
# The cirrus frame: the camera looks straight up at a slab CIRRUS_LENGTH long and CIRRUS_THICKNESS deep.
CIRRUS_LENGTH, CIRRUS_THICKNESS = 8.0, 0.24
CIRRUS_WIDTH = CIRRUS_LENGTH * CIRRUS_CELL[1] / CIRRUS_CELL[0]
# Puffs blend over BLEND units; the surface softens over EDGE; billow noise bulges and erodes it around BILLOW_MEAN
# with features BILLOW_VOXELS across, finest last; below the base the density falls off BASE_FALLOFF times faster
# than it rises inside.
BLEND, EDGE, BILLOW_MEAN = 0.12, 0.045, 0.32
BILLOW_VOXELS, BILLOW_WEIGHTS = (40.0, 20.0, 10.0, 5.0, 2.5), (0.42, 0.27, 0.16, 0.1, 0.05)
BASE_FALLOFF = 4.0
# Cumulus: the base row's half-span, its puffs' radii and how flat they are; columns of puffs stacked on it (count,
# the height their tops reach, and for congestus how many puffs wide a column is); small billows on the upper faces;
# how strongly the noise works the surface. Fractus is broken and thin: no flat base, rougher, at FRACTUS_OPACITY of
# the others' density, lifted FRACTUS_LIFT.
CUMULUS = (
    {"name": "humilis_1", "span": 1.75, "base": (0.42, 0.58), "squash": 0.6, "columns": (2, (0.55, 0.75)),
     "billows": 30, "rough": 0.26},
    {"name": "humilis_2", "span": 1.55, "base": (0.4, 0.56), "squash": 0.6, "columns": (3, (0.6, 0.85)),
     "billows": 28, "rough": 0.28},
    {"name": "mediocris_1", "span": 1.65, "base": (0.44, 0.62), "squash": 0.72, "columns": (3, (0.95, 1.3)),
     "billows": 38, "rough": 0.3},
    {"name": "mediocris_2", "span": 1.45, "base": (0.42, 0.6), "squash": 0.75, "columns": (4, (1.05, 1.4)),
     "billows": 40, "rough": 0.3},
    {"name": "mediocris_3", "span": 1.75, "base": (0.44, 0.62), "squash": 0.7, "columns": (4, (0.9, 1.35)),
     "billows": 36, "rough": 0.32},
    {"name": "congestus_1", "span": 1.45, "base": (0.45, 0.64), "squash": 0.78, "columns": (2, (1.95, 2.1)),
     "girth": 3, "billows": 56, "rough": 0.3},
    {"name": "congestus_2", "span": 1.3, "base": (0.42, 0.6), "squash": 0.8, "columns": (1, (1.95, 2.05)),
     "girth": 3, "billows": 50, "rough": 0.32},
    {"name": "fractus_1", "span": 0.9, "base": (0.3, 0.42), "squash": 0.75, "columns": (2, (0.55, 0.75)),
     "billows": 22, "rough": 0.55, "ragged": True},
)
FRACTUS_OPACITY, FRACTUS_LIFT = 0.55, 0.18
# How far above a column's last stem puff its crown reaches, in that puff's radii.
CROWN = 1.77
# Cirrus: how many streaks, how long (units), how thin (sigma, units), how much they wave, how strong they are and
# the share of the strip's width they spread over. Hooked cirrus (uncinus) are commas instead: their length is drawn
# evenly on a log scale, their heads gather round `groups` points along the strip, scattered by `scatter` units, and
# each tail leaves its head `hook` degrees off its run, which lies up to `tilt` degrees off the strip.
CIRRUS = (
    {"name": "cirrus_fibratus", "streaks": 40, "length": (2.0, 5.5), "sigma": (0.012, 0.025), "wave": 0.04,
     "strength": (0.4, 1.0), "spread": 0.7},
    {"name": "cirrus_uncinus", "streaks": 18, "length": (0.6, 2.4), "sigma": (0.045, 0.075), "hook": (35.0, 65.0),
     "groups": 6, "scatter": 0.35, "tilt": 10.0, "strength": (0.55, 0.9), "spread": 0.8},
    {"name": "cirrus_spissatus", "streaks": 30, "length": (2.5, 6.5), "sigma": (0.03, 0.07), "wave": 0.05,
     "strength": (0.25, 0.55), "spread": 0.8},
)
# Optical thickness of a cumulus: the density grid in [0, 1] times CUMULUS_DENSITY in Cycles. A cirrus's optical
# depth is its density times CIRRUS_EXTINCTION integrated through the slab; its colour runs from CIRRUS_LIT to
# CIRRUS_SHADED (linear) as that depth grows to CIRRUS_SHADE_DEPTH.
CUMULUS_DENSITY, CIRRUS_EXTINCTION, CIRRUS_SHADE_DEPTH = 40.0, 14.0, 3.0
CIRRUS_LIT, CIRRUS_SHADED = (1.0, 1.0, 1.0), (0.74, 0.78, 0.86)
# Light: a sun from the upper left and in front of the camera, warm white; a sky lighting from above in blue and from
# below in the dark of the sea; scattering leaning forward by ANISOTROPY.
SUN = {"energy": 8.0, "angle_deg": 0.6, "color": (1.0, 0.97, 0.92), "toward": (0.75, 0.4, -0.55)}
SKY = {"strength": 0.5, "zenith": (0.42, 0.58, 0.95), "below": (0.08, 0.1, 0.14)}
ANISOTROPY = 0.6
SAMPLES, VOLUME_BOUNCES = 128, 8
# The brightest lit cumulus (its 99.5th percentile over pixels at least OPAQUE covered) maps to WHITE_POINT; above
# SHOULDER values ease toward 1 instead of clipping.
WHITE_POINT, SHOULDER, OPAQUE = 1.0, 0.9, 0.5


def layout():
    """Each cell's pixel rectangle (x and y of its top-left corner from the atlas's top left, width, height)."""
    cells = {}
    for k, recipe in enumerate(CUMULUS):
        cells[recipe["name"]] = ((k % 2) * CUMULUS_CELL[0], (k // 2) * CUMULUS_CELL[1]) + CUMULUS_CELL
    top = math.ceil(len(CUMULUS) / 2) * CUMULUS_CELL[1]
    for k, recipe in enumerate(CIRRUS):
        cells[recipe["name"]] = ((k % 2) * CIRRUS_CELL[0], top + (k // 2) * CIRRUS_CELL[1]) + CIRRUS_CELL
    return cells


def manifest_entry():
    """What the site needs to draw the clouds: the file and its size, every cell's rectangle in glTF UV space (origin
    at the image's top left), where a cumulus's flat base lies down its cell, how many units across a cumulus cell
    and a cirrus cell are, and that every cumulus is lit from its upper left; the alpha is straight."""
    width, height = SIZE
    cells = {name: [round(x / width, 6), round(y / height, 6), round((x + w) / width, 6), round((y + h) / height, 6)]
             for name, (x, y, w, h) in layout().items()}
    return {"file": FILE, "size": list(SIZE), "cells": cells, "wrap": "clamp", "alpha_test": None,
            "double_sided": True, "cumulus_base_v": round(1.0 - BASE_MARGIN / CUMULUS_HEIGHT, 6),
            "cumulus_cell_units": [CUMULUS_WIDTH, round(CUMULUS_HEIGHT, 6)],
            "cirrus_cell_units": [CIRRUS_LENGTH, round(CIRRUS_WIDTH, 6)], "cumulus_lit_from": "upper left"}


def _axes(lo, hi, step=VOXEL):
    """Sample centres `step` apart along each axis from lo to hi."""
    return [lo[k] + (np.arange(int(math.ceil((hi[k] - lo[k]) / step))) + 0.5) * step for k in range(3)]


def _billow(shape, rng):
    """Billow noise in [0, 1]: folded octaves of smooth noise, ridged where each octave crosses its middle."""
    field = sum(w * np.abs(2.0 * textures.noise(shape, rng, s, (1.0, 1.0, 1.0)) - 1.0)
                for s, w in zip(BILLOW_VOXELS, BILLOW_WEIGHTS))
    return (field / sum(BILLOW_WEIGHTS)).astype(np.float32)


def _puffs(rng, recipe):
    """A cumulus's puffs as (centre, radius, vertical squash): an overlapping base row; columns rising out of it,
    each a stem of overlapping puffs leaning a little from side to side under a crown of puffs wider than the stem;
    and small billows on the upper faces of them all."""
    span, squash = recipe["span"], recipe["squash"]
    count = int(math.ceil(2.0 * span / 0.42)) + 1
    puffs = []
    for k in range(count):
        x = -span + 2.0 * span * k / (count - 1) + rng.uniform(-0.08, 0.08)
        r = rng.uniform(*recipe["base"]) * (1.0 - 0.35 * abs(x) / span)
        puffs.append(((x, rng.uniform(-0.25, 0.25), r * squash * 0.55), r, squash))
    columns, reach = recipe["columns"]
    for _ in range(columns):
        # A lone column rises near the middle; several spread along the base.
        x = rng.uniform(-0.6, 0.6) * span if columns > 1 else rng.uniform(-0.2, 0.2) * span
        (cx, cy, cz), r, sq = min(puffs[:count], key=lambda p: abs(p[0][0] - x))
        top = rng.uniform(*reach) * (1.0 - 0.25 * abs(x) / span)
        r, lean = min(r, rng.uniform(0.38, 0.52)), rng.choice((-1.0, 1.0))
        # The crown below tops out CROWN radii above its stem's last puff; the stem grows while that stays under top.
        girth = recipe.get("girth", 1)
        while True:
            step = r * sq * rng.uniform(0.6, 0.8)
            if cz + step + CROWN * r > top:
                break
            cz += step
            r *= rng.uniform(0.95, 1.06)
            cx += lean * rng.uniform(0.0, 0.18) * r
            cy += rng.uniform(-0.1, 0.1)
            for j in range(girth):
                across = (j - (girth - 1) / 2) * 0.75 * r
                puffs.append(((cx + across, cy + rng.uniform(-0.15, 0.15) * r, cz + rng.uniform(-0.1, 0.1) * r),
                              r * (1.0 if across == 0.0 else rng.uniform(0.85, 1.0)), 0.92))
            sq = 0.92
            lean = -lean if rng.random() < 0.4 else lean
        crown, spread = cz + 0.7 * r, 0.55 * r * (1.0 + 0.5 * (girth - 1))
        for angle in rng.uniform(0.0, 2.0 * math.pi) + np.arange(int(rng.integers(2, 4)) + girth - 1) * 2.2:
            puffs.append(((cx + math.cos(angle) * spread, cy + math.sin(angle) * 0.4 * r,
                           crown + rng.uniform(-0.15, 0.2) * r), r * rng.uniform(0.7, 0.95), 0.9))
        puffs.append(((cx, cy, crown + 0.35 * r), 0.8 * r, 0.9))
    big = list(puffs)
    for _ in range(recipe["billows"]):
        (cx, cy, cz), r, sq = big[rng.integers(len(big))]
        azimuth, polar = rng.uniform(0.0, 2.0 * math.pi), rng.uniform(0.15, 1.3)
        offset = np.array([math.sin(polar) * math.cos(azimuth), math.sin(polar) * math.sin(azimuth), math.cos(polar) * sq])
        puffs.append((tuple(np.array((cx, cy, cz)) + offset * r * 0.92), rng.uniform(0.1, 0.22) * r / 0.5, 1.0))
    if recipe.get("ragged"):
        puffs = [((cx, cy, cz + FRACTUS_LIFT), r, sq) for (cx, cy, cz), r, sq in puffs]
    return puffs


def _smin(a, b, k):
    """Polynomial smooth minimum: the union of two distance fields with their seam rounded over k."""
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h - k * h * (1.0 - h)


def cumulus_density(recipe, seed):
    """A cumulus's density in [0, 1] on the cumulus frame's grid (x, y, z), and the frame's lowest corner."""
    rng = np.random.default_rng(seed)
    lo = np.array([-CUMULUS_WIDTH / 2, -CUMULUS_DEPTH / 2, -BASE_MARGIN])
    xs, ys, zs = _axes(lo, lo + np.array([CUMULUS_WIDTH, CUMULUS_DEPTH, CUMULUS_HEIGHT]))
    field = np.full((len(xs), len(ys), len(zs)), 10.0, np.float32)
    for (cx, cy, cz), r, squash in _puffs(rng, recipe):
        # Only voxels within reach of a puff can change; the rest stay outside by more than the noise can move them.
        reach = r + BLEND + recipe["rough"]
        box = tuple(slice(np.searchsorted(a, c - reach), np.searchsorted(a, c + reach)) for a, c in ((xs, cx), (ys, cy), (zs, cz)))
        x, y, z = np.meshgrid(xs[box[0]], ys[box[1]], zs[box[2]], indexing="ij", sparse=True)
        distance = np.sqrt((x - cx) ** 2 + (y - cy) ** 2 + ((z - cz) / squash) ** 2) - r
        field[box] = _smin(field[box], distance.astype(np.float32), BLEND)
    field += recipe["rough"] * (BILLOW_MEAN - _billow(field.shape, rng))
    if recipe.get("ragged"):
        return np.clip(-field / EDGE, 0.0, 1.0) * FRACTUS_OPACITY, lo
    wobble = 0.03 * (2.0 * textures.noise(field.shape[:2], rng, 30.0) - 1.0)
    field = np.maximum(field, (wobble[:, :, None] - zs[None, None, :]) * BASE_FALLOFF)
    return np.clip(-field / EDGE, 0.0, 1.0), lo


def cirrus_density(recipe, seed):
    """A cirrus's density in [0, 1] sampled one cell pixel apart (x along the strip, y across it, z up through the
    slab): streaks y = f(x) with a Gaussian section, fading in and out along their length, or hooked commas (see
    _commas)."""
    rng = np.random.default_rng(seed)
    lo = np.array([-CIRRUS_LENGTH / 2, -CIRRUS_WIDTH / 2, 0.0])
    step = CIRRUS_LENGTH / CIRRUS_CELL[0]
    xs, ys, zs = _axes(lo, lo + np.array([CIRRUS_LENGTH, CIRRUS_WIDTH, CIRRUS_THICKNESS]), step)
    x, y, z = np.meshgrid(xs, ys, zs, indexing="ij", sparse=True)
    density = np.zeros((len(xs), len(ys), len(zs)), np.float32)
    half = CIRRUS_WIDTH / 2 * recipe["spread"]
    if "hook" in recipe:
        density += _commas(rng, recipe, x, y, z, half)
    for _ in range(0 if "hook" in recipe else recipe["streaks"]):
        length = rng.uniform(*recipe["length"])
        start = rng.uniform(-CIRRUS_LENGTH / 2 + 0.2, CIRRUS_LENGTH / 2 - 0.2 - length)
        along = np.clip((x - start) / length, 0.0, 1.0)
        centre = rng.uniform(-half, half) + recipe["wave"] * np.sin(rng.uniform(1.0, 3.0) * x + rng.uniform(0, 6.3))
        sigma = rng.uniform(*recipe["sigma"])
        fade = np.sin(math.pi * along) ** 0.8
        height = rng.uniform(0.4, 0.6) * CIRRUS_THICKNESS
        section = np.exp(-((y - centre) / sigma) ** 2) * np.exp(-((z - height) / (0.12 * CIRRUS_THICKNESS)) ** 2)
        density += (rng.uniform(*recipe["strength"]) * fade * section).astype(np.float32)
    grain = textures.noise(density.shape, rng, 6.0, (12.0, 1.0, 1.0))
    edge = np.clip((0.46 * CIRRUS_WIDTH - np.abs(np.asarray(ys))) / (0.1 * CIRRUS_WIDTH), 0.0, 1.0)[None, :, None]
    return np.clip(density * (0.55 + 0.45 * grain) * edge, 0.0, 1.0)


def _commas(rng, recipe, x, y, z, half):
    """Hooked cirrus: commas, each a round dense head with a tail that leaves it at a steep angle, hooks round and runs
    on upwind (-x), thinning and fading to its tip; the heads gather round `groups` points spread along the strip, the
    tails curl nine in ten of them the same way, and every comma has its own length, hook and tilt."""
    xs, ys = np.ravel(x), np.ravel(y)
    field = np.zeros((len(xs), len(ys)), np.float32)
    bins = np.linspace(-CIRRUS_LENGTH / 2 + 0.6, CIRRUS_LENGTH / 2 - 0.4, recipe["groups"] + 1)
    groups = rng.uniform(bins[:-1], bins[1:])
    curl = rng.choice((-1.0, 1.0))
    low, high = np.log(recipe["length"])
    for _ in range(recipe["streaks"]):
        length = math.exp(rng.uniform(low, high))
        width = rng.uniform(*recipe["sigma"])
        hook = math.radians(rng.uniform(*recipe["hook"])) * curl * (1.0 if rng.random() < 0.9 else -1.0)
        tilt = math.radians(rng.uniform(-recipe["tilt"], recipe["tilt"]))
        # The tail from the head: its heading turns from tilt + hook at the head to tilt at the tip.
        t = np.linspace(0.0, 1.0, max(2, int(length / (0.3 * width * 0.2))))
        heading = tilt + hook * (1.0 - t) ** 2
        step = length / (len(t) - 1)
        path = np.cumsum(np.stack([-np.cos(heading), np.sin(heading)], -1) * step, axis=0) - [-np.cos(heading[0]) * step,
                                                                                              np.sin(heading[0]) * step]
        lo, hi = path.min(axis=0), path.max(axis=0)
        reach_x = (-CIRRUS_LENGTH / 2 + 0.2 - lo[0], CIRRUS_LENGTH / 2 - 0.2 - hi[0])
        reach_y = (-half - lo[1], half - hi[1])
        head = (float(np.clip(rng.choice(groups) + rng.normal(0.0, recipe["scatter"]), *reach_x)),
                rng.uniform(*reach_y) if reach_y[0] < reach_y[1] else 0.5 * sum(reach_y))
        sigma = width * (0.8 - 0.6 * t)
        weight = rng.uniform(*recipe["strength"]) * (1.0 - t) ** 0.6 * step / (sigma * math.sqrt(math.pi))
        centres = path + head
        box = (np.abs(xs[:, None] - 0.5 * (lo[0] + hi[0]) - head[0]) < 0.5 * (hi[0] - lo[0]) + 4 * width)[:, 0]
        near = np.nonzero(box)[0]
        if not len(near):
            continue
        for (cx, cy), s, w in zip(centres, sigma, weight):
            field[near] += (w * np.exp(-((xs[near, None] - cx) ** 2 + (ys[None, :] - cy) ** 2) / s ** 2)).astype(np.float32)
        # The head is a soft tuft drawn out along the way the tail leaves it.
        along = (xs[near, None] - head[0]) * -math.cos(heading[0]) + (ys[None, :] - head[1]) * math.sin(heading[0])
        across = (xs[near, None] - head[0]) * math.sin(heading[0]) + (ys[None, :] - head[1]) * math.cos(heading[0])
        field[near] += (0.75 * np.exp(-(along / (2.2 * width)) ** 2 - (across / (1.3 * width)) ** 2)).astype(np.float32)
    height = 0.5 * CIRRUS_THICKNESS
    return field[:, :, None] * np.exp(-((z - height) / (0.12 * CIRRUS_THICKNESS)) ** 2).astype(np.float32)


def cirrus_image(recipe, seed):
    """A cirrus cell as seen from below: straight-alpha linear RGBA, rows from the top, the strip along the rows."""
    density = cirrus_density(recipe, seed)
    _inside_frame(density, recipe["name"])
    depth = CIRRUS_EXTINCTION * density.sum(axis=2) * (CIRRUS_LENGTH / CIRRUS_CELL[0])
    shade = np.clip(depth / CIRRUS_SHADE_DEPTH, 0.0, 1.0)[..., None]
    rgb = (1.0 - shade) * np.array(CIRRUS_LIT) + shade * np.array(CIRRUS_SHADED)
    image = np.concatenate([rgb, (1.0 - np.exp(-depth))[..., None]], -1)
    return np.transpose(image, (1, 0, 2))[::-1].astype(np.float32)


def _use_gpu(scene):
    """Render on the GPU when Cycles finds one, else on the CPU; the denoiser always runs on the CPU."""
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("METAL", "OPTIX", "CUDA", "HIP", "ONEAPI"):
        try:
            prefs.compute_device_type = kind
        except TypeError:
            continue
        prefs.get_devices()
        gpus = [d for d in prefs.devices if d.type != "CPU"]
        if gpus:
            for d in prefs.devices:
                d.use = d.type != "CPU"
            scene.cycles.device = "GPU"
            return
    scene.cycles.device = "CPU"


def studio():
    """The cloud studio scene: Cycles with volume bounces, a transparent film, the Standard view transform, the
    sky gradient, the sun and an orthographic camera."""
    scene = bpy.data.scenes.get(STUDIO) or bpy.data.scenes.new(STUDIO)
    scene.render.engine = "CYCLES"
    _use_gpu(scene)
    scene.cycles.samples = SAMPLES
    scene.cycles.use_adaptive_sampling = False
    scene.cycles.seed = 0
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
    scene.cycles.denoising_use_gpu = False
    scene.cycles.volume_bounces = VOLUME_BOUNCES
    scene.cycles.max_bounces = VOLUME_BOUNCES + 4
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.image_settings.file_format = "OPEN_EXR"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "32"
    scene.world = _sky()
    sun = scene.objects.get(STUDIO + "_sun")
    if sun is None:
        sun = bpy.data.objects.new(STUDIO + "_sun", bpy.data.lights.new(STUDIO + "_sun", "SUN"))
        scene.collection.objects.link(sun)
    sun.data.energy, sun.data.angle, sun.data.color = SUN["energy"], math.radians(SUN["angle_deg"]), SUN["color"]
    sun.rotation_euler = Vector(SUN["toward"]).normalized().to_track_quat("-Z", "Y").to_euler()
    camera = scene.objects.get(STUDIO + "_camera")
    if camera is None:
        camera = bpy.data.objects.new(STUDIO + "_camera", bpy.data.cameras.new(STUDIO + "_camera"))
        scene.collection.objects.link(camera)
    camera.data.type = "ORTHO"
    scene.camera = camera
    return scene


def _sky():
    """The world: SKY's zenith colour above the horizon blending to its colour below, which lights the bases."""
    world = bpy.data.worlds.get(STUDIO) or bpy.data.worlds.new(STUDIO)
    world.use_nodes = True
    nodes, links = world.node_tree.nodes, world.node_tree.links
    nodes.clear()
    coords, split = nodes.new("ShaderNodeTexCoord"), nodes.new("ShaderNodeSeparateXYZ")
    span, ramp = nodes.new("ShaderNodeMapRange"), nodes.new("ShaderNodeValToRGB")
    background, output = nodes.new("ShaderNodeBackground"), nodes.new("ShaderNodeOutputWorld")
    span.inputs["From Min"].default_value, span.inputs["From Max"].default_value = -1.0, 1.0
    low, high = ramp.color_ramp.elements
    low.position, low.color = 0.35, SKY["below"] + (1.0,)
    high.position, high.color = 0.75, SKY["zenith"] + (1.0,)
    background.inputs["Strength"].default_value = SKY["strength"]
    links.new(coords.outputs["Generated"], split.inputs[0])
    links.new(split.outputs["Z"], span.inputs["Value"])
    links.new(span.outputs["Result"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], background.inputs["Color"])
    links.new(background.outputs[0], output.inputs["Surface"])
    return world


def _volume_material(name, density):
    """Scattering only, white, leaning forward by ANISOTROPY, its density the grid's times `density`."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    grid, scale = nodes.new("ShaderNodeAttribute"), nodes.new("ShaderNodeMath")
    scatter, output = nodes.new("ShaderNodeVolumeScatter"), nodes.new("ShaderNodeOutputMaterial")
    grid.attribute_name = "density"
    scale.operation, scale.inputs[1].default_value = "MULTIPLY", density
    scatter.phase = "HENYEY_GREENSTEIN"
    scatter.inputs["Anisotropy"].default_value = ANISOTROPY
    scatter.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    links.new(grid.outputs["Fac"], scale.inputs[0])
    links.new(scale.outputs[0], scatter.inputs["Density"])
    links.new(scatter.outputs[0], output.inputs["Volume"])
    return material


def _aim(scene):
    """Point the camera at a cumulus from the side, TILT_DEG up, its centre ray through the middle of the frame."""
    camera = scene.camera
    tilt = math.radians(TILT_DEG)
    camera.data.ortho_scale = CUMULUS_WIDTH
    middle = CUMULUS_HEIGHT / 2 - BASE_MARGIN
    camera.location = (0.0, -10.0, middle - 10.0 * math.tan(tilt))
    camera.rotation_euler = (math.pi / 2 + tilt, 0.0, 0.0)
    camera.data.clip_start, camera.data.clip_end = 0.1, 40.0
    scene.render.resolution_x, scene.render.resolution_y = CUMULUS_CELL


def _inside_frame(density, name):
    """A cloud must clear its frame's sides and top (the cumulus bases sit on the frame's floor margin), or its
    cell would cut it off."""
    rims = (density[0], density[-1], density[:, 0], density[:, -1], density[:, :, -1])
    if max(float(rim.max()) for rim in rims) > 0.01:
        raise ValueError("%s reaches the edge of its frame; shrink its recipe" % name)


def render(scene, density, lo, scratch, name):
    """Photograph one cumulus's density grid; returns its premultiplied linear RGBA, rows from the top."""
    _inside_frame(density, name)
    grid = openvdb.FloatGrid()
    grid.copyFromArray(density)
    grid.name = "density"
    grid.transform = openvdb.createLinearTransform(voxelSize=VOXEL)
    path = os.path.join(scratch, name + ".vdb")
    openvdb.write(path, grids=[grid])
    volume = bpy.data.volumes.new(name)
    volume.filepath = path
    volume.materials.append(_volume_material(name, CUMULUS_DENSITY))
    ob = bpy.data.objects.new(name, volume)
    # Voxel (i, j, k) of the grid sits at (i, j, k) * VOXEL from the object; its centre was sampled half a voxel in.
    ob.location = Vector(lo) + Vector((VOXEL, VOXEL, VOXEL)) * 0.5
    scene.collection.objects.link(ob)
    _aim(scene)
    scene.render.filepath = os.path.join(scratch, name + ".exr")
    bpy.ops.render.render(write_still=True, scene=scene.name)
    image = bpy.data.images.load(scene.render.filepath, check_existing=False)
    w, h = image.size
    pixels = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    material = volume.materials[0]
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.volumes.remove(volume)
    bpy.data.materials.remove(material)
    return pixels.reshape(h, w, 4)[::-1].copy()


def _gain(cells):
    """The one exposure for the cumulus renders: their brightest lit pixels (the 99.5th percentile of the maximum
    channel over pixels covered at least OPAQUE, after unpremultiplying) map to WHITE_POINT."""
    lit = np.concatenate([_straight(c)[..., :3].max(-1)[c[..., 3] > OPAQUE] for c in cells])
    return WHITE_POINT / max(1e-6, float(np.percentile(lit, 99.5)))


def _straight(premultiplied):
    """Premultiplied RGBA to straight alpha."""
    out = premultiplied.copy()
    alpha = out[..., 3:4]
    out[..., :3] = np.where(alpha > 1e-4, out[..., :3] / np.maximum(alpha, 1e-4), 0.0)
    return out


def _finish(straight, gain=1.0):
    """A straight-alpha linear image as an atlas cell: exposed by `gain`, eased over SHOULDER instead of clipping,
    sRGB-encoded, with its colour bled into the clear pixels."""
    cell = straight.copy()
    rgb = cell[..., :3] * gain
    over = np.maximum(rgb - SHOULDER, 0.0)
    rgb = np.minimum(rgb, SHOULDER) + (1.0 - SHOULDER) * (1.0 - np.exp(-over / (1.0 - SHOULDER)))
    cell[..., :3] = atlas.linear_to_srgb(rgb)
    cell[..., 3] = np.clip(cell[..., 3], 0.0, 1.0)
    return atlas.bleed(cell)


def build(out_dir, scratch, seed=7):
    """Build, render and pack every cloud; writes clouds.png and atlases.json into out_dir and returns the sheet."""
    scene = studio()
    renders = {}
    for k, recipe in enumerate(CUMULUS):
        density, lo = cumulus_density(recipe, seed * 1000 + k)
        renders[recipe["name"]] = render(scene, density, lo, scratch, recipe["name"])
    gain = _gain(list(renders.values()))
    cells = {name: _finish(_straight(image), gain) for name, image in renders.items()}
    for k, recipe in enumerate(CIRRUS):
        cells[recipe["name"]] = _finish(cirrus_image(recipe, seed * 1000 + 100 + k))
    sheet = np.zeros((SIZE[1], SIZE[0], 4), dtype=np.float32)
    for name, (x, y, w, h) in layout().items():
        sheet[y:y + h, x:x + w] = cells[name]
    os.makedirs(out_dir, exist_ok=True)
    atlas.write_png(os.path.join(out_dir, FILE), sheet)
    atlas.write_manifest(os.path.join(out_dir, atlas.MANIFEST))
    bpy.data.scenes.remove(scene)
    return sheet


def preview(sheet, path):
    """The atlas laid over a sky gradient, so the cut-outs and the light read as they will against the sky."""
    h = sheet.shape[0]
    t = np.linspace(0.0, 1.0, h)[:, None, None]
    sky = atlas.linear_to_srgb((1.0 - t) * np.array([0.22, 0.42, 0.78]) + t * np.array([0.6, 0.74, 0.92]))
    alpha = sheet[..., 3:4]
    image = np.concatenate([sheet[..., :3] * alpha + sky * (1.0 - alpha), np.ones_like(alpha)], -1)
    return atlas.write_png(path, image)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0] if __doc__ else None)
    parser.add_argument("--out", default="public/models/island", help="folder for clouds.png and atlases.json")
    parser.add_argument("--previews", default=None, help="folder for the preview over a sky (omit to skip)")
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args(argv)
    with tempfile.TemporaryDirectory() as scratch:
        sheet = build(os.path.abspath(args.out), scratch, args.seed)
    if args.previews:
        os.makedirs(args.previews, exist_ok=True)
        print("preview", preview(sheet, os.path.join(os.path.abspath(args.previews), "clouds_preview.png")))
    print("clouds", os.path.join(os.path.abspath(args.out), FILE))


if __name__ == "__main__":
    main()
