"""Sprite geometry for the vegetation atlases (DESIGN.md sections 13b and 18.3): leaves with real outlines (lobed oak,
ovate apple, toothed birch and rowan, three-lobed hawthorn, small box, narrow willow, lance-shaped ash leaflets, long
pine needles), twigs, spines, grass blades and heads, fern and bracken fronds, petals, bells and seed heads, and the
fallen leaves, needles, cones and twigs of the forest floor, built as plain meshes with a corner colour "Col" for
the atlas studio in atlas.py to photograph. A sprite fills a frame of `extent` metres centred on the origin: in the
front view X runs right and Z up, the camera looking along +Y; in the top view X runs right and Y up, the camera
looking down. Leaves, blades and petals let some of the back light through; twigs, stems, fruit and cones are
opaque. Foliage and grass sprites are painted in near-neutral greys, their green comes from the corner colours of
the cards that show them; flowers, gorse, bramble and the litter keep their own colours."""

import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from island import style

STUDIO_MATERIAL, OPAQUE_MATERIAL, HOLDOUT_MATERIAL = "atlas_sprite", "atlas_sprite_opaque", "atlas_holdout"
# Material slots of a sketch's faces.
TRANSLUCENT, HOLDOUT, OPAQUE = 0, 1, 2
# Share of the light a leaf, blade or petal lets through, and the warmer colour light takes on passing through it.
TRANSLUCENCY = 0.3
TRANSLUCENT_TINT = (1.0, 0.95, 0.72)
# How far, in sprite units (a square sprite spans one), ambient occlusion looks for the sprite's own leaves, so the
# middle of a cluster, which little sky reaches, comes out darker.
AO_DISTANCE = 0.12
AO_SAMPLES = 8


def _sprite_material(name, translucent):
    """Base colour from the corner colour Col darkened by ambient occlusion among the sprite's own faces, a little
    sheen, no specular glints that would bake into the atlas; a translucent sprite also lets some of the back light
    through, warmer."""
    mat = bpy.data.materials.get(name)
    if mat is not None:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = False
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.62
    bsdf.inputs["Specular IOR Level"].default_value = 0.2
    col = nodes.new("ShaderNodeVertexColor")
    col.layer_name = style.COLOR_ATTRIBUTE
    ao = nodes.new("ShaderNodeAmbientOcclusion")
    ao.only_local = True
    ao.samples = AO_SAMPLES
    ao.inputs["Distance"].default_value = AO_DISTANCE
    links.new(col.outputs["Color"], ao.inputs["Color"])
    links.new(ao.outputs["Color"], bsdf.inputs["Base Color"])
    if translucent:
        tint = nodes.new("ShaderNodeMix")
        tint.data_type, tint.blend_type = "RGBA", "MULTIPLY"
        tint.inputs["Factor"].default_value = 1.0
        tint.inputs["B"].default_value = (*TRANSLUCENT_TINT, 1.0)
        links.new(ao.outputs["Color"], tint.inputs["A"])
        through = nodes.new("ShaderNodeBsdfTranslucent")
        links.new(tint.outputs["Result"], through.inputs["Color"])
        mix = nodes.new("ShaderNodeMixShader")
        mix.inputs["Fac"].default_value = TRANSLUCENCY
        links.new(bsdf.outputs["BSDF"], mix.inputs[1])
        links.new(through.outputs["BSDF"], mix.inputs[2])
        links.new(mix.outputs["Shader"], nodes["Material Output"].inputs["Surface"])
    return mat


def holdout_material():
    """Cuts a hole in the render where it is seen, for overlay sprites that must be hidden behind leaves."""
    mat = bpy.data.materials.get(HOLDOUT_MATERIAL)
    if mat is None:
        mat = bpy.data.materials.new(HOLDOUT_MATERIAL)
        mat.use_nodes = True
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        nodes.remove(nodes["Principled BSDF"])
        holdout = nodes.new("ShaderNodeHoldout")
        links.new(holdout.outputs["Holdout"], nodes["Material Output"].inputs["Surface"])
    return mat


class Sketch:
    """A bmesh with a corner colour, filled by the shape helpers below and turned into one studio object."""

    def __init__(self):
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new(style.COLOR_ATTRIBUTE)
        self.twigs = []

    def face(self, points, colours, holdout=False, opaque=False):
        verts = [self.bm.verts.new(p) for p in points]
        f = self.bm.faces.new(verts)
        for loop, c in zip(f.loops, colours):
            loop[self.col] = (c[0], c[1], c[2], 1.0)
        f.material_index = HOLDOUT if holdout else OPAQUE if opaque else TRANSLUCENT
        return f

    def strip(self, left, right, colours_left, colours_right, holdout=False, opaque=False):
        """Quads between two polylines of equal length."""
        for i in range(len(left) - 1):
            self.face([left[i], right[i], right[i + 1], left[i + 1]],
                      [colours_left[i], colours_right[i], colours_right[i + 1], colours_left[i + 1]], holdout, opaque)

    def tube(self, path, radii, colour, sides=5, holdout=False, opaque=True):
        """A tapering tube along a polyline, for twigs, stems, the rachis of compound leaves and flower bells."""
        frames = _frames(path)
        rings = []
        for p, r, (side, normal) in zip(path, radii, frames):
            rings.append([p + (side * math.cos(a) + normal * math.sin(a)) * r
                          for a in (2 * math.pi * k / sides for k in range(sides))])
        colours = colour if isinstance(colour, list) else [colour] * len(path)
        for i in range(len(rings) - 1):
            for k in range(sides):
                k2 = (k + 1) % sides
                self.face([rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]],
                          [colours[i], colours[i], colours[i + 1], colours[i + 1]], holdout, opaque)

    def sphere(self, centre, radius, colour, rings=6, segments=10, squash=1.0, shade=0.25, holdout=False):
        """A small UV sphere (fruit, berries, buds, seed-clock cores), darker underneath."""
        def point(i, j):
            theta = math.pi * i / rings
            phi = 2 * math.pi * j / segments
            return Vector((math.sin(theta) * math.cos(phi), math.sin(theta) * math.sin(phi), math.cos(theta) * squash))

        for i in range(rings):
            for j in range(segments):
                corners = [point(i, j), point(i + 1, j), point(i + 1, j + 1), point(i, j + 1)]
                tones = [tuple(c * (1.0 - shade * (0.5 - 0.5 * p.z / max(squash, 1e-3))) for c in colour) for p in corners]
                pts = [centre + p * radius for p in corners]
                if i == 0:
                    pts, tones = [pts[0], pts[1], pts[2]], tones[:3]
                elif i == rings - 1:
                    pts, tones = [pts[0], pts[1], pts[3]], [tones[0], tones[1], tones[3]]
                self.face(pts, tones, holdout, opaque=True)

    def framing(self, axes=(0, 2), margin=0.47, extent=(1.0, 1.0), bottom=False):
        """The matrix that scales and centres the sketch so it fills a sprite frame of `extent` without crossing its
        edge; with `bottom` its foot sits on the frame's bottom margin instead, so stems and roots start at the
        bottom of their card."""
        lo = [min(v.co[a] for v in self.bm.verts) for a in axes]
        hi = [max(v.co[a] for v in self.bm.verts) for a in axes]
        scale = min(1.0, *(margin * e / max(1e-6, (h - l) * 0.5) for l, h, e in zip(lo, hi, extent)))
        centre = Vector((0.0, 0.0, 0.0))
        for a, l, h in zip(axes, lo, hi):
            centre[a] = (l + h) * 0.5
        if bottom:
            centre[axes[1]] = lo[1] + margin * extent[1] / scale
        return Matrix.Scale(scale, 4) @ Matrix.Translation(-centre)

    def fit(self, axes=(0, 2), margin=0.47, matrix=None, extent=(1.0, 1.0), bottom=False):
        if self.bm.verts:
            self.bm.transform(matrix or self.framing(axes, margin, extent, bottom))
        return self

    def to_object(self, name, collection):
        me = bpy.data.meshes.new(name)
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        me.materials.append(_sprite_material(STUDIO_MATERIAL, translucent=True))
        me.materials.append(holdout_material())
        me.materials.append(_sprite_material(OPAQUE_MATERIAL, translucent=False))
        for poly in me.polygons:
            poly.use_smooth = True
        ob = bpy.data.objects.new(name, me)
        collection.objects.link(ob)
        return ob


def _frames(path):
    """A (side, normal) pair per point of a polyline, carried along it without twisting."""
    frames = []
    tangent = (path[1] - path[0]).normalized()
    side = tangent.orthogonal().normalized()
    for i, p in enumerate(path):
        nxt = path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]
        if nxt.length > 1e-9:
            new = nxt.normalized()
            side = (side - new * side.dot(new)).normalized()
            tangent = new
        frames.append((side, tangent.cross(side).normalized()))
    return frames


