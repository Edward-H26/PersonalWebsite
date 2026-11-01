"""The island.blend beside this file is a convenience snapshot from snapshot.py; the GLBs come from the headless build.

Build island assets: one collection and one joined object per asset, a draco GLB, a night preview and a daylight
preview, a black silhouette check, contact sheets per phase and for the marked props in both lights, and a stats
file with triangles against the budget, sizes, the proportion check against the originals and the re-import check of
every GLB, including its material names and primitives, the share of top surfaces that face the sky and the hue range
of the greens the site's seasons tint (DESIGN.md section 13). Before the vegetation, the atlases of DESIGN.md section
13b (foliage, grass, flowers, rock) and the ground texture are rendered and painted and written as PNG beside the
GLBs, which carry no images. Vegetation must come back as one mesh with exactly one material, the form the site
instances: one of the textured family materials (cut out, both sides, with UVs, the corner colour and the wind
channel) or, for the garden pieces, planter, bunting, haystack and fence, the vertex-coloured one; every other asset
but the lantern keeps only the vertex colours and the lit glass and embers, so it draws in a few calls. Types the site
places more than once are also built as character variants from other seeds (DESIGN.md section 9), so no two
instances match; the trees' _b copies stand on the shore, at a sea-wind exposure of flora.SHORE. The Island v2
landmarks of phase 4 that the terrain places (DESIGN.md section 17) keep their build's origin instead of the bottom
centre: their map anchor, or the terrain's own origin for the breakwater and the quay wall, as the landmarks of
terrain.json record.

Headless, from the repository root:
    /Applications/Blender.app/Contents/MacOS/Blender --background --python blender/island/build.py -- \\
        --assets house_01,pier --out public/models/island --previews blender/previews --sheets blender/previews

In the open Blender window (MCP bridge): import island.build and call run(...) with the same arguments."""

import argparse
import importlib
import json
import os
import sys
import tempfile

BLENDER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BLENDER_DIR not in sys.path:
    sys.path.insert(0, BLENDER_DIR)

import bpy  # noqa: E402

from island import atlas, flora, lawn, mesh, rig, style  # noqa: E402

