"""Shared vegetation helpers (DESIGN.md sections 13 and 13b): the greens of a place, moss, the sea wind's lean, and the
vertex-coloured plant language the garden pieces and the hydrangea planter still use (leafy clumps, pom-poms,
leaves), finished into one mesh under the one vertex-colour material. The trees, bushes, ground cover and rocks of
section 13b are textured cards built in trees.py, ground.py and rocks.py; they borrow only the greens, the moss and
the wind from here.

The sea and the key light lie towards +Y, like the buildings' seaward faces and the site's sun at azimuth 180, so the
wind blows landward along -Y. Exposure runs from 0, a sheltered plant inland, to 1, a plant on the shore: the site's
files are baked at INLAND and the trees' _b variants at SHORE."""

import collections
import math

import bmesh
from mathutils import Vector, noise

from island import mesh, style

INLAND, SHORE = 0.2, 0.8
LANDWARD = Vector((0.0, -1.0, 0.0))
KEY_LIGHT = Vector((0.0, math.cos(math.radians(30.0)), math.sin(math.radians(30.0))))
# Trunk lean at the two baked exposures (DESIGN.md section 13): 3 degrees inland, 8 on the shore.
LEAN = ((INLAND, 3.0), (SHORE, 8.0))
TOP_BEND = 0.08
Greens = collections.namedtuple("Greens", "body light shade")
Corner = collections.namedtuple("Corner", "co normal face index")


def mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def scaled(colour, factor):
    return tuple(c * factor for c in colour)


