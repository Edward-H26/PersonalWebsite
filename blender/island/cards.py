"""One vegetation asset under construction (DESIGN.md section 13b). Wood is built as tubes whose bark repeats inside
its atlas cell, foliage, blades and petals as cards that each show one atlas cell, and every corner carries the
colour Col, the wind channel Wind (R: how far it sways, G: its phase, B: 1 on cards and 0 on wood) and an anchor, the
point its card's shading turns away from. finish() stretches the plan to the scanned original's proportions, leans
the plant in the sea wind, writes one mesh under the family's one material and turns each card's normals out from
its anchor, so a canopy shades as one volume instead of a stack of flat cards."""

import math

import bmesh
import bpy
from mathutils import Vector

from island import atlas, flora, mesh, style

_ANCHOR = "anchor"
_CARD = "card"
# How far a card's normals lean from its face toward the direction out of its anchor.
NORMAL_BLEND = 0.72


def frames(path):
    """A (side, normal) pair per point of a polyline, carried along it without twisting."""
    result = []
    tangent = (path[min(1, len(path) - 1)] - path[0]).normalized()
    side = tangent.orthogonal().normalized()
    for i in range(len(path)):
        span = path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]
        if span.length > 1e-9:
            tangent = span.normalized()
            side = (side - tangent * side.dot(tangent)).normalized()
        result.append((side, tangent.cross(side).normalized()))
    return result