PHASES = {
    1: ("house_01", "house_02", "house_03", "pier", "ship", "barrels", "crate", "lantern", "sea_marker"),
    2: ("inn", "bell_tower", "mill", "mill_sails", "blacksmith", "barracks", "sawmill", "stable", "market_stand_01",
        "market_stand_02", "well", "cart", "fence", "fire_pit"),
    3: ("cypress", "island_tree_01", "island_tree_02", "tree_small", "birch", "spruce", "hawthorn", "hedge_box", "fern",
        "boulder_01", "boulder_02", "moss_rocks", "tree_stump", "grass_medium_01", "grass_medium_02", "grass_bermuda",
        "dandelion", "gazania", "sorrel", "cornflower", "daisy", "poppy", "planter_hydrangea", "bunting", "raised_bed",
        "espalier", "arbour", "hedgerow", "dry_stone_wall", "haystack", "standing_stones"),
    4: ("castle_keep", "castle_stair", "watermill", "watermill_wheel", "stone_bridge", "breakwater", "quay_wall",
        "lighthouse", "signpost", "shrine", "rowing_boat", "net_rack", "lobster_pots"),
}
VEGETATION_PHASE = 3
# The props that carry the owner's marks (DESIGN.md section 13), gathered on a sheet of their own.
PROPS = ("barrels", "crate", "fence", "cart", "fire_pit", "well", "market_stand_01", "market_stand_02")
ASSETS = tuple(name for names in PHASES.values() for name in names)
# Size of each original model after glTF import (X, Y, Z), from DESIGN.md section 3.
ORIGINAL_SIZE = {
    "house_01": (1.94, 2.12, 1.07),
    "house_02": (2.14, 2.66, 3.39),
    "house_03": (2.22, 3.42, 3.25),
    "pier": (3.10, 19.03, 7.51),
    "ship": (9.53, 37.43, 32.55),
    "barrels": (4.44, 3.34, 0.93),
    "crate": (0.82, 0.41, 0.35),
    "lantern": (0.22, 0.23, 0.53),
    "sea_marker": (3.00, 3.00, 6.68),
    "inn": (4.03, 4.02, 3.49),
    "bell_tower": (1.94, 2.23, 4.76),
    "mill": (3.40, 2.73, 4.80),
    "blacksmith": (3.89, 3.28, 3.00),
    "barracks": (1.94, 2.12, 2.09),
    "sawmill": (4.40, 3.28, 2.86),
    "stable": (4.70, 3.33, 2.49),
    "market_stand_01": (0.52, 1.15, 1.04),
    "market_stand_02": (0.95, 1.19, 1.05),
    "well": (0.67, 1.00, 1.25),
    "cart": (0.46, 0.93, 0.80),
    "fence": (0.79, 0.03, 0.33),
    "fire_pit": (1.44, 1.43, 0.38),
    "cypress": (2.03, 1.78, 12.99),
    "island_tree_01": (4.76, 4.82, 5.02),
    "island_tree_02": (4.21, 4.07, 3.41),
    "tree_small": (2.91, 4.22, 4.55),
    "boulder_01": (1.27, 1.83, 1.00),
    "boulder_02": (2.53, 1.23, 0.88),
    "tree_stump": (1.43, 1.59, 0.57),
    # The site instances one named mesh out of each multi-variant scan, so these are that mesh's size, not the
    # whole file's in the DESIGN.md table; a _b variant matches the second mesh the site instances.
    "fern": (0.99, 0.894, 0.428),
    "moss_rocks": (2.108, 2.08, 1.095),
    "moss_rocks_b": (2.126, 2.753, 1.259),
    "grass_medium_01": (0.216, 0.221, 0.218),
    "grass_medium_02": (0.262, 0.25, 0.232),
    "grass_medium_02_b": (0.119, 0.12, 0.157),
    "grass_bermuda": (0.068, 0.046, 0.151),
    "dandelion": (0.17, 0.167, 0.101),
    "dandelion_b": (0.214, 0.205, 0.047),
    "gazania": (0.241, 0.186, 0.069),
    "gazania_b": (0.246, 0.266, 0.1),
    "sorrel": (0.061, 0.049, 0.054),
    # The lantern hook's arm makes fence_b deeper than the scan by design; it fits at the plain fence's height.
    "fence_b": None,
}
# Triangle budgets from DESIGN.md sections 3 and 10; anything not listed is a prop.
BUDGET = {"inn": 20000, "bell_tower": 20000, "mill": 20000, "house_01": 14000, "house_02": 14000, "house_03": 14000,
          "blacksmith": 16000, "barracks": 16000, "sawmill": 16000, "stable": 16000, "pier": 6000, "ship": 30000,
          "fence": 200, "island_tree_01": 8000, "island_tree_02": 8000, "tree_small": 8000, "birch": 8000, "spruce": 8000,
          "cypress": 8000, "hawthorn": 1500, "hedge_box": 1500, "fern": 600, "grass_medium_01": 300, "grass_medium_02": 300,
          "grass_bermuda": 300, "dandelion": 400, "gazania": 400, "sorrel": 400, "cornflower": 400, "daisy": 400,
          "poppy": 400, "planter_hydrangea": 600, "bunting": 400, "raised_bed": 1200, "espalier": 1200, "arbour": 1200,
          "hedgerow": 1500, "dry_stone_wall": 1200, "haystack": 1200, "standing_stones": 2500, "lighthouse": 16000,
          "castle_keep": 24000, "watermill": 16000, "stone_bridge": 4000, "breakwater": 9000, "quay_wall": 6000,
          "mill_sails": 4000, "castle_stair": 6000}
