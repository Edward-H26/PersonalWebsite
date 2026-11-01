"""Palette and materials for the island assets: slate blues for stone and roofs, warm plaster and timber, the
regional plaster tints and terracotta of DESIGN.md section 9, harbor timber greyed by salt wind and amber emission
for lit glass. The site's cyan and violet stay in the user interface and never go on buildings; Columbia blue is
kept for pennants."""

import colorsys
import contextlib

import bpy

PALETTE = {
    "timber_dark": "#3a2a1e",
    "timber": "#5b4231",
    "plank": "#7a5a3f",
    "plank_light": "#9b7a55",
    "driftwood": "#6f6c66",
    "plaster": "#e7dcc8",
    "plaster_warm": "#d9c7ab",
    "stone": "#4c5b73",
    "stone_light": "#7d8aa3",
    "stone_dark": "#36425a",
    "roof": "#2f3f61",
    "roof_light": "#3f5078",
    "roof_violet": "#3b3663",
    "iron": "#2b2f36",
    "rope": "#b8a580",
    "canvas": "#e6dccb",
    "canvas_dark": "#cdbfa6",
    "glass": "#8fd3e8",
    "cyan": "#06b6d4",
    "violet": "#8b5cf6",
    "amber": "#f59e0b",
    "warm_light": "#ffe0b0",
    "hull": "#4a3426",
    "hull_dark": "#2e2016",
    "water_wood": "#5d6462",
    "leaf": "#3f7a3a",
    "leaf_dark": "#2a4a2a",
    "bark": "#4a3a2c",
    "ground": "#7a6b56",
    "copper": "#8c5a3c",
    "paint_red": "#9b2f26",
    "paint_gold": "#c08a2e",
    "hay": "#c9a45c",
    "bronze": "#7a5a30",
    "water": "#22404f",
    "plaster_ochre": "#d4b26a",
    "plaster_rose": "#d8a399",
    "plaster_sage": "#b8c39e",
    "tile": "#a1502f",
    "tile_light": "#b96a42",
    "tile_dark": "#7c3b23",
    "stone_honey": "#9d8b66",
    "stone_honey_light": "#bba982",
    "brick": "#8c4536",
    "moss": "#56683a",
    "columbia": "#75aadb",
    "white": "#f1efe8",
    "leaf_light": "#5f9a48",
    "grass": "#6b8f3e",
    "grass_dry": "#a59a5a",
    "petal_yellow": "#f2c230",
    "petal_orange": "#e8892b",
    "flower_centre": "#5a3a1a",
    "hydrangea_light": "#a8cbee",
    "hydrangea_deep": "#4d78b0",
    "soil": "#3d3024",
    "stone_honey_dark": "#76664a",
    "burnt": "#2a1d15",
    "lavender": "#8c7fb8",
    "sage": "#8a9a7a",
    "sand": "#d3c29a",
    "sand_wet": "#9f9172"
}

# Roughness and metallic per key, from DESIGN.md section 2; keys not listed use DEFAULT_SURFACE.
SURFACE = {
    "stone": (0.9, 0.0),
    "stone_light": (0.9, 0.0),
    "stone_dark": (0.9, 0.0),
    "plaster": (0.85, 0.0),
    "plaster_warm": (0.85, 0.0),
    "roof": (0.7, 0.0),
    "roof_light": (0.7, 0.0),
    "iron": (0.5, 0.6),
    "glass": (0.6, 0.0),
    "warm_light": (0.6, 0.0),
    "paint_red": (0.6, 0.0),
    "canvas": (0.9, 0.0),
    "canvas_dark": (0.9, 0.0),
    "rope": (0.9, 0.0),
    "hay": (0.95, 0.0),
    "bronze": (0.4, 0.8),
    "water": (0.15, 0.0),
    "paint_gold": (0.5, 0.3),
    "plaster_ochre": (0.85, 0.0),
    "plaster_rose": (0.85, 0.0),
    "plaster_sage": (0.85, 0.0),
    "tile": (0.75, 0.0),
    "tile_light": (0.75, 0.0),
    "tile_dark": (0.75, 0.0),
    "stone_honey": (0.9, 0.0),
    "stone_honey_light": (0.9, 0.0),
    "brick": (0.9, 0.0),
    "moss": (0.95, 0.0),
    "columbia": (0.9, 0.0),
    "white": (0.9, 0.0),
    "soil": (0.95, 0.0),
    "stone_honey_dark": (0.9, 0.0)
}
DEFAULT_SURFACE = (0.8, 0.0)
HARBOR_KEYS = ("timber", "timber_dark", "plank", "plank_light", "driftwood", "hull", "hull_dark", "water_wood")
VERTEX_MATERIAL = "isl_vertex_colour"
# The lit materials an asset keeps beside VERTEX_MATERIAL, named so the site can dim, light or flicker them.
WINDOW_GLASS, LANTERN_GLASS, HEARTH_GLOW = "isl_window_glass", "isl_lantern_glass", "isl_hearth_glow"
# The mill pond's surface keeps a slot of its own too, so the site can draw it with its water shader.
POND_WATER = "isl_pond_water"
COLOR_ATTRIBUTE = "Col"
WINDOW_GLOW = 1.5
LANTERN_GLOW = 3.0
EMBER_GLOW = 1.4
# Foliage greens by place (DESIGN.md section 13): yellow-green inland, blue-green by the sea, each a body green, a
# lighter top band and a cool shade, and the amber dusk band on the faces towards the key light. Every green stays
# inside GREEN_HUE, in degrees on the linear corner colours at a saturation of at least GREEN_SATURATION: the window
# the site's season tint turns to ochre in autumn. Bark, straw, flowers, stone and the dusk band all fall outside it.
INLAND_GREENS = {"body": "#5e8c31", "light": "#a7c25a", "shade": "#2f4a2c"}
SEA_GREENS = {"body": "#3e7b66", "light": "#86b59a", "shade": "#1e3f3b"}
DUSK = "#e8a23f"
GREEN_HUE = (70.0, 175.0)
GREEN_SATURATION = 0.2


