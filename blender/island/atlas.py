"""The vegetation atlases of DESIGN.md sections 13b and 18.3, rendered in Blender: a small studio scene (orthographic
camera, a key sun from above, a back sun whose light comes through thin leaves and petals, soft white sky,
transparent film) photographs sprite geometry from sprites.py, the textures come from textures.py, and the cells are
composed into one RGBA atlas each with their colour bled into the transparent pixels so mipmaps do not fringe.

A plant family has one material: its card atlas times the corner colour "Col", cut out where the atlas alpha falls
under ALPHA_CUTOFF and drawn from both sides. The foliage family's wood (bark, end grain, the clipped evergreens)
draws from a second atlas, bark.png with its normal map, chosen face by face by the card flag of the wind channel
(COLOR_1.b: 1 on cards, 0 on wood), so a tree is still one mesh under one material. The litter atlas holds the
forest-floor decals the site lays on the ground under the copses. The GLBs carry no images; the site binds each
family's atlases by material name (MATERIALS) as atlases.json lists them."""

import json
import math
import os
import random

import bpy
import numpy as np

from island import sprites, studio, style, textures

ALPHA_CUTOFF = 0.5
STUDIO = "atlas_studio"
OVERSAMPLE = 2
CYCLES_SAMPLES = 24
BLEED_STEPS = 24
SKY = 0.42
SUN = {"energy": 3.4, "angle_deg": 12.0, "tilt_deg": 24.0}
# The back sun stands low behind a front-view sprite, so leaves and petals show the light coming through them.
BACK_SUN = {"energy": 2.2, "angle_deg": 10.0, "elevation_deg": 28.0}

# Atlas -> (file, width in pixels, rows from the top as (cell width, cell height, cell names)); a None name leaves its
# cell empty.
ATLASES = {
    "foliage": ("foliage.png", 2048, (
        (512, 512, ("oak_a", "oak_b", "ash", "birch")),
        (512, 512, ("spruce", "pine", "apple", "apple_blossom")),
        (512, 512, ("apple_fruit", "rowan", "rowan_berries", "willow")),
        (512, 512, ("hawthorn", "box", "gorse", "bramble")))),
    "bark": ("bark.png", 2048, (
        (512, 512, ("bark_oak", "bark_oak_young", "bark_ash", "bark_ash_young")),
        (512, 512, ("bark_birch", "bark_spruce", "bark_pine", "bark_apple")),
        (512, 512, ("bark_rowan", "bark_willow", "bark_hawthorn", "bark_cane")),
        (512, 512, ("bark_gorse", "end_grain", "cypress", "box_clipped")))),
    "grass": ("grass.png", 2048, (
        (256, 512, ("grass_lawn", "grass_meadow", "grass_seed", "grass_tall", "grass_dry", "heads_spike",
                    "heads_panicle", "heads_nodding")),
        (256, 512, ("fern", "bracken", "bracken_stalk", None, None, None, None, None)))),
    "flowers": ("flowers.png", 2048, (
        (256, 256, ("poppy", "poppy_orange", "poppy_pink", "cornflower", "cornflower_violet", "cornflower_pink", "daisy",
                    "daisy_pink")),
        (256, 256, ("marigold", "marigold_yellow", "dandelion", "buttercup", "buttercup_lemon", "seed_clock",
                    "poppy_bud", "clover_head")),
        (256, 256, ("poppy_side", "poppy_orange_side", "poppy_pink_side", "cornflower_side", "cornflower_violet_side",
                    "cornflower_pink_side", "daisy_side", "daisy_pink_side")),
        (256, 256, ("marigold_side", "marigold_yellow_side", "dandelion_side", "buttercup_side", "buttercup_lemon_side",
                    None, None, None)),
        (256, 256, ("leaf_lance", "leaf_dandelion", "leaf_trefoil", "leaf_pinnate", "leaf_buttercup", "leaf_foxglove",
                    "leaf_bluebell", None)),
        (256, 256, (None,) * 8),
        (256, 512, ("foxglove", "foxglove_pink", "foxglove_white", "bluebell", "bluebell_white", "bluebell_pink", None,
                    None)))),
    "litter": ("litter.png", 2048, (
        (512, 512, ("litter_oak", "litter_mixed", "litter_birch", "litter_needles")),
        (512, 512, ("litter_twigs", "litter_cones", "moss_cushion", "moss_litter")))),
    "rock": ("rock.png", 1024, None),
}
# Plant family -> (material, the atlas its cards draw from, the atlas its tubes and discs draw from).
FAMILIES = {"foliage": ("isl_foliage", "foliage", "bark"), "grass": ("isl_grass", "grass", "grass"),
            "flowers": ("isl_flowers", "flowers", "flowers"), "rock": ("isl_rock", "rock", "rock")}
