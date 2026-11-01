"""The vegetation atlases of DESIGN.md section 13b, rendered in Blender: a small studio scene (orthographic camera,
a sun from above, soft white sky, transparent film) photographs sprite geometry from sprites.py, the textures come
from textures.py, and the cells are composed into one RGBA atlas per family with their colour bled into the
transparent pixels so mipmaps do not fringe. Each family has one material: the atlas times the corner colour "Col",
cut out where the atlas alpha falls under ALPHA_CUTOFF and drawn from both sides. The GLBs carry no images; the site
binds each family's atlas by material name (MATERIALS)."""

import json
import math
import os
import random

import bpy
import numpy as np

from island import sprites, style, textures

ALPHA_CUTOFF = 0.5
STUDIO = "atlas_studio"
OVERSAMPLE = 2
CYCLES_SAMPLES = 24
BLEED_STEPS = 24
SKY = 0.42
SUN = {"energy": 3.4, "angle_deg": 12.0, "tilt_deg": 24.0}

# Family -> (material name, atlas file, pixel size (w, h), cell size (w, h), cell names row by row from the top).
FAMILIES = {
    "foliage": ("isl_foliage", "foliage.png", (1024, 1024), (256, 256),
                (("oak_a", "oak_b", "ash", "birch"),
                 ("apple", "hawthorn", "box", "spruce"),
                 ("bark_oak", "bark_birch", "bark_spruce", "bark_apple"),
                 ("end_grain", "cypress", "apple_blossom", "apple_fruit"))),
    "grass": ("isl_grass", "grass.png", (1024, 512), (256, 512),
              (("grass_meadow", "grass_lawn", "grass_seed", "fern"),)),
    "flowers": ("isl_flowers", "flowers.png", (1024, 1024), (256, 256),
                (("marigold", "cornflower", "daisy", "poppy"),
                 ("marigold_side", "cornflower_side", "daisy_side", "poppy_side"),
                 ("dandelion", "seed_clock", "poppy_bud", "dandelion_side"),
                 ("leaf_lance", "leaf_dandelion", "leaf_trefoil", "leaf_pinnate"))),
    "rock": ("isl_rock", "rock.png", (1024, 1024), None, None),
}
GROUND = "ground.png"
# Metres of island the ground texture covers before it repeats, the scale the lawn render uses.
GROUND_TILE = 4.0
# The terrain's other ground textures (DESIGN.md section 17), painted like GROUND: per name its file, the metres it
# covers before repeating and its painter. Splat's earth channel takes ground_earth, its gravel channel ground_cobble
# in the village and ground_gravel outside it, its sand channel ground_sand.
GROUNDS = {"ground_earth": ("ground_earth.png", 4.0, textures.earth),
           "ground_cobble": ("ground_cobble.png", 3.0, textures.cobble),
           "ground_gravel": ("ground_gravel.png", 2.5, textures.gravel),
           "ground_sand": ("ground_sand.png", 4.0, textures.sand)}
MANIFEST = "atlases.json"
MATERIALS = {family: spec[0] for family, spec in FAMILIES.items()}
# Cells that repeat across a surface (bark along a trunk, the cypress all round) carry a wrapped border of TILE_PAD
# pixels so filtering at their edge still reads the same texture; their UV rectangle is the inside of that border.
TILEABLE = ("bark_oak", "bark_birch", "bark_spruce", "bark_apple", "cypress")
TILE_PAD = 8
APPLE = {"twigs": 8, "length": 0.16, "per_twig": 6, "tip": 3, "radii": (0.36, 0.34)}


def cell_rect(family, cell, inset=None):
    """The UV rectangle (u0, v0, u1, v1) of a named cell, inset so filtering stays inside it (by TILE_PAD for tiling
    cells); V runs up from the bottom of the image, as Blender's UVs do before the glTF exporter flips them."""
    _, _, (width, height), (cw, ch), rows = FAMILIES[family]
    if inset is None:
        inset = TILE_PAD if cell in TILEABLE else 1.5
    for r, row in enumerate(rows):
        if cell in row:
            c = row.index(cell)
            x0, y0 = c * cw + inset, height - (r + 1) * ch + inset
            return (x0 / width, y0 / height, (x0 + cw - 2 * inset) / width, (y0 + ch - 2 * inset) / height)
    raise KeyError(cell)


