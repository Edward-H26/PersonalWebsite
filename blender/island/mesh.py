"""Low-level mesh helpers: primitives built with bmesh, bevels, joining and origins."""

import colorsys
import contextlib
import math

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

from island import style

_collection = None
_keep_palette = False


def collection(name):
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    return coll


def use_collection(name, clear=False):
    """Every primitive created afterwards lands in this collection."""
    global _collection
    _collection = collection(name)
    if clear:
        for ob in list(_collection.objects):
            me = ob.data
            bpy.data.objects.remove(ob, do_unlink=True)
            if isinstance(me, bpy.types.Mesh) and me.users == 0:
                bpy.data.meshes.remove(me)
    return _collection


def link(ob):
    """Put an object made outside these helpers, such as a converted curve, into the current collection."""
    (_collection or bpy.context.scene.collection).objects.link(ob)
    return ob


def from_bmesh(name, bm, mat):
    """Turn a bmesh into a linked object; `mat` is one material or a list matching the faces' material indices."""
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    for m in mat if isinstance(mat, (list, tuple)) else [mat]:
        if m is not None:
            me.materials.append(m)
    return ob


def box(name, size, at=(0, 0, 0), rot=(0, 0, 0), mat=None, bevel=0.0, origin="center", segments=1):
    """A cuboid. origin="bottom" puts the pivot at the bottom-centre, "corner" at min x, min y, min z."""
    sx, sy, sz = size
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
        if origin == "bottom":
            v.co.z += sz * 0.5
        elif origin == "corner":
            v.co += Vector((sx * 0.5, sy * 0.5, sz * 0.5))
    ob = from_bmesh(name, bm, mat)
    ob.location = at
    ob.rotation_euler = rot
    if bevel > 0:
        add_bevel(ob, bevel, segments)
    return ob


def cylinder(name, radius, height, at=(0, 0, 0), rot=(0, 0, 0), mat=None, segments=16, radius_top=None,
             bevel=0.0, origin="bottom", cap=True):
    bm = bmesh.new()
    r2 = radius if radius_top is None else radius_top
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=segments, radius1=radius, radius2=r2, depth=height)
    if origin == "bottom":
        for v in bm.verts:
            v.co.z += height * 0.5
    ob = from_bmesh(name, bm, mat)
    ob.location = at
    ob.rotation_euler = rot
    if bevel > 0:
        add_bevel(ob, bevel, 1)
    return ob


def prism(name, width, height, depth, at=(0, 0, 0), rot=(0, 0, 0), mat=None):
    """A triangular prism: base `width` along X, apex `height` up, extruded `depth` along Y, origin at base centre."""
    bm = bmesh.new()
    hw, hd = width * 0.5, depth * 0.5
    tri = [(-hw, 0.0), (hw, 0.0), (0.0, height)]
    front = [bm.verts.new((x, -hd, z)) for x, z in tri]
    back = [bm.verts.new((x, hd, z)) for x, z in tri]
    bm.faces.new(front[::-1])
    bm.faces.new(back)
    for i in range(3):
        a, b = front[i], front[(i + 1) % 3]
        c, d = back[(i + 1) % 3], back[i]
        bm.faces.new((a, b, c, d))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = from_bmesh(name, bm, mat)
    ob.location = at
    ob.rotation_euler = rot
    return ob