def _greyer(hex_str, amount):
    """The colour pulled `amount` of the way towards the grey of its own luminance."""
    h = hex_str.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    grey = 0.299 * r + 0.587 * g + 0.114 * b
    return "#" + "".join("%02x" % round(c + (grey - c) * amount) for c in (r, g, b))


# Harbor timber sits two 25 percent steps greyer than hillside timber (DESIGN.md section 9).
PALETTE.update({"harbor_" + key: _greyer(PALETTE[key], 0.5) for key in HARBOR_KEYS})
HARBOR = {key: "harbor_" + key for key in HARBOR_KEYS}
_remap = {}


@contextlib.contextmanager
def weathered():
    """Materials made inside this block take the harbor timber in place of the hillside timber."""
    global _remap
    _remap = HARBOR
    try:
        yield
    finally:
        _remap = {}


def _linear(channel):
    c = channel / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb(hex_str):
    h = hex_str.lstrip("#")
    return tuple(_linear(int(h[i:i + 2], 16)) for i in (0, 2, 4))


def linear(key):
    """The linear RGB of a palette key, for painting corner colours."""
    return rgb(PALETTE[key])


def is_green(colour):
    """Whether a linear colour lies in the season window: GREEN_HUE at GREEN_SATURATION or more."""
    hue, saturation, _ = colorsys.rgb_to_hsv(*colour[:3])
    return saturation >= GREEN_SATURATION and GREEN_HUE[0] <= 360.0 * hue <= GREEN_HUE[1]


def material(key, roughness=None, metallic=None, emission=None, strength=0.0, name=None):
    """One shared material per palette key (and per emission variant), so exports stay small; inside weathered()
    the hillside timber keys resolve to their harbor variants."""
    key = _remap.get(key, key)
    name = name or "isl_" + key + ("_em_" + emission + "_" + format(strength, "g") if emission else "")
    m = bpy.data.materials.get(name)
    if m is not None:
        return m
    default_roughness, default_metallic = SURFACE.get(key, DEFAULT_SURFACE)
    m = bpy.data.materials.new(name)
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    color = (*rgb(PALETTE[key]), 1.0)
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = default_roughness if roughness is None else roughness
    bsdf.inputs["Metallic"].default_value = default_metallic if metallic is None else metallic
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*rgb(PALETTE[emission]), 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    # Single-sided in the GLB: three.js then culls back faces, and open parts are only built to be seen from outside.
    m.use_backface_culling = True
    m.diffuse_color = color
    return m


def window_glass():
    """Every lit window pane on the island: warm glass glowing from inside at WINDOW_GLOW, one material with a stable
    name so the site can dim or light all windows at once."""
    return material("warm_light", emission="amber", strength=WINDOW_GLOW, name=WINDOW_GLASS)


def vertex_colour_material():
    """The one material for every opaque surface on the island: colour comes from the COLOR_ATTRIBUTE corner colours
    alone, so an asset draws its opaque parts in one call and vegetation instances as a single mesh. Double-sided,
    because blades, fronds and flags are single faces."""
    m = bpy.data.materials.get(VERTEX_MATERIAL)
    if m is not None:
        return m
    m = bpy.data.materials.new(VERTEX_MATERIAL)
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    colour = nodes.new("ShaderNodeVertexColor")
    colour.layer_name = COLOR_ATTRIBUTE
    links.new(colour.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.85
    m.use_backface_culling = False
    return m


def pond_water():
    """The mill pond's still surface, a material of its own so the site can swap in its water shader."""
    return material("water", roughness=0.1, name=POND_WATER)


def lantern_glass():
    """The brand lantern's amber glass, a material of its own so the site can light each lantern separately."""
    return material("warm_light", emission="amber", strength=LANTERN_GLOW, name=LANTERN_GLASS)


def hearth_glow():
    """Glowing coals in the forge and the fire pit's bed of embers and burning log ends, in the lantern amber
    (DESIGN.md section 13): a material of its own so the site can flicker the fires without touching the lanterns."""
    return material("amber", emission="amber", strength=EMBER_GLOW, name=HEARTH_GLOW)
