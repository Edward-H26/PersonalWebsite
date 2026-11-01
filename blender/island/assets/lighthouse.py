"""lighthouse: the light on the west headland at the end of the lighthouse path (DESIGN.md section 17). A round tower
limewashed over a battered plinth of honey stone, small lit windows climbing it with the stair, a red band under a
corbelled gallery with an iron railing, the lamp room glazed all round in the brand lantern's amber glass, which the
site lights with the other lanterns, under a slate cap with a ball finial and a wind vane; the keeper's cottage of
honey stone under stone tiles leans against its landward side with a chimney, a lit window and the brand lantern at
its door. Origin at the foot of the tower's centre, so the site sets the tower on the lighthouse anchor; the cottage
lies east of it, toward the path from the village."""

import math
import random

from mathutils import Vector

from island import mesh, parts, style

PLINTH_R, PLINTH_H = 2.9, 1.1
BASE_R, TOP_R, BODY_H = 2.55, 2.0, 9.6
BAND = (BODY_H - 1.1, BODY_H - 0.2)
GALLERY_R, LAMP_R, LAMP_H, CAP_H = 2.7, 1.35, 2.2, 1.7
COTTAGE = (2.0, 8.0, -2.6, 2.4)  # x0, x1, y0, y1: east of the tower, its west wall in the tower's flank
COTTAGE_EAVE, COTTAGE_PITCH = 3.0, 50.0
STONES = {"keys": parts.WARM_HONEY_KEYS, "course": (0.28, 0.4), "length": (0.5, 1.0)}
# Honey walls take warm mortar and honey quoins instead of the slate stone's.
HONEY_WALL = {"core_key": "stone_honey_dark", "quoin_keys": parts.HONEY_QUOIN_KEYS}


def build(seed=7):
    rng = random.Random(seed)
    ch = parts.character(seed)
    objs = _tower(rng, ch) + _gallery(rng) + _lamp(rng) + _cottage(rng, ch)
    return mesh.finalize("isl_lighthouse", objs, centre=False)


def _radius(z):
    """The tower body's radius at height z over its plinth."""
    return BASE_R + (TOP_R - BASE_R) * min(1.0, max(0.0, z / BODY_H))


def _tower(rng, ch):
    """The battered stone plinth, the limewashed body with its red band, the door toward the cottage and the windows
    climbing round with the stair."""
    top = PLINTH_H + BODY_H
    objs = [mesh.lathe("plinth_core", [(PLINTH_R + 0.2, 0.0), (PLINTH_R - 0.05, PLINTH_H)], segments=24,
                       mat=parts.mat("stone_honey_dark")),
            parts.stone_ring(PLINTH_R + 0.15, PLINTH_H, rng, radius_top=PLINTH_R - 0.08, course=(0.28, 0.4), length=(0.5, 0.9),
                             keys=parts.WARM_HONEY_KEYS, moss=ch.moss),
            mesh.lathe("plinth_cap", [(PLINTH_R + 0.05, PLINTH_H - 0.02), (PLINTH_R + 0.05, PLINTH_H + 0.12), (BASE_R, PLINTH_H + 0.12)],
                       segments=24, mat=parts.mat("stone_honey_light")),
            mesh.lathe("tower_body", [(BASE_R, PLINTH_H), (_radius(BAND[0]), PLINTH_H + BAND[0])], segments=24, mat=parts.mat("plaster"),
                       cap_bottom=False, cap_top=False),
            mesh.lathe("tower_band", [(_radius(BAND[0]) + 0.01, PLINTH_H + BAND[0]), (_radius(BAND[1]) + 0.01, PLINTH_H + BAND[1])],
                       segments=24, mat=parts.mat("paint_red"), cap_bottom=False, cap_top=False),
            mesh.lathe("tower_neck", [(_radius(BAND[1]), PLINTH_H + BAND[1]), (TOP_R, top)], segments=24, mat=parts.mat("plaster"),
                       cap_bottom=False)]
    door_angle = math.pi / 2
    objs += _on_wall(parts.door(1.0, 2.1, rng, arched=True, frame=False, strap_end="scroll"), door_angle, PLINTH_H, BASE_R)
    objs += _on_wall(parts.arch_surround(1.0, 2.1, rng, ring=0.26, stones=9, key="stone_honey_light"), door_angle, PLINTH_H, BASE_R)
    objs += _on_wall(parts.lantern_bracket(), door_angle - 0.42, PLINTH_H + 2.4, BASE_R)
    for k, z in enumerate((3.3, 5.6, 7.9)):
        angle = door_angle + math.pi * 0.55 * (k + 1)
        objs += _on_wall(parts.window(0.45, 0.8, rng, panes=(1, 2), shutters=(False, False), frame_key="paint_red"), angle,
                         PLINTH_H + z, _radius(z))
    return objs


def _on_wall(objs, angle, z, radius):
    """Place wall-local parts on the tower's curved face at `angle` (0 facing -Y, growing toward +X) and height z."""
    return mesh.transform(objs, mesh.frame(parts.ring_point(radius - 0.02, angle, z), angle))


def _gallery(rng):
    """The corbelled gallery round the top of the tower: a stone corbel ring, the deck and an iron railing."""
    z = PLINTH_H + BODY_H
    objs = [mesh.lathe("gallery_corbel", [(TOP_R, z - 0.7), (TOP_R + 0.35, z - 0.3), (GALLERY_R, z - 0.05), (GALLERY_R, z + 0.15)],
                       segments=24, mat=parts.mat("stone_honey_light")),
            mesh.cylinder("gallery_deck", GALLERY_R, 0.08, at=(0.0, 0.0, z + 0.15), segments=24, mat=parts.mat("iron"))]
    iron = parts.mat("iron")
    posts = 20
    for k in range(posts):
        p = parts.ring_point(GALLERY_R - 0.06, 2 * math.pi * k / posts, z + 0.23)
        objs.append(mesh.rod("railing_post", p, p + Vector((0.0, 0.0, 1.0)), 0.025, iron, segments=4))
    for h in (0.5, 1.0):
        ring = [parts.ring_point(GALLERY_R - 0.06, 2 * math.pi * k / posts, z + 0.23 + h) for k in range(posts)]
        objs.append(parts.rope(ring, 0.03, key="iron", sides=4, closed=True, name="railing"))
    return objs


