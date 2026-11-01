"""Sprite geometry for the vegetation atlases (DESIGN.md section 13b): leaves with real outlines (lobed oak, ovate
apple, toothed birch, three-lobed hawthorn, small box, lance-shaped ash leaflets), twigs, needles, grass blades,
petals and seed heads, built as plain meshes with a corner colour "Col" for the atlas studio in atlas.py to
photograph. A sprite fills a frame of `extent` metres centred on the origin: in the front view X runs right and Z up,
the camera looking along +Y; in the top view X runs right and Y up, the camera looking down. Foliage sprites are
painted in near-neutral greys, their green comes from the corner colours of the cards that show them; flowers keep
their own colours."""

import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from island import style

STUDIO_MATERIAL = "atlas_sprite"
HOLDOUT_MATERIAL = "atlas_holdout"


def studio_material():
    """Base colour from the corner colour Col, a little sheen, no specular glints that would bake into the atlas."""
    mat = bpy.data.materials.get(STUDIO_MATERIAL)
    if mat is None:
        mat = bpy.data.materials.new(STUDIO_MATERIAL)
        mat.use_nodes = True
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        bsdf = nodes["Principled BSDF"]
        col = nodes.new("ShaderNodeVertexColor")
        col.layer_name = style.COLOR_ATTRIBUTE
        links.new(col.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.62
        bsdf.inputs["Specular IOR Level"].default_value = 0.2
        mat.use_backface_culling = False
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

    def face(self, points, colours, holdout=False):
        verts = [self.bm.verts.new(p) for p in points]
        f = self.bm.faces.new(verts)
        for loop, c in zip(f.loops, colours):
            loop[self.col] = (c[0], c[1], c[2], 1.0)
        if holdout:
            f.material_index = 1
        return f

    def strip(self, left, right, colours_left, colours_right, holdout=False):
        """Quads between two polylines of equal length."""
        for i in range(len(left) - 1):
            self.face([left[i], right[i], right[i + 1], left[i + 1]],
                      [colours_left[i], colours_right[i], colours_right[i + 1], colours_left[i + 1]], holdout)

    def tube(self, path, radii, colour, sides=5, holdout=False):
        """A tapering tube along a polyline, for twigs, stems and the rachis of compound leaves."""
        frames = _frames(path)
        rings = []
        for p, r, (side, normal) in zip(path, radii, frames):
            rings.append([p + (side * math.cos(a) + normal * math.sin(a)) * r
                          for a in (2 * math.pi * k / sides for k in range(sides))])
        for i in range(len(rings) - 1):
            for k in range(sides):
                k2 = (k + 1) % sides
                self.face([rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]], [colour] * 4, holdout)

    def sphere(self, centre, radius, colour, rings=6, segments=10, squash=1.0, shade=0.25, holdout=False):
        """A small UV sphere (fruit, buds, seed-clock cores), darker underneath."""
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
                self.face(pts, tones, holdout)

    def framing(self, axes=(0, 2), margin=0.47):
        """The matrix that scales and centres the sketch so it fills the sprite frame without crossing its edge."""
        lo = [min(v.co[a] for v in self.bm.verts) for a in axes]
        hi = [max(v.co[a] for v in self.bm.verts) for a in axes]
        scale = min(1.0, margin / max(1e-6, max((h - l) * 0.5 for l, h in zip(lo, hi))))
        centre = Vector((0.0, 0.0, 0.0))
        for a, l, h in zip(axes, lo, hi):
            centre[a] = (l + h) * 0.5
        return Matrix.Scale(scale, 4) @ Matrix.Translation(-centre)

    def fit(self, axes=(0, 2), margin=0.47, matrix=None):
        if self.bm.verts:
            self.bm.transform(matrix or self.framing(axes, margin))
        return self

    def to_object(self, name, collection):
        me = bpy.data.meshes.new(name)
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        me.materials.append(studio_material())
        me.materials.append(holdout_material())
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
         lobes=4.5, tint=(1.0, 1.0, 1.0), holdout=False, gradient=0.0):
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
    sketch.strip(mid, right, rib, edge, holdout)
    sketch.strip(left, mid, edge, rib, holdout)