MATERIALS = {family: spec[0] for family, spec in FAMILIES.items()}
# The UV map every plant's cards and wood are laid out in.
UV_MAP = "UVMap"
# Atlases with a tangent-space normal map beside them (OpenGL convention, green toward the top of the image), and how
# deep their relief reads: the height field's full range in pixels of the cell.
NORMAL_MAPS = {"bark": "bark_normal.png"}
# Metres of ground one litter cell covers when the site lays it as a decal.
LITTER_CELL_METRES = 1.2
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
# Cells that repeat across a surface (bark along a trunk, the clipped evergreens all round) carry a wrapped border of
# TILE_PAD pixels so filtering at their edge still reads the same texture; their UV rectangle is the inside of that
# border.
TILEABLE = frozenset(name for row in ATLASES["bark"][2] for name in row[2]) - {"end_grain"}
TILE_PAD = 8
# The leaf clusters that carry seasonal overlays, built from the same arguments so the overlays line up with them.
APPLE = {"twigs": 10, "length": 0.15, "per_twig": 7, "tip": 3, "radii": (0.37, 0.35)}
ROWAN = {"twigs": 9, "length": 0.3, "per_twig": 2, "tip": 1, "pairs": 6, "spread": (30.0, 60.0), "radii": (0.36, 0.34)}


def atlas_size(name):
    """An atlas's (width, height) in pixels."""
    _, width, rows = ATLASES[name]
    return (width, width) if rows is None else (width, sum(row[1] for row in rows))


def cells(name):
    """The named cells of an atlas as (cell name, x, y, width, height) in pixels from its top-left corner."""
    _, _, rows = ATLASES[name]
    out, top = [], 0
    for cw, ch, names in rows or ():
        for k, cell in enumerate(names):
            if cell is not None:
                out.append((cell, k * cw, top, cw, ch))
        top += ch
    return out


def cell_rect(name, cell, inset=None):
    """The UV rectangle (u0, v0, u1, v1) of a named cell of atlas `name`, inset so filtering stays inside it (by
    TILE_PAD for tiling cells); V runs up from the bottom of the image, as Blender's UVs do before the glTF exporter
    flips them."""
    width, height = atlas_size(name)
    if inset is None:
        inset = TILE_PAD if cell in TILEABLE else 1.5
    for other, x, y, cw, ch in cells(name):
        if other == cell:
            x0, y0 = x + inset, height - y - ch + inset
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


def write_png(path, rgba, alpha=True):
    """Write a float array (rows from the top, sRGB-encoded RGB, straight alpha) as an 8-bit RGBA PNG, or RGB when
    `alpha` is False for images with nothing to cut out."""
    h, w = rgba.shape[:2]
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=alpha)
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


def normal_map(height, relief):
    """A tangent-space normal map of a tiling height field in [0, 1] whose full range rises `relief` pixels, encoded
    in [0, 1] in the OpenGL convention (red toward +U, green toward the top of the image); gradients wrap at the
    edges, so the map tiles as the texture does."""
    gx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 0.5 * relief
    # Rows run down the image while V runs up it, so the slope along V is minus the slope down the rows.
    gy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * 0.5 * relief
    n = np.stack([-gx, gy, np.ones_like(height)], axis=-1)
    return n / np.linalg.norm(n, axis=-1, keepdims=True) * 0.5 + 0.5


