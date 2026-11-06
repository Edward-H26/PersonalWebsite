"""Impostors for the far woods (DESIGN.md sections 18.1 and 18.3): one plant per impostor set (a tree species at an
age, its coastal form, a shrub) photographed level from VIEWS bearings round it in an orthographic studio, as albedo
with alpha and as normals in the view's own frame, and packed into one colour page and one normal page beside the
GLBs. Every variant of a set shares its views; the site swaps a plant for its set's impostor beyond SWITCH_METRES,
scales it to the variant's size, shows the view nearest the camera's bearing and lights it with the normals, so the
far woods keep their colour, their silhouettes and their light. atlases.json records each set's cells and the metres
a cell spans, and each variant's set and size.

A view is the plant seen from bearing 360 / VIEWS * k, counted anticlockwise seen from above from its front (Blender
-Y, the glTF +Z the GLBs face); its normals are encoded like a tangent-space normal map of a card facing the camera
(red to the right, green up, blue toward the viewer)."""

import math
import os

import bpy
import numpy as np

from island import atlas, studio

VIEWS = 8
CELL = 256
PAGE = 4096
SWITCH_METRES = 120.0
FILE, NORMAL_FILE = "impostors.png", "impostors_normal.png"
STUDIO = "impostor_studio"
OVERSAMPLE = 2
SAMPLES = 8
# The frame's margin round the plant, as a share of its largest extent.
MARGIN = 0.03


def _recording(material, what):
    """A copy of a plant family material that emits what an impostor records instead of shading: its albedo (the
    atlas times the corner colour, exactly as the material's Base Color receives it) or its shading normal turned
    into the camera's frame; the alpha cut stays, so leaves are leaves and not cards."""
    copy = material.copy()
    nodes, links = copy.node_tree.nodes, copy.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    out = next(n for n in nodes if n.type == "OUTPUT_MATERIAL")
    emit = nodes.new("ShaderNodeEmission")
    if what == "albedo":
        source = bsdf.inputs["Base Color"].links[0].from_socket if bsdf.inputs["Base Color"].links else None
        if source is not None:
            links.new(source, emit.inputs["Color"])
    else:
        geometry = nodes.new("ShaderNodeNewGeometry")
        normal = bsdf.inputs["Normal"].links[0].from_socket if bsdf.inputs["Normal"].links else geometry.outputs["Normal"]
        turn = nodes.new("ShaderNodeVectorTransform")
        turn.vector_type, turn.convert_from, turn.convert_to = "NORMAL", "WORLD", "CAMERA"
        links.new(normal, turn.inputs["Vector"])
        # The node's camera space has +Z looking into the scene, so flip Z to point blue at the viewer, then encode
        # in [0, 1].
        flip = nodes.new("ShaderNodeVectorMath")
        flip.operation = "MULTIPLY"
        flip.inputs[1].default_value = (0.5, 0.5, -0.5)
        links.new(turn.outputs["Vector"], flip.inputs[0])
        encode = nodes.new("ShaderNodeVectorMath")
        encode.operation = "ADD"
        encode.inputs[1].default_value = (0.5, 0.5, 0.5)
        links.new(flip.outputs["Vector"], encode.inputs[0])
        links.new(encode.outputs["Vector"], emit.inputs["Color"])
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    mix = nodes.new("ShaderNodeMixShader")
    alpha = bsdf.inputs["Alpha"].links[0].from_socket if bsdf.inputs["Alpha"].links else None
    if alpha is not None:
        links.new(alpha, mix.inputs["Fac"])
    else:
        mix.inputs["Fac"].default_value = 1.0
    links.new(transparent.outputs["BSDF"], mix.inputs[1])
    links.new(emit.outputs["Emission"], mix.inputs[2])
    links.new(mix.outputs["Shader"], out.inputs["Surface"])
    return copy


def _frame(ob):
    """The square a plant's views share, in metres: twice its reach from the trunk's axis or its height, whichever is
    larger, with the margin; the foot of the trunk sits at the middle of the cell's bottom edge. Measured in the
    plant's own frame, whose origin is the foot of its trunk."""
    reach = max(math.hypot(v.co.x, v.co.y) for v in ob.data.vertices)
    top = max(v.co.z for v in ob.data.vertices)
    return max(2.0 * reach, top) * (1.0 + 2.0 * MARGIN)