def _lamp(rng):
    """The lamp room: a short iron drum, eight panes of the lantern's amber glass between iron mullions, an iron
    ring over them, the slate cap, a ball finial and a wind vane."""
    z = PLINTH_H + BODY_H + 0.23
    iron = parts.mat("iron")
    sides = 8
    objs = [mesh.cylinder("lamp_base", LAMP_R + 0.1, 0.5, at=(0.0, 0.0, z), segments=sides, mat=iron, rot=(0, 0, math.pi / sides)),
            mesh.cylinder("lamp_glass", LAMP_R - 0.04, LAMP_H, at=(0.0, 0.0, z + 0.5), segments=sides, mat=style.lantern_glass(),
                          rot=(0, 0, math.pi / sides)),
            mesh.cylinder("lamp_ring", LAMP_R + 0.12, 0.16, at=(0.0, 0.0, z + 0.5 + LAMP_H), segments=sides, mat=iron,
                          rot=(0, 0, math.pi / sides))]
    for k in range(sides):
        corner = parts.ring_point(LAMP_R / math.cos(math.pi / sides), 2 * math.pi * k / sides, z + 0.5)
        objs.append(mesh.rod("lamp_mullion", corner, corner + Vector((0.0, 0.0, LAMP_H)), 0.045, iron, segments=4))
    cap_z = z + 0.5 + LAMP_H + 0.16
    objs += mesh.transform(parts.cone_roof(LAMP_R + 0.35, CAP_H, rng, keys=parts.SLATE_KEYS, exposure=0.3, run=(0.35, 0.6)),
                           mesh.frame((0.0, 0.0, cap_z)))
    tip = Vector((0.0, 0.0, cap_z + CAP_H + 0.15))
    objs += [parts.blob(rng, 0.16, "paint_gold", squash=1.0, at=tip + Vector((0.0, 0.0, 0.15))),
             mesh.rod("vane_spindle", tip, tip + Vector((0.0, 0.0, 1.2)), 0.025, iron, segments=6),
             mesh.box("vane_arrow", (0.9, 0.03, 0.06), at=tip + Vector((0.1, 0.0, 1.0)), mat=iron),
             mesh.box("vane_tail", (0.03, 0.03, 0.3), at=tip + Vector((-0.32, 0.0, 1.0)), mat=parts.mat("paint_gold"))]
    return objs


def _cottage(rng, ch):
    """The keeper's cottage against the tower's landward side: honey stone walls, a door under the brand lantern,
    two lit windows, a stone-tiled roof running back into the tower and a chimney on its far gable."""
    x0, x1, y0, y1 = COTTAGE
    holes = {"front": [(0.4, 0.0, 1.0, 2.1, True), (-1.6, 0.9, 0.6, 1.1, False)],
             "back": [(0.0, 0.9, 0.6, 1.1, False)], "right": [(0.0, 0.9, 0.6, 1.1, False)]}
    objs, frames = parts.stone_storey(x0, x1, y0, y1, 0.0, COTTAGE_EAVE, rng, holes, quoin_sides=(1,), moss={"back": ch.moss},
                                      **HONEY_WALL, **STONES)
    for face, openings in holes.items():
        for hx, hz, hw, hh, door in openings:
            if door:
                objs += parts.place(parts.door(hw, hh, rng, arched=True, frame=False, strap_end="scroll"), frames[face], (hx, 0.0, hz))
                objs += parts.place(parts.arch_surround(hw, hh, rng, ring=0.24, stones=9, key="stone_honey_light"), frames[face],
                                    (hx, 0.0, hz))
                objs += parts.place(parts.lantern_bracket(), frames[face], (hx + hw / 2 + 0.5, -0.06, 2.3))
                objs += parts.place(parts.steps(1, hw + 0.5, 0.14, 0.4, rng), frames[face], (hx, 0.0, 0.0))
            else:
                objs += parts.place(parts.window(hw, hh, rng, panes=(2, 2), stone=True), frames[face], (hx, 0.0, hz))
    span = y1 - y0
    rise = span / 2 * math.tan(math.radians(COTTAGE_PITCH))
    roof = parts.gable_roof(x1 - x0 + 0.2, span, COTTAGE_PITCH, rng, keys=parts.STONE_SLATE_KEYS, exposure=0.22, run=(0.4, 0.9),
                            rafters=0, barges=(False, True), ridge_key="stone_honey_light", moss=(1, ch.moss))
    objs += mesh.transform(roof, mesh.frame((x0 - 0.2, (y0 + y1) / 2, COTTAGE_EAVE)))
    m, w = parts.face_frame("right", x0, x1, y0, y1, COTTAGE_EAVE)
    objs += mesh.transform([mesh.prism("gable_core", w, rise, 0.3, at=(0.0, 0.15, 0.0), mat=parts.mat("stone_honey"))], m)
    objs += mesh.transform(parts.chimney(0.8, 0.7, rise + 1.3, rng, lean_deg=1.0 + ch.lean), mesh.frame((x1 - 0.5, (y0 + y1) / 2 + 0.6,
                                                                                                         COTTAGE_EAVE - 0.4)))
    return objs