def _studio():
    """The atlas studio scene: the shared studio (see studio.py) with a soft white sky, a key sun from above and a
    back sun, its camera clipped round the sprite plane."""
    scene = studio.scene(STUDIO, CYCLES_SAMPLES, bounces=4, sky=SKY)
    scene.camera.data.clip_start, scene.camera.data.clip_end = 3.5, 6.5
    for suffix, spec in (("_sun", SUN), ("_back", BACK_SUN)):
        sun = scene.objects.get(STUDIO + suffix)
        if sun is None:
            sun = bpy.data.objects.new(STUDIO + suffix, bpy.data.lights.new(STUDIO + suffix, "SUN"))
            scene.collection.objects.link(sun)
        sun.data.energy = spec["energy"]
        sun.data.angle = math.radians(spec["angle_deg"])
        sun.data.use_shadow = True
    return scene


def _aim(view, extent):
    """Point the studio camera and suns for a sprite of `extent` (width, height) metres. front: the camera looks along
    +Y at the X-Z plane, the key sun from above leaning toward the camera and the back sun low behind the sprite; top:
    the camera looks down at the X-Y plane, image up is +Y, the key sun high and leaning in from the top of the image,
    no back sun."""
    scene = bpy.data.scenes[STUDIO]
    camera, sun, back = (scene.objects[STUDIO + suffix] for suffix in ("_camera", "_sun", "_back"))
    camera.data.ortho_scale = max(extent)
    tilt = math.radians(SUN["tilt_deg"])
    if view == "front":
        camera.location, camera.rotation_euler = (0.0, -5.0, 0.0), (math.radians(90.0), 0.0, 0.0)
        sun.rotation_euler = (-tilt, 0.0, 0.0)
        back.rotation_euler = (-math.radians(90.0 - BACK_SUN["elevation_deg"]), 0.0, 0.0)
        back.data.energy = BACK_SUN["energy"]
    else:
        camera.location, camera.rotation_euler = (0.0, 0.0, 5.0), (0.0, 0.0, 0.0)
        sun.rotation_euler = (tilt, 0.0, 0.0)
        back.data.energy = 0.0


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
    studio.render(scene, path)
    image = downsample(read_png(path), OVERSAMPLE)
    for ob in objects:
        data = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        if data is not None and data.users == 0:
            bpy.data.meshes.remove(data)
    return image


def _image_node(nodes, image, repeat=False):
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.extension = "REPEAT" if repeat else "EXTEND"
    tex.interpolation = "Linear"
    return tex


def family_material(family, images=None):
    """The one material of a plant family over its atlas images ({atlas name: image}, normal maps as
    "<atlas>_normal"): the card atlas times the corner colour Col into Base Color, its alpha cut at ALPHA_CUTOFF into
    Alpha and both sides drawn (rock is opaque, front faces only, and its texture repeats). Base Color's own value
    stays white so the glTF exporter writes no colour factor."""
    images = images or {}
    name, card_atlas, wood_atlas = FAMILIES[family]
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
    tex = _image_node(nodes, images.get(card_atlas), repeat=family == "rock")
    colour, alpha = tex.outputs["Color"], tex.outputs["Alpha"]
    if wood_atlas != card_atlas:
        colour, alpha = _wood(nodes, links, bsdf, images, wood_atlas, colour, alpha)
    col = nodes.new("ShaderNodeVertexColor")
    col.layer_name = style.COLOR_ATTRIBUTE
    mul = nodes.new("ShaderNodeMix")
    mul.data_type, mul.blend_type = "RGBA", "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    links.new(colour, mul.inputs["A"])
    links.new(col.outputs["Color"], mul.inputs["B"])
    links.new(mul.outputs["Result"], bsdf.inputs["Base Color"])
    if family != "rock":
        cut = nodes.new("ShaderNodeMath")
        cut.operation = "GREATER_THAN"
        cut.inputs[1].default_value = ALPHA_CUTOFF
        links.new(alpha, cut.inputs[0])
        links.new(cut.outputs["Value"], bsdf.inputs["Alpha"])
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def _wood(nodes, links, bsdf, images, atlas_name, card_colour, card_alpha):
    """Wood that draws from a second atlas: the card flag of the wind channel (1 on cards, 0 on wood) picks between
    the two atlases' colours, keeps wood solid where the card atlas would cut it out, and bends the wood's shading
    normals by the second atlas's normal map. Returns the colour and alpha sockets."""
    wind = nodes.new("ShaderNodeVertexColor")
    wind.layer_name = style.WIND_ATTRIBUTE
    flag = nodes.new("ShaderNodeSeparateColor")
    links.new(wind.outputs["Color"], flag.inputs["Color"])
    card = flag.outputs["Blue"]
    wood = _image_node(nodes, images.get(atlas_name))
    pick = nodes.new("ShaderNodeMix")
    pick.data_type = "RGBA"
    links.new(card, pick.inputs["Factor"])
    links.new(wood.outputs["Color"], pick.inputs["A"])
    links.new(card_colour, pick.inputs["B"])
    bare = nodes.new("ShaderNodeMath")
    bare.operation = "SUBTRACT"
    bare.inputs[0].default_value = 1.0
    links.new(card, bare.inputs[1])
    solid = nodes.new("ShaderNodeMath")
    solid.operation = "MAXIMUM"
    links.new(card_alpha, solid.inputs[0])
    links.new(bare.outputs["Value"], solid.inputs[1])
    relief = images.get(atlas_name + "_normal")
    if relief is not None:
        tex = _image_node(nodes, relief)
        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.uv_map = UV_MAP
        links.new(tex.outputs["Color"], normal_map.inputs["Color"])
        geometry = nodes.new("ShaderNodeNewGeometry")
        bend = nodes.new("ShaderNodeMix")
        bend.data_type = "VECTOR"
        links.new(card, bend.inputs["Factor"])
        links.new(normal_map.outputs["Normal"], bend.inputs["A"])
        links.new(geometry.outputs["Normal"], bend.inputs["B"])
        links.new(bend.outputs["Result"], bsdf.inputs["Normal"])
    return pick.outputs["Result"], solid.outputs["Value"]


