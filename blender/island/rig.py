"""Preview rig from DESIGN.md section 3: a warm key sun behind the asset, a cool fill sun in front, a navy world
and a camera framed on the asset's vertices. Also exports the draco GLB, re-imports it as a check and composes
contact sheets."""

import contextlib
import json
import math
import os
import struct

import bmesh
import bpy
from mathutils import Matrix, Vector

from island import mesh, style

RIG_COLLECTION = "preview_rig"
RESOLUTION = (960, 720)
CAMERA_VIEW = (35.0, 22.0)
KEY_SUN = {"azimuth": 180.0, "elevation": 30.0, "color": (1.0, 0.85, 0.7), "strength": 3.0}
FILL_SUN = {"azimuth": 0.0, "elevation": 30.0, "color": (0.6, 0.8, 1.0), "strength": 0.6}
WORLD_COLOR = (0.02, 0.03, 0.06)
WORLD_STRENGTH = 0.3
EXPOSURE = 0.2
DAY_SUN = {"azimuth": 45.0, "elevation": 45.0, "color": (1.0, 1.0, 1.0), "strength": 4.0}
DAY_SKY, DAY_SKY_STRENGTH, DAY_EXPOSURE = (1.0, 1.0, 1.0), 0.9, 0.0
SILHOUETTE_SIZE = (320, 240)
SILHOUETTE_VIEW = (35.0, 30.0)
SKY = (0.82, 0.86, 0.9)
FRAME_MARGIN = 1.15
SUN_ANGLE_DEG = 2.0
TILE_SIZE = (4.0, 3.0)


def view_direction(azimuth_deg, elevation_deg):
    """Unit vector from the asset towards a viewer or a light. Azimuth 0 faces the asset's front (-Y) and turns
    towards +X, the same convention as three.js spherical coordinates after the glTF Y-up conversion."""
    az, el = math.radians(azimuth_deg), math.radians(elevation_deg)
    return Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))


def _facing(azimuth_deg, elevation_deg):
    # Cameras look and suns shine along their local -Z, so local +Z points back along the view direction.
    return view_direction(azimuth_deg, elevation_deg).to_track_quat("Z", "Y").to_euler()


def _linked(coll, name, data):
    ob = bpy.data.objects.get(name) or bpy.data.objects.new(name, data)
    if ob.name not in coll.objects:
        coll.objects.link(ob)
    return ob


def _sun(coll, name, azimuth, elevation, color, strength):
    light = bpy.data.lights.get(name) or bpy.data.lights.new(name, "SUN")
    light.color = color
    light.energy = strength
    light.angle = math.radians(SUN_ANGLE_DEG)
    _linked(coll, name, light).rotation_euler = _facing(azimuth, elevation)


def _camera(coll):
    cam = bpy.data.cameras.get("rig_camera") or bpy.data.cameras.new("rig_camera")
    cam.lens = 50
    cam.clip_end = 2000
    return _linked(coll, "rig_camera", cam)


def _world(scene):
    world = bpy.data.worlds.get("rig_world") or bpy.data.worlds.new("rig_world")
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (*WORLD_COLOR, 1.0)
    background.inputs["Strength"].default_value = WORLD_STRENGTH
    scene.world = world


def setup():
    """Create or refresh the rig in the current scene and set the EEVEE preview render settings."""
    scene = bpy.context.scene
    coll = mesh.collection(RIG_COLLECTION)
    _sun(coll, "rig_key_sun", **KEY_SUN)
    _sun(coll, "rig_fill_sun", **FILL_SUN)
    scene.camera = _camera(coll)
    _world(scene)
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = RESOLUTION
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = EXPOSURE
    return scene.camera


def frame_camera(ob, view=CAMERA_VIEW):
    """Turn the camera to the preview view and move it so the asset's vertices fill the frame with a margin."""
    cam = bpy.context.scene.camera
    cam.rotation_euler = _facing(*view)
    bpy.context.view_layer.update()
    points = [ob.matrix_world @ v.co for v in ob.data.vertices]
    lo, hi = mesh.bounds([ob])
    centre = (lo + hi) * 0.5
    coords = [c for p in points for c in centre + (p - centre) * FRAME_MARGIN]
    cam.location, _ = cam.camera_fit_coords(bpy.context.evaluated_depsgraph_get(), coords)


