"""A walk-height view of a lawn at real scale, for judging the vegetation of DESIGN.md section 13b as a visitor meets it:
the ground texture on a broad plane, grass clumps at three times the old scatter density with flowers in drifts, trees,
bushes and rocks around and behind, seen from 1.7 metres in low afternoon light. Every plant is a linked copy of a
built asset at its real size, so the render shows exactly what the GLBs hold."""

import math
import random

import bpy
from mathutils import Vector

SCENE = "lawn"
EYE = 1.7
LENS = 26.0
SIZE = (1600, 900)
GROUND_TILE = 4.0
GROUND_SIZE = 140.0
SUN = {"direction": (0.5, 0.62, -0.6), "energy": 5.2, "colour": (1.0, 0.9, 0.76), "angle_deg": 2.0}
SKY = ((0.5, 0.64, 0.88), 0.35)
# Grass clumps per square metre, near the eye and further out: a lawn grazed short but full.
GRASS_NEAR, GRASS_FAR = 4.0, 1.6
# (asset label, x, y, yaw degrees): the larger plants, placed by hand so the view has depth and a clear foreground.
PLANTS = (
    ("island_tree_01", -9.5, 17.0, 20.0), ("island_tree_02", 12.0, 26.0, 140.0), ("birch", 6.2, 11.5, 0.0),
    ("birch_b", 8.6, 13.4, 70.0), ("tree_small", -4.8, 9.0, 200.0), ("spruce", -17.0, 34.0, 0.0),
    ("spruce_b", 21.0, 42.0, 45.0), ("cypress", 2.5, 40.0, 0.0), ("hawthorn", -8.5, 7.0, 90.0),
    ("hedge_box", 3.4, 5.6, 0.0), ("hedge_box_b", 4.4, 6.3, 15.0), ("tree_stump", -2.6, 4.6, 120.0),
    ("boulder_01", 7.2, 8.2, 30.0), ("moss_rocks", -6.4, 12.8, 200.0), ("boulder_02", 14.0, 16.5, 80.0),
)
# (asset label, how many, drift radius in metres): flower drifts and ferns, each drift one kind.
DRIFTS = (("daisy", 22, 2.2), ("poppy", 16, 2.0), ("cornflower", 18, 2.0), ("gazania", 12, 1.6), ("gazania_b", 10, 1.5),
          ("dandelion", 14, 2.4), ("dandelion_b", 10, 2.0), ("sorrel", 16, 1.2), ("fern", 7, 2.2), ("daisy", 18, 2.5),
          ("poppy", 12, 1.8), ("cornflower", 14, 1.8))
GRASS = ("grass_medium_01", "grass_medium_02", "grass_medium_02_b", "grass_bermuda")
# A wood edge closing the far side of the lawn: (asset labels, how many, x range, y range).
WOOD_EDGE = (("island_tree_01", "island_tree_01_b", "island_tree_02", "spruce", "spruce_b", "birch", "hawthorn"), 26,
             (-55.0, 55.0), (46.0, 64.0))


def _copy(scene, source, at, yaw, scale=1.0):
    """A linked copy of a built asset standing at `at` (x, y) turned by `yaw` radians."""
    ob = source.copy()
    ob.location = (at[0], at[1], 0.0)
    ob.rotation_euler = (0.0, 0.0, yaw)
    ob.scale = (scale, scale, scale)
    ob.hide_render = False
    scene.collection.objects.link(ob)
    return ob