def _cluster(kind, **kwargs):
    return lambda rng: sprites.cluster(rng, kind, **kwargs)


# Bark kinds of the bark atlas and how deep their relief reads in the normal map, in pixels of the cell.
BARKS = {"oak": 10.0, "oak_young": 2.5, "ash": 7.0, "ash_young": 2.0, "birch": 2.5, "spruce": 5.0, "pine": 9.0,
         "apple": 6.0, "rowan": 2.5, "willow": 9.0, "hawthorn": 6.0, "cane": 3.0, "gorse": 4.0}
# Flower heads seen from above; each also has a "<name>_side" cell of the flower on its stem.
FLOWER_HEADS = ("poppy", "poppy_orange", "poppy_pink", "cornflower", "cornflower_violet", "cornflower_pink", "daisy",
                "daisy_pink", "marigold", "marigold_yellow", "dandelion", "buttercup", "buttercup_lemon")
# Overlay cells take their leaf cluster's seed, so they line up with its leaves.
OVERLAYS = {"apple_blossom": "apple", "apple_fruit": "apple", "rowan_berries": "rowan"}
# The eight flower species of section 18.3, whose base colours go into the manifest.
FLOWER_KINDS = ("poppy", "cornflower", "daisy", "marigold", "dandelion", "buttercup", "foxglove", "bluebell")
# Leaf-cluster sprites get the painted light-to-shadow gradient; the rest keep the studio's light as rendered.
GRADED = ("oak_a", "oak_b", "ash", "birch", "spruce", "pine", "apple", "rowan", "willow", "hawthorn", "box", "gorse",
          "bramble")