def srgb_to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def read_png(path):
    """An 8-bit PNG as a float array (rows from the top, sRGB-encoded RGB, straight alpha)."""
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    data = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(data)
    bpy.data.images.remove(img)
    return data.reshape(h, w, 4)[::-1].copy()


def write_png(path, rgba):
    """Write a float array (rows from the top, sRGB-encoded RGB, straight alpha) as an 8-bit RGBA PNG."""
    h, w = rgba.shape[:2]
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=True)
    img.pixels.foreach_set(np.clip(rgba[::-1], 0.0, 1.0).astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
    return path


def downsample(rgba, factor):
    """Box-filter by `factor` in premultiplied alpha, so edges average without dark halos."""
    h, w = rgba.shape[0] // factor, rgba.shape[1] // factor
    pre = rgba.copy()
    pre[..., :3] *= pre[..., 3:4]
    pre = pre[:h * factor, :w * factor].reshape(h, factor, w, factor, 4).mean(axis=(1, 3))
    alpha = pre[..., 3:4]
    pre[..., :3] = np.where(alpha > 1e-4, pre[..., :3] / np.maximum(alpha, 1e-4), 0.0)
    return pre


def bleed(rgba, steps=BLEED_STEPS):
    """Spread the colour of covered pixels into the transparent ones around them, alpha untouched, so a mipmapped
    or filtered lookup at a cut-out edge never picks up black."""
    rgb = rgba[..., :3].copy()
    known = rgba[..., 3] > 0.02
    for _ in range(steps):
        if known.all():
            break
        total = np.zeros_like(rgb)
        count = np.zeros(known.shape, dtype=np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            shifted = np.roll(known, (dy, dx), axis=(0, 1))
            total += np.roll(rgb * known[..., None], (dy, dx), axis=(0, 1))
            count += shifted
        grow = (~known) & (count > 0)
        rgb[grow] = total[grow] / count[grow][:, None]
        known = known | grow
    rgb[~known] = rgb[known].mean(axis=0) if known.any() else 0.0
    out = rgba.copy()
    out[..., :3] = rgb
    return out


def shade_gradient(rgba, top=1.0, bottom=0.62, core=0.82):
    """Paint the light-to-shadow gradient into a cluster sprite: lighter at the top, where the sun reaches it, darker
    at the bottom and toward the middle, where the cluster shades itself."""
    h, w = rgba.shape[:2]
    y = np.linspace(1.0, 0.0, h)[:, None]
    x = np.linspace(-1.0, 1.0, w)[None, :]
    yy = np.linspace(1.0, -1.0, h)[:, None]
    radial = np.clip(1.0 - np.sqrt(x * x + yy * yy), 0.0, 1.0)
    factor = (bottom + (top - bottom) * y ** 0.8) * (1.0 - (1.0 - core) * radial)
    out = rgba.copy()
    out[..., :3] = linear_to_srgb(srgb_to_linear(rgba[..., :3]) * factor[..., None])
    return out


def studio():
    """The atlas studio scene, created once: orthographic camera, sun from above and a little in front, soft white
    sky, transparent film, Standard view transform so the sprites keep the colours they were given."""
    scene = bpy.data.scenes.get(STUDIO)
    if scene is None:
        scene = bpy.data.scenes.new(STUDIO)
    # Cycles on the CPU with a fixed seed renders the same pixels on every run, so the atlases are byte-identical
    # from build to build; EEVEE's shadows are not.
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = CYCLES_SAMPLES
    scene.cycles.use_denoising = False
    scene.cycles.use_adaptive_sampling = False
    scene.cycles.seed = 0
    scene.cycles.max_bounces = 4
    scene.render.threads_mode = "AUTO"
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.resolution_percentage = 100
    if scene.world is None:
        scene.world = bpy.data.worlds.new(STUDIO)
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes["Background"]
    background.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    background.inputs["Strength"].default_value = SKY
    camera = scene.objects.get(STUDIO + "_camera")
    if camera is None:
        camera = bpy.data.objects.new(STUDIO + "_camera", bpy.data.cameras.new(STUDIO + "_camera"))
        scene.collection.objects.link(camera)
    camera.data.type = "ORTHO"
    camera.data.clip_start, camera.data.clip_end = 3.5, 6.5
    scene.camera = camera
    sun = scene.objects.get(STUDIO + "_sun")
    if sun is None:
        sun = bpy.data.objects.new(STUDIO + "_sun", bpy.data.lights.new(STUDIO + "_sun", "SUN"))
        scene.collection.objects.link(sun)
    sun.data.energy = SUN["energy"]
    sun.data.angle = math.radians(SUN["angle_deg"])
    sun.data.use_shadow = True
    return scene


def _aim(view, extent):
    """Point the studio camera and sun for a sprite of `extent` (width, height) metres. front: the camera looks along
    +Y at the X-Z plane, the sun from above leaning toward the camera; top: the camera looks down at the X-Y plane,
    image up is +Y, the sun high and leaning in from the top of the image."""
    scene = bpy.data.scenes[STUDIO]
    camera, sun = scene.objects[STUDIO + "_camera"], scene.objects[STUDIO + "_sun"]
    camera.data.ortho_scale = max(extent)
    tilt = math.radians(SUN["tilt_deg"])
    if view == "front":
        camera.location, camera.rotation_euler = (0.0, -5.0, 0.0), (math.radians(90.0), 0.0, 0.0)
        sun.rotation_euler = (-tilt, 0.0, 0.0)
    else:
        camera.location, camera.rotation_euler = (0.0, 0.0, 5.0), (0.0, 0.0, 0.0)
        sun.rotation_euler = (tilt, 0.0, 0.0)


def _break_depth_ties(me, toward_camera, step=1e-5):
    """Move each face a hair nearer the camera than the one built before it. Petals and needles overlap almost in
    one plane, and the renderer settles exact depth ties differently from run to run; with no ties left, every
    atlas is the same file on every build. Sprite faces own their vertices, so the faces move apart cleanly."""
    owner = np.zeros(len(me.vertices))
    corners = np.empty(len(me.loops), dtype=np.int64)
    me.loops.foreach_get("vertex_index", corners)
    starts = np.empty(len(me.polygons), dtype=np.int64)
    me.polygons.foreach_get("loop_start", starts)
    counts = np.empty(len(me.polygons), dtype=np.int64)
    me.polygons.foreach_get("loop_total", counts)
    owner[corners] = np.repeat(np.arange(len(me.polygons)), counts)
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3) + np.outer(owner * step, toward_camera)
    me.vertices.foreach_set("co", co.ravel())
    me.update()


def render(objects, view, extent, pixels, path):
    """Render the given studio objects into a sprite of `pixels` (w, h), `extent` (w, h) metres across, oversampled and
    box-filtered; returns the float RGBA array (rows from the top) and removes the objects."""
    scene = bpy.data.scenes[STUDIO]
    _aim(view, extent)
    for ob in objects:
        _break_depth_ties(ob.data, (0.0, -1.0, 0.0) if view == "front" else (0.0, 0.0, 1.0))
    scene.render.resolution_x, scene.render.resolution_y = pixels[0] * OVERSAMPLE, pixels[1] * OVERSAMPLE
    scene.render.pixel_aspect_x = scene.render.pixel_aspect_y = 1.0
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True, scene=scene.name)
    image = downsample(read_png(path), OVERSAMPLE)
    for ob in objects:
        data = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        if data is not None and data.users == 0:
            bpy.data.meshes.remove(data)
    return image