def _ground(scene, image_path):
    """A broad plane carrying the tiling ground texture."""
    half = GROUND_SIZE * 0.5
    me = bpy.data.meshes.new("lawn_ground")
    me.from_pydata([(-half, -half, 0.0), (half, -half, 0.0), (half, half, 0.0), (-half, half, 0.0)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name="UVMap")
    repeat = GROUND_SIZE / GROUND_TILE
    for loop, (u, v) in zip(me.loops, ((0, 0), (repeat, 0), (repeat, repeat), (0, repeat))):
        uv.data[loop.index].uv = (u, v)
    mat = bpy.data.materials.new("lawn_ground")
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(image_path, check_existing=True)
    tex.extension = "REPEAT"
    bsdf = nodes["Principled BSDF"]
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.95
    bsdf.inputs["Specular IOR Level"].default_value = 0.15
    me.materials.append(mat)
    ob = bpy.data.objects.new("lawn_ground", me)
    scene.collection.objects.link(ob)
    return ob


def _scatter_grass(rng, scene, sources):
    """Grass clumps over the lawn, thick near the eye and thinner further out, clear of the plants' feet."""
    for x0, x1, y0, y1, density in ((-14.0, 14.0, 0.8, 14.0, GRASS_NEAR), (-34.0, 34.0, 14.0, 52.0, GRASS_FAR)):
        for _ in range(int((x1 - x0) * (y1 - y0) * density)):
            x, y = rng.uniform(x0, x1), rng.uniform(y0, y1)
            if abs(x) > 1.0 + (y + 2.0) * 0.75:
                continue
            _copy(scene, rng.choice(sources), (x, y), rng.uniform(0.0, 2 * math.pi), rng.uniform(0.6, 1.25))


def _scatter_drifts(rng, scene, objects):
    """Flower drifts and ferns, each a loose cluster of one kind round a centre."""
    for label, count, radius in DRIFTS:
        source = objects.get(label)
        if source is None:
            continue
        centre = (rng.uniform(-7.0, 7.0), rng.uniform(2.0, 16.0))
        for _ in range(count):
            r, a = radius * math.sqrt(rng.random()), rng.uniform(0.0, 2 * math.pi)
            _copy(scene, source, (centre[0] + r * math.cos(a), centre[1] + r * math.sin(a)), rng.uniform(0.0, 2 * math.pi),
                  rng.uniform(0.85, 1.15))


def _wood_edge(rng, scene, objects):
    """Trees scattered along the far side, so the lawn ends in a wood rather than at the plane's edge."""
    labels, count, xs, ys = WOOD_EDGE
    sources = [objects[label] for label in labels if label in objects]
    for _ in range(count if sources else 0):
        _copy(scene, rng.choice(sources), (rng.uniform(*xs), rng.uniform(*ys)), rng.uniform(0.0, 2 * math.pi),
              rng.uniform(0.9, 1.15))


def _light(scene):
    """A low warm sun and a soft blue sky."""
    sun = bpy.data.objects.new("lawn_sun", bpy.data.lights.new("lawn_sun", "SUN"))
    sun.data.energy, sun.data.color = SUN["energy"], SUN["colour"]
    sun.data.angle = math.radians(SUN["angle_deg"])
    sun.rotation_euler = Vector(SUN["direction"]).normalized().to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(sun)
    world = bpy.data.worlds.new("lawn_sky")
    world.use_nodes = True
    background = world.node_tree.nodes["Background"]
    background.inputs["Color"].default_value = (*SKY[0], 1.0)
    background.inputs["Strength"].default_value = SKY[1]
    scene.world = world


def _camera(scene):
    cam = bpy.data.objects.new("lawn_camera", bpy.data.cameras.new("lawn_camera"))
    cam.data.lens = LENS
    cam.data.clip_start, cam.data.clip_end = 0.05, 300.0
    cam.location = (0.0, -1.0, EYE)
    cam.rotation_euler = (math.radians(85.0), 0.0, 0.0)
    scene.collection.objects.link(cam)
    scene.camera = cam


def render(objects, ground_image, path, seed=7):
    """Render the lawn from `objects` ({asset label: built object}) and the ground texture to `path`, then remove the
    lawn scene and everything made for it."""
    rng = random.Random(seed)
    scene = bpy.data.scenes.new(SCENE)
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 64
    scene.render.resolution_x, scene.render.resolution_y = SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.exposure = 0.2
    _ground(scene, ground_image)
    _light(scene)
    _camera(scene)
    for label, x, y, yaw in PLANTS:
        if label in objects:
            _copy(scene, objects[label], (x, y), math.radians(yaw))
    _wood_edge(rng, scene, objects)
    _scatter_drifts(rng, scene, objects)
    _scatter_grass(rng, scene, [objects[label] for label in GRASS if label in objects])
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True, scene=scene.name)
    _clear(scene)
    return path


def _clear(scene):
    """Remove the lawn scene, its copies, ground, camera, sun and sky; the built assets it copied stay."""
    world = scene.world
    for ob in list(scene.objects):
        data = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        if isinstance(data, bpy.types.Camera):
            bpy.data.cameras.remove(data)
        elif isinstance(data, bpy.types.Light):
            bpy.data.lights.remove(data)
        elif isinstance(data, bpy.types.Mesh) and data.users == 0:
            bpy.data.meshes.remove(data)
    bpy.data.scenes.remove(scene)
    bpy.data.worlds.remove(world)
    for mat in [m for m in bpy.data.materials if m.name.startswith("lawn_ground") and m.users == 0]:
        bpy.data.materials.remove(mat)