def polygon(name, points, height, at=(0, 0, 0), rot=(0, 0, 0), mat=None, bevel=0.0):
    """A flat polygon (counter-clockwise XY points) extruded `height` up."""
    bm = bmesh.new()
    bottom = [bm.verts.new((x, y, 0.0)) for x, y in points]
    top = [bm.verts.new((x, y, height)) for x, y in points]
    bm.faces.new(bottom[::-1])
    bm.faces.new(top)
    n = len(points)
    for i in range(n):
        bm.faces.new((bottom[i], bottom[(i + 1) % n], top[(i + 1) % n], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = from_bmesh(name, bm, mat)
    ob.location = at
    ob.rotation_euler = rot
    if bevel > 0:
        add_bevel(ob, bevel, 1)
    return ob


def hexa(name, corners, mat=None, bevel=0.0):
    """A six-sided solid from eight corners: the first four trace one face, the last four the opposite face in the
    same order. Used for boards that follow a roof slope or a hull."""
    bm = bmesh.new()
    v = [bm.verts.new(c) for c in corners]
    for f in ((0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
        bm.faces.new([v[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = from_bmesh(name, bm, mat)
    if bevel > 0:
        add_bevel(ob, bevel, 1)
    return ob


def loft(name, sections, mat=None, close_ends=True, mirror_x=False, band_materials=None):
    """Skin a list of rings (each a list of (x, y, z) points, same length) into a tube; used for hulls.
    band_materials gives a material index per band between consecutive ring points."""
    bm = bmesh.new()
    rings = [[bm.verts.new(p) for p in ring] for ring in sections]
    n = len(sections[0])
    for a, b in zip(rings, rings[1:]):
        for i in range(n - 1):
            face = bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
            face.material_index = band_materials[i] if band_materials else 0
    if close_ends:
        bm.faces.new(rings[0][::-1])
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = from_bmesh(name, bm, mat)
    if mirror_x:
        mod = ob.modifiers.new("Mirror", "MIRROR")
        mod.use_axis[0] = True
        mod.use_clip = True
        mod.merge_threshold = 0.01
    return ob


def lathe(name, profile, segments=16, mat=None, band_materials=None, cap_bottom=True, cap_top=True,
          sharp_meridians=False):
    """Revolve (radius, z) points around Z. band_materials gives a material index per band between consecutive
    points; sharp_meridians keeps every segment flat across, which reads as barrel staves."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * k / segments), r * math.sin(2 * math.pi * k / segments), z))
                      for k in range(segments)])
    for band, (a, b) in enumerate(zip(rings, rings[1:])):
        for k in range(segments):
            f = bm.faces.new((a[k], a[(k + 1) % segments], b[(k + 1) % segments], b[k]))
            f.material_index = band_materials[band] if band_materials else 0
    if cap_bottom:
        bm.faces.new(rings[0][::-1]).material_index = band_materials[0] if band_materials else 0
    if cap_top:
        bm.faces.new(rings[-1]).material_index = band_materials[-1] if band_materials else 0
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if sharp_meridians:
        bm.edges.ensure_lookup_table()
        for e in bm.edges:
            a, b = e.verts
            if abs(a.co.z - b.co.z) > 1e-6:
                e.smooth = False
    return from_bmesh(name, bm, mat)


def aim(direction):
    """Rotation whose local Z points along `direction` while local X stays horizontal."""
    z = Vector(direction).normalized()
    x = Vector((0.0, 0.0, 1.0)).cross(z)
    if x.length < 1e-6:
        x = Vector((1.0, 0.0, 0.0))
    x.normalize()
    return Matrix((x, z.cross(x), z)).transposed().to_4x4()


def beam(name, a, b, width, height, mat=None, bevel=0.0):
    """A square timber from point a to point b; `width` is its horizontal side, `height` the other one."""
    a, b = Vector(a), Vector(b)
    ob = box(name, (width, height, (b - a).length), mat=mat, bevel=bevel)
    ob.matrix_world = Matrix.Translation((a + b) * 0.5) @ aim(b - a)
    return ob


def rod(name, a, b, radius, mat=None, segments=8, radius_b=None, cap=True):
    """A round bar from a to b, optionally tapering to radius_b: posts, spars, rigging, rails."""
    a, b = Vector(a), Vector(b)
    ob = cylinder(name, radius, (b - a).length, mat=mat, segments=segments, radius_top=radius_b, cap=cap)
    ob.matrix_world = Matrix.Translation(a) @ aim(b - a)
    return ob


def add_bevel(ob, width, segments=1, angle_deg=30):
    mod = ob.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(angle_deg)
    return mod


def add_array(ob, count, relative=(1.0, 0.0, 0.0), constant=None):
    mod = ob.modifiers.new("Array", "ARRAY")
    mod.count = max(1, int(count))
    mod.use_relative_offset = True
    mod.relative_offset_displace = relative
    if constant is not None:
        mod.use_constant_offset = True
        mod.constant_offset_displace = constant
    return mod


def transform(objs, matrix):
    """Move objects built in a local frame into place: world = matrix @ local. Uses matrix_basis because
    matrix_world only catches up with a new location or rotation after a depsgraph update."""
    for ob in objs:
        ob.matrix_basis = matrix @ ob.matrix_basis
    return objs


def frame(at=(0, 0, 0), yaw=0.0):
    return Matrix.Translation(Vector(at)) @ Matrix.Rotation(yaw, 4, "Z")


def select(objs, active=None):
    bpy.ops.object.select_all(action="DESELECT")
    for ob in objs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]


def smooth(objs, angle_deg=35):
    select(objs)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle_deg))


@contextlib.contextmanager
def palette_kept():
    """Within this block finalize still paints the corner colours the bake gives, but leaves every named palette
    material on its faces, so island.blend shows and edits the real colours; the GLB export never runs inside it."""
    global _keep_palette
    previous, _keep_palette = _keep_palette, True
    try:
        yield
    finally:
        _keep_palette = previous


def finalize(name, objs, smooth_angle=35, ground=True, vertex_colors=True, centre=True):
    """Apply modifiers, join every part into one object named `name`, pivot at the bottom centre. ground=False keeps
    the pivot at Z = 0 for assets that sit in water with part of their geometry below it; centre=False keeps it at the
    build's own origin, for landmarks the site sets down on a map anchor. The parts' palette colours are baked into
    corner colours under the one vertex-colour material, the lit glass and embers kept as materials of their own;
    vertex_colors=False keeps every palette material instead."""
    objs = [ob for ob in objs if ob.type == "MESH"]
    select(objs)
    bpy.ops.object.convert(target="MESH")
    select(objs)
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    # The join keeps the first part's transform; bake it so the pivot below is measured in world space.
    ob.data.transform(ob.matrix_basis)
    ob.matrix_basis = Matrix.Identity(4)
    if vertex_colors or _keep_palette:
        bake_vertex_colors(ob.data, keep_materials=_keep_palette)
    if smooth_angle:
        smooth([ob], smooth_angle)
    if centre:
        set_pivot(ob, ground)
    return ob


def set_pivot(ob, ground=True, around=None):
    """Put a placed object's origin at the bottom centre of its bounds, or of the bounds of the objects `around` it
    (parts exported on their own), or at Z = 0 with ground=False, without moving the mesh; the object's transform
    must be a plain translation."""
    bpy.context.view_layer.update()
    lo, hi = bounds(around or [ob])
    pivot = Vector(((lo.x + hi.x) * 0.5, (lo.y + hi.y) * 0.5, lo.z if ground else 0.0))
    ob.data.transform(Matrix.Translation(ob.matrix_world.translation - pivot))
    ob.matrix_world = Matrix.Translation(pivot)
    bpy.context.view_layer.update()
    return ob


def _own_slot(material):
    """Whether a material keeps a slot of its own through the bake: it is lit (emissive), or it is the pond's water."""
    if material.name == style.POND_WATER:
        return True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    return bsdf is not None and bsdf.inputs["Emission Strength"].default_value > 0.0


def bake_vertex_colors(me, ground_shade=0.78, jitter=0.14, keep_materials=False):
    """Bring a mesh's opaque surfaces under the one vertex-colour material, keeping lit (emissive) materials and the
    pond's water as slots of their own after it. Corners its parts were painted with keep their colour; every other
    opaque face takes its material's base colour, a little brighter or darker per face so flat colours do not go dull,
    and darker towards the bottom of the mesh as a cheap stand-in for ambient occlusion. Faces on their own slots get
    white corners, which their materials never read. keep_materials paints the corners the same way but leaves the
    palette materials in place."""
    colours = [tuple(m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value)[:3] for m in me.materials]
    lit = [m for m in dict.fromkeys(me.materials) if _own_slot(m)]
    slot = [1 + lit.index(m) if m in lit else 0 for m in me.materials]
    values = [0.0] * (4 * len(me.loops))
    attr = me.color_attributes.get(style.COLOR_ATTRIBUTE)
    if attr is None:
        attr = me.color_attributes.new(style.COLOR_ATTRIBUTE, "FLOAT_COLOR", "CORNER")
    else:
        attr.data.foreach_get("color", values)
    heights = [v.co.z for v in me.vertices]
    z0, span = min(heights), max(1e-6, max(heights) - min(heights))
    indices = []
    for poly in me.polygons:
        indices.append(slot[poly.material_index])
        r, g, b = colours[poly.material_index]
        face = 1.0 - jitter / 2 + jitter * ((poly.index * 2654435761) % 997) / 997
        for li in poly.loop_indices:
            # Parts painted before the join carry full alpha; the join leaves every other corner at zero.
            if values[4 * li + 3] > 0.5:
                continue
            if indices[-1]:
                values[4 * li:4 * li + 4] = (1.0, 1.0, 1.0, 1.0)
                continue
            shade = face * (ground_shade + (1.0 - ground_shade) * (heights[me.loops[li].vertex_index] - z0) / span)
            values[4 * li:4 * li + 4] = (r * shade, g * shade, b * shade, 1.0)
    attr.data.foreach_set("color", values)
    me.color_attributes.active_color = attr
    if keep_materials:
        return
    me.materials.clear()
    for m in [style.vertex_colour_material()] + lit:
        me.materials.append(m)
    me.polygons.foreach_set("material_index", indices)


def fit_plan(ob, original):
    """Stretch an object in plan so its width:height and depth:height equal the original's (X, Y, Z) size, about
    its own origin; the height is left alone."""
    bpy.context.view_layer.update()
    lo, hi = bounds([ob])
    w, d, h = hi - lo
    ow, od, oh = original
    ob.data.transform(Matrix.Diagonal(((ow / oh) * h / w, (od / oh) * h / d, 1.0, 1.0)))
    bpy.context.view_layer.update()
    return ob


def bounds(objs):
    lo = Vector((math.inf,) * 3)
    hi = Vector((-math.inf,) * 3)
    for ob in objs:
        for corner in ob.bound_box:
            w = ob.matrix_world @ Vector(corner)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def sky_facing(objs, samples=48):
    """The share of straight-down rays, on a grid over the objects' plan, whose first visible surface is turned up to
    the sky: 1.0 when every top surface has clean upward normals, so the site's snow can settle on it. A ray passes
    through the back of a face whose material culls back faces, as the renderer would."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    down = Vector((0.0, 0.0, -1.0))
    casts = []
    for ob in objs:
        bm = bmesh.new()
        bm.from_object(ob, depsgraph)
        bm.transform(ob.matrix_world)
        culled = [ob.data.materials[f.material_index].use_backface_culling if ob.data.materials else False for f in bm.faces]
        casts.append((BVHTree.FromBMesh(bm), culled))
        bm.free()

    def first_visible(tree, culled, origin):
        hit = tree.ray_cast(origin, down)
        while hit[0] is not None and hit[1].z <= 0.0 and culled[hit[2]]:
            hit = tree.ray_cast(hit[0] + down * 1e-4, down)
        return hit

    lo, hi = bounds(objs)
    hits = up = 0
    for i in range(samples):
        for j in range(samples):
            origin = Vector((lo.x + (hi.x - lo.x) * (i + 0.5) / samples, lo.y + (hi.y - lo.y) * (j + 0.5) / samples,
                             hi.z + 1.0))
            found = [first_visible(tree, culled, origin) for tree, culled in casts]
            nearest = min((hit for hit in found if hit[0] is not None), key=lambda hit: (hit[0] - origin).length, default=None)
            if nearest:
                hits += 1
                up += nearest[1].z > 0.0
    return round(up / hits, 3) if hits else None


def greens(objs):
    """The season-tint record of DESIGN.md section 13: the hue range in degrees of the corner colours that fall in
    the green window style.GREEN_HUE, and their share of all corners."""
    hues, total = [], 0
    for ob in objs:
        attr = ob.data.color_attributes.active_color or next(iter(ob.data.color_attributes), None)
        if attr is None:
            continue
        values = [0.0] * (4 * len(attr.data))
        attr.data.foreach_get("color", values)
        total += len(attr.data)
        hues += [360.0 * colorsys.rgb_to_hsv(*values[i:i + 3])[0] for i in range(0, len(values), 4)
                 if style.is_green(values[i:i + 3])]
    return {"hue": [round(min(hues), 1), round(max(hues), 1)] if hues else None,
            "share": round(len(hues) / total, 3) if total else 0.0, "window": list(style.GREEN_HUE)}


def stats(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = ob.evaluated_get(dg).to_mesh()
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    ob.evaluated_get(dg).to_mesh_clear()
    lo, hi = bounds([ob])
    dim = hi - lo
    return {"tris": tris, "size": [round(dim.x, 3), round(dim.y, 3), round(dim.z, 3)], "materials": len(ob.data.materials)}
