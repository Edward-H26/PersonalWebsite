"""dry_stone_wall: one piece of the dry-stone walls along the fields (DESIGN.md section 17), LENGTH long with flush ends
so the site chains pieces end to end. Two battered faces of laid stones, each a block of five visible faces in the rock
family's strata-and-lichen texture tinted stone by stone, close the dark hearting between them; a row of coping stones
set on edge, tall and short in turn, caps the top. The gateway form keeps the length but stands two built stone
pillars at its ends with GATE apart between them, the width of a fence piece, for the field gate. One mesh, one
textured material."""

import math
import random

from mathutils import Matrix, Vector

from island import cards, flora, rocks

LENGTH, HEIGHT, BASE, TOP = 3.0, 1.05, 0.62, 0.42
COURSE, STONE_LENGTH, STONE_DEPTH = (0.15, 0.24), (0.3, 0.55), 0.26
COPING = (0.08, 0.14), (0.24, 0.36)  # thickness along the wall, height
GATE, PILLAR = 2.3, (0.35, 0.62, 1.45)  # gap, (along the wall, across it, height)
STONE_TINT = (0.84, 0.81, 0.75)


def build(seed=7, form="wall"):
    rng = random.Random(seed)
    plant = cards.Plant("rock")
    if form == "gateway":
        for side in (-1, 1):
            _pillar(rng, plant, side * (LENGTH / 2 - PILLAR[0] / 2))
    else:
        _hearting(plant)
        for side in (-1, 1):
            _face(rng, plant, side)
        _coping(rng, plant)
    return plant.finish("isl_dry_stone_wall")


def _half_width(z):
    """Half the wall's thickness at height z: battered from BASE at the foot to TOP at the coping."""
    return (BASE + (TOP - BASE) * z / HEIGHT) / 2


def _tint(rng, top=False):
    """A stone's colour: weathered grey with a warm cast, a lichened top now and then."""
    shade = rng.uniform(0.78, 1.06)
    colour = tuple(c * shade for c in STONE_TINT)
    if top and rng.random() < 0.35:
        colour = flora.mix(colour, rocks.MOSS, 0.45)
    return colour


def _block(plant, corners, colour, hidden=()):
    """A stone from its eight corners (bottom four, then the top four above them in the same order), every face but
    the hidden ones added with its box-projected texture and wound to face out of the stone, since the rock material
    culls back faces."""
    verts = [plant.bm.verts.new(c) for c in corners]
    centre = sum(corners, Vector()) / 8
    faces = {"bottom": (0, 1, 2, 3), "top": (4, 5, 6, 7), "outer": (0, 1, 5, 4), "right": (1, 2, 6, 5), "inner": (2, 3, 7, 6),
             "left": (3, 0, 4, 7)}
    for name, idx in faces.items():
        if name in hidden:
            continue
        pts = [corners[i] for i in idx]
        normal = (pts[1] - pts[0]).cross(pts[2] - pts[0])
        if normal.dot(sum(pts, Vector()) / 4 - centre) < 0.0:
            idx, pts, normal = idx[::-1], pts[::-1], -normal
        normal.normalize()
        shade = 0.55 if name == "bottom" else 1.0
        plant.face([verts[i] for i in idx], [rocks.uv(p, normal) for p in pts], [tuple(c * shade for c in colour)] * 4,
                   [(0.0, 0.0, 0.0)] * 4)


def _hearting(plant):
    """The dark rubble core between the faces, seen in the gaps between the stones."""
    corners = [Vector(c) for c in ((-LENGTH / 2, -BASE / 2 + 0.06, 0.0), (LENGTH / 2, -BASE / 2 + 0.06, 0.0),
                                   (LENGTH / 2, BASE / 2 - 0.06, 0.0), (-LENGTH / 2, BASE / 2 - 0.06, 0.0),
                                   (-LENGTH / 2, -TOP / 2 + 0.06, HEIGHT), (LENGTH / 2, -TOP / 2 + 0.06, HEIGHT),
                                   (LENGTH / 2, TOP / 2 - 0.06, HEIGHT), (-LENGTH / 2, TOP / 2 - 0.06, HEIGHT))]
    _block(plant, corners, (0.22, 0.21, 0.2), hidden=("bottom", "left", "right"))