class Plant:
    """A bmesh with the layers above, filled by tube() and card() and turned into one object by finish()."""

    def __init__(self, family):
        self.family = family
        # Cards draw from the family's card atlas, tubes and discs from its wood atlas (bark, for the foliage family).
        _, self.card_atlas, self.wood_atlas = atlas.FAMILIES[family]
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new(atlas.UV_MAP)
        self.col = self.bm.loops.layers.float_color.new(style.COLOR_ATTRIBUTE)
        self.wind = self.bm.loops.layers.float_color.new(style.WIND_ATTRIBUTE)
        self.anchor = self.bm.loops.layers.float_vector.new(_ANCHOR)
        self.kind = self.bm.faces.layers.int.new(_CARD)

    def face(self, verts, uvs, colours, winds, anchor=None):
        face = self.bm.faces.new(verts)
        for loop, uv, colour, wind in zip(face.loops, uvs, colours, winds):
            loop[self.uv].uv = uv
            loop[self.col] = (*colour, 1.0)
            loop[self.wind] = (*wind, 1.0)
            if anchor is not None:
                loop[self.anchor] = anchor
        face[self.kind] = anchor is not None
        face.smooth = True
        return face

    def tube(self, path, radii, cell, shade, sway, phase, sides=8, tile=1.0, sectors=1, twist=0.0, shape=None):
        """Wood along a polyline, `radii` per point, rings of `sides` corners turned by `twist` radians per metre for
        the slight spiral of bark; shape(s, angle) scales the radius at arc length s and angle (root flare). The bark
        cell repeats `sectors` times round the tube and once every `tile` metres along it, with a ring at every repeat
        so no quad straddles the cell's edge. shade(point, outward) gives a corner's colour, sway(point) its weight."""
        lengths = [0.0]
        for a, b in zip(path, path[1:]):
            lengths.append(lengths[-1] + (b - a).length)
        stations = []
        for i in range(len(path)):
            stations.append((lengths[i], path[i], radii[i]))
            if i + 1 < len(path):
                k = math.floor(lengths[i] / tile + 1e-6) + 1
                while k * tile < lengths[i + 1] - 1e-4:
                    f = (k * tile - lengths[i]) / (lengths[i + 1] - lengths[i])
                    stations.append((k * tile, path[i].lerp(path[i + 1], f), radii[i] + (radii[i + 1] - radii[i]) * f))
                    k += 1
        points = [p for _, p, _ in stations]
        rings = []
        for (s, p, r), (side, normal) in zip(stations, frames(points)):
            ring = []
            for k in range(sides):
                angle = 2 * math.pi * k / sides + twist * s
                out = side * math.cos(angle) + normal * math.sin(angle)
                ring.append((self.bm.verts.new(p + out * r * (shape(s, angle) if shape else 1.0)), out))
            rings.append(ring)
        u0, v0, u1, v1 = atlas.cell_rect(self.wood_atlas, cell)
        per = sides // sectors
        for j in range(len(rings) - 1):
            s0, s1 = stations[j][0], stations[j + 1][0]
            v_low = s0 / tile - math.floor(s0 / tile + 1e-6)
            v_high = min(1.0, v_low + (s1 - s0) / tile)
            for k in range(sides):
                k2 = (k + 1) % sides
                ua, ub = (k % per) / per, (k % per + 1) / per
                corners = [rings[j][k], rings[j][k2], rings[j + 1][k2], rings[j + 1][k]]
                uvs = [(u0 + (u1 - u0) * u, v0 + (v1 - v0) * v) for u, v in ((ua, v_low), (ub, v_low), (ub, v_high), (ua, v_high))]
                self.face([c[0] for c in corners], uvs, [shade(c[0].co, c[1]) for c in corners],
                           [(sway(c[0].co), phase, 0.0) for c in corners])

    def disc(self, centre, normal, radius, cell, shade, sides=12):
        """A flat end cap showing a whole cell (the sawn face of a stump), facing `normal`."""
        normal = normal.normalized()
        side = normal.orthogonal().normalized()
        other = normal.cross(side)
        u0, v0, u1, v1 = atlas.cell_rect(self.wood_atlas, cell)
        hub = (u0 + u1) * 0.5, (v0 + v1) * 0.5
        rim = [(centre + (side * math.cos(a) + other * math.sin(a)) * radius, math.cos(a), math.sin(a))
               for a in (2 * math.pi * k / sides for k in range(sides))]
        middle = self.bm.verts.new(centre)
        verts = [self.bm.verts.new(p) for p, _, _ in rim]
        for k in range(sides):
            k2 = (k + 1) % sides
            uvs = [hub] + [(hub[0] + (u1 - u0) * 0.5 * rim[i][1], hub[1] + (v1 - v0) * 0.5 * rim[i][2]) for i in (k, k2)]
            self.face([middle, verts[k], verts[k2]], uvs, [shade(centre, normal)] * 3, [(0.0, 0.0, 0.0)] * 3)

    def card(self, centre, normal, up, width, height, cell, colours, sway, phase, anchor, fold=0.0, pivot=0.5,
             bend=0.0, rows=1, flip=False):
        """A card showing one cell, `width` x `height` metres facing `normal` with the image upright along `up`;
        `pivot` is where `centre` sits on its height (0.5 the middle, 0 the bottom edge for blades and stems). fold
        swings both halves back that many radians about the vertical midline so the card keeps some body edge-on;
        bend curls it toward `normal` by that share of its height at the top. colours and sway are (bottom, top). A
        card is turned to face away from its anchor, so its front is always the side seen from outside; flip mirrors
        the image."""
        normal = normal.normalized()
        if normal.dot(centre - anchor) < 0.0:
            normal = -normal
        up = (up - normal * up.dot(normal))
        if up.length < 1e-6:
            up = normal.orthogonal()
        up.normalize()
        right = up.cross(normal)
        u0, v0, u1, v1 = atlas.cell_rect(self.card_atlas, cell)
        if flip:
            u0, u1 = u1, u0
        grid = []
        for r in range(rows + 1):
            t = r / rows
            base = centre + up * (height * (t - pivot)) + normal * (bend * height * t * t)
            row = []
            for c in (-1, 0, 1):
                x = c * width * 0.5
                p = base + right * (x * math.cos(fold)) - normal * (abs(x) * math.sin(fold))
                row.append((self.bm.verts.new(p), (u0 + (u1 - u0) * (c + 1) * 0.5, v0 + (v1 - v0) * t), t))
            grid.append(row)
        (c_low, c_high), (w_low, w_high) = colours, sway
        for r in range(rows):
            for c in range(2):
                corners = [grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]]
                self.face([v for v, _, _ in corners], [uv for _, uv, _ in corners],
                           [tuple(a + (b - a) * t for a, b in zip(c_low, c_high)) for _, _, t in corners],
                           [(w_low + (w_high - w_low) * t, phase, 1.0) for _, _, t in corners], anchor)

    def _transform(self, fn):
        """Move every vertex and every anchor by fn(point) -> point."""
        for v in self.bm.verts:
            v.co = fn(v.co)
        seen = {}
        for face in self.bm.faces:
            if face[self.kind]:
                for loop in face.loops:
                    key = tuple(loop[self.anchor])
                    if key not in seen:
                        seen[key] = fn(Vector(key))
                    loop[self.anchor] = seen[key]

    def finish(self, name, plan=None, exposure=None, bend=flora.TOP_BEND, height=None):
        """Write the plant as one object named `name` under the family material, pivot at its bottom centre: scaled
        evenly to `height` metres when given, its plan stretched to the original's (X, Y, Z) proportions when `plan` is
        given, then leant landward and its top bent by the wind at `exposure` (recorded as the object's
        "upright_size" before the lean), then its card normals turned out from their anchors."""
        bm = self.bm
        if height:
            top = max(v.co.z for v in bm.verts)
            self._transform(lambda p: p * (height / top))
        if plan:
            lo = Vector([min(v.co[i] for v in bm.verts) for i in range(3)])
            hi = Vector([max(v.co[i] for v in bm.verts) for i in range(3)])
            w, d, h = hi - lo
            sx, sy = (plan[0] / plan[2]) * h / w, (plan[1] / plan[2]) * h / d
            cx, cy = (lo.x + hi.x) * 0.5, (lo.y + hi.y) * 0.5
            self._transform(lambda p: Vector((cx + (p.x - cx) * sx, cy + (p.y - cy) * sy, p.z)))
            self.stretch = (round(sx, 3), round(sy, 3))
        upright = None
        if exposure is not None:
            lo = Vector([min(v.co[i] for v in bm.verts) for i in range(3)])
            hi = Vector([max(v.co[i] for v in bm.verts) for i in range(3)])
            upright = [round(x, 3) for x in hi - lo]
            height = hi.z
            tilt = math.tan(math.radians(max(0.0, flora.lean_degrees(exposure))))
            self._transform(lambda p: p + flora.LANDWARD * height * ((max(0.0, p.z) / height) * tilt
                                                                     + bend * exposure * (max(0.0, p.z) / height) ** 3))
        me = bpy.data.meshes.new(name)
        bm.normal_update()
        bm.to_mesh(me)
        bm.free()
        me.materials.append(bpy.data.materials.get(atlas.MATERIALS[self.family]) or atlas.family_material(self.family))
        _card_normals(me)
        me.color_attributes.active_color = me.color_attributes[style.COLOR_ATTRIBUTE]
        ob = mesh.link(bpy.data.objects.new(name, me))
        mesh.set_pivot(ob, ground=True)
        if upright:
            ob["upright_size"] = upright
        if plan:
            ob["plan_stretch"] = self.stretch
        return ob


def _card_normals(me):
    """Give card corners normals leaning from their face toward the direction out of their anchor, wood keeps its
    smooth normals; then drop the helper attributes so they do not reach the GLB."""
    anchors = me.attributes[_ANCHOR].data
    cards = me.attributes[_CARD].data
    normals = [tuple(n.vector) for n in me.corner_normals]
    for poly in me.polygons:
        if not cards[poly.index].value:
            continue
        for li in poly.loop_indices:
            out = me.vertices[me.loops[li].vertex_index].co - anchors[li].vector
            if out.length > 1e-6:
                n = poly.normal * (1.0 - NORMAL_BLEND) + out.normalized() * NORMAL_BLEND
                normals[li] = tuple(n.normalized())
    me.normals_split_custom_set(normals)
    me.attributes.remove(me.attributes[_ANCHOR])
    me.attributes.remove(me.attributes[_CARD])