def _recipes():
    """Every cell: ("sprite", geometry builder, view, extent in metres) photographed in the studio, ("relief", painter
    of colour and height, relief in pixels) for the tiling textures with a normal map, or ("paint", painter of RGBA
    at a cell size)."""
    stem = sprites.colours("stem")
    square, tall = (1.0, 1.0), (0.5, 1.0)

    def head(name):
        return lambda rng: sprites.flower_head(rng, sprites.kind_of(name), sprites.colours(name))

    def side(name):
        leaves = 0 if name == "dandelion" else 1
        return lambda rng: sprites.flower_side(rng, sprites.kind_of(name), sprites.colours(name), stem, leaves=leaves)

    def spike(builder, name):
        return lambda rng: builder(rng, sprites.colours(name), stem, extent=tall)

    def litter(**kwargs):
        return lambda rng: sprites.litter(rng, **kwargs)

    return {
        # Leaf clusters, foliage.png.
        "oak_a": ("sprite", _cluster("oak", twigs=13, length=0.14, per_twig=8, steps=36, inner=0.15, radii=(0.37, 0.35)),
                  "front", square),
        "oak_b": ("sprite", _cluster("oak", twigs=12, length=0.16, per_twig=7, steps=36, inner=0.15, radii=(0.38, 0.32)),
                  "front", square),
        "ash": ("sprite", _cluster("lance", twigs=10, length=0.27, per_twig=3, tip=1, pairs=4, spread=(25.0, 55.0),
                                   radii=(0.35, 0.33)), "front", square),
        "birch": ("sprite", _cluster("birch", twigs=10, length=0.08, per_twig=12, droop=0.5, spread=(30.0, 60.0), dome=0.12,
                                     radii=(0.38, 0.3)), "front", square),
        "spruce": ("sprite", lambda rng: sprites.spray(rng, shoots=17, needle=0.07, spacing=0.0045), "top", square),
        "pine": ("sprite", lambda rng: sprites.pine_tufts(rng), "front", square),
        "apple": ("sprite", _cluster("apple", **APPLE), "front", square),
        "apple_blossom": ("sprite", lambda rng: sprites.overlay(rng, "apple", APPLE, "blossom"), "front", square),
        "apple_fruit": ("sprite", lambda rng: sprites.overlay(rng, "apple", APPLE, "fruit"), "front", square),
        "rowan": ("sprite", _cluster("serrate", **ROWAN), "front", square),
        "rowan_berries": ("sprite", lambda rng: sprites.overlay(rng, "serrate", ROWAN, "berries"), "front", square),
        "willow": ("sprite", _cluster("willow", twigs=11, length=0.13, per_twig=10, droop=0.45, spread=(12.0, 30.0),
                                      dome=0.1, radii=(0.36, 0.32)), "front", square),
        "hawthorn": ("sprite", _cluster("hawthorn", twigs=13, length=0.09, per_twig=10, lobes=(2.5, 2.5), steps=24,
                                        radii=(0.38, 0.36)), "front", square),
        "box": ("sprite", _cluster("box", twigs=20, length=0.05, per_twig=18, tip=2, spread=(40.0, 80.0), dome=0.3,
                                   radii=(0.4, 0.4)), "front", square),
        "gorse": ("sprite", lambda rng: sprites.gorse(rng), "front", square),
        "bramble": ("sprite", lambda rng: sprites.bramble(rng), "front", square),
        # Bark, end grain and the clipped evergreens, bark.png with its normal map.
        **{"bark_" + kind: ("relief", (lambda k: lambda rng, size: textures.bark(rng, size, k))(kind), relief)
           for kind, relief in BARKS.items()},
        "end_grain": ("relief", textures.end_grain, 3.0),
        "cypress": ("relief", textures.scale_foliage, 6.0),
        "box_clipped": ("relief", textures.box_foliage, 5.0),
        # Grass, grass.png.
        "grass_lawn": ("sprite", lambda rng: sprites.grass_clump(rng, blades=120, height=(0.5, 0.85), width=(0.012, 0.02),
                                                                 lean=(0.0, 22.0), bend=(0.02, 0.15), extent=tall), "front", tall),
        "grass_meadow": ("sprite", lambda rng: sprites.grass_clump(rng, blades=80, lean=(0.0, 16.0), bend=(0.05, 0.22),
                                                                   extent=tall), "front", tall),
        "grass_seed": ("sprite", lambda rng: sprites.grass_clump(rng, blades=60, seed_heads=7, height=(0.45, 0.8),
                                                                 lean=(0.0, 14.0), bend=(0.05, 0.2), extent=tall), "front", tall),
        "grass_tall": ("sprite", lambda rng: sprites.grass_clump(rng, blades=70, height=(0.7, 1.0), width=(0.018, 0.03),
                                                                 lean=(2.0, 13.0), bend=(0.08, 0.22), extent=tall), "front", tall),
        "grass_dry": ("sprite", lambda rng: sprites.grass_clump(rng, blades=65, tone=(0.55, 0.95), lean=(0.0, 15.0),
                                                                bend=(0.05, 0.2), curl=0.15, broken=0.3, extent=tall), "front", tall),
        "heads_spike": ("sprite", lambda rng: sprites.grass_heads(rng, "spike", extent=tall), "front", tall),
        "heads_panicle": ("sprite", lambda rng: sprites.grass_heads(rng, "panicle", extent=tall), "front", tall),
        "heads_nodding": ("sprite", lambda rng: sprites.grass_heads(rng, "nodding", extent=tall), "front", tall),
        "fern": ("sprite", lambda rng: sprites.fern_frond(rng, extent=tall), "front", tall),
        "bracken": ("sprite", lambda rng: sprites.bracken_frond(rng, extent=tall), "top", tall),
        "bracken_stalk": ("sprite", lambda rng: sprites.stalk(rng, extent=tall), "front", tall),
        # Flowers, flowers.png: every colour variant rendered in its own colours, heads from above and on their stems.
        **{name: ("sprite", head(name), "top", square) for name in FLOWER_HEADS},
        **{name + "_side": ("sprite", side(name), "front", square) for name in FLOWER_HEADS},
        "seed_clock": ("sprite", lambda rng: sprites.seed_clock(rng, stem), "front", square),
        "poppy_bud": ("sprite", lambda rng: sprites.bud(rng, sprites.colours("poppy"), stem), "front", square),
        "clover_head": ("sprite", lambda rng: sprites.clover_head(rng, stem), "front", square),
        "leaf_lance": ("sprite", lambda rng: sprites.leaf_tuft(rng, "lance", count=5, length=0.75, spread=60.0), "front", square),
        "leaf_dandelion": ("sprite", lambda rng: sprites.leaf_tuft(rng, "dandelion", count=4, length=0.8, spread=80.0, lobes=5.0),
                           "front", square),
        "leaf_trefoil": ("sprite", lambda rng: sprites.leaf_tuft(rng, "heart", count=5, view="top"), "top", square),
        "leaf_pinnate": ("sprite", lambda rng: sprites.leaf_tuft(rng, "pinna", count=4, length=0.8, lobes=6.0), "front", square),
        "leaf_buttercup": ("sprite", lambda rng: sprites.leaf_tuft(rng, "palmate", count=4, length=0.55, spread=90.0,
                                                                   petiole=0.3), "front", square),
        "leaf_foxglove": ("sprite", lambda rng: sprites.leaf_tuft(rng, "ovate", count=4, length=0.85, spread=75.0), "front", square),
        "leaf_bluebell": ("sprite", lambda rng: sprites.leaf_tuft(rng, "strap", count=6, length=0.95, spread=45.0), "front", square),
        **{name: ("sprite", spike(sprites.foxglove, name), "front", tall) for name in ("foxglove", "foxglove_pink", "foxglove_white")},
        **{name: ("sprite", spike(sprites.bluebell, name), "front", tall) for name in ("bluebell", "bluebell_white", "bluebell_pink")},
        # Forest floor decals, litter.png.
        "litter_oak": ("sprite", litter(leaves=(("oak", 1.0),), nuts=14), "top", square),
        "litter_mixed": ("sprite", litter(leaves=(("oak", 0.35), ("ash", 0.25), ("birch", 0.2), ("hawthorn", 0.2)), twigs=4),
                         "top", square),
        "litter_birch": ("sprite", litter(leaves=(("birch", 0.7), ("willow", 0.3))), "top", square),
        "litter_needles": ("sprite", litter(needles=2600, cones=5), "top", square),
        "litter_twigs": ("sprite", litter(leaves=(("oak", 0.5), ("ash", 0.5)), count=40, twigs=14), "top", square),
        "litter_cones": ("sprite", litter(needles=900, cones=16, twigs=3), "top", square),
        "moss_cushion": ("paint", lambda rng, size: textures.moss(rng, size[0], cushions=True)),
        "moss_litter": ("paint", lambda rng, size: textures.moss(rng, size[0], cushions=False)),
    }