def _face(rng, plant, side):
    """One battered face of stones laid in rough courses, each stone leaning back with the batter."""
    z = 0.0
    while z < HEIGHT - 0.05:
        h = min(rng.uniform(*COURSE), HEIGHT - z)
        x = -LENGTH / 2 + rng.uniform(-0.15, 0.0)
        while x < LENGTH / 2:
            length = rng.uniform(*STONE_LENGTH)
            x0, x1 = max(x, -LENGTH / 2), min(x + length, LENGTH / 2)
            if x1 - x0 > 0.06:
                lift = rng.uniform(-0.012, 0.012)
                out0, out1 = _half_width(z) + rng.uniform(0.0, 0.025), _half_width(z + h) + rng.uniform(0.0, 0.025)
                gap = 0.012
                bottom, top = z + gap + lift, z + h - gap + lift
                outer = [(x0 + gap, out0, bottom), (x1 - gap, out0, bottom)]
                inner = [(x1 - gap, out0 - STONE_DEPTH, bottom), (x0 + gap, out0 - STONE_DEPTH, bottom)]
                upper = [(x0 + gap, out1, top), (x1 - gap, out1, top), (x1 - gap, out1 - STONE_DEPTH, top),
                         (x0 + gap, out1 - STONE_DEPTH, top)]
                corners = [Vector((cx, side * cy, cz)) for cx, cy, cz in outer + inner + upper]
                _block(plant, corners, _tint(rng, top=z + h >= HEIGHT - 0.05), hidden=("inner",))
            x += length
        z += h


def _coping(rng, plant):
    """Coping stones set on edge across the top, tall and short in turn, leaning a little."""
    x = -LENGTH / 2
    tall = True
    while x < LENGTH / 2 - 0.04:
        t = min(rng.uniform(*COPING[0]), LENGTH / 2 - x)
        h = COPING[1][1 if tall else 0] * rng.uniform(0.9, 1.05)
        w = TOP / 2 + 0.03
        lean = Matrix.Rotation(math.radians(rng.uniform(-6.0, 6.0)), 4, "Y")
        local = [Vector(c) for c in ((0.0, -w, 0.0), (t, -w, 0.0), (t, w, 0.0), (0.0, w, 0.0),
                                     (0.0, -w, h), (t, -w, h), (t, w, h), (0.0, w, h))]
        corners = [Matrix.Translation((x, 0.0, HEIGHT - 0.03)) @ lean @ c for c in local]
        _block(plant, corners, _tint(rng, top=True), hidden=("bottom",))
        x += t + 0.01
        tall = not tall


def _pillar(rng, plant, x):
    """A gate pillar of big squared stones in courses with a flat cap stone."""
    along, across, height = PILLAR
    z = 0.0
    while z < height - 0.05:
        h = min(rng.uniform(0.22, 0.32), height - z)
        grow = rng.uniform(0.0, 0.03)
        a, b = along / 2 + grow, across / 2 + grow
        corners = [Vector((x + cx, cy, cz)) for cz in (z + 0.01, z + h - 0.01)
                   for cx, cy in ((-a, -b), (a, -b), (a, b), (-a, b))]
        _block(plant, corners, _tint(rng))
        z += h
    a, b = along / 2 + 0.06, across / 2 + 0.06
    cap = [Vector((x + cx, cy, cz)) for cz in (height, height + 0.13) for cx, cy in ((-a, -b), (a, -b), (a, b), (-a, b))]
    _block(plant, cap, _tint(rng, top=True))