def compound(sketch, base, direction, normal, length, pairs, rng, tone=0.85, leaflet="lance", leaflet_scale=0.34,
             rachis=0.006, holdout=False):
    """A pinnate leaf: a rachis with `pairs` opposite leaflets and one at the tip (ash, marigold, poppy)."""
    d = direction.normalized()
    n = (normal - d * normal.dot(d)).normalized()
    s = d.cross(n)
    path = [base + d * (length * t) + n * (0.08 * length * t * t) for t in (0.0, 0.33, 0.66, 1.0)]
    sketch.tube(path, [rachis, rachis * 0.8, rachis * 0.6, rachis * 0.4], (tone * 0.7,) * 3, sides=3, holdout=holdout)
    size = length * leaflet_scale
    for k in range(pairs):
        t = 0.25 + 0.7 * k / max(1, pairs)
        at = base + d * (length * t) + n * (0.08 * length * t * t)
        for side in (1.0, -1.0):
            out = (s * side + d * 0.45).normalized()
            leaf(sketch, leaflet, at, out, n + s * side * 0.2, size * rng.uniform(0.85, 1.05), tone * rng.uniform(0.9, 1.08),
                 steps=8, fold=0.12, curl=0.08, holdout=holdout)
    leaf(sketch, leaflet, path[-1], d, n, size * 1.05, tone, steps=8, fold=0.12, curl=0.08, holdout=holdout)


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


def cluster(rng, kind, twigs=7, length=0.2, per_twig=8, radii=(0.44, 0.42), dome=0.22, spread=(35.0, 70.0),
            tone=(0.68, 1.0), droop=0.0, tip=2, lobes=(4.0, 5.0), pairs=0, twig_colour=0.3, tints=0.05, inner=0.3,
            steps=16, fold=0.18, layers=((0.14, 0.72), (0.0, 1.0)), fit=True):
    """A leaf cluster at the end of a branch, seen from outside its tree in the front view: twigs fan out from a
    core below the middle, the ones ending near the middle nearer the camera so the cluster is a dome; leaves
    alternate along each twig at an angle to it and fan at its tip, their faces turned to the camera and up toward
    the light, each a slightly different grey. Each of `layers` (depth behind the front, tone) repeats the twigs, so
    a darker back layer fills the gaps of the front one. droop arcs the twigs up and over like a fountain (birch);
    pairs > 0 makes each leaf pinnate with that many leaflet pairs (ash)."""
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
                    compound(sketch, at, direction, normal, size, pairs, rng, grey)
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


def grass_clump(rng, blades=70, height=(0.55, 0.95), width=(0.016, 0.03), lean=(0.0, 38.0), bend=(0.05, 0.35),
                spread=0.07, tone=(0.65, 1.0), seed_heads=0, folded=0.35):
    """A clump of grass in the front view: blades from a tight root patch, leaning out further the shorter they are,
    some bowed over; optional seed stalks with spikelet heads standing above the blades."""
    sketch = Sketch()
    for _ in range(blades):
        root = Vector((rng.gauss(0.0, spread), rng.uniform(-0.05, 0.05), -0.5))
        tilt = math.radians(rng.uniform(*lean)) * (1 if rng.random() < 0.5 else -1)
        turn = rng.uniform(-0.5, 0.5)
        direction = Vector((math.sin(tilt), math.sin(turn) * 0.4, math.cos(tilt)))
        length = rng.uniform(*height)
        blade(sketch, root, direction, length, rng.uniform(*width), rng.uniform(*bend) * (0.4 + abs(tilt)), rng.uniform(*tone),
              rng, fold=folded)
    for _ in range(seed_heads):
        root = Vector((rng.gauss(0.0, spread * 0.6), rng.uniform(-0.04, 0.04), -0.5))
        tilt = math.radians(rng.uniform(-14.0, 14.0))
        top = root + Vector((math.sin(tilt), 0.0, math.cos(tilt))) * rng.uniform(0.85, 0.98)
        path = _bezier(root, root.lerp(top, 0.5) + Vector((rng.uniform(-0.03, 0.03), 0.0, 0.0)), top, 6)
        sketch.tube(path, [0.0035 * (1.0 - 0.5 * k / 6) for k in range(7)], (0.6,) * 3, sides=4)
        head_from = 0.72
        for k in range(14):
            at, d = _along(path, head_from + (1.0 - head_from) * k / 13)
            side = 1 if k % 2 else -1
            leaf(sketch, "ray", at, _turn(d, side * rng.uniform(18.0, 30.0)), Vector((0.0, -1.0, 0.2)),
                 0.05 * (1.0 - 0.4 * k / 13), rng.uniform(0.75, 1.0), steps=4, fold=0.4, curl=0.0)
    return sketch.fit(axes=(0, 2), margin=0.49)


def fern_frond(rng, pairs=15, tone=(0.65, 1.0)):
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
    return sketch.fit(axes=(0, 2), margin=0.49)