def outline(kind, t, rng_phase=0.0, lobes=4.5):
    """Half-width of a leaf of unit length at t along its midrib (0 at the stalk, 1 at the tip)."""
    s = math.sin(math.pi * min(1.0, max(0.0, t)))
    if kind == "oak":
        env = s ** 0.85 * (0.62 + 0.55 * t)
        lobe = abs(math.sin(math.pi * lobes * t + rng_phase)) ** 0.45
        return 0.30 * env * (0.42 + 0.58 * lobe)
    if kind == "apple":
        env = math.sin(math.pi * t ** 0.78) ** 1.05
        return 0.29 * env * (1.0 + 0.035 * math.cos(70.0 * t))
    if kind == "birch":
        env = math.sin(math.pi * t ** 0.62) ** 1.15
        return 0.37 * env * (1.0 + 0.06 * math.cos(55.0 * t))
    if kind == "hawthorn":
        env = s ** 0.7 * (0.55 + 0.6 * t)
        lobe = abs(math.sin(math.pi * 2.5 * t + 0.35)) ** 0.4
        return 0.36 * env * (0.26 + 0.74 * lobe)
    if kind == "box":
        return 0.27 * s ** 0.8
    if kind == "lance":
        env = math.sin(math.pi * t ** 0.9) ** 1.25
        return 0.15 * env * (1.0 + 0.05 * math.cos(60.0 * t))
    if kind == "serrate":
        # Rowan's leaflets: long and narrow with saw teeth along the outer two thirds.
        env = math.sin(math.pi * t ** 0.85) ** 0.9
        tooth = 1.0 - 0.22 * ((t * 13.0 + rng_phase) % 1.0) ** 2 * (t > 0.3)
        return 0.17 * env * tooth
    if kind == "willow":
        env = math.sin(math.pi * t ** 0.8) ** 1.1
        return 0.075 * env * (1.0 + 0.04 * math.cos(90.0 * t))
    if kind == "needle":
        return 0.03 * s ** 0.4
    if kind == "bramble":
        env = math.sin(math.pi * t ** 0.72) ** 0.85
        tooth = 1.0 - 0.14 * ((t * 17.0 + rng_phase) % 1.0) ** 2
        return 0.3 * env * tooth
    if kind == "ovate":
        env = math.sin(math.pi * t ** 0.68) ** 0.75
        return 0.33 * env * (1.0 + 0.05 * math.sin(32.0 * t + rng_phase))
    if kind == "strap":
        tip = math.sqrt(max(0.0, 1.0 - max(0.0, (t - 0.86) / 0.14) ** 2))
        return 0.055 * min(1.0, t * 9.0) * tip
    if kind == "lobe":
        # One lobe of a buttercup leaf: a wedge widening to a toothed, three-pointed end.
        env = s ** 0.5 * (0.4 + 0.75 * t)
        teeth = 1.0 - 0.35 * abs(math.sin(math.pi * 3.0 * t + rng_phase)) ** 2 * (t > 0.55)
        return 0.3 * env * teeth
    if kind == "dandelion":
        env = s ** 0.6 * (0.4 + 0.7 * t)
        tooth = ((lobes * t + rng_phase) % 1.0) ** 1.6
        return 0.22 * env * (0.3 + 0.7 * tooth)
    if kind == "round":
        return 0.45 * s ** 0.55
    if kind == "ray":
        return 0.12 * s ** 0.45 * (1.0 - 0.25 * max(0.0, t - 0.92) / 0.08)
    if kind == "petal":
        return 0.34 * math.sin(math.pi * t ** 0.62) ** 0.55
    if kind == "poppy":
        return 0.56 * math.sin(math.pi * t ** 0.55) ** 0.45 * (1.0 + 0.04 * math.sin(40.0 * t + rng_phase))
    if kind == "pinna":
        return 0.13 * s ** 0.7 * (0.45 + 0.55 * abs(math.sin(math.pi * lobes * t + rng_phase)) ** 0.5)
    if kind == "heart":
        return 0.5 * math.sin(math.pi * t ** 0.7) ** 0.6 * (1.0 - 0.35 * math.exp(-((1.0 - t) / 0.12) ** 2))
    raise KeyError(kind)


def leaf(sketch, kind, base, direction, normal, length, tone=0.85, steps=16, fold=0.18, curl=0.12, phase=0.0,
         lobes=4.5, tint=(1.0, 1.0, 1.0), holdout=False, gradient=0.0, opaque=False):
    """One leaf blade from `base` along `direction`, its face toward `normal`: folded a little along the midrib,
    curled along its length, the midrib lighter and the margin darker so the folds read in the sprite."""
    d = direction.normalized()
    n = (normal - d * normal.dot(d)).normalized()
    s = d.cross(n)
    mid, right, left = [], [], []
    for i in range(steps + 1):
        t = i / steps
        m = base + d * (length * t) + n * (curl * length * t * t)
        half = outline(kind, t, phase, lobes) * length
        mid.append(m)
        right.append(m + s * half - n * (fold * half))
        left.append(m - s * half * 0.97 - n * (fold * half))
    ramp = [1.0 - gradient * (1.0 - i / steps) for i in range(steps + 1)]
    rib = [tuple(min(1.0, tone * 1.1 * c * g) for c in tint) for g in ramp]
    edge = [tuple(tone * 0.86 * c * g for c in tint) for g in ramp]
    sketch.strip(mid, right, rib, edge, holdout, opaque)
    sketch.strip(left, mid, edge, rib, holdout, opaque)


def compound(sketch, base, direction, normal, length, pairs, rng, tone=0.85, leaflet="lance", leaflet_scale=0.34,
             rachis=0.006, holdout=False, tint=(1.0, 1.0, 1.0)):
    """A pinnate leaf: a rachis with `pairs` opposite leaflets and one at the tip (ash, rowan, marigold, poppy)."""
    d = direction.normalized()
    n = (normal - d * normal.dot(d)).normalized()
    s = d.cross(n)
    path = [base + d * (length * t) + n * (0.08 * length * t * t) for t in (0.0, 0.33, 0.66, 1.0)]
    sketch.tube(path, [rachis, rachis * 0.8, rachis * 0.6, rachis * 0.4], tuple(tone * 0.7 * c for c in tint), sides=3,
                holdout=holdout)
    size = length * leaflet_scale
    for k in range(pairs):
        t = 0.25 + 0.7 * k / max(1, pairs)
        at = base + d * (length * t) + n * (0.08 * length * t * t)
        for side in (1.0, -1.0):
            out = (s * side + d * 0.45).normalized()
            leaf(sketch, leaflet, at, out, n + s * side * 0.2, size * rng.uniform(0.85, 1.05), tone * rng.uniform(0.9, 1.08),
                 steps=8, fold=0.12, curl=0.08, holdout=holdout, phase=rng.uniform(0.0, 1.0), tint=tint)
    leaf(sketch, leaflet, path[-1], d, n, size * 1.05, tone, steps=8, fold=0.12, curl=0.08, holdout=holdout, tint=tint)


def _bezier(a, b, c, steps):
    return [a * (1 - t) ** 2 + b * (2 * (1 - t) * t) + c * t * t for t in (i / steps for i in range(steps + 1))]


def _along(path, t):
    """Point and unit tangent at fraction t of a polyline's points."""
    x = t * (len(path) - 1)
    i = min(int(x), len(path) - 2)
    f = x - i
    return path[i].lerp(path[i + 1], f), (path[i + 1] - path[i]).normalized()


def _turn(direction, degrees, axis=Vector((0.0, -1.0, 0.0))):
    return (Matrix.Rotation(math.radians(degrees), 3, axis) @ direction).normalized()


def _hex(code):
    """A palette hex code as linear RGB."""
    return style.rgb(code)


def cluster(rng, kind, twigs=7, length=0.2, per_twig=8, radii=(0.44, 0.42), dome=0.22, spread=(35.0, 70.0),
            tone=(0.68, 1.0), droop=0.0, tip=2, lobes=(4.0, 5.0), pairs=0, twig_colour=0.3, tints=0.05, inner=0.3,
            steps=16, fold=0.18, layers=((0.14, 0.72), (0.0, 1.0)), fit=True):
    """A leaf cluster at the end of a branch, seen from outside its tree in the front view: twigs fan out from a
    core below the middle, the ones ending near the middle nearer the camera so the cluster is a dome; leaves
    alternate along each twig at an angle to it and fan at its tip, their faces turned to the camera and up toward
    the light, each a slightly different grey. Each of `layers` (depth behind the front, tone) repeats the twigs, so
    a darker back layer fills the gaps of the front one. droop arcs the twigs up and over like a fountain (birch,
    willow); pairs > 0 makes each leaf pinnate with that many pairs of `kind` leaflets (ash, rowan)."""
    sketch = Sketch()
    core = Vector((0.0, 0.12, -0.35 * radii[1]))
    base = Vector((0.0, 0.16, -0.5))
    sketch.tube([base, base.lerp(core, 0.5), core], [0.009, 0.007, 0.005], (twig_colour,) * 3, sides=5)
    for depth, shade in layers:
        ends = []
        for i in range(twigs):
            a = 2 * math.pi * (i + rng.uniform(-0.3, 0.3)) / twigs + math.pi / 2
            r = rng.uniform(inner, 0.62) if i % 3 == 2 else rng.uniform(0.72, 0.98)
            ends.append((r, a))
        ends.sort(key=lambda e: -e[0])
        for r, a in ends:
            x, z = radii[0] * r * math.cos(a), radii[1] * r * math.sin(a)
            tip_at = Vector((x, depth - dome * (1.0 - r * r) + rng.uniform(-0.03, 0.03), z - droop * (0.3 + 0.2 * r)))
            start = core + Vector((rng.uniform(-0.04, 0.04), depth * 0.5, rng.uniform(-0.03, 0.05)))
            lift = 0.12 * r + droop * (0.45 + 0.25 * r)
            path = _bezier(start, start.lerp(tip_at, 0.5) + Vector((0.0, -dome * 0.4, lift)), tip_at, 8)
            sketch.tube(path, [0.005 * (1.0 - 0.6 * k / 8) for k in range(9)], (twig_colour,) * 3, sides=4)
            sketch.twigs.append(path)
            count = max(2, int(per_twig * (0.55 + 0.45 * r)))
            for k in range(count + tip):
                if k < count:
                    t = 0.3 + 0.68 * k / max(1, count - 1)
                    angle = rng.uniform(*spread) * (1 if k % 2 else -1)
                else:
                    t = 1.0
                    angle = rng.uniform(-25.0, 25.0)
                at, d = _along(path, t)
                direction = _turn(d, angle) + Vector((0.0, rng.uniform(-0.35, 0.2), -droop * rng.uniform(0.3, 0.8)))
                normal = Vector((rng.uniform(-0.45, 0.45), -1.0, rng.uniform(0.15, 0.75)))
                size = length * rng.uniform(0.82, 1.12) * (0.85 if k < count and t < 0.5 else 1.0)
                grey = rng.uniform(*tone) * shade
                tint = (1.0 + rng.uniform(-tints, tints), 1.0, 1.0 + rng.uniform(-tints, tints))
                if pairs:
                    compound(sketch, at, direction, normal, size, pairs, rng, grey, leaflet=kind)
                else:
                    leaf(sketch, kind, at, direction, normal, size, grey, steps=steps, fold=fold,
                         phase=rng.uniform(0.0, 0.6), lobes=rng.uniform(*lobes), tint=tint)
    return sketch.fit() if fit else sketch