def _cell_image(name, recipe, size, seed, scratch):
    """Render or paint one cell at `size` (w, h) pixels; returns its RGBA and, for a relief cell, its encoded
    normals, both with a wrapped border when the cell tiles."""
    kind = recipe[0]
    if kind == "relief":
        pad = TILE_PAD if name in TILEABLE else 0
        colour, height = recipe[1](np.random.default_rng(seed), size[0] - 2 * pad)
        normals = normal_map(height, recipe[2])
        if pad:
            colour = np.pad(colour, ((pad, pad), (pad, pad), (0, 0)), mode="wrap")
            normals = np.pad(normals, ((pad, pad), (pad, pad), (0, 0)), mode="wrap")
        return np.concatenate([colour, np.ones(colour.shape[:2] + (1,))], axis=-1), normals
    if kind == "paint":
        return recipe[1](np.random.default_rng(seed), size), None
    _, builder, view, extent = recipe
    scene = _studio()
    ob = builder(random.Random(seed)).to_object("sprite_" + name, scene.collection)
    image = render([ob], view, extent, size, os.path.join(scratch, "sprite.png"))
    return (shade_gradient(image) if name in GRADED else image), None


def compose(name, recipes, seed, scratch, only=None):
    """Render or paint the cells of one atlas (all, or those named in `only`) and lay them out with their colour bled
    into the transparent pixels; returns the RGBA sheet and, for an atlas with a normal map, its encoded normals."""
    width, height = atlas_size(name)
    sheet = np.zeros((height, width, 4), dtype=np.float32)
    normals = np.tile(np.array([0.5, 0.5, 1.0]), (height, width, 1)) if name in NORMAL_MAPS else None
    for cell, x, y, cw, ch in cells(name):
        if only is not None and cell not in only:
            continue
        cell_seed = seed * 1000 + sum(map(ord, OVERLAYS.get(cell, cell)))
        image, relief = _cell_image(cell, recipes[cell], (cw, ch), cell_seed, scratch)
        sheet[y:y + ch, x:x + cw] = bleed(image)
        if relief is not None:
            normals[y:y + ch, x:x + cw] = relief
    return sheet, normals