def family_material(family, image=None):
    """The one material of a vegetation family: atlas colour times the corner colour Col into Base Color, atlas alpha
    cut at ALPHA_CUTOFF into Alpha and both sides drawn (rock is opaque, front faces only, and its texture repeats).
    Base Color's own value stays white so the glTF exporter writes no colour factor."""
    name = MATERIALS[family]
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = family == "rock"
    mat.use_transparent_shadow = family != "rock"
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.8 if family != "rock" else 0.9
    bsdf.inputs["Specular IOR Level"].default_value = 0.25
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.extension = "REPEAT" if family == "rock" else "EXTEND"
    tex.interpolation = "Linear"
    col = nodes.new("ShaderNodeVertexColor")
    col.layer_name = style.COLOR_ATTRIBUTE
    mul = nodes.new("ShaderNodeMix")
    mul.data_type, mul.blend_type = "RGBA", "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    links.new(tex.outputs["Color"], mul.inputs["A"])
    links.new(col.outputs["Color"], mul.inputs["B"])
    links.new(mul.outputs["Result"], bsdf.inputs["Base Color"])
    if family != "rock":
        cut = nodes.new("ShaderNodeMath")
        cut.operation = "GREATER_THAN"
        cut.inputs[1].default_value = ALPHA_CUTOFF
        links.new(tex.outputs["Alpha"], cut.inputs[0])
        links.new(cut.outputs["Value"], bsdf.inputs["Alpha"])
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def _cluster(kind, **kwargs):
    return lambda rng: sprites.cluster(rng, kind, **kwargs)