def spray(rng, shoots=10, needle=0.032, spacing=0.0075, tone=(0.6, 1.0), twig_colour=0.33):
    """A flat spruce spray seen from above (top view): a main shoot with alternate side shoots shortening toward the
    tip and short second-order shoots on those, every shoot set all round with short stiff needles, darker toward
    the main shoot where the spray shades itself."""
    sketch = Sketch()
    main = _bezier(Vector((0.0, -0.5, 0.0)), Vector((rng.uniform(-0.05, 0.05), 0.0, 0.02)), Vector((0.0, 0.47, 0.0)), 10)
    stems = [(main, 0.007, 0.0)]
    for i in range(shoots):
        t = 0.1 + 0.82 * i / (shoots - 1)
        at, d = _along(main, t)
        side = 1 if i % 2 else -1
        reach = 0.34 * (1.0 - 0.7 * t) + 0.06
        direction = _turn(d, side * rng.uniform(50.0, 64.0), axis=Vector((0.0, 0.0, 1.0)))
        end = at + direction * reach
        path = _bezier(at, at.lerp(end, 0.5) + d * 0.05, end, 6)
        stems.append((path, 0.004, 1.0))
        for j in range(int(reach / 0.06)):
            s_at, s_d = _along(path, 0.25 + 0.6 * j / max(1, int(reach / 0.06)))
            s_side = 1 if (i + j) % 2 else -1
            s_dir = _turn(s_d, s_side * rng.uniform(40.0, 55.0), axis=Vector((0.0, 0.0, 1.0)))
            s_end = s_at + s_dir * reach * rng.uniform(0.3, 0.42)
            stems.append((_bezier(s_at, s_at.lerp(s_end, 0.5) + s_d * 0.02, s_end, 4), 0.0025, 2.0))
    lift = 0.0
    for path, radius, order in stems:
        sketch.tube(path, [radius * (1.0 - 0.6 * k / (len(path) - 1)) for k in range(len(path))], (twig_colour,) * 3, sides=4)
        total = sum((path[k + 1] - path[k]).length for k in range(len(path) - 1))
        count = int(total / spacing)
        for k in range(count):
            f = k / max(1, count - 1)
            at, d = _along(path, f)
            # Needles lie almost in one plane under the top camera; a strictly rising height per needle keeps the
            # renderer from settling their overlaps differently on every run.
            lift += 2e-5
            at = at + Vector((0.0, 0.0, lift))
            side_axis = d.cross(Vector((0.0, 0.0, 1.0))).normalized()
            for turn in (rng.uniform(0, 360) for _ in range(2)):
                around = (Matrix.Rotation(math.radians(turn), 3, d) @ side_axis)
                if around.z < -0.2:
                    around.z = -around.z
                direction = (around + d * rng.uniform(0.5, 0.9)).normalized()
                grey = rng.uniform(*tone) * (0.62 + 0.38 * (0.35 * order / 2 + 0.65 * f))
                leaf(sketch, "lance", at, direction, Vector((0.0, 0.0, 1.0)) + side_axis * 0.3,
                     needle * rng.uniform(0.8, 1.1) * (0.65 + 0.35 * (1 - f)), grey, steps=3, fold=0.35, curl=0.0)
    return sketch.fit(axes=(0, 1))




def pine_tufts(rng, shoots=12, needle=0.13, per_shoot=120, tone=(0.6, 1.0), twig_colour=0.32):
    """Scots pine foliage in the front view: shoots fanning up and out from a twig below the middle, each a bottle
    brush of long paired needles angled toward its tip, the needles shorter toward the tip where the new growth is,
    and a bud at the end of every shoot."""
    sketch = Sketch()
    core = Vector((0.0, 0.1, -0.28))
    sketch.tube([Vector((0.0, 0.15, -0.5)), core], [0.012, 0.009], (twig_colour,) * 3, sides=5)
    for i in range(shoots):
        a = math.pi / 2 + (i - (shoots - 1) / 2) * (math.pi * 0.85 / (shoots - 1)) + rng.uniform(-0.1, 0.1)
        reach = rng.uniform(0.36, 0.5)
        end = core + Vector((math.cos(a) * reach, rng.uniform(-0.15, 0.1), math.sin(a) * reach * 0.95 + 0.05))
        path = _bezier(core, core.lerp(end, 0.5) + Vector((0.0, -0.05, 0.06)), end, 8)
        sketch.tube(path, [0.007 * (1.0 - 0.5 * k / 8) for k in range(9)], (twig_colour,) * 3, sides=4)
        for k in range(per_shoot):
            t = 0.12 + 0.86 * k / per_shoot
            at, d = _along(path, t)
            around = Matrix.Rotation(rng.uniform(0.0, 2 * math.pi), 3, d) @ d.orthogonal().normalized()
            for pair in (-0.12, 0.12):
                direction = (d * rng.uniform(0.9, 1.4) + around + around.cross(d) * pair).normalized()
                facing = Vector((rng.uniform(-0.3, 0.3), -1.0, rng.uniform(0.0, 0.5)))
                length = needle * rng.uniform(0.82, 1.08) * (1.0 - 0.4 * t ** 2)
                grey = rng.uniform(*tone) * (0.68 + 0.32 * t)
                leaf(sketch, "needle", at, direction, facing, length, grey, steps=3, fold=0.3, curl=0.06,
                     tint=(0.96, 1.0, 1.04))
        sketch.sphere(end, 0.012, (0.42, 0.36, 0.3), rings=4, segments=6, squash=1.6)
    return sketch.fit()


def overlay(rng, kind, cluster_kwargs, what):
    """A leaf cluster's seasonal overlay: the apple's blossom (spring) or fruit (late summer), or the rowan's berry
    bunches (late summer to autumn), framed exactly like the cluster cell built from the same seed and arguments,
    its leaves cut out so only what shows in front of them is left; the site lays the overlay over the cluster's
    cards by the season."""
    sketch = cluster(rng, kind, fit=False, **cluster_kwargs)
    frame = sketch.framing()
    for f in sketch.bm.faces:
        f.material_index = HOLDOUT
    up = Vector((0.0, -1.0, 0.35))
    for path in sketch.twigs:
        if what == "blossom":
            c = colours("blossom")
            for t in (1.0, 0.82, 0.64, 0.46):
                at, d = _along(path, t)
                for k in range(rng.randint(3, 5)):
                    centre = at + Vector((rng.uniform(-0.04, 0.04), -0.03 - rng.uniform(0.0, 0.03), rng.uniform(-0.03, 0.04)))
                    face = (up + Vector((rng.uniform(-0.4, 0.4), 0.0, rng.uniform(-0.2, 0.5)))).normalized()
                    side = face.orthogonal().normalized()
                    for p in range(5):
                        petal_dir = (Matrix.Rotation(2 * math.pi * p / 5 + rng.uniform(0, 1), 3, face) @ side)
                        tint = tuple(a * (1 - 0.35 * rng.random()) + b * 0.35 * rng.random() for a, b in zip(c["petal"], c["blush"]))
                        leaf(sketch, "petal", centre, petal_dir + face * 0.25, face, 0.045, 1.0, steps=6, fold=0.1,
                             curl=-0.2, tint=tint, gradient=0.15)
                    sketch.sphere(centre + face * 0.006, 0.008, c["centre"], rings=3, segments=6)
        elif what == "fruit":
            c = colours("fruit")
            for t in (0.78, 0.5):
                at, d = _along(path, t)
                hang = at + Vector((rng.uniform(-0.02, 0.02), -0.05, -0.06))
                sketch.tube([at, hang], [0.003, 0.002], (0.25, 0.18, 0.1), sides=3)
                blush = rng.uniform(0.3, 0.8)
                skin = tuple(a * blush + b * (1 - blush) for a, b in zip(c["skin"], c["cheek"]))
                sketch.sphere(hang + Vector((0.0, 0.0, -0.035)), 0.04, skin, rings=7, segments=12, squash=0.92, shade=0.4)
        elif rng.random() < 0.9:
            # A rowan's bunch of berries hangs from the end of its twig, a loose dome of some twenty on short stalks.
            c = colours("rowan_berry")
            at, d = _along(path, 1.0)
            top = at + Vector((rng.uniform(-0.02, 0.02), -0.05, -0.02))
            for k in range(rng.randint(22, 36)):
                a, r = rng.uniform(0.0, 2 * math.pi), 0.075 * math.sqrt(rng.random())
                berry = top + Vector((math.cos(a) * r, -0.01 - 0.02 * rng.random(), -0.03 - 0.6 * r * r / 0.075 + math.sin(a) * r * 0.5))
                sketch.tube([top, berry], [0.002, 0.0015], (0.35, 0.22, 0.12), sides=3)
                tone = c["berry"] if rng.random() < 0.7 else c["deep"]
                sketch.sphere(berry, rng.uniform(0.012, 0.015), tuple(v * rng.uniform(0.9, 1.08) for v in tone), rings=4,
                              segments=7, shade=0.45)
    return sketch.fit(matrix=frame)