def build(out_dir, scratch, seed=7):
    """Render and paint every cell, compose the atlases with their colour bled into the transparent pixels, paint the
    rock texture and the grounds, and write them all as PNG into out_dir with the manifest; returns {name: path},
    normal maps under "<atlas>_normal"."""
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(scratch, exist_ok=True)
    recipes = _recipes()
    paths = {}
    for name, (filename, _, rows) in ATLASES.items():
        if rows is None:
            continue
        sheet, normals = compose(name, recipes, seed, scratch)
        # Bark is solid all over and normal maps carry no cut-out, so they go out without an alpha channel.
        paths[name] = write_png(os.path.join(out_dir, filename), sheet, alpha=name != "bark")
        if normals is not None:
            paths[name + "_normal"] = write_png(os.path.join(out_dir, NORMAL_MAPS[name]),
                                                np.concatenate([normals, np.ones(normals.shape[:2] + (1,))], axis=-1),
                                                alpha=False)
    rock = textures.rock(np.random.default_rng(seed + 1), ATLASES["rock"][1])
    paths["rock"] = write_png(os.path.join(out_dir, ATLASES["rock"][0]), np.concatenate([rock, np.ones(rock.shape[:2] + (1,))], -1))
    ground = textures.ground(np.random.default_rng(seed + 2), 1024)
    paths["ground"] = write_png(os.path.join(out_dir, GROUND), np.concatenate([ground, np.ones(ground.shape[:2] + (1,))], -1))
    for k, (name, (filename, _, paint)) in enumerate(GROUNDS.items()):
        image = paint(np.random.default_rng(seed + 3 + k), 1024)
        paths[name] = write_png(os.path.join(out_dir, filename), np.concatenate([image, np.ones(image.shape[:2] + (1,))], -1))
    write_manifest(os.path.join(out_dir, MANIFEST))
    studio.close(STUDIO)
    return paths


def files(folder):
    """{name: path} in `folder` of every atlas and normal map the plant families draw from."""
    out = {name: os.path.join(folder, ATLASES[name][0]) for spec in FAMILIES.values() for name in spec[1:]}
    out.update({name + "_normal": os.path.join(folder, filename) for name, filename in NORMAL_MAPS.items()})
    return out