PROP_BUDGET = 2000
# Every copy of a type the site places more than once, as the keyword arguments of its build(): each extra copy is
# exported as <name>_b, <name>_c with its own character seed, a "form" makes it match a second scanned mesh or shape,
# an exposure puts a tree on the shore and the fence's hook marks the pieces the road lanterns hang from.
SHORE = {"exposure": flora.SHORE}
VARIANTS = {"house_01": ({}, {}, {}), "house_02": ({}, {}, {}), "house_03": ({}, {}, {}), "market_stand_02": ({}, {}),
            "fence": ({}, {"hook": True}), "cypress": ({}, SHORE), "island_tree_01": ({}, SHORE),
            "island_tree_02": ({}, SHORE), "tree_small": ({}, SHORE), "birch": ({}, SHORE), "spruce": ({}, SHORE),
            "moss_rocks": ({}, {"form": "long"}),
            "grass_medium_02": ({}, {"form": "sprig"}), "dandelion": ({}, {"form": "rosette"}),
            "gazania": ({}, {"form": "tall"}), "hedge_box": ({}, {"form": "cube"}), "hedgerow": ({}, {}),
            "dry_stone_wall": ({}, {"form": "gateway"}), "haystack": ({}, {}), "rowing_boat": ({}, {"band": "paint_red"})}
VARIANT_SEED_STEP = 101
# Assets the site instances: one mesh, one material and vertex colours, checked on re-import. The material is one of
# the textured families or, for the garden pieces, planter, bunting and fence, the vertex-coloured one.
INSTANCED = (*PHASES[VEGETATION_PHASE], "fence")
TEXTURED = frozenset(atlas.MATERIALS.values())
INSTANCED_MATERIALS = TEXTURED | {style.VERTEX_MATERIAL}
# What a textured plant's GLB must carry: UVs for its atlas, the corner colour and the wind channel.
TEXTURED_STREAMS = {"TEXCOORD_0", "COLOR_0", "COLOR_1"}
# Every other asset bakes its opaque surfaces to vertex colours and keeps only the lit materials and the mill pond's
# water, so it draws in a few calls; the lantern keeps its palette materials because the site swaps its glass on each copy.
BAKED_MATERIALS = {style.VERTEX_MATERIAL, style.WINDOW_GLASS, style.LANTERN_GLASS, style.HEARTH_GLOW, style.POND_WATER}
UNBAKED = ("lantern",)
RATIO_TOLERANCE = 0.15
DEFAULT_SEED = 7
STATS_PATH = os.path.join(BLENDER_DIR, "island", "build", "stats.json")
LINEUP_SPACING = 20.0
PHASE_SPACING = 45.0


def build_asset(name, seed=DEFAULT_SEED, label=None, **kwargs):
    """Rebuild one asset in its own collection asset_<label> and return the joined object, named isl_<label>."""
    label = label or name
    module = importlib.import_module("island.assets." + name)
    mesh.use_collection("asset_" + label, clear=True)
    original = ORIGINAL_SIZE.get(label, ORIGINAL_SIZE.get(name))
    if phase_of(name) == VEGETATION_PHASE and original:
        # The site fits instanced vegetation by height alone, so the builder stretches its plan to the scan's
        # footprint ratio, before any wind lean.
        kwargs["plan"] = original
    ob = module.build(seed, **kwargs)
    ob.name = ob.data.name = "isl_" + label
    return ob


def instances(name, seed=DEFAULT_SEED):
    """(label, seed, build keyword arguments) for every copy of a type: the type itself and its variants."""
    return [(name + ("_" + "abcdefgh"[i] if i else ""), seed + i * VARIANT_SEED_STEP, kwargs)
            for i, kwargs in enumerate(VARIANTS.get(name, ({},)))]


def ratio_change(size, original):
    """Relative change of width:height and depth:height against the original model."""
    (w, d, h), (ow, od, oh) = size, original
    return [round((w / h) / (ow / oh) - 1, 3), round((d / h) / (od / oh) - 1, 3)]


def fit_height_factor(ratios):
    """The factor on the site's fit height that keeps a model wider or deeper than the original's proportions
    within the tolerance of the original's footprint; 1.0 when it already fits."""
    return round(min(1.0, (1 + RATIO_TOLERANCE) / (1 + max(ratios))), 3)


def phase_of(name):
    return next(phase for phase, names in PHASES.items() if name in names)


def _relative(path):
    return os.path.relpath(path, os.path.dirname(BLENDER_DIR))