def gorse(rng, shoots=16, spines=90, flowers=75):
    """Gorse in the front view and in its own colours: stiff green shoots fanning up from below the middle, each set
    all round with sharp spines angled toward its tip, and yellow pea flowers crowded along the upper shoots, a
    standard petal over two wings and a keel."""
    c = colours("gorse")
    sketch = Sketch()
    core = Vector((0.0, 0.1, -0.32))
    sketch.tube([Vector((0.0, 0.14, -0.5)), core], [0.012, 0.01], c["stem"], sides=5)
    paths = []
    for i in range(shoots):
        a = math.pi / 2 + (i - (shoots - 1) / 2) * (math.pi * 0.9 / (shoots - 1)) + rng.uniform(-0.12, 0.12)
        reach = rng.uniform(0.38, 0.52)
        end = core + Vector((math.cos(a) * reach, rng.uniform(-0.18, 0.12), math.sin(a) * reach + 0.06))
        path = _bezier(core, core.lerp(end, 0.5) + Vector((rng.uniform(-0.04, 0.04), -0.04, 0.04)), end, 8)
        paths.append(path)
        sketch.tube(path, [0.008 * (1.0 - 0.6 * k / 8) for k in range(9)], c["stem"], sides=4)
        for k in range(spines):
            t = 0.15 + 0.85 * k / spines
            at, d = _along(path, t)
            around = Matrix.Rotation(rng.uniform(0.0, 2 * math.pi), 3, d) @ d.orthogonal().normalized()
            direction = (d * rng.uniform(0.6, 1.1) + around).normalized()
            spine = tuple(v * rng.uniform(0.8, 1.15) for v in c["spine"])
            leaf(sketch, "needle", at, direction, Vector((0.0, -1.0, 0.3)), rng.uniform(0.045, 0.07), 1.0, steps=3,
                 fold=0.3, curl=0.0, tint=spine)
    for _ in range(flowers):
        path = paths[rng.randrange(len(paths))]
        at, d = _along(path, rng.uniform(0.45, 1.0))
        facing = (Vector((rng.uniform(-0.5, 0.5), -1.0, rng.uniform(0.0, 0.6)))).normalized()
        side = facing.cross(Vector((0.0, 0.0, 1.0))).normalized()
        centre = at + facing * 0.012
        petal = tuple(v * rng.uniform(0.92, 1.05) for v in c["petal"])
        leaf(sketch, "round", centre, Vector((0.0, 0.0, 1.0)) + side * rng.uniform(-0.3, 0.3), facing, 0.034, 1.0, steps=6,
             fold=-0.15, curl=-0.2, tint=petal, gradient=0.2)
        for w in (-1.0, 1.0):
            leaf(sketch, "petal", centre - facing * 0.004, side * w + Vector((0.0, 0.0, -0.35)), facing, 0.026, 1.0, steps=5,
                 fold=0.2, curl=0.1, tint=petal)
        leaf(sketch, "petal", centre + facing * 0.004, Vector((0.0, 0.0, -1.0)) + facing * 0.4, facing, 0.022, 1.0, steps=5,
             fold=0.3, curl=0.15, tint=c["keel"])
    return sketch.fit()