def _atlas_entry(name):
    """An atlas's file, size, normal map and every cell's rectangle in glTF UV space (origin at the image's top left,
    as the GLBs' UVs are)."""
    width, height = atlas_size(name)
    entry = {"file": ATLASES[name][0], "size": [width, height]}
    if name in NORMAL_MAPS:
        entry["normal"] = NORMAL_MAPS[name]
    named = cells(name)
    if named:
        entry["cells"] = {}
        for cell, *_ in named:
            u0, v0, u1, v1 = cell_rect(name, cell)
            entry["cells"][cell] = [round(u0, 6), round(1.0 - v1, 6), round(u1, 6), round(1.0 - v0, 6)]
    return entry


def _overlays(name):
    """Each seasonal overlay cell with the leaf cell it lies over pixel for pixel and the glTF UV offset that moves a
    card from the leaf cell onto it."""
    out = {}
    for overlay, base in OVERLAYS.items():
        u0, v0, _, v1 = cell_rect(name, overlay)
        bu0, bv0, _, bv1 = cell_rect(name, base)
        out[overlay] = {"base": base, "offset": [round(u0 - bu0, 6), round(bv1 - v1, 6)]}
    return out


def write_manifest(path):
    """What the site needs to bind the atlases: per family its material, atlas, cut-out, sides and every cell's
    rectangle in glTF UV space; for the foliage family the seasonal overlays with the offset from their leaf cells,
    and the wood atlas with its normal map, the rule that picks it (faces whose COLOR_1.b is 0) and the metres a bark
    cell covers (see trees.wood_metres); per flower species the base colour the site fades with the season; the
    litter decals with the ground a cell covers; the ground textures; and the cloud atlas."""
    # Imported here: clouds.py renders with this module's image helpers and trees.py builds on cards.py, which
    # takes its cells from this module, so both import atlas at their tops.
    from island import clouds, trees
    doc = {}
    for family, (material, card_atlas, wood_atlas) in FAMILIES.items():
        doc[family] = {"material": material, **_atlas_entry(card_atlas),
                       "alpha_test": None if family == "rock" else ALPHA_CUTOFF, "double_sided": family != "rock",
                       "wrap": "repeat" if family == "rock" else "clamp"}
        if wood_atlas != card_atlas:
            doc[family]["wood"] = {**_atlas_entry(wood_atlas), "wrap": "clamp",
                                   "select": {"attribute": "COLOR_1", "channel": "b", "value": 0},
                                   "cell_metres": trees.wood_metres()}
    doc["foliage"]["overlays"] = _overlays("foliage")
    doc["flowers"]["base_colours"] = {kind: entry["petal"] for kind, entry in sprites.PALETTE.items()
                                      if kind in FLOWER_KINDS}
    doc["litter"] = {**_atlas_entry("litter"), "alpha_test": ALPHA_CUTOFF, "wrap": "clamp", "cell_metres": LITTER_CELL_METRES}
    doc["ground"] = {"file": GROUND, "size": [1024, 1024], "tile_metres": GROUND_TILE, "wrap": "repeat"}
    for name, (filename, metres, _) in GROUNDS.items():
        doc[name] = {"file": filename, "size": [1024, 1024], "tile_metres": metres, "wrap": "repeat"}
    doc["clouds"] = clouds.manifest_entry()
    _write_json(path, doc)
    return path


def merge_manifest(path, entries):
    """Add or replace top-level `entries` ({key: entry}) in the atlases.json at `path`."""
    with open(path) as f:
        doc = json.load(f)
    doc.update(entries)
    _write_json(path, doc)
    return path


def _write_json(path, doc):
    with open(path, "w") as f:
        json.dump(doc, f, indent=2, sort_keys=True)
        f.write("\n")


def load_materials(paths):
    """Load the written atlases as images, named by their files, and (re)build each family's material on them;
    `paths` maps atlas names, and normal maps as "<atlas>_normal", to their files."""
    images = {}
    for name, path in paths.items():
        if name not in ATLASES and not name.endswith("_normal"):
            continue
        key = os.path.basename(path)
        image = bpy.data.images.get(key)
        if image is None:
            image = bpy.data.images.load(path)
            image.name = key
        else:
            image.filepath = path
            image.reload()
        image.colorspace_settings.name = "Non-Color" if name.endswith("_normal") else "sRGB"
        image.alpha_mode = "STRAIGHT"
        images[name] = image
    return {family: family_material(family, images) for family in FAMILIES}