def _load_stats(path):
    if not os.path.exists(path):
        return {}
    with open(path) as f:
        return json.load(f)


def _line_up(ob, name, variant):
    """Spread the built assets over the live scene: one row per phase and the character variants in a row of
    their own."""
    phase = phase_of(name)
    row = len(PHASES) if variant else phase - 1
    ob.location = (PHASES[phase].index(name) * LINEUP_SPACING + variant * 4.0, -row * PHASE_SPACING, 0.0)


def build_one(name, label, seed, kwargs, out_dir, preview_dir):
    """Build, export, re-import and render one copy of an asset; returns its stats entry."""
    ob = build_asset(name, seed, label, **kwargs)
    glb = os.path.join(out_dir, label + ".glb")
    entry = mesh.stats(ob)
    original = ORIGINAL_SIZE.get(label, ORIGINAL_SIZE.get(name))
    upright = ob.get("upright_size")
    if upright:
        entry.update({"exposure": kwargs.get("exposure", flora.INLAND), "upright_size": list(upright)})
    if "mount" in ob:
        entry["mount"] = ob["mount"].to_dict()
    ratios = ratio_change(upright or entry["size"], original) if original else None
    entry.update({"seed": seed, "budget": BUDGET.get(name, PROP_BUDGET), "glb": _relative(glb),
                  "glb_bytes": rig.export_glb(ob, glb)})
    check = rig.reimport_check(glb)
    entry.update({"glb_size": check["size"], "glb_min_z": check["min_z"], "glb_tris": check["tris"],
                  "glb_meshes": check["meshes"], "glb_materials": check["materials"],
                  "glb_material_names": check["material_names"], "glb_primitives": check["primitives"],
                  "glb_vertex_colors": check["vertex_colors"], "sky_facing": check["sky_facing"], "greens": check["greens"],
                  "original_size": list(original) if original else None, "ratio_change": ratios,
                  "fit_height_factor": fit_height_factor(ratios) if ratios else None})
    names = set(check["material_names"])
    if name in INSTANCED:
        if not (check["meshes"] == check["materials"] == 1 and check["vertex_colors"] and names <= INSTANCED_MATERIALS):
            raise RuntimeError("%s must re-import as one mesh with one of %s, got %s" % (label, sorted(INSTANCED_MATERIALS),
                                                                                        check))
        if names & TEXTURED:
            entry.update(_textured_check(label, glb, names))
    elif name not in UNBAKED and not (style.VERTEX_MATERIAL in names and names <= BAKED_MATERIALS):
        raise RuntimeError("%s must keep only %s, got %s" % (label, sorted(BAKED_MATERIALS), sorted(names)))
    _line_up(ob, name, label != name)
    if preview_dir:
        entry["preview"] = _relative(rig.render_preview(ob, os.path.join(preview_dir, label + ".png")))
        with rig.daylight():
            entry["preview_day"] = _relative(rig.render_preview(ob, os.path.join(preview_dir, "day", label + ".png")))
        silhouette = os.path.join(preview_dir, "silhouettes", label + ".png")
        entry["silhouette"] = _relative(rig.render_silhouette(ob, silhouette))
    print("%-18s %6d/%-5d tris  size %-22s glb %7d bytes  min z %6.3f  meshes %d  primitives %d  sky %s  greens %s  "
          "ratio change %s  materials %s" % (label, entry["tris"], entry["budget"], entry["size"], entry["glb_bytes"],
                                             entry["glb_min_z"], entry["glb_meshes"], entry["glb_primitives"], entry["sky_facing"],
                                             entry["greens"]["hue"], ratios, ",".join(entry["glb_material_names"])))
    return entry


def _textured_check(label, glb, names):
    """A textured plant's GLB must cut its atlas out (rock is opaque), carry UVs, the corner colour and the wind
    channel, and name the atlas the site binds to its material."""
    surface = rig.glb_surface(glb)
    family = next(f for f, m in atlas.MATERIALS.items() if m in names)
    alpha = ["OPAQUE"] if family == "rock" else ["MASK"]
    if surface["alpha"] != alpha or not TEXTURED_STREAMS <= set(surface["streams"]):
        raise RuntimeError("%s must draw %s with %s, got %s" % (label, alpha, sorted(TEXTURED_STREAMS), surface))
    return {"atlas": atlas.FAMILIES[family][1], "glb_alpha": surface["alpha"], "glb_double_sided": surface["double_sided"],
            "glb_streams": surface["streams"]}