def render_preview(ob, path, view=CAMERA_VIEW):
    """Render only this asset (plus the rig) to a PNG; other objects are hidden from the render meanwhile."""
    keep = {ob.name, *(o.name for o in mesh.collection(RIG_COLLECTION).objects)}
    hidden = {o.name: o.hide_render for o in bpy.context.scene.objects}
    for o in bpy.context.scene.objects:
        o.hide_render = o.name not in keep
    frame_camera(ob, view)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    for name, state in hidden.items():
        bpy.data.objects[name].hide_render = state
    return path


@contextlib.contextmanager
def daylight():
    """Neutral daylight for judging materials and colours: a white sun at 45 degrees from the camera's side, a white
    sky, no fill tint and no exposure offset. The night rig comes back afterwards."""
    scene = bpy.context.scene
    key, fill = bpy.data.objects["rig_key_sun"], bpy.data.objects["rig_fill_sun"]
    background = scene.world.node_tree.nodes["Background"]
    saved = (key.rotation_euler.copy(), tuple(key.data.color), key.data.energy, fill.data.energy,
             tuple(background.inputs["Color"].default_value), background.inputs["Strength"].default_value,
             scene.view_settings.exposure)
    key.rotation_euler = _facing(DAY_SUN["azimuth"], DAY_SUN["elevation"])
    key.data.color, key.data.energy, fill.data.energy = DAY_SUN["color"], DAY_SUN["strength"], 0.0
    background.inputs["Color"].default_value = (*DAY_SKY, 1.0)
    background.inputs["Strength"].default_value = DAY_SKY_STRENGTH
    scene.view_settings.exposure = DAY_EXPOSURE
    try:
        yield
    finally:
        key.rotation_euler, key.data.color, key.data.energy, fill.data.energy = saved[:4]
        background.inputs["Color"].default_value = saved[4]
        background.inputs["Strength"].default_value = saved[5]
        scene.view_settings.exposure = saved[6]


def render_silhouette(ob, path, view=SILHOUETTE_VIEW):
    """The silhouette check of DESIGN.md section 10: the asset as a flat black shape against a pale sky, small, from
    the overview angle, so it has to read from its outline alone."""
    scene, layer = bpy.context.scene, bpy.context.view_layer
    background = scene.world.node_tree.nodes["Background"]
    saved = (scene.render.resolution_x, scene.render.resolution_y, scene.view_settings.view_transform,
             scene.view_settings.exposure, tuple(background.inputs["Color"].default_value),
             background.inputs["Strength"].default_value)
    scene.render.resolution_x, scene.render.resolution_y = SILHOUETTE_SIZE
    scene.view_settings.view_transform, scene.view_settings.exposure = "Standard", 0.0
    background.inputs["Color"].default_value = (*SKY, 1.0)
    background.inputs["Strength"].default_value = 1.0
    with _black(ob):
        render_preview(ob, path, view)
    (scene.render.resolution_x, scene.render.resolution_y, scene.view_settings.view_transform,
     scene.view_settings.exposure) = saved[:4]
    background.inputs["Color"].default_value = saved[4]
    background.inputs["Strength"].default_value = saved[5]
    return path


def _textured(ob):
    """Whether an asset draws from an atlas, as the plants of DESIGN.md section 13b do."""
    return any(m and m.node_tree and any(n.type == "TEX_IMAGE" for n in m.node_tree.nodes) for m in ob.data.materials)


@contextlib.contextmanager
def _black(ob):
    """Draw an asset flat black: a black emission override for plain materials, or, when a material cuts its shape
    out of an atlas, black copies of its materials that keep that cut-out, so leaves read as leaves and not cards."""
    materials = list(ob.data.materials)
    if not _textured(ob):
        black = _emission_material("silhouette_black", color=(0.0, 0.0, 0.0, 1.0))
        bpy.context.view_layer.material_override = black
        try:
            yield
        finally:
            bpy.context.view_layer.material_override = None
            bpy.data.materials.remove(black)
        return
    copies = []
    for i, m in enumerate(materials):
        copy = m.copy()
        bsdf = copy.node_tree.nodes["Principled BSDF"]
        for link in list(bsdf.inputs["Base Color"].links):
            copy.node_tree.links.remove(link)
        bsdf.inputs["Base Color"].default_value = (0.0, 0.0, 0.0, 1.0)
        bsdf.inputs["Specular IOR Level"].default_value = 0.0
        bsdf.inputs["Roughness"].default_value = 1.0
        ob.data.materials[i] = copy
        copies.append(copy)
    try:
        yield
    finally:
        for i, m in enumerate(materials):
            ob.data.materials[i] = m
        for copy in copies:
            bpy.data.materials.remove(copy)