def flower_head(rng, kind, colours, fit=True):
    """A flower head seen from above (top view), its face in the X-Y plane: marigold, a dense ruffled double head;
    cornflower, ragged funnel florets round a darker centre; daisy, white rays round a domed yellow disc; poppy,
    four broad cupped petals with dark blotches round a seed capsule; dandelion, rings of narrow yellow rays."""
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
    elif kind in ("marigold", "daisy", "dandelion"):
        sketch.sphere(head @ Vector((0.0, 0.0, -0.03)), 0.05, stem_colour, rings=4, segments=8, squash=0.6)
    bow = rng.uniform(-0.06, 0.06) + (0.05 if kind == "poppy" else 0.0)
    path = _bezier(Vector((0.0, 0.0, -0.5)), Vector((bow, 0.0, -0.1)), neck, 10)
    sketch.tube(path, [0.012 - 0.004 * k / 10 for k in range(11)], stem_colour, sides=5)
    for k in range(leaves):
        at, d = _along(path, 0.25 + 0.3 * k)
        side = 1 if k % 2 == 0 else -1
        leaf(sketch, "lance", at, _turn(d, side * 48.0), Vector((0.0, -1.0, 0.3)), 0.26, 1.0, steps=10, fold=0.25,
             curl=0.15, tint=stem_colour)
    return sketch.fit(axes=(0, 2), margin=0.48)


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
    return sketch.fit(axes=(0, 2), margin=0.48)


def bud(rng, colours, stem_colour):
    """A poppy's closed bud nodding on its hooked, hairy stem, in the front view."""
    sketch = Sketch()
    top = Vector((0.12, 0.0, 0.3))
    sketch.sphere(top + Vector((0.04, 0.0, -0.1)), 0.11, colours["bud"], rings=6, segments=10, squash=1.45, shade=0.3)
    path = _bezier(Vector((0.0, 0.0, -0.5)), Vector((-0.05, 0.0, 0.45)), top, 12)
    sketch.tube(path, [0.012 - 0.004 * k / (len(path) - 1) for k in range(len(path))], stem_colour, sides=5)
    return sketch.fit(axes=(0, 2), margin=0.48)


def leaf_tuft(rng, kind, count=4, length=0.62, spread=70.0, tone=(0.7, 1.0), lobes=4.5, petiole=0.0, view="front"):
    """A tuft of basal leaves fanning up from the bottom of the cell (front view), or a few leaves lying open from
    the middle (top view, for the trefoil of wood sorrel)."""
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
        leaf(sketch, kind, base, d, Vector((0.0, -1.0, 0.25)), length * rng.uniform(0.8, 1.05), rng.uniform(*tone),
             steps=24, fold=0.22, curl=0.25, lobes=lobes, phase=rng.uniform(0.0, 0.5))
    return sketch.fit(axes=(0, 2), margin=0.48)


FLOWER_COLOURS = {
    "marigold": {"petal": "#f29a1d", "centre": "#b85a10"},
    "cornflower": {"petal": "#4f7fe0", "deep": "#3a4fb8", "centre": "#2a2a6e", "bract": "#6f8a5a"},
    "daisy": {"petal": "#f4f2ea", "centre": "#f0b81c"},
    "poppy": {"petal": "#d8261a", "blotch": "#1a1414", "centre": "#7a8a4a", "bud": "#6f8a4e"},
    "dandelion": {"petal": "#f6c520"},
    "blossom": {"petal": "#f6eef0", "blush": "#e7a9b8", "centre": "#e8d070"},
    "fruit": {"skin": "#b8321e", "cheek": "#d9b03a"},
    "stem": "#5a7a3a",
}


def colours(name):
    """The linear colours of a FLOWER_COLOURS entry."""
    entry = FLOWER_COLOURS[name]
    if isinstance(entry, str):
        return style.rgb(entry)
    return {key: style.rgb(value) for key, value in entry.items()}


def apple_overlay(rng, cluster_kwargs, what):
    """The blossom (spring) or fruit (late summer) of the apple cluster, framed exactly like the apple cell built
    from the same seed and arguments, its leaves cut out so only what shows in front of them is left; the site lays
    the overlay over the apple cards by the season."""
    sketch = cluster(rng, "apple", fit=False, **cluster_kwargs)
    frame = sketch.framing()
    for f in sketch.bm.faces:
        f.material_index = 1
    up = Vector((0.0, -1.0, 0.35))
    for path in sketch.twigs:
        for t in ((1.0, 0.82, 0.64, 0.46) if what == "blossom" else (0.78, 0.5)):
            at, d = _along(path, t)
            if what == "blossom":
                c = colours("blossom")
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
            else:
                c = colours("fruit")
                hang = at + Vector((rng.uniform(-0.02, 0.02), -0.05, -0.06))
                sketch.tube([at, hang], [0.003, 0.002], (0.25, 0.18, 0.1), sides=3)
                blush = rng.uniform(0.3, 0.8)
                skin = tuple(a * blush + b * (1 - blush) for a, b in zip(c["skin"], c["cheek"]))
                sketch.sphere(hang + Vector((0.0, 0.0, -0.035)), 0.04, skin, rings=7, segments=12, squash=0.92, shade=0.4)
    return sketch.fit(matrix=frame)
