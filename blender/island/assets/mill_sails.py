"""mill_sails: the windmill's four sails on their own (DESIGN.md section 17), so the site can turn them on the
windshaft: the lattice whips with their bars and hemlaths, canvas spread on two and reefed half way on the others,
exactly as they stood on the mill. Origin at the hub where the stocks cross, the windshaft along X like
watermill_wheel's axle. The object carries its mount on mill.glb: the hub's offset from the mill's origin in the
GLB's axes (X east, Y up, Z south when the mill is unturned) and the turn about the up axis that lays its X along the
shaft."""

import math

import bpy
from mathutils import Matrix

from island import mesh
from island.assets import mill

# Turned a quarter round, the sails' own X lies along the mill's windshaft (the mill's Y).
TURN_DEG = 90.0


def build(seed=7):
    body, sails = mill.finished(seed)
    hub = mill.HUB - body.matrix_world.translation
    bpy.data.objects.remove(body, do_unlink=True)
    to_hub = Matrix.Rotation(-math.radians(TURN_DEG), 4, "Z") @ Matrix.Translation(-mill.HUB)
    ob = mesh.finalize("isl_mill_sails", mesh.transform(sails, to_hub), ground=False, centre=False)
    ob["mount"] = {"on": "mill", "offset": [round(v, 3) + 0.0 for v in (hub.x, hub.z, -hub.y)], "rotationY": TURN_DEG,
                   "spinsAbout": "x"}
    return ob