def export_glb(ob, path):
    """Export the asset alone as a draco GLB with its pivot at the file origin; returns the file size in bytes."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    placed = ob.matrix_world.copy()
    ob.matrix_world = Matrix.Identity(4)
    mesh.select([ob])
    # A textured plant ships without its atlas, which lies beside the GLBs for the site to bind by material name,
    # and carries its corner colour Col as COLOR_0 and its wind channel as COLOR_1. Every other asset keeps the
    # exporter's material-driven colours, so its files stay as they were.
    plant = {"export_image_format": "NONE", "export_vertex_color": "NAME", "export_vertex_color_name": style.COLOR_ATTRIBUTE,
             "export_all_vertex_colors": True} if _textured(ob) else {}
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_apply=True, export_yup=True,
                              use_selection=True, export_draco_mesh_compression_enable=True,
                              export_draco_mesh_compression_level=6, export_materials="EXPORT",
                              export_normals=True, use_active_scene=True, **plant)
    ob.matrix_world = placed
    return os.path.getsize(path)


def reimport_check(path):
    """Load the GLB into a throwaway collection and measure what came back, proving the file decodes: its size, its
    lowest point, its triangles, how many mesh objects and materials it holds and their names, its primitives,
    whether it carries vertex colours, the share of its top surfaces that face the sky and the hue range of its
    greens. Leaves no trace."""
    materials = set(bpy.data.materials)
    scenes = set(bpy.data.scenes)
    before = set(bpy.data.objects)
    coll = bpy.data.collections.new("glb_check")
    bpy.context.scene.collection.children.link(coll)
    layer = bpy.context.view_layer
    previous = layer.active_layer_collection
    layer.active_layer_collection = layer.layer_collection.children[coll.name]
    bpy.ops.import_scene.gltf(filepath=path)
    layer.active_layer_collection = previous
    layer.update()
    # The importer lands in the active collection headless, but not always under the MCP bridge, so the check reads
    # whatever the import created.
    objs = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in objs if o.type == "MESH"]
    lo, hi = mesh.bounds(meshes)
    tris = sum(len(p.vertices) - 2 for o in meshes for p in o.data.polygons)
    slots = len({m for o in meshes for m in o.data.materials})
    vertex_colors = all(len(o.data.color_attributes) > 0 for o in meshes)
    sky, greens = mesh.sky_facing(meshes), mesh.greens(meshes)
    names, primitives = glb_materials(path)
    for o in objs:
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if isinstance(data, bpy.types.Mesh) and data.users == 0:
            bpy.data.meshes.remove(data)
    for m in set(bpy.data.materials) - materials:
        bpy.data.materials.remove(m)
    bpy.data.batch_remove(set(bpy.data.scenes) - scenes)
    bpy.data.collections.remove(coll)
    return {"size": [round(v, 3) for v in hi - lo], "min_z": round(lo.z, 3), "tris": tris, "meshes": len(meshes),
            "materials": slots, "material_names": names, "primitives": primitives, "vertex_colors": vertex_colors,
            "sky_facing": sky, "greens": greens}


def glb_document(path):
    """A GLB's JSON chunk, as the site's loader reads it."""
    with open(path, "rb") as f:
        data = f.read()
    length = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20:20 + length])


def glb_materials(path):
    """The material names a GLB holds and how many primitives, one draw call each, its meshes have."""
    doc = glb_document(path)
    return [m.get("name") for m in doc.get("materials", [])], sum(len(m["primitives"]) for m in doc.get("meshes", []))


def glb_surface(path):
    """How a GLB's materials draw (alpha mode, both sides) and which vertex streams its primitives carry, so a
    textured plant can be checked for its cut-out, its UVs, its corner colour and its wind channel."""
    doc = glb_document(path)
    return {"alpha": sorted({m.get("alphaMode", "OPAQUE") for m in doc.get("materials", [])}),
            "double_sided": all(m.get("doubleSided", False) for m in doc.get("materials", [])),
            "streams": sorted({name for m in doc.get("meshes", []) for p in m["primitives"] for name in p["attributes"]})}


def _emission_material(name, color=None, image=None):
    mat = bpy.data.materials.new(name)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.remove(nodes["Principled BSDF"])
    emission = nodes.new("ShaderNodeEmission")
    links.new(emission.outputs["Emission"], nodes["Material Output"].inputs["Surface"])
    if image is None:
        emission.inputs["Color"].default_value = color
    else:
        texture = nodes.new("ShaderNodeTexImage")
        texture.image = image
        links.new(texture.outputs["Color"], emission.inputs["Color"])
    return mat


def _image_plane(scene, name, image, x0, y0):
    w, h = TILE_SIZE
    bm = bmesh.new()
    face = bm.faces.new([bm.verts.new((x0 + u * w, y0 + v * h, 0.0)) for u, v in ((0, 0), (1, 0), (1, 1), (0, 1))])
    uv = bm.loops.layers.uv.new("UVMap")
    for loop in face.loops:
        loop[uv].uv = ((loop.vert.co.x - x0) / w, (loop.vert.co.y - y0) / h)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(_emission_material(name, image=image))
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


def _label(scene, text, x, y, material):
    curve = bpy.data.curves.new("label_" + text, "FONT")
    curve.body = text
    curve.size = 0.16
    curve.materials.append(material)
    ob = bpy.data.objects.new("label_" + text, curve)
    ob.location = (x, y, 0.01)
    scene.collection.objects.link(ob)
    return ob


def contact_sheet(entries, path, columns=None, tile=RESOLUTION):
    """Lay (label, png) previews out as image planes in a temporary scene and render them as one sheet, in about as
    many columns as rows unless told otherwise, each tile `tile` pixels."""
    columns = columns or math.ceil(math.sqrt(len(entries)))
    rows = math.ceil(len(entries) / columns)
    w, h = TILE_SIZE
    scene = bpy.data.scenes.new("contact_sheet")
    white = _emission_material("label_white", color=(1.0, 1.0, 1.0, 1.0))
    black = _emission_material("label_black", color=(0.0, 0.0, 0.0, 1.0))
    images = []
    for i, (label, png) in enumerate(entries):
        x0, y0 = (i % columns) * w, (rows - 1 - i // columns) * h
        images.append(bpy.data.images.load(png))
        _image_plane(scene, "tile_" + label, images[-1], x0, y0)
        _label(scene, label, x0 + 0.12, y0 + h - 0.3, white if tile == RESOLUTION else black)
    cam = bpy.data.objects.new("sheet_camera", bpy.data.cameras.new("sheet_camera"))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = columns * w
    cam.location = (columns * w * 0.5, rows * h * 0.5, 10.0)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.world = _sheet_world(images[0])
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = columns * tile[0]
    scene.render.resolution_y = rows * tile[1]
    scene.render.filter_size = 0.0
    scene.eevee.taa_render_samples = 1
    scene.view_settings.view_transform = "Standard"
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True, scene=scene.name)
    for ob in list(scene.collection.objects):
        data = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        if isinstance(data, bpy.types.Mesh):
            bpy.data.meshes.remove(data)
        elif isinstance(data, bpy.types.Curve):
            bpy.data.curves.remove(data)
        elif isinstance(data, bpy.types.Camera):
            bpy.data.cameras.remove(data)
    for m in [m for m in bpy.data.materials if m.users == 0 and (m.name.startswith("tile_") or m.name.startswith("label_"))]:
        bpy.data.materials.remove(m)
    for img in images:
        bpy.data.images.remove(img)
    bpy.data.worlds.remove(scene.world)
    bpy.data.scenes.remove(scene)
    return path


def _sheet_world(image):
    """A world in the colour of an image's top-left pixel, so empty cells of a sheet match the ground its tiles were
    rendered on."""
    width, height = image.size
    i = (height - 1) * width * 4
    pixel = image.pixels[i:i + 3]
    world = bpy.data.worlds.new("sheet_world")
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (
        *style.rgb("#%02x%02x%02x" % tuple(round(255 * c) for c in pixel)), 1.0)
    return world