def smoothstep(edge0, edge1, x):
    t = min(1.0, max(0.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def greens(exposure):
    """The greens of a place, mixed in linear light from the inland family (exposure 0) to the sea family (1)."""
    return Greens(*(mix(style.rgb(style.INLAND_GREENS[key]), style.rgb(style.SEA_GREENS[key]), exposure)
                    for key in Greens._fields))


def moss(exposure=0.5):
    """Moss on stone and bark, the canopies' green darker and duller."""
    g = greens(exposure)
    return mix(mix(g.body, g.shade, 0.55), style.linear("driftwood"), 0.2)


def colour_layer(bm):
    return bm.loops.layers.float_color.get(style.COLOR_ATTRIBUTE) or bm.loops.layers.float_color.new(style.COLOR_ATTRIBUTE)


def paint(ob, colour, per_face=False):
    """Paint an object's corners with colour(corner) -> linear (r, g, b) and put it under the vertex-colour material.
    A corner carries its world position and normal (its face's centre and normal when per_face is True, for flat
    facets), its face's normal and its face's index."""
    me = ob.data
    to_world = ob.matrix_basis
    turn = to_world.to_3x3().inverted().transposed()
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    layer = colour_layer(bm)
    for face in bm.faces:
        face.material_index = 0
        face_normal = (turn @ face.normal).normalized()
        centre = to_world @ face.calc_center_median()
        for loop in face.loops:
            if per_face:
                co, normal = centre, face_normal
            else:
                co, normal = to_world @ loop.vert.co, (turn @ loop.vert.normal).normalized()
            loop[layer] = (*colour(Corner(co, normal, face_normal, face.index)), 1.0)
    bm.to_mesh(me)
    bm.free()
    me.materials.clear()
    me.materials.append(style.vertex_colour_material())
    return ob


def up_face(bm, verts, layer=None, tints=None):
    """A face through verts turned so its normal points up, for open leaves, petals and blades, painted from a
    per-vertex `tints` map when given."""
    face = bm.faces.new(verts)
    face.normal_update()
    if face.normal.z < 0.0:
        face.normal_flip()
    if tints is not None:
        for loop in face.loops:
            loop[layer] = (*tints[loop.vert], 1.0)
    return face


def canopy(colours, tone=1.0, dusk=0.55):
    """The painting of clipped box and leaf clumps, by their normals as umbrella() paints its domes: their green, a
    lighter band over the top that is strongest on the side towards the key light, the amber dusk band where they
    face the key light and a cool dark green underneath; tone lightens or darkens the whole of it a little."""
    body, light, under = (scaled(c, tone) for c in colours)
    amber = style.rgb(style.DUSK)
    seaward = -LANDWARD

    def colour(c):
        if c.face.z < -0.3:
            return under
        n = c.normal
        top = smoothstep(0.45, 0.9, n.z) * (0.45 + 0.55 * (0.5 + 0.5 * n.dot(seaward)))
        out = mix(body, light, top)
        out = mix(out, amber, smoothstep(0.62, 0.95, n.dot(KEY_LIGHT)) * dusk)
        return mix(out, under, smoothstep(0.4, -0.15, n.z) * 0.9)

    return colour


def leaf(length, width, base, direction, rise, droop, colours, segments=3, notch=0.0):
    """A flat leaf from `base` along a horizontal `direction`, rising then drooping, widest a third of the way out
    and pointed, painted from colours[0] at the stalk to colours[1] at the tip and turned to the sky; notch cuts its
    edges into teeth like a dandelion's."""
    bm = bmesh.new()
    layer = colour_layer(bm)
    d = Vector(direction).normalized()
    side = Vector((-d.y, d.x, 0.0))
    tints, rows = {}, []
    for i in range(segments + 1):
        t = i / segments
        c = Vector(base) + d * length * t + Vector((0.0, 0.0, rise * math.sin(math.pi * t * 0.7) - droop * t * t))
        w = width * math.sin(math.pi * min(1.0, t * 1.4)) ** 0.8 * (1.0 - notch * (i % 2))
        pair = (bm.verts.new(c - side * w), bm.verts.new(c + side * w))
        tints.update({v: mix(colours[0], colours[1], t) for v in pair})
        rows.append(pair)
    tip = bm.verts.new(Vector(base) + d * length * 1.12 + Vector((0.0, 0.0, -droop * 1.2)))
    tints[tip] = colours[1]
    for (l0, r0), (l1, r1) in zip(rows, rows[1:]):
        up_face(bm, (l0, r0, r1, l1), layer, tints)
    up_face(bm, (rows[-1][0], rows[-1][1], tip), layer, tints)
    return mesh.from_bmesh("leaf", bm, style.vertex_colour_material())


def pompom(radius, rng, colour, deep, layers=3, petals=7):
    """A double marigold head facing up at the origin: `layers` cupped rings of petals, each smaller, higher and
    deeper in colour than the one below, so the head reads as a ball of frills."""
    bm = bmesh.new()
    layer = colour_layer(bm)
    for l in range(layers):
        u = l / max(1, layers - 1)
        r, z = radius * (1.0 - 0.5 * u), radius * 0.5 * u
        tint = mix(colour, deep, 0.7 * u)
        middle = bm.verts.new((0.0, 0.0, z + radius * 0.12))
        turn = rng.uniform(0.0, math.pi)
        ring = []
        for i in range(2 * petals):
            reach = r if i % 2 == 0 else r * 0.55
            ring.append(bm.verts.new((reach * math.cos(turn + math.pi * i / petals), reach * math.sin(turn + math.pi * i / petals),
                                      z + radius * (0.28 * (1.0 - 0.5 * u) if i % 2 == 0 else 0.05))))
        tints = {v: tint for v in ring + [middle]}
        for i in range(2 * petals):
            up_face(bm, (middle, ring[i], ring[(i + 1) % (2 * petals)]), layer, tints)
    return mesh.from_bmesh("pompom", bm, style.vertex_colour_material())


def clump(centre, radii, rng, colour, subdivisions=1, rough=0.25):
    """A lumpy clump of leaves or florets: an icosphere stretched to `radii` round `centre` and pushed in and out by
    noise, painted face by face with colour(corner)."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=1.0)
    phase = Vector((rng.uniform(-50, 50), rng.uniform(-50, 50), rng.uniform(-50, 50)))
    rx, ry, rz = radii
    for v in bm.verts:
        n = v.co.normalized()
        bump = 1.0 + rough * noise.noise(n * 1.8 + phase) + rng.uniform(-0.04, 0.04)
        v.co = Vector(centre) + Vector((n.x * rx * bump, n.y * ry * bump, n.z * rz * bump))
    return paint(mesh.from_bmesh("clump", bm, style.vertex_colour_material()), colour, per_face=True)


def leafy(colours, tone=1.0):
    """Paint for a clump of leaves: the dome painting with every face a little lighter or darker, like leaves catching
    the light."""
    dome = canopy(colours, tone)
    return lambda c: scaled(dome(c), 0.9 + 0.2 * ((c.index * 2654435761) % 101) / 100)


def lean_degrees(exposure):
    """Trunk lean for an exposure, along the line through the two values of LEAN."""
    (e0, d0), (e1, d1) = LEAN
    return d0 + (d1 - d0) * (exposure - e0) / (e1 - e0)


def windswept(ob, exposure, bend=TOP_BEND):
    """Lean a joined plant landward about its foot by lean_degrees(exposure) and bend its top a further `bend` of its
    height times the exposure. A shear, so horizontal faces stay horizontal and dome undersides and tops stay clean;
    the pivot goes back to the bottom centre."""
    me = ob.data
    height = max(v.co.z for v in me.vertices)
    tilt = math.tan(math.radians(max(0.0, lean_degrees(exposure))))
    for v in me.vertices:
        u = max(0.0, v.co.z) / height
        v.co += LANDWARD * height * (u * tilt + bend * exposure * u ** 3)
    me.update()
    return mesh.set_pivot(ob)


def finish(name, objs, plan=None, exposure=None, bend=TOP_BEND, smooth_angle=35):
    """Join a plant into one vertex-coloured mesh named `name`, stretch its plan to the scanned original's footprint
    ratio when the site fits one (plan is that original's size), then lean and bend it in the wind when given its
    exposure: after the fit, so the lean does not count against the original's footprint."""
    ob = mesh.finalize(name, objs, smooth_angle=smooth_angle, vertex_colors=True)
    if plan:
        mesh.fit_plan(ob, plan)
    if exposure is not None:
        # The proportion check reads the upright size, so the lean is not counted against the original's footprint.
        ob["upright_size"] = mesh.stats(ob)["size"]
        windswept(ob, exposure, bend)
    return ob