def _recipes():
    """Every cell: ("sprite", geometry builder, view, extent in metres) photographed in the studio, or ("paint",
    painter of a numpy array) for the tiling textures."""
    stem = sprites.colours("stem")
    flower = {name: sprites.colours(name) for name in ("marigold", "cornflower", "daisy", "poppy", "dandelion")}
    square, tall = (1.0, 1.0), (0.5, 1.0)
    return {
        "oak_a": ("sprite", _cluster("oak", twigs=9, length=0.15, per_twig=7, steps=36, radii=(0.36, 0.34)), "front", square),
        "oak_b": ("sprite", _cluster("oak", twigs=8, length=0.17, per_twig=6, steps=36, radii=(0.38, 0.3)), "front", square),
        "ash": ("sprite", _cluster("lance", twigs=9, length=0.28, per_twig=3, tip=1, pairs=4, spread=(25.0, 55.0),
                                   radii=(0.34, 0.32)), "front", square),
        "birch": ("sprite", _cluster("birch", twigs=9, length=0.085, per_twig=11, droop=0.5, spread=(30.0, 60.0), dome=0.12,
                                     radii=(0.38, 0.3)), "front", square),
        "apple": ("sprite", _cluster("apple", **APPLE), "front", square),
        "hawthorn": ("sprite", _cluster("hawthorn", twigs=12, length=0.1, per_twig=9, lobes=(2.5, 2.5), steps=24,
                                        radii=(0.38, 0.36)), "front", square),
        "box": ("sprite", _cluster("box", twigs=18, length=0.055, per_twig=16, tip=2, spread=(40.0, 80.0), dome=0.3,
                                   radii=(0.4, 0.4)), "front", square),
        "spruce": ("sprite", lambda rng: sprites.spray(rng, shoots=15, needle=0.075, spacing=0.0055), "top", square),
        "bark_oak": ("paint", lambda rng, size: textures.bark(rng, size, "oak")),
        "bark_birch": ("paint", lambda rng, size: textures.bark(rng, size, "birch")),
        "bark_spruce": ("paint", lambda rng, size: textures.bark(rng, size, "spruce")),
        "bark_apple": ("paint", lambda rng, size: textures.bark(rng, size, "apple")),
        "end_grain": ("paint", lambda rng, size: textures.end_grain(rng, size)),
        "cypress": ("paint", lambda rng, size: textures.scale_foliage(rng, size)),
        "apple_blossom": ("sprite", lambda rng: sprites.apple_overlay(rng, APPLE, "blossom"), "front", square),
        "apple_fruit": ("sprite", lambda rng: sprites.apple_overlay(rng, APPLE, "fruit"), "front", square),
        "grass_meadow": ("sprite", lambda rng: sprites.grass_clump(rng, blades=70), "front", tall),
        "grass_lawn": ("sprite", lambda rng: sprites.grass_clump(rng, blades=110, height=(0.5, 0.85), width=(0.014, 0.022),
                                                                 lean=(0.0, 25.0), bend=(0.02, 0.15)), "front", tall),
        "grass_seed": ("sprite", lambda rng: sprites.grass_clump(rng, blades=55, seed_heads=6, height=(0.45, 0.8)), "front", tall),
        "fern": ("sprite", lambda rng: sprites.fern_frond(rng), "front", tall),
        **{name: ("sprite", (lambda n: lambda rng: sprites.flower_head(rng, n, flower[n]))(name), "top", square)
           for name in ("marigold", "cornflower", "daisy", "poppy", "dandelion")},
        **{name + "_side": ("sprite", (lambda n: lambda rng: sprites.flower_side(rng, n, flower[n], stem))(name), "front", square)
           for name in ("marigold", "cornflower", "daisy", "poppy")},
        "seed_clock": ("sprite", lambda rng: sprites.seed_clock(rng, stem), "front", square),
        "poppy_bud": ("sprite", lambda rng: sprites.bud(rng, flower["poppy"], stem), "front", square),
        "dandelion_side": ("sprite", lambda rng: sprites.flower_side(rng, "dandelion", flower["dandelion"], stem, leaves=0),
                           "front", square),
        "leaf_lance": ("sprite", lambda rng: sprites.leaf_tuft(rng, "lance", count=5, length=0.75, spread=60.0), "front", square),
        "leaf_dandelion": ("sprite", lambda rng: sprites.leaf_tuft(rng, "dandelion", count=4, length=0.8, spread=80.0, lobes=5.0),
                           "front", square),
        "leaf_trefoil": ("sprite", lambda rng: sprites.leaf_tuft(rng, "heart", count=5, view="top"), "top", square),
        "leaf_pinnate": ("sprite", lambda rng: sprites.leaf_tuft(rng, "pinna", count=4, length=0.8, lobes=6.0), "front", square),
    }