def sheet_groups(name, label):
    """The contact sheets a copy of an asset appears on: its phase, or the variants sheet for the character copies of
    buildings and props; the props sheet for the owner's marked props; and for every base asset the one combined
    silhouette sheet."""
    phase = phase_of(name)
    groups = ["phase%d" % phase if label == name or phase == VEGETATION_PHASE else "variants"]
    if name in PROPS:
        groups.append("props")
    if label == name:
        groups.append("silhouettes")
    return groups


def run(names, out_dir, preview_dir=None, sheet_dir=None, stats_path=STATS_PATH, seed=DEFAULT_SEED, lawn_path=None):
    """Build, export and check each asset and its character variants, render previews, silhouettes and the contact
    sheets, merge the stats, and render the walk-height lawn from the plants built when `lawn_path` is given."""
    rig.setup()
    if any(phase_of(name) == VEGETATION_PHASE for name in names):
        with tempfile.TemporaryDirectory() as scratch:
            atlas.load_materials(atlas.build(out_dir, scratch, seed))
    stats = _load_stats(stats_path)
    sheets = {}
    for name in names:
        for label, variant_seed, kwargs in instances(name, seed):
            stats[label] = build_one(name, label, variant_seed, kwargs, out_dir, preview_dir)
            if not preview_dir:
                continue
            for group in sheet_groups(name, label):
                if group == "silhouettes":
                    sheets.setdefault(group, []).append((label, os.path.join(preview_dir, "silhouettes", label + ".png")))
                    continue
                sheets.setdefault(group, []).append((label, os.path.join(preview_dir, label + ".png")))
                sheets.setdefault(group + "_day", []).append((label, os.path.join(preview_dir, "day", label + ".png")))
    os.makedirs(os.path.dirname(stats_path), exist_ok=True)
    order = [label for name in ASSETS for label, _, _ in instances(name, seed)]
    with open(stats_path, "w") as f:
        json.dump({label: stats[label] for label in order if label in stats}, f, indent=2)
    if sheet_dir:
        for group, entries in sheets.items():
            tile = rig.SILHOUETTE_SIZE if group == "silhouettes" else rig.RESOLUTION
            rig.contact_sheet(entries, os.path.join(sheet_dir, "contact_sheet_%s.png" % group), tile=tile)
    if lawn_path:
        built = {label: bpy.data.objects["isl_" + label] for name in names if phase_of(name) == VEGETATION_PHASE
                 for label, _, _ in instances(name, seed)}
        lawn.render(built, os.path.join(out_dir, atlas.GROUND), os.path.abspath(lawn_path), seed)
    return stats


def clear_startup_scene():
    """Headless Blender starts from the default file; drop its cube, light and camera."""
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)


def parse_args(argv):
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--assets", default=",".join(ASSETS), help="comma separated asset names")
    parser.add_argument("--out", default="public/models/island", help="folder for the GLB files")
    parser.add_argument("--previews", default=None, help="folder for preview PNGs (omit to skip rendering)")
    parser.add_argument("--sheets", default=None, help="folder for one contact sheet per phase built from the previews")
    parser.add_argument("--stats", default=STATS_PATH, help="stats JSON to merge the results into")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--lawn", default=None, help="PNG path for the walk-height lawn render of the vegetation")
    return parser.parse_args(argv)


def main():
    args = parse_args(sys.argv)
    if bpy.app.background:
        clear_startup_scene()
    names = [n.strip() for n in args.assets.split(",") if n.strip()]
    previews = os.path.abspath(args.previews) if args.previews else None
    sheets = os.path.abspath(args.sheets) if args.sheets else None
    run(names, os.path.abspath(args.out), previews, sheets, os.path.abspath(args.stats), args.seed, args.lawn)


if __name__ == "__main__":
    main()
