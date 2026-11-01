"""lantern: a hanging iron cage lantern with amber glass. It keeps its palette materials rather than baking to vertex
colours: the site swaps the isl_lantern_glass material on each copy to light the lanterns one by one."""

from island import mesh, parts


def build(seed=7):
    return mesh.finalize("isl_lantern", parts.lantern(), vertex_colors=False)
