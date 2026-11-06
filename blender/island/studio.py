"""The photo studio the atlas and impostor renders share: a scene of its own beside the assets' scene, with Cycles
on the CPU and a fixed seed so the same input renders the same pixels on every build, a transparent film, 8-bit RGBA
PNG output, a plain white sky and an orthographic camera named <studio>_camera."""

import bpy


def scene(name, samples, bounces, sky=0.0):
    """The studio scene `name`, created on first use and set up on every call; `sky` is the white sky's strength."""
    studio = bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
    studio.render.engine = "CYCLES"
    studio.cycles.device = "CPU"
    studio.cycles.samples = samples
    studio.cycles.use_denoising = False
    studio.cycles.use_adaptive_sampling = False
    studio.cycles.seed = 0
    studio.cycles.max_bounces = bounces
    studio.render.threads_mode = "AUTO"
    studio.render.film_transparent = True
    studio.view_settings.view_transform = "Standard"
    studio.view_settings.look = "None"
    studio.view_settings.exposure = 0.0
    studio.view_settings.gamma = 1.0
    output = studio.render.image_settings
    output.file_format, output.color_mode, output.color_depth = "PNG", "RGBA", "8"
    studio.render.resolution_percentage = 100
    if studio.world is None:
        studio.world = bpy.data.worlds.new(name)
    studio.world.use_nodes = True
    background = studio.world.node_tree.nodes["Background"]
    background.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    background.inputs["Strength"].default_value = sky
    camera = studio.objects.get(name + "_camera")
    if camera is None:
        camera = bpy.data.objects.new(name + "_camera", bpy.data.cameras.new(name + "_camera"))
        studio.collection.objects.link(camera)
    camera.data.type = "ORTHO"
    studio.camera = camera
    return studio


def render(studio, path):
    """Render the studio scene to the PNG at `path`."""
    studio.render.filepath = path
    bpy.ops.render.render(write_still=True, scene=studio.name)


def close(name):
    """Remove the studio scene `name` with its objects, their cameras and lights, and its world if nothing else
    uses it."""
    studio = bpy.data.scenes.get(name)
    if studio is None:
        return
    for ob in list(studio.objects):
        data = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        if isinstance(data, bpy.types.Camera):
            bpy.data.cameras.remove(data)
        elif isinstance(data, bpy.types.Light):
            bpy.data.lights.remove(data)
    world = studio.world
    bpy.data.scenes.remove(studio)
    if world is not None and world.users == 0:
        bpy.data.worlds.remove(world)