# Leaf-cluster sprites get the painted light-to-shadow gradient; the rest keep the studio's light as rendered.
GRADED = ("oak_a", "oak_b", "ash", "birch", "apple", "hawthorn", "box", "spruce")


def _cell_image(name, recipe, size, seed, scratch):
    """Render or paint one cell at `size` (w, h) pixels."""
    if recipe[0] == "paint":
        pad = TILE_PAD if name in TILEABLE else 0
        inner = recipe[1](np.random.default_rng(seed), size[0] - 2 * pad)
        if pad:
            inner = np.pad(inner, ((pad, pad), (pad, pad), (0, 0)), mode="wrap")
        return np.concatenate([inner, np.ones(inner.shape[:2] + (1,))], axis=-1)
    _, builder, view, extent = recipe
    scene = studio()
    ob = builder(random.Random(seed)).to_object("sprite_" + name, scene.collection)
    image = render([ob], view, extent, size, os.path.join(scratch, "sprite.png"))
    return shade_gradient(image) if name in GRADED else image


def build(out_dir, scratch, seed=7):
    """Render and paint every cell, compose the family atlases with their colour bled into the transparent pixels,
    paint the rock texture and the grounds, and write them all as PNG into out_dir; returns {name: path}."""
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(scratch, exist_ok=True)
    recipes = _recipes()
    paths = {}
    for family, (_, filename, (width, height), cell, rows) in FAMILIES.items():
        if rows is None:
            continue
        sheet = np.zeros((height, width, 4), dtype=np.float32)
        for r, row in enumerate(rows):
            for c, name in enumerate(row):
                # The apple overlays share the apple cell's seed, so they line up with its leaves.
                cell_seed = seed * 1000 + sum(map(ord, "apple" if name.startswith("apple_") else name))
                image = bleed(_cell_image(name, recipes[name], cell, cell_seed, scratch))
                sheet[r * cell[1]:(r + 1) * cell[1], c * cell[0]:(c + 1) * cell[0]] = image
        paths[family] = write_png(os.path.join(out_dir, filename), sheet)
    rock = textures.rock(np.random.default_rng(seed + 1), FAMILIES["rock"][2][0])
    paths["rock"] = write_png(os.path.join(out_dir, FAMILIES["rock"][1]), np.concatenate([rock, np.ones(rock.shape[:2] + (1,))], -1))
    ground = textures.ground(np.random.default_rng(seed + 2), 1024)
    paths["ground"] = write_png(os.path.join(out_dir, GROUND), np.concatenate([ground, np.ones(ground.shape[:2] + (1,))], -1))
    for k, (name, (filename, _, paint)) in enumerate(GROUNDS.items()):
        image = paint(np.random.default_rng(seed + 3 + k), 1024)
        paths[name] = write_png(os.path.join(out_dir, filename), np.concatenate([image, np.ones(image.shape[:2] + (1,))], -1))
    write_manifest(os.path.join(out_dir, MANIFEST))
    _close_studio()
    return paths