def bramble(rng, leaves=7, flowers=4, berries=10):
    """A bramble shoot in the front view and in its own colours: an arching prickly cane from the lower left, leaves
    of three or five toothed leaflets held out from it on stalks, white-pink flowers with their stamens, and
    blackberries ripening from green through red to black."""
    c = colours("bramble")
    sketch = Sketch()
    second = _bezier(Vector((0.3, 0.12, -0.48)), Vector((0.12, 0.1, 0.1)), Vector((-0.3, 0.12, -0.12)), 12)
    sketch.tube(second, [0.012 - 0.006 * k / 12 for k in range(13)], c["cane"], sides=6)
    for k in range(4):
        at, d = _along(second, 0.3 + 0.2 * k)
        stalk_end = at + (_turn(d, (1 if k % 2 else -1) * 70.0) + Vector((0.0, -0.3, 0.0))).normalized() * 0.07
        sketch.tube([at, stalk_end], [0.004, 0.003], c["cane"], sides=4)
        for j in range(3):
            leaf(sketch, "bramble", stalk_end, _turn((stalk_end - at).normalized(), (j - 1) * 70.0),
                 Vector((rng.uniform(-0.3, 0.3), -1.0, 0.35)), rng.uniform(0.11, 0.14), 1.0, steps=14, fold=0.22, curl=0.1,
                 phase=rng.uniform(0.0, 1.0), tint=tuple(v * rng.uniform(0.75, 0.95) for v in c["leaf"]))
    cane = _bezier(Vector((-0.44, 0.08, -0.48)), Vector((-0.1, 0.0, 0.52)), Vector((0.44, 0.04, 0.02)), 16)
    sketch.tube(cane, [0.016 - 0.008 * k / 16 for k in range(17)], c["cane"], sides=6)
    for k in range(26):
        at, d = _along(cane, 0.04 + 0.92 * k / 26)
        around = Matrix.Rotation(rng.uniform(0.0, 2 * math.pi), 3, d) @ d.orthogonal().normalized()
        leaf(sketch, "needle", at, (around - d * 0.6).normalized(), Vector((0.0, -1.0, 0.0)), 0.03, 1.0, steps=2, fold=0.0,
             curl=0.0, tint=c["prickle"], opaque=True)
    for k in range(leaves):
        at, d = _along(cane, 0.12 + 0.8 * k / max(1, leaves - 1))
        side = 1 if k % 2 else -1
        stalk_dir = (_turn(d, side * rng.uniform(55.0, 80.0)) + Vector((0.0, -0.3, 0.0))).normalized()
        stalk_end = at + stalk_dir * rng.uniform(0.06, 0.1)
        sketch.tube([at, stalk_end], [0.004, 0.003], c["cane"], sides=4)
        count = 5 if rng.random() < 0.5 else 3
        for j in range(count):
            angle = (j - (count - 1) / 2) * (150.0 / max(1, count - 1)) if count > 1 else 0.0
            direction = _turn(stalk_dir, angle)
            green = tuple(v * rng.uniform(0.82, 1.1) for v in (c["leaf"] if rng.random() < 0.7 else c["leaf_light"]))
            leaf(sketch, "bramble", stalk_end, direction, Vector((rng.uniform(-0.3, 0.3), -1.0, 0.35)),
                 rng.uniform(0.13, 0.17) * (1.0 if j == (count - 1) // 2 else 0.85), 1.0, steps=14, fold=0.22, curl=0.1,
                 phase=rng.uniform(0.0, 1.0), tint=green)
    for k in range(flowers):
        at, d = _along(cane, rng.uniform(0.55, 0.98))
        centre = at + Vector((rng.uniform(-0.06, 0.06), -0.05, rng.uniform(0.0, 0.06)))
        facing = Vector((rng.uniform(-0.4, 0.4), -1.0, rng.uniform(0.0, 0.5))).normalized()
        side = facing.orthogonal().normalized()
        for p in range(5):
            petal_dir = Matrix.Rotation(2 * math.pi * p / 5 + rng.uniform(0.0, 0.5), 3, facing) @ side
            leaf(sketch, "petal", centre, petal_dir + facing * 0.15, facing, 0.04, 1.0, steps=6, fold=0.1, curl=-0.15,
                 tint=c["petal"], gradient=0.12)
        sketch.sphere(centre + facing * 0.006, 0.012, c["stamens"], rings=3, segments=7, squash=0.5)
    for k in range(berries):
        at, d = _along(cane, rng.uniform(0.5, 1.0))
        hang = at + Vector((rng.uniform(-0.05, 0.05), -0.05, -0.04 - rng.uniform(0.0, 0.03)))
        sketch.tube([at, hang], [0.003, 0.002], c["cane"], sides=3)
        ripeness = rng.random()
        tone = c["berry_black"] if ripeness < 0.55 else c["berry_red"] if ripeness < 0.85 else c["berry_green"]
        for j in range(9):
            a = 2 * math.pi * j / 9
            drupelet = hang + Vector((math.cos(a) * 0.011, -0.006 * abs(math.sin(a)), math.sin(a) * 0.013 - 0.005))
            sketch.sphere(drupelet, 0.0075, tone, rings=3, segments=5, shade=0.5)
        sketch.sphere(hang + Vector((0.0, -0.01, -0.004)), 0.0085, tone, rings=3, segments=5, shade=0.5)
    return sketch.fit()


def blade(sketch, root, direction, length, width, bend, tone, rng, segments=6, root_tone=0.62, fold=0.35):
    """One grass blade from `root`: a folded strip narrowing to a point, bowed over by `bend` toward its lean,
    dark at the root and light at the tip."""
    d = direction.normalized()
    out = Vector((d.x, d.y, 0.0))
    out = out.normalized() if out.length > 1e-6 else Vector((1.0, 0.0, 0.0))
    side = Vector((0.0, 0.0, 1.0)).cross(out)
    if side.length < 1e-6:
        side = Vector((1.0, 0.0, 0.0))
    side.normalize()
    side = (Matrix.Rotation(rng.uniform(-0.6, 0.6), 3, d) @ side).normalized()
    facing = d.cross(side).normalized()
    mid, left, right, tones = [], [], [], []
    for i in range(segments + 1):
        t = i / segments
        p = root + d * (length * t) + (out * 0.6 - Vector((0.0, 0.0, 1.0))) * (bend * length * t * t)
        w = width * (1.0 - t ** 1.4) * 0.5
        mid.append(p)
        left.append(p - side * w + facing * (fold * w))
        right.append(p + side * w + facing * (fold * w))
        tones.append((tone * (root_tone + (1.0 - root_tone) * t ** 0.8),) * 3)
    edge = [tuple(c * 0.9 for c in t) for t in tones]
    sketch.strip(left, mid, edge, tones)
    sketch.strip(mid, right, tones, edge)


def grass_clump(rng, blades=70, height=(0.55, 0.95), width=(0.016, 0.03), lean=(0.0, 30.0), bend=(0.05, 0.35),
                spread=0.05, tone=(0.65, 1.0), seed_heads=0, folded=0.35, curl=0.0, broken=0.0, extent=(1.0, 1.0)):
    """A clump of grass in the front view: blades from a tight root patch, leaning out further the shorter they are,
    some bowed over; `curl` bends dry blades over further and `broken` is the share snapped or grazed short;
    optional seed stalks with spikelet heads standing above the blades. The roots sit on the bottom of the cell."""
    sketch = Sketch()
    for _ in range(blades):
        root = Vector((rng.gauss(0.0, spread), rng.uniform(-0.05, 0.05), -0.5))
        tilt = math.radians(rng.uniform(*lean)) * (1 if rng.random() < 0.5 else -1)
        turn = rng.uniform(-0.5, 0.5)
        direction = Vector((math.sin(tilt), math.sin(turn) * 0.4, math.cos(tilt)))
        length = rng.uniform(*height)
        if rng.random() < broken:
            length *= rng.uniform(0.35, 0.7)
        sag = rng.uniform(*bend) * (0.4 + abs(tilt)) + curl * rng.uniform(0.4, 1.0)
        blade(sketch, root, direction, length, rng.uniform(*width), sag, rng.uniform(*tone), rng, fold=folded)
    for _ in range(seed_heads):
        root = Vector((rng.gauss(0.0, spread * 0.6), rng.uniform(-0.04, 0.04), -0.5))
        tilt = math.radians(rng.uniform(-10.0, 10.0))
        top = root + Vector((math.sin(tilt), 0.0, math.cos(tilt))) * rng.uniform(0.85, 0.98)
        path = _bezier(root, root.lerp(top, 0.5) + Vector((rng.uniform(-0.03, 0.03), 0.0, 0.0)), top, 6)
        sketch.tube(path, [0.0035 * (1.0 - 0.5 * k / 6) for k in range(7)], (0.6,) * 3, sides=4)
        head_from = 0.72
        for k in range(14):
            at, d = _along(path, head_from + (1.0 - head_from) * k / 13)
            side = 1 if k % 2 else -1
            leaf(sketch, "ray", at, _turn(d, side * rng.uniform(18.0, 30.0)), Vector((0.0, -1.0, 0.2)),
                 0.05 * (1.0 - 0.4 * k / 13), rng.uniform(0.75, 1.0), steps=4, fold=0.4, curl=0.0)
    return sketch.fit(axes=(0, 2), margin=0.49, extent=extent, bottom=True)


def grass_heads(rng, kind, stems=6, extent=(1.0, 1.0)):
    """Flowering grass stems in the front view, each from the bottom of the cell with a leaf or two on it: "spike",
    timothy's dense cylinder of spikelets; "panicle", an open airy head of fine branches with a spikelet at every
    end, like bent or Yorkshire fog; "nodding", arching branches with flat spikelets hanging from them, like brome."""
    sketch = Sketch()
    for i in range(stems):
        root = Vector(((i - (stems - 1) / 2) * 0.025 + rng.gauss(0.0, 0.01), rng.uniform(-0.04, 0.04), -0.5))
        tilt = math.radians(rng.uniform(-9.0, 9.0) + (i - (stems - 1) / 2) * 3.0)
        top = root + Vector((math.sin(tilt), 0.0, math.cos(tilt))) * rng.uniform(0.82, 0.97)
        path = _bezier(root, root.lerp(top, 0.5) + Vector((rng.uniform(-0.03, 0.03), 0.0, 0.0)), top, 10)
        sketch.tube(path, [0.0038 * (1.0 - 0.5 * k / 10) for k in range(11)], (0.62,) * 3, sides=4)
        at, d = _along(path, rng.uniform(0.15, 0.35))
        side = 1 if i % 2 else -1
        blade(sketch, at, _turn(d, side * rng.uniform(15.0, 30.0)), rng.uniform(0.18, 0.28), 0.012, 0.12, 0.85, rng)
        if kind == "spike":
            head_from = rng.uniform(0.8, 0.86)
            for k in range(46):
                t = head_from + (1.0 - head_from) * k / 45
                at, d = _along(path, t)
                around = Matrix.Rotation(k * 2.39996, 3, d) @ d.orthogonal().normalized()
                leaf(sketch, "round", at + around * 0.006, (d * 0.8 + around).normalized(), around + Vector((0.0, -0.6, 0.0)),
                     0.018, rng.uniform(0.78, 1.0), steps=3, fold=0.3, curl=0.0)
        elif kind == "panicle":
            for k in range(7):
                t = 0.68 + 0.3 * k / 6
                at, d = _along(path, t)
                for b in range(3):
                    branch_dir = _turn(d, rng.uniform(-70.0, 70.0))
                    branch = [at + branch_dir * (0.11 * (1.0 - 0.5 * k / 6) * u) + Vector((0.0, 0.0, -0.01 * u * u))
                              for u in (0.0, 0.5, 1.0)]
                    sketch.tube(branch, [0.0015, 0.0012, 0.001], (0.66,) * 3, sides=3)
                    for u in (0.55, 0.8, 1.0):
                        tip, td = _along(branch, u)
                        leaf(sketch, "ray", tip, td, Vector((0.0, -1.0, 0.2)), 0.02, rng.uniform(0.8, 1.0), steps=3, fold=0.3,
                             curl=0.0)
        else:
            for k in range(6):
                t = 0.72 + 0.26 * k / 5
                at, d = _along(path, t)
                side = 1 if k % 2 else -1
                reach = 0.08 * rng.uniform(0.8, 1.2)
                out = _turn(d, side * rng.uniform(35.0, 60.0))
                branch = _bezier(at, at + out * reach * 0.6 + Vector((0.0, 0.0, 0.02)), at + out * reach + Vector((0.0, 0.0, -0.05)), 4)
                sketch.tube(branch, [0.0015 * (1.0 - 0.4 * u / 4) for u in range(5)], (0.66,) * 3, sides=3)
                tip, td = _along(branch, 1.0)
                leaf(sketch, "lance", tip, Vector((td.x * 0.3, 0.0, -1.0)), Vector((0.0, -1.0, 0.1)), 0.06, rng.uniform(0.8, 1.0),
                     steps=5, fold=0.35, curl=0.05)
    return sketch.fit(axes=(0, 2), margin=0.49, extent=extent, bottom=True)


def fern_frond(rng, pairs=15, tone=(0.65, 1.0), extent=(1.0, 1.0)):
    """A fern frond lying in the front view: a curved rachis from the bottom with alternate lobed pinnae, longest a
    third of the way up and shortening to a fine tip."""
    sketch = Sketch()
    root, top = Vector((0.0, 0.0, -0.5)), Vector((rng.uniform(-0.04, 0.04), 0.0, 0.48))
    path = _bezier(root, Vector((0.05, -0.04, 0.0)), top, 12)
    sketch.tube(path, [0.006 * (1.0 - 0.7 * k / 12) for k in range(13)], (0.5,) * 3, sides=4)
    for k in range(pairs * 2):
        t = 0.1 + 0.88 * k / (pairs * 2 - 1)
        at, d = _along(path, t)
        side = 1 if k % 2 else -1
        size = 0.26 * math.sin(math.pi * min(1.0, t * 0.9 + 0.12)) ** 0.8 * (1.0 - 0.55 * t)
        direction = _turn(d, side * rng.uniform(62.0, 75.0)) + d * 0.15
        leaf(sketch, "pinna", at, direction, Vector((0.0, -1.0, 0.25)), size, rng.uniform(*tone), steps=18, fold=0.15,
             curl=0.05, lobes=rng.uniform(5.0, 7.0), phase=rng.uniform(0.0, 1.0))
    return sketch.fit(axes=(0, 2), margin=0.49, extent=extent, bottom=True)


def bracken_frond(rng, pairs=10, tone=(0.62, 1.0), extent=(1.0, 1.0)):
    """A bracken frond seen from above (top view), as it holds its blade level over the woodland floor: the stalk
    enters from the bottom of the cell and the broad triangular blade spreads from it in pairs of pinnae, longest at
    the base, each pinna itself cut into rows of lobed pinnules."""
    sketch = Sketch()
    up = Vector((0.0, 0.0, 1.0))
    path = _bezier(Vector((0.0, -0.5, 0.0)), Vector((0.02, 0.0, 0.03)), Vector((rng.uniform(-0.03, 0.03), 0.48, 0.0)), 14)
    sketch.tube(path, [0.007 * (1.0 - 0.75 * k / 14) for k in range(15)], (0.55,) * 3, sides=4)
    for k in range(pairs):
        t = 0.18 + 0.78 * k / pairs
        at, d = _along(path, t)
        reach = 0.25 * (1.0 - t) ** 0.75 + 0.03
        for side in (1.0, -1.0):
            out = _turn(d, side * rng.uniform(55.0, 68.0), axis=up)
            pinna = _bezier(at, at + out * reach * 0.55 + d * reach * 0.06, at + out * reach + d * reach * 0.12, 6)
            sketch.tube(pinna, [0.0025 * (1.0 - 0.6 * u / 6) for u in range(7)], (0.6,) * 3, sides=3)
            lobes = max(3, int(reach / 0.022))
            for j in range(lobes):
                u = 0.1 + 0.88 * j / lobes
                p_at, p_d = _along(pinna, u)
                for s2 in (1.0, -1.0):
                    size = reach * 0.28 * (1.0 - 0.6 * u) + 0.008
                    leaf(sketch, "pinna", p_at, _turn(p_d, s2 * rng.uniform(55.0, 70.0), axis=up) + p_d * 0.2, up, size,
                         rng.uniform(*tone), steps=8, fold=0.12, curl=-0.05, lobes=3.0, phase=rng.uniform(0.0, 1.0))
    return sketch.fit(axes=(0, 1), margin=0.49, extent=extent, bottom=True)


def flower_head(rng, kind, colours, fit=True):
    """A flower head seen from above (top view), its face in the X-Y plane: marigold, a dense ruffled double head;
    cornflower, ragged funnel florets round a darker centre; daisy, white rays round a domed yellow disc; poppy,
    four broad cupped petals with dark blotches round a seed capsule; dandelion, rings of narrow yellow rays;
    buttercup, five broad cupped petals round a green boss ringed with stamens."""
    sketch = Sketch()
    up = Vector((0.0, 0.0, 1.0))
    if kind == "marigold":
        for ring, (count, length, rise) in enumerate(((16, 0.46, 0.05), (14, 0.38, 0.12), (12, 0.3, 0.2), (10, 0.22, 0.28),
                                                       (8, 0.14, 0.34))):
            for k in range(count):
                a = 2 * math.pi * (k + 0.5 * (ring % 2) + rng.uniform(-0.15, 0.15)) / count
                d = Vector((math.cos(a), math.sin(a), rise + rng.uniform(-0.05, 0.08)))
                tone = 1.0 - 0.1 * ring
                colour = tuple(c * tone * rng.uniform(0.92, 1.05) for c in colours["petal"])
                leaf(sketch, "petal", Vector((0.0, 0.0, 0.04 * ring)), d, up + d * 0.3, length, 1.0, steps=10, fold=0.25,
                     curl=-0.25, tint=colour, gradient=0.35)
        sketch.sphere(Vector((0.0, 0.0, 0.16)), 0.06, colours["centre"], rings=4, segments=8)
    elif kind == "cornflower":
        for ring, (count, length, rise) in enumerate(((9, 0.44, 0.15), (7, 0.3, 0.45))):
            for k in range(count):
                a = 2 * math.pi * (k + 0.5 * ring + rng.uniform(-0.1, 0.1)) / count
                d = Vector((math.cos(a), math.sin(a), rise))
                colour = colours["petal"] if ring == 0 else colours["deep"]
                base = d.normalized() * 0.06 + Vector((0.0, 0.0, 0.05 * ring))
                for tooth in (-22.0, -8.0, 8.0, 22.0):
                    t_dir = (Matrix.Rotation(math.radians(tooth), 3, up) @ d).normalized()
                    leaf(sketch, "ray", base, t_dir, up, length * rng.uniform(0.85, 1.0), 1.0, steps=6, fold=0.3,
                         curl=0.1, tint=tuple(c * rng.uniform(0.9, 1.05) for c in colour), gradient=0.4)
        for k in range(12):
            a = rng.uniform(0, 2 * math.pi)
            p = Vector((math.cos(a), math.sin(a), 0.0)) * rng.uniform(0.0, 0.06) + Vector((0.0, 0.0, 0.12))
            sketch.sphere(p, 0.022, colours["centre"], rings=3, segments=5)
    elif kind == "daisy":
        count = 26
        for k in range(count):
            a = 2 * math.pi * (k + rng.uniform(-0.2, 0.2)) / count
            d = Vector((math.cos(a), math.sin(a), rng.uniform(-0.05, 0.08)))
            leaf(sketch, "ray", d * 0.1, d, up, rng.uniform(0.36, 0.4), 1.0, steps=8, fold=0.2, curl=-0.1,
                 tint=tuple(c * rng.uniform(0.94, 1.0) for c in colours["petal"]), gradient=0.12)
        sketch.sphere(Vector((0.0, 0.0, 0.02)), 0.13, colours["centre"], rings=5, segments=12, squash=0.45, shade=0.4)
    elif kind == "poppy":
        for k, (a, length, rise) in enumerate(((0.3, 0.5, 0.25), (1.87, 0.5, 0.25), (3.44, 0.5, 0.25), (5.01, 0.5, 0.25))):
            d = Vector((math.cos(a), math.sin(a), rise))
            leaf(sketch, "poppy", d * 0.02 + Vector((0.0, 0.0, 0.02 * k)), d, up - d * 0.25, length, 1.0, steps=14,
                 fold=-0.2, curl=0.45, tint=colours["petal"], gradient=0.18, phase=rng.uniform(0, 3))
            leaf(sketch, "round", d * 0.03 + Vector((0.0, 0.0, 0.03 + 0.02 * k)), d, up - d * 0.25, 0.14, 1.0, steps=6,
                 fold=-0.2, curl=0.3, tint=colours["blotch"])
        for k in range(18):
            a = 2 * math.pi * k / 18
            d = Vector((math.cos(a), math.sin(a), 0.9))
            leaf(sketch, "ray", d * 0.05 + Vector((0.0, 0.0, 0.1)), d, up, 0.07, 1.0, steps=3, fold=0.0, curl=0.0,
                 tint=colours["blotch"])
        sketch.sphere(Vector((0.0, 0.0, 0.14)), 0.075, colours["centre"], rings=4, segments=10, squash=0.8)
    elif kind == "dandelion":
        for ring, (count, length, rise) in enumerate(((26, 0.46, 0.02), (22, 0.38, 0.15), (18, 0.29, 0.3), (12, 0.2, 0.5))):
            for k in range(count):
                a = 2 * math.pi * (k + 0.5 * (ring % 2) + rng.uniform(-0.2, 0.2)) / count
                d = Vector((math.cos(a), math.sin(a), rise))
                leaf(sketch, "ray", Vector((0.0, 0.0, 0.03 * ring)), d, up, length * rng.uniform(0.9, 1.05), 1.0, steps=6,
                     fold=0.2, curl=-0.1, tint=tuple(c * (1.0 - 0.07 * ring) for c in colours["petal"]), gradient=0.25)
    elif kind == "buttercup":
        for k in range(5):
            a = 2 * math.pi * k / 5 + rng.uniform(-0.12, 0.12)
            d = Vector((math.cos(a), math.sin(a), 0.55))
            leaf(sketch, "round", d * 0.03, d, up - d * 0.35, 0.44, 1.0, steps=10, fold=-0.25, curl=0.35,
                 tint=tuple(c * rng.uniform(0.95, 1.04) for c in colours["petal"]), gradient=0.25)
        for k in range(40):
            a = k * 2.39996
            r = 0.02 + 0.07 * math.sqrt(k / 40)
            sketch.sphere(Vector((math.cos(a) * r, math.sin(a) * r, 0.1 + 0.04 * (1.0 - r / 0.09))), 0.012, colours["stamen"],
                          rings=3, segments=5)
        sketch.sphere(Vector((0.0, 0.0, 0.1)), 0.04, colours["centre"], rings=4, segments=8, squash=0.7)
    return sketch.fit(axes=(0, 1)) if fit else sketch


def _place(sketch, matrix, start):
    """Move the vertices added to a sketch since index `start` by `matrix`."""
    sketch.bm.verts.ensure_lookup_table()
    for v in sketch.bm.verts[start:]:
        v.co = matrix @ v.co


def flower_side(rng, kind, colours, stem_colour, leaves=1):
    """A flower on its stem in the front view: the head turned up toward the light and a little toward the camera,
    on a gently curved stem from the bottom of the cell, with a leaf or two on the stem; the cornflower gets its
    scaly involucre, the poppy a hairy, slightly crooked stem."""
    sketch = flower_head(rng, kind, colours, fit=False)
    tilt = Matrix.Rotation(math.radians(rng.uniform(52.0, 62.0)), 4, "X")
    head = Matrix.Translation((0.0, 0.0, 0.3)) @ tilt @ Matrix.Scale(0.42, 4)
    _place(sketch, head, 0)
    neck = head @ Vector((0.0, 0.0, -0.02))
    if kind == "cornflower":
        sketch.sphere(head @ Vector((0.0, 0.0, -0.06)), 0.055, colours["bract"], rings=5, segments=8, squash=1.3, shade=0.35)
        neck = head @ Vector((0.0, 0.0, -0.16))
    elif kind in ("marigold", "daisy", "dandelion", "buttercup"):
        sketch.sphere(head @ Vector((0.0, 0.0, -0.03)), 0.05, stem_colour, rings=4, segments=8, squash=0.6)
    bow = rng.uniform(-0.06, 0.06) + (0.05 if kind == "poppy" else 0.0)
    path = _bezier(Vector((0.0, 0.0, -0.5)), Vector((bow, 0.0, -0.1)), neck, 10)
    sketch.tube(path, [0.012 - 0.004 * k / 10 for k in range(11)], stem_colour, sides=5)
    for k in range(leaves):
        at, d = _along(path, 0.25 + 0.3 * k)
        side = 1 if k % 2 == 0 else -1
        leaf(sketch, "lance", at, _turn(d, side * 48.0), Vector((0.0, -1.0, 0.3)), 0.26, 1.0, steps=10, fold=0.25,
             curl=0.15, tint=stem_colour)
    return sketch.fit(axes=(0, 2), margin=0.48, bottom=True)


def seed_clock(rng, stem_colour, pappus=(0.95, 0.95, 0.92), seeds=140):
    """A dandelion seed clock on its stem in the front view: a sphere of fine white pappus rays, each ending in a
    tiny tuft, round a small seed core."""
    sketch = Sketch()
    centre = Vector((0.0, 0.0, 0.22))
    for k in range(seeds):
        z = 1.0 - 2.0 * (k + 0.5) / seeds
        a = k * 2.399963
        d = Vector((math.sqrt(1 - z * z) * math.cos(a), math.sqrt(1 - z * z) * math.sin(a), z))
        tip = centre + d * 0.24
        sketch.tube([centre + d * 0.03, tip], [0.0016, 0.0012], tuple(c * 0.9 for c in pappus), sides=3)
        for f in range(5):
            spread = _turn(d, rng.uniform(-60, 60), axis=d.orthogonal().normalized())
            sketch.tube([tip, tip + spread * 0.045], [0.0012, 0.0006], pappus, sides=3)
    sketch.sphere(centre, 0.035, (0.45, 0.33, 0.18), rings=4, segments=8)
    path = _bezier(Vector((0.0, 0.0, -0.5)), Vector((0.03, 0.0, -0.15)), centre, 8)
    sketch.tube(path, [0.01 - 0.003 * k / 8 for k in range(9)], stem_colour, sides=5)
    return sketch.fit(axes=(0, 2), margin=0.48, bottom=True)


def bud(rng, colours, stem_colour):
    """A poppy's closed bud nodding on its hooked, hairy stem, in the front view."""
    sketch = Sketch()
    top = Vector((0.12, 0.0, 0.3))
    sketch.sphere(top + Vector((0.04, 0.0, -0.1)), 0.11, colours["bud"], rings=6, segments=10, squash=1.45, shade=0.3)
    path = _bezier(Vector((0.0, 0.0, -0.5)), Vector((-0.05, 0.0, 0.45)), top, 12)
    sketch.tube(path, [0.012 - 0.004 * k / (len(path) - 1) for k in range(len(path))], stem_colour, sides=5)
    return sketch.fit(axes=(0, 2), margin=0.48, bottom=True)


def clover_head(rng, stem_colour, florets=90):
    """A white clover head on its stalk in the front view: a dense globe of small florets standing out from the
    middle, each a white petal turned outward, the lowest turned down and browning as they fade."""
    c = colours("clover")
    sketch = Sketch()
    centre = Vector((0.0, 0.0, 0.18))
    for k in range(florets):
        z = 1.0 - 2.0 * (k + 0.5) / florets
        a = k * 2.39996
        d = Vector((math.sqrt(1.0 - z * z) * math.cos(a), math.sqrt(1.0 - z * z) * math.sin(a), z))
        spent = d.z < -0.4
        if spent:
            d = (d + Vector((0.0, 0.0, -0.8))).normalized()
        tone = c["fade"] if spent else tuple(v * rng.uniform(0.95, 1.0) for v in c["floret"])
        leaf(sketch, "petal", centre + d * 0.05, d, d.orthogonal(), 0.11, 1.0, steps=4, fold=0.3, curl=-0.1, tint=tone)
    sketch.sphere(centre, 0.08, c["base"], rings=5, segments=10)
    path = _bezier(Vector((0.0, 0.0, -0.5)), Vector((0.03, 0.0, -0.15)), centre - Vector((0.0, 0.0, 0.05)), 8)
    sketch.tube(path, [0.012 - 0.004 * k / 8 for k in range(9)], stem_colour, sides=5)
    return sketch.fit(axes=(0, 2), margin=0.48, bottom=True)


def stalk(rng, extent=(1.0, 1.0)):
    """A bracken stalk in the front view, from the bottom of the cell to its top: grooved, a little crooked, darker
    at its foot, for the crossed cards that hold a frond up."""
    sketch = Sketch()
    path = _bezier(Vector((0.0, 0.0, -0.5)), Vector((rng.uniform(-0.03, 0.03), 0.0, 0.0)), Vector((0.0, 0.0, 0.5)), 12)
    shades = [(0.5 + 0.35 * k / 12,) * 3 for k in range(13)]
    sketch.tube(path, [0.05 - 0.015 * k / 12 for k in range(13)], shades, sides=6)
    return sketch.fit(axes=(0, 2), margin=0.5, extent=extent, bottom=True)


def leaf_tuft(rng, kind, count=4, length=0.62, spread=70.0, tone=(0.7, 1.0), lobes=4.5, petiole=0.0, view="front"):
    """A tuft of basal leaves fanning up from the bottom of the cell (front view), or a few leaves lying open from
    the middle (top view, for the trefoil of wood sorrel). The "palmate" kind is the buttercup's leaf, three toothed
    lobes spread from the end of its stalk."""
    sketch = Sketch()
    if view == "top":
        for k in range(count):
            a = 2 * math.pi * k / count + rng.uniform(-0.3, 0.3)
            stalk_end = Vector((math.cos(a), math.sin(a), 0.0)) * rng.uniform(0.12, 0.2) + Vector((0, 0, 0.03 * k))
            sketch.tube([Vector((0.0, 0.0, 0.0)), stalk_end], [0.008, 0.006], (0.55,) * 3, sides=4)
            for j in range(3):
                b = a + 2 * math.pi * j / 3 + rng.uniform(-0.1, 0.1)
                d = Vector((math.cos(b), math.sin(b), 0.1))
                leaf(sketch, "heart", stalk_end, d, Vector((0.0, 0.0, 1.0)), 0.16 * rng.uniform(0.9, 1.1),
                     rng.uniform(*tone), steps=12, fold=0.3, curl=-0.1)
        return sketch.fit(axes=(0, 1), margin=0.48)
    for k in range(count):
        angle = -spread / 2 + spread * (k + rng.uniform(-0.2, 0.2)) / max(1, count - 1)
        d = _turn(Vector((0.0, 0.0, 1.0)), angle) + Vector((0.0, rng.uniform(-0.3, 0.1), 0.0))
        base = Vector((rng.uniform(-0.03, 0.03), 0.0, -0.5))
        if petiole:
            end = base + d.normalized() * petiole
            sketch.tube([base, end], [0.008, 0.006], (0.55,) * 3, sides=4)
            base = end
        size, grey = length * rng.uniform(0.8, 1.05), rng.uniform(*tone)
        if kind == "palmate":
            for j in (-1, 0, 1):
                leaf(sketch, "lobe", base, _turn(d.normalized(), j * 40.0), Vector((0.0, -1.0, 0.35)), size * (0.85 if j else 1.0),
                     grey, steps=14, fold=0.2, curl=0.15, phase=rng.uniform(0.0, 1.0))
        else:
            leaf(sketch, kind, base, d, Vector((0.0, -1.0, 0.25)), size, grey, steps=24, fold=0.22, curl=0.25, lobes=lobes,
                 phase=rng.uniform(0.0, 0.5))
    return sketch.fit(axes=(0, 2), margin=0.48, bottom=True)


def foxglove(rng, colours, stem_colour, bells=18, extent=(1.0, 1.0)):
    """A foxglove spike in the front view: a tall stem from the bottom of the cell with a few soft leaves low down,
    and up its top half a one-sided raceme of drooping tubular bells, the lowest open and largest with a paler lip
    at the mouth, closing into green-tinged buds at the tip."""
    sketch = Sketch()
    lean = rng.uniform(-0.04, 0.04)
    path = _bezier(Vector((0.0, 0.0, -0.5)), Vector((lean, 0.0, 0.0)), Vector((lean * 2.0, 0.0, 0.48)), 16)
    sketch.tube(path, [0.012 - 0.007 * k / 16 for k in range(17)], stem_colour, sides=5)
    for k in range(3):
        at, d = _along(path, 0.06 + 0.08 * k)
        side = 1 if k % 2 else -1
        leaf(sketch, "ovate", at, _turn(d, side * rng.uniform(50.0, 65.0)), Vector((0.0, -1.0, 0.3)), 0.2 - 0.04 * k, 0.9,
             steps=12, fold=0.2, curl=0.25, tint=stem_colour)
    for k in range(bells):
        at, d = _along(path, 0.42 + 0.55 * k / (bells - 1))
        size = 0.085 * (1.0 - 0.6 * (k / bells) ** 1.5)
        a = rng.uniform(-0.9, 0.9)
        out = Vector((math.sin(a), -math.cos(a), 0.0))
        stalk_end = at + out * 0.02
        sketch.tube([at, stalk_end], [0.002, 0.002], stem_colour, sides=3)
        hang = (out * 0.75 + Vector((0.0, 0.0, -0.6))).normalized()
        if k > bells - 5:
            bud = tuple(a2 * 0.6 + b * 0.4 for a2, b in zip(colours["bud"], colours["petal"]))
            sketch.sphere(stalk_end + hang * size * 0.35, size * 0.32, bud, rings=4, segments=6, squash=1.5)
            continue
        bell = [stalk_end + hang * size * u for u in (0.0, 0.35, 0.7, 1.0)]
        shades = [tuple(c * f for c in colours["petal"]) for f in (0.8, 0.92, 1.0, 1.0)]
        sketch.tube(bell, [size * f for f in (0.12, 0.24, 0.3, 0.34)], shades, sides=7, opaque=False)
        leaf(sketch, "round", bell[-1] - hang * 0.004, (hang + Vector((0.0, 0.0, -0.5))).normalized(), -out, size * 0.36, 1.0,
             steps=5, fold=-0.2, curl=-0.25, tint=colours["throat"])
    return sketch.fit(axes=(0, 2), margin=0.49, extent=extent, bottom=True)


def bluebell(rng, colours, stem_colour, scapes=3, extent=(1.0, 1.0)):
    """Bluebells in the front view: a few flower stems from the bottom of the cell arching over at the top, each hung
    along one side with narrow bells whose petal tips curl back, among strap leaves."""
    sketch = Sketch()
    for k in range(3):
        base = Vector(((k - 1) * 0.04, 0.02, -0.5))
        leaf(sketch, "strap", base, _turn(Vector((0.0, 0.0, 1.0)), (k - 1) * 28.0 + rng.uniform(-6.0, 6.0)),
             Vector((0.0, -1.0, 0.2)), rng.uniform(0.45, 0.6), 0.85, steps=14, fold=0.3, curl=0.35, tint=stem_colour)
    for i in range(scapes):
        root = Vector(((i - (scapes - 1) / 2) * 0.05, rng.uniform(-0.03, 0.03), -0.5))
        lean = (i - (scapes - 1) / 2) * 0.1 + rng.uniform(-0.04, 0.04)
        top = root + Vector((lean + 0.14, 0.0, rng.uniform(0.8, 0.93)))
        path = _bezier(root, root + Vector((lean * 0.3, 0.0, 0.85)), top, 14)
        sketch.tube(path, [0.009 - 0.004 * k / 14 for k in range(15)], stem_colour, sides=5)
        bells = rng.randint(6, 10)
        for k in range(bells):
            at, d = _along(path, 0.5 + 0.48 * k / bells)
            size = 0.07 * (1.0 - 0.45 * k / bells)
            out = Vector((rng.uniform(-0.4, 0.4), -1.0, 0.0)).normalized()
            stalk_end = at + out * 0.012 + Vector((0.0, 0.0, -0.01))
            sketch.tube([at, stalk_end], [0.002, 0.0015], stem_colour, sides=3)
            hang = (Vector((0.0, 0.0, -1.0)) + out * 0.25).normalized()
            bell = [stalk_end + hang * size * u for u in (0.0, 0.5, 1.0)]
            shades = [tuple(c * f for c in colours["petal"]) for f in (0.75, 0.95, 1.0)]
            sketch.tube(bell, [size * f for f in (0.14, 0.22, 0.24)], shades, sides=6, opaque=False)
            mouth = bell[-1]
            side = hang.orthogonal().normalized()
            for p in range(6):
                lip = Matrix.Rotation(2 * math.pi * p / 6, 3, hang) @ side
                leaf(sketch, "petal", mouth + lip * size * 0.2, (lip + hang * 0.2).normalized(), -hang, size * 0.3, 1.0,
                     steps=4, fold=0.1, curl=-0.4, tint=colours["tip"])
    return sketch.fit(axes=(0, 2), margin=0.49, extent=extent, bottom=True)


# Fallen leaves by kind: outline, colours and length as a share of a litter cell.
LITTER_LEAVES = {"oak": ("oak", ("#8a6a3c", "#7a5530", "#a07a45", "#6b4a2a", "#9a8048"), 0.11),
                 "ash": ("lance", ("#7a7350", "#8a7a48", "#6a6a40", "#9a8a50"), 0.07),
                 "birch": ("birch", ("#c8a040", "#b08a30", "#d8b050", "#a07a28"), 0.055),
                 "hawthorn": ("hawthorn", ("#8a5a30", "#a0623a", "#7a4a2a"), 0.045),
                 "willow": ("willow", ("#a89a50", "#b8a058", "#8a8040"), 0.09)}


def litter(rng, leaves=(), count=70, nuts=0, needles=0, cones=0, twigs=0):
    """A patch of forest floor seen from above, in its own colours: fallen leaves of the given (kind, weight) lying
    flat and curling, acorns, needles, cones and twigs, thickest in the middle and thinning to bare edges so a decal
    of it blends into the ground."""
    sketch = Sketch()
    up = Vector((0.0, 0.0, 1.0))
    lift = [0.0]

    def spot():
        """A point in the patch, rarer toward its rim, a hair above everything laid before it."""
        while True:
            x, y = rng.uniform(-0.47, 0.47), rng.uniform(-0.47, 0.47)
            edge = min(1.0, max(0.0, (0.47 - math.hypot(x, y)) / 0.25))
            if rng.random() < edge * edge * (3.0 - 2.0 * edge):
                lift[0] += 2e-4
                return Vector((x, y, lift[0]))

    total = sum(w for _, w in leaves)
    for _ in range(count if leaves else 0):
        pick, kind = rng.uniform(0.0, total), leaves[-1][0]
        for name, weight in leaves:
            if pick <= weight:
                kind = name
                break
            pick -= weight
        shape, palette, size = LITTER_LEAVES[kind]
        a = rng.uniform(0.0, 2 * math.pi)
        colour = tuple(v * rng.uniform(0.85, 1.1) for v in _hex(rng.choice(palette)))
        at = spot()
        direction = Vector((math.cos(a), math.sin(a), 0.0))
        if kind == "ash":
            compound(sketch, at, direction, up, size * 2.2, 3, rng, 1.0, leaflet="lance", tint=colour)
            continue
        leaf(sketch, shape, at, direction, up, size * rng.uniform(0.8, 1.2), 1.0, steps=12, fold=rng.uniform(-0.25, 0.35),
             curl=rng.uniform(-0.3, 0.3), phase=rng.uniform(0.0, 0.6), tint=colour, opaque=True)
    for _ in range(needles):
        a = rng.uniform(0.0, 2 * math.pi)
        colour = tuple(v * rng.uniform(0.8, 1.15) for v in _hex("#8a5f36"))
        leaf(sketch, "needle", spot(), Vector((math.cos(a), math.sin(a), 0.0)), up, rng.uniform(0.025, 0.05), 1.0, steps=2,
             fold=0.0, curl=0.0, tint=colour, opaque=True)
    for _ in range(cones):
        at, a = spot(), rng.uniform(0.0, 2 * math.pi)
        axis = Vector((math.cos(a), math.sin(a), 0.0))
        length = rng.uniform(0.05, 0.1)
        for k in range(9):
            u = k / 8
            centre = at + axis * (length * (u - 0.5)) + up * 0.012
            radius = 0.016 * math.sin(math.pi * (0.15 + 0.7 * u)) + 0.004
            sketch.sphere(centre, radius, tuple(v * (0.75 + 0.25 * (k % 2)) for v in _hex("#6e4a2c")), rings=3, segments=6)
    for _ in range(nuts):
        at = spot()
        sketch.sphere(at + up * 0.008, 0.009, _hex("#9a7a3a"), rings=4, segments=7, squash=1.2)
        sketch.sphere(at + up * 0.004, 0.0085, _hex("#6a5232"), rings=3, segments=7, squash=0.6)
    for _ in range(twigs):
        start, a = spot(), rng.uniform(0.0, 2 * math.pi)
        length = rng.uniform(0.12, 0.32)
        end = start + Vector((math.cos(a), math.sin(a), 0.0)) * length
        path = _bezier(start, start.lerp(end, 0.5) + Vector((rng.uniform(-0.03, 0.03), rng.uniform(-0.03, 0.03), 0.004)), end, 6)
        tone = tuple(v * rng.uniform(0.85, 1.1) for v in _hex("#5c4a3a"))
        radius = rng.uniform(0.004, 0.008)
        sketch.tube(path, [radius * (1.0 - 0.5 * k / 6) for k in range(7)], tone, sides=5)
        if rng.random() < 0.6:
            at, d = _along(path, rng.uniform(0.3, 0.7))
            fork = at + _turn(d, rng.choice((-1, 1)) * rng.uniform(25.0, 45.0), axis=up) * length * 0.35
            sketch.tube([at, fork], [radius * 0.7, radius * 0.4], tone, sides=4)
    return sketch


# Sprite colours by name, as palette hex codes: every flower and its colour variants ("kind" names the head a variant
# is built as), the apple's blossom and fruit, the rowan's berries, and the shrubs whose sprites keep their own
# colours. "stem" is the green of every flower stem.
PALETTE = {
    "marigold": {"petal": "#f29a1d", "centre": "#b85a10"},
    "marigold_yellow": {"kind": "marigold", "petal": "#f6c21c", "centre": "#c88a10"},
    "cornflower": {"petal": "#4f7fe0", "deep": "#3a4fb8", "centre": "#2a2a6e", "bract": "#6f8a5a"},
    "cornflower_violet": {"kind": "cornflower", "petal": "#8a5fd0", "deep": "#6a3fb0", "centre": "#3a2060", "bract": "#6f8a5a"},
    "cornflower_pink": {"kind": "cornflower", "petal": "#e08ab0", "deep": "#c8608c", "centre": "#6a2a4a", "bract": "#6f8a5a"},
    "daisy": {"petal": "#f4f2ea", "centre": "#f0b81c"},
    "daisy_pink": {"kind": "daisy", "petal": "#f6d6e0", "centre": "#f0b81c"},
    "poppy": {"petal": "#d8261a", "blotch": "#1a1414", "centre": "#7a8a4a", "bud": "#6f8a4e"},
    "poppy_orange": {"kind": "poppy", "petal": "#ec6a1e", "blotch": "#2a1810", "centre": "#7a8a4a", "bud": "#6f8a4e"},
    "poppy_pink": {"kind": "poppy", "petal": "#e8879e", "blotch": "#f4eef0", "centre": "#7a8a4a", "bud": "#6f8a4e"},
    "dandelion": {"petal": "#f6c520"},
    "buttercup": {"petal": "#f7c80f", "centre": "#9aa83a", "stamen": "#e8b818"},
    "buttercup_lemon": {"kind": "buttercup", "petal": "#f3e46a", "centre": "#a0aa48", "stamen": "#e8d040"},
    "foxglove": {"petal": "#c066b4", "throat": "#f4e0ef", "bud": "#7d9a5e"},
    "foxglove_pink": {"kind": "foxglove", "petal": "#f0a2c8", "throat": "#fbe8f1", "bud": "#7d9a5e"},
    "foxglove_white": {"kind": "foxglove", "petal": "#f0ebe1", "throat": "#fbf7f0", "bud": "#8aa06a"},
    "bluebell": {"petal": "#6a72e0", "tip": "#8a90ec"},
    "bluebell_white": {"kind": "bluebell", "petal": "#ecece6", "tip": "#ffffff"},
    "bluebell_pink": {"kind": "bluebell", "petal": "#f0b4d4", "tip": "#f8d2e6"},
    "clover": {"floret": "#f4f1ea", "fade": "#b89a7a", "base": "#e8dcd0"},
    "blossom": {"petal": "#f6eef0", "blush": "#e7a9b8", "centre": "#e8d070"},
    "fruit": {"skin": "#b8321e", "cheek": "#d9b03a"},
    "rowan_berry": {"berry": "#e0501c", "deep": "#c23a16"},
    "gorse": {"stem": "#4f6a32", "spine": "#3f6a2c", "petal": "#f3c419", "keel": "#e89a12"},
    "bramble": {"cane": "#6e2c3c", "prickle": "#b0806a", "leaf": "#3d5e2a", "leaf_light": "#5f8040", "petal": "#f2e6ea",
                "stamens": "#e8d8a0", "berry_black": "#1c1418", "berry_red": "#9a1c2a", "berry_green": "#7e9c3e"},
    "stem": "#5a7a3a",
}


def colours(name):
    """The linear colours of a PALETTE entry."""
    entry = PALETTE[name]
    if isinstance(entry, str):
        return style.rgb(entry)
    return {key: style.rgb(value) for key, value in entry.items() if key != "kind"}


def kind_of(name):
    """The flower a colour variant is built as."""
    return PALETTE[name].get("kind", name)