def photograph(ob, scratch):
    """Photograph one plant from VIEWS bearings in one render: VIEWS linked copies stand in a row, each turned so the
    camera, looking along +Y, sees it from its bearing. Returns lists of albedo and normal views (RGBA at CELL pixels)
    and the metres a cell spans."""
    scene = studio.scene(STUDIO, SAMPLES, bounces=0)
    span = _frame(ob)
    copies = []
    for k in range(VIEWS):
        copy = ob.copy()
        scene.collection.objects.link(copy)
        # Turning the plant clockwise by a bearing brings the side that faces that bearing round to the camera.
        copy.location = (k * span, 0.0, 0.0)
        copy.rotation_euler = (0.0, 0.0, -2.0 * math.pi * k / VIEWS)
        copies.append(copy)
    camera = scene.camera
    camera.data.ortho_scale = VIEWS * span
    camera.data.clip_start, camera.data.clip_end = 0.1, span * 6.0
    camera.location = ((VIEWS - 1) * span * 0.5, -span * 3.0, span * 0.5)
    camera.rotation_euler = (math.radians(90.0), 0.0, 0.0)
    scene.render.resolution_x, scene.render.resolution_y = VIEWS * CELL * OVERSAMPLE, CELL * OVERSAMPLE
    materials = ob.data.materials
    originals = list(materials)
    passes = {}
    for what in ("albedo", "normal"):
        recorded = [_recording(m, what) for m in originals]
        for i, m in enumerate(recorded):
            materials[i] = m
        path = os.path.join(scratch, "impostor_views.png")
        # Albedo goes out sRGB-encoded like every atlas; normals are data and go out as they are.
        scene.view_settings.view_transform = "Standard" if what == "albedo" else "Raw"
        studio.render(scene, path)
        row = atlas.downsample(atlas.read_png(path), OVERSAMPLE)
        passes[what] = [row[:, k * CELL:(k + 1) * CELL] for k in range(VIEWS)]
        for i, m in enumerate(originals):
            materials[i] = m
        for m in recorded:
            bpy.data.materials.remove(m)
    for copy in copies:
        bpy.data.objects.remove(copy, do_unlink=True)
    return passes["albedo"], passes["normal"], span


def build(plants, members, out_dir, scratch):
    """Photograph each set's plant ({set: (label, object)}) and pack the views into one colour page and one normal
    page, VIEWS cells per set in reading order; `members` maps each set to its variants' sizes in metres ({set:
    {label: [x, y, z]}}). Returns the manifest entry the site reads."""
    per_row = PAGE // CELL
    rows = math.ceil(len(plants) * VIEWS / per_row)
    if rows * CELL > PAGE:
        raise ValueError("%d impostor sets need %d px, more than one %d px page" % (len(plants), rows * CELL, PAGE))
    sheet = np.zeros((rows * CELL, PAGE, 4), dtype=np.float32)
    normals = np.zeros_like(sheet)
    entry = {"file": FILE, "normal": NORMAL_FILE, "size": [PAGE, rows * CELL], "views": VIEWS, "cell": CELL,
             "switch_metres": SWITCH_METRES, "first_view": "the model's front (glTF +Z)",
             "turn": "360 / views degrees anticlockwise seen from above",
             "foot": "the middle of each cell's bottom edge", "sets": {}, "variants": {}}
    height = rows * CELL
    for i, (name, (photographed, ob)) in enumerate(plants.items()):
        albedo, normal, span = photograph(ob, scratch)
        cells = []
        for k in range(VIEWS):
            n = i * VIEWS + k
            y, x = (n // per_row) * CELL, (n % per_row) * CELL
            sheet[y:y + CELL, x:x + CELL] = atlas.bleed(albedo[k])
            normals[y:y + CELL, x:x + CELL] = atlas.bleed(normal[k])
            cells.append([round(v, 6) for v in (x / PAGE, y / height, (x + CELL) / PAGE, (y + CELL) / height)])
        sizes = members[name]
        entry["sets"][name] = {"cells": cells, "cell_metres": round(span, 4), "photographed": photographed,
                               "size": sizes[photographed]}
        for label, size in sizes.items():
            entry["variants"][label] = {"set": name, "size": size}
    studio.close(STUDIO)
    atlas.write_png(os.path.join(out_dir, FILE), sheet)
    atlas.write_png(os.path.join(out_dir, NORMAL_FILE), normals)
    return entry