def write_manifest(path):
    """What the site needs to bind the atlases: per family its material, file, size, cut-out and sides, and every
    cell's rectangle in glTF UV space (origin at the image's top left, as the GLB's UVs are), so a shader can move
    the apple's cards to the blossom or fruit cell by the season."""
    doc = {}
    for family, (material, filename, size, cell, rows) in FAMILIES.items():
        entry = {"material": material, "file": filename, "size": list(size), "alpha_test": None if family == "rock" else ALPHA_CUTOFF,
                 "double_sided": family != "rock", "wrap": "repeat" if family == "rock" else "clamp"}
        if rows:
            entry["cells"] = {}
            for name in (n for row in rows for n in row):
                u0, v0, u1, v1 = cell_rect(family, name)
                entry["cells"][name] = [round(u0, 6), round(1.0 - v1, 6), round(u1, 6), round(1.0 - v0, 6)]
        doc[family] = entry
    doc["ground"] = {"file": GROUND, "size": [1024, 1024], "tile_metres": GROUND_TILE, "wrap": "repeat"}
    for name, (filename, metres, _) in GROUNDS.items():
        doc[name] = {"file": filename, "size": [1024, 1024], "tile_metres": metres, "wrap": "repeat"}
    with open(path, "w") as f:
        json.dump(doc, f, indent=2, sort_keys=True)
        f.write("\n")
    return path


def _close_studio():
    """Remove the studio scene with its camera, sun and world once the atlases are written."""
    scene = bpy.data.scenes.get(STUDIO)
    if scene is None:
        return
    for ob in list(scene.objects):
        data = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        if isinstance(data, bpy.types.Camera):
            bpy.data.cameras.remove(data)
        elif isinstance(data, bpy.types.Light):
            bpy.data.lights.remove(data)
    world = scene.world
    bpy.data.scenes.remove(scene)
    if world is not None and world.users == 0:
        bpy.data.worlds.remove(world)


def load_materials(paths):
    """Load the written atlases as images and (re)build each family's material on them."""
    materials = {}
    for family in FAMILIES:
        image = bpy.data.images.get(MATERIALS[family])
        if image is None:
            image = bpy.data.images.load(paths[family])
            image.name = MATERIALS[family]
        else:
            image.filepath = paths[family]
            image.reload()
        image.colorspace_settings.name = "sRGB"
        image.alpha_mode = "STRAIGHT"
        materials[family] = family_material(family, image)
    return materials
