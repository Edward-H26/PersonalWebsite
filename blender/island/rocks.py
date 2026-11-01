"""Rocks and the tree stump of DESIGN.md section 13b. A rock is a rounded, lumpy mass of slate: an icosphere pushed
out by low-frequency noise, flattened where it beds into the ground and stepped a little along its strata, textured
by the rock texture projected from the side it faces (the strata stay horizontal) and painted in its corner colour:
darker in its hollows and at its foot, moss on its crown and on its lee side away from the sea."""

import bmesh
from mathutils import Vector, noise

from island import cards

TILE = 1.6
MOSS = (0.42, 0.62, 0.22)


def uv(p, n):
    """Project the repeating rock texture from the axis the face looks along, strata running level."""
    if abs(n.z) > 0.7:
        return (p.x / TILE, p.y / TILE)
    if abs(n.x) > abs(n.y):
        return (p.y / TILE, p.z / TILE)
    return (p.x / TILE, p.z / TILE)


def boulder(rng, plant, size, at=(0.0, 0.0), subdivisions=3, moss=0.35, strata=0.16, lump=0.24, sink=0.12):
    """One rounded slate rock of `size` (x, y, z) metres standing at `at`, added to `plant`."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=1.0)
    seed = Vector((rng.uniform(-50, 50), rng.uniform(-50, 50), rng.uniform(-50, 50)))
    hollow = {}
    for v in bm.verts:
        n = v.co.normalized()
        bump = lump * noise.noise(n * 1.2 + seed) + lump * 0.4 * noise.noise(n * 2.7 - seed)
        p = n * (1.0 + bump)
        z = p.z
        if z < 0.0:
            z *= sink
        p = Vector((p.x * size[0] * 0.5, p.y * size[1] * 0.5, (z + sink) / (1.0 + sink) * size[2]))
        if strata:
            # Slate splits along its beds: pull every height a little toward the nearest bedding plane.
            step = size[2] * strata
            p.z += 0.35 * (round(p.z / step) * step - p.z)
        v.co = Vector((p.x + at[0], p.y + at[1], max(0.0, p.z)))
        hollow[v.index] = bump
    bm.normal_update()
    verts = {v.index: plant.bm.verts.new(v.co) for v in bm.verts}
    for f in bm.faces:
        n = f.normal
        uvs, colours = [], []
        for loop in f.loops:
            v = loop.vert
            uvs.append(uv(v.co, n))
            shade = 0.82 + 0.35 * max(-0.2, min(0.25, hollow[v.index])) - 0.18 * max(0.0, 1.0 - v.co.z / 0.25)
            vn = v.normal
            top = max(0.0, vn.z - 0.35) / 0.65
            lee = max(0.0, -vn.y - 0.2) * max(0.0, 1.0 - v.co.z / max(0.1, size[2]))
            patch = 0.5 + 0.5 * noise.noise(v.co * 2.3 + seed)
            m = min(1.0, moss * (1.6 * top + 0.9 * lee) * (0.4 + patch))
            base = (shade, shade, shade * 1.02)
            colours.append(tuple(b * (1.0 - m) + c * m * shade * 1.4 for b, c in zip(base, MOSS)))
        plant.face([verts[l.vert.index] for l in f.loops], uvs, colours, [(0.0, 0.0, 0.0)] * len(uvs))
    bm.free()


def rocks(rng, name, pieces, plan=None, height=None):
    """A rock or a group of rocks as one object, `height` metres tall when given; pieces are (size, at,
    subdivisions, moss)."""
    plant = cards.Plant("rock")
    for size, at, subdivisions, moss in pieces:
        boulder(rng, plant, size, at, subdivisions, moss)
    return plant.finish(name, plan=plan, height=height)
