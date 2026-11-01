"""Save island.blend, the convenience snapshot of every island asset for looking at in Blender and trying colours in
place. Each asset is built from its module with its named palette materials kept; the export's vertex-colour bake
still paints the corner colours, so Solid shading in Attribute mode shows the same colours, and the plants draw from
the atlases beside the GLBs. The assets stand in one row per phase, each in a collection of its own under its
phase's collection, and the 3D viewport is saved in Material Preview looking at the houses. A colour changed here
stays here: the GLBs only ever come from the modules through build.py.

Headless, from the repository root:
    /Applications/Blender.app/Contents/MacOS/Blender --background --python blender/island/snapshot.py -- \\
        --models public/models/island --out blender/island/island.blend"""

import argparse
import math
import os
import sys

BLENDER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BLENDER_DIR not in sys.path:
    sys.path.insert(0, BLENDER_DIR)

import bpy  # noqa: E402
from mathutils import Euler, Vector  # noqa: E402

from island import atlas, build, mesh  # noqa: E402

PHASE_NAMES = {1: "Phase 1: houses, harbour and lantern", 2: "Phase 2: village buildings and props",
               3: "Phase 3: vegetation, rocks and gardens", 4: "Phase 4: Island v2 landmarks and harbour props"}
GAP = 3.0
ROW_GAP = 12.0
STUDIO_LIGHT = "studio.exr"
# The opening view: the first few assets of the phase 1 row, seen from the south-east at about thirty degrees.
OPENING_ASSETS = 4
OPENING_ROTATION = Euler((math.radians(62.0), 0.0, math.radians(32.0)))


def build_rows(models, seed):
    """Build every asset and its variants with the palette kept, the plants on the atlases in `models`; returns
    {phase: [(label, object)]} in build order."""
    atlas.load_materials({family: os.path.join(models, spec[1]) for family, spec in atlas.FAMILIES.items()})
    rows = {}
    with mesh.palette_kept():
        for name in build.ASSETS:
            for label, variant_seed, kwargs in build.instances(name, seed):
                rows.setdefault(build.phase_of(name), []).append((label, build.build_asset(name, variant_seed, label, **kwargs)))
    return rows


def lay_out(rows):
    """Put each phase in a row of its own, south to north, every asset beside the last, and move each asset's
    collection under its phase's collection with the asset's name."""
    scene = bpy.context.scene
    y = 0.0
    for phase in sorted(rows):
        parent = bpy.data.collections.new(PHASE_NAMES[phase])
        scene.collection.children.link(parent)
        x, depth = 0.0, 0.0
        for label, ob in rows[phase]:
            lo, hi = mesh.bounds([ob])
            ob.location += Vector((x - lo.x, y - (lo.y + hi.y) * 0.5, 0.0))
            x += (hi.x - lo.x) + GAP
            depth = max(depth, hi.y - lo.y)
            coll = ob.users_collection[0]
            scene.collection.children.unlink(coll)
            parent.children.link(coll)
            coll.name = label
        y += depth + ROW_GAP
    bpy.context.view_layer.update()


def opening_view(rows):
    """Where the saved viewport looks: the centre of the first assets of phase 1, from far enough to hold them."""
    first = [ob for _, ob in rows[1][:OPENING_ASSETS]]
    lo, hi = mesh.bounds(first)
    return (lo + hi) * 0.5, max(hi - lo) * 1.1


def set_viewports(focus, distance):
    """Every 3D viewport in Material Preview under the studio light, Solid shading coloured by the corner colour
    attribute, looking at `focus`."""
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type != "VIEW_3D":
                    continue
                space.shading.type = "MATERIAL"
                space.shading.studio_light = STUDIO_LIGHT
                # "VERTEX" is the Attribute choice of Solid shading's colour menu.
                space.shading.color_type = "VERTEX"
                space.clip_end = 3000.0
                space.region_3d.view_perspective = "PERSP"
                space.region_3d.view_location = focus
                space.region_3d.view_rotation = OPENING_ROTATION.to_quaternion()
                space.region_3d.view_distance = distance


def save(path):
    """Drop the startup file's empty collection, purge orphans, point the atlases at the GLB folder relative to the
    file, pack nothing, save compressed."""
    for coll in [c for c in bpy.data.collections if not c.all_objects]:
        bpy.data.collections.remove(coll)
    for family in atlas.FAMILIES:
        image = bpy.data.images[atlas.MATERIALS[family]]
        image.filepath = bpy.path.relpath(bpy.path.abspath(image.filepath), start=os.path.dirname(path))
    bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
    bpy.ops.wm.save_mainfile(filepath=path, compress=True, relative_remap=False)
    return path


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0] if __doc__ else None)
    parser.add_argument("--models", default="public/models/island", help="folder holding the GLBs and the atlases")
    parser.add_argument("--out", default="blender/island/island.blend", help="where to save the snapshot")
    parser.add_argument("--seed", type=int, default=build.DEFAULT_SEED)
    args = parser.parse_args(argv)
    build.clear_startup_scene()
    rows = build_rows(os.path.abspath(args.models), args.seed)
    lay_out(rows)
    set_viewports(*opening_view(rows))
    print("saved", save(os.path.abspath(args.out)))


if __name__ == "__main__":
    main()
