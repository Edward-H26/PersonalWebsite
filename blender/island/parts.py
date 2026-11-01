"""Architectural and harbor parts built from mesh primitives.

Wall parts use wall-local coordinates: x runs along the face from left to right as seen from outside, the outward
normal is -Y, Z is up and the origin is the bottom centre of the face on the wall plane. face_frame() maps a face
onto a footprint. Windows and doors stand a few centimetres proud of the wall core instead of cutting holes, so
their frames read as deep reveals without boolean operations. Every builder returns a list of objects."""

import collections
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

from island import mesh, style

CHAMFER = 0.018
FACE_YAW = {"front": 0.0, "right": math.pi / 2, "back": math.pi, "left": -math.pi / 2}
SHINGLE_KEYS = (("copper", 0.7), ("plank", 0.2), ("plank_light", 0.1))
SLATE_KEYS = (("roof", 0.7), ("roof_light", 0.3))
TILE_KEYS = (("tile", 0.6), ("tile_light", 0.25), ("tile_dark", 0.15))
STONE_SLATE_KEYS = (("stone_honey", 0.55), ("stone_honey_light", 0.3), ("driftwood", 0.15))
STONE_KEYS = (("stone", 0.58), ("stone_light", 0.27), ("stone_dark", 0.15))
HONEY_KEYS = (("stone_honey", 0.6), ("stone_honey_light", 0.3), ("stone_dark", 0.1))
QUOIN_KEYS = (("stone_light", 0.6), ("stone", 0.4))
HONEY_QUOIN_KEYS = (("stone_honey_light", 0.6), ("stone_honey", 0.4))
# Honey stone without the slate-blue fleck, for the larger honey walls of the Island v2 landmarks.
WARM_HONEY_KEYS = (("stone_honey", 0.6), ("stone_honey_light", 0.3), ("stone_honey_dark", 0.1))
HULL_KEYS = ("hull", "hull_dark", "timber", "plank", "plank_light", "copper")
# Ridge sag per metre of ridge at mid-length; DESIGN.md section 7 asks for 2 to 4 cm.
RIDGE_SAG = 0.02
# One carpenter's rod (DESIGN.md section 9): bays, studs, storeys, jetties, overhangs, windows and doors.
BAY, STUD, STOREY, JETTY, OVERHANG = 1.2, 0.6, 2.4, 0.4, 0.4
WINDOW, DOOR = (0.6, 1.2), (1.0, 2.1)
TUDOR_PLASTER = ("plaster", "plaster_warm")
FACHWERK_PLASTER = ("plaster_ochre", "plaster_rose")
COLMAR_PLASTER = ("plaster_rose", "plaster_sage", "plaster_ochre")
Character = collections.namedtuple("Character", "lean stud wear moss tint flaw")


def mat(key):
    return style.material(key)


def character(seed):
    """The character a seed gives an asset (DESIGN.md section 9): how far its storeys lean, its stud rhythm, its
    roof wear, how much moss grows on its seaward side, which plaster tint it takes and where its deliberate flaw
    falls, so no two instances match."""
    rng = random.Random(seed * 7919 + 13)
    return Character(lean=rng.uniform(0.6, 1.4), stud=STUD * rng.uniform(0.9, 1.1), wear=rng.uniform(0.04, 0.08),
                     moss=rng.uniform(0.15, 0.35), tint=rng.random(), flaw=rng.random())


def chosen(ch, options):
    """The one of `options` where a character's deliberate flaw falls."""
    return options[int(ch.flaw * len(options)) % len(options)]


def tint(ch, options):
    """The plaster tint a character picks from a style's options."""
    return options[int(ch.tint * len(options)) % len(options)]


def pick(rng, weighted):
    """A key drawn from (key, weight) pairs."""
    x = rng.random() * sum(w for _, w in weighted)
    for key, w in weighted:
        x -= w
        if x <= 0:
            return key
    return weighted[-1][0]


def jitter(rng, amount):
    return rng.uniform(-amount, amount)


def face_frame(face, x0, x1, y0, y1, z=0.0):
    """Matrix from wall-local coordinates onto one face of an x0..x1, y0..y1 footprint, and the face's width."""
    cx, cy = (x0 + x1) * 0.5, (y0 + y1) * 0.5
    at, width = {"front": ((cx, y0, z), x1 - x0), "right": ((x1, cy, z), y1 - y0),
                 "back": ((cx, y1, z), x1 - x0), "left": ((x0, cy, z), y1 - y0)}[face]
    return mesh.frame(at, FACE_YAW[face]), width


def place(objs, matrix, at=(0.0, 0.0, 0.0)):
    """Move wall-local parts built around their own origin to `at` on a face whose frame is `matrix`."""
    return mesh.transform(objs, matrix @ Matrix.Translation(Vector(at)))


def lean(objs, base_z, angle_deg, axis="X"):
    """Shear objects so everything above base_z shifts by tan(angle) per metre: towards -Y for axis "X", towards
    +X for axis "Y". Walls and chimneys lean this way without lifting their feet. The shear is baked into each
    object's own mesh because an object transform cannot hold it."""
    t = math.tan(math.radians(angle_deg))
    shear = Matrix.Identity(4)
    if axis == "X":
        shear[1][2] = -t
    else:
        shear[0][2] = t
    z = Matrix.Translation((0.0, 0.0, base_z))
    world = z @ shear @ z.inverted()
    for ob in objs:
        ob.data.transform(ob.matrix_basis.inverted() @ world @ ob.matrix_basis)
    return objs


def add_face(bm, coords, outward, material_index=0):
    """Add a face from coordinates with its normal turned along `outward`."""
    face = bm.faces.new([bm.verts.new(c) for c in coords])
    face.normal_update()
    if face.normal.dot(Vector(outward)) < 0:
        face.normal_flip()
    face.material_index = material_index
    return face


def bar(length, width, depth, key, chamfer=CHAMFER, name="timber"):
    """A timber along local X, `width` tall in Z and `depth` deep towards -Y from y = 0, with its two front edges
    chamfered. Only the five faces that can show are built (10 triangles): the back lies on a wall and the ends
    are always buried in a post, a plate or the core."""
    c = min(chamfer, width * 0.3, depth * 0.3)
    hw = width / 2
    profile = [(0.0, -hw), (-depth + c, -hw), (-depth, -hw + c), (-depth, hw - c), (-depth + c, hw), (0.0, hw)]
    bm = bmesh.new()
    left = [bm.verts.new((-length / 2, y, z)) for y, z in profile]
    right = [bm.verts.new((length / 2, y, z)) for y, z in profile]
    centre = Vector((0.0, -depth / 2, 0.0))
    for i in range(5):
        face = bm.faces.new((left[i], left[i + 1], right[i + 1], right[i]))
        face.normal_update()
        if face.normal.dot(face.calc_center_median() - centre) < 0:
            face.normal_flip()
    return mesh.from_bmesh(name, bm, mat(key))


def member(a, b, size, rng, proud=0.05, key="timber_dark", sink=0.03):
    """A timber on a wall face from (x, z) point a to b, standing `proud` out of the core and sunk `sink` into it."""
    (x0, z0), (x1, z1) = a, b
    out = proud + jitter(rng, 0.005)
    ob = bar(math.hypot(x1 - x0, z1 - z0), size * (1 + jitter(rng, 0.08)), out + sink, key)
    angle = math.atan2(z1 - z0, x1 - x0) + math.radians(jitter(rng, 0.35))
    ob.matrix_world = Matrix.Translation(((x0 + x1) / 2, sink, (z0 + z1) / 2)) @ Matrix.Rotation(-angle, 4, "Y")
    return ob


def patch(x0, x1, z0, z1, rng, key="plaster_warm"):
    """A warm plaster patch standing a few millimetres out of the core between timbers."""
    inset = 0.01 + rng.uniform(0.0, 0.02)
    return mesh.box("patch", (x1 - x0 - inset, 0.016, z1 - z0 - inset), at=((x0 + x1) / 2, 0.0, (z0 + z1) / 2),
                    mat=mat(key))


def timber_wall(width, height, rng, bays=3, openings=None, frame="tudor", sill=0.78, head=2.12, post=0.2, plate=0.18,
                proud=0.05, patch_chance=0.25, door_width=DOOR[0], window_width=WINDOW[0], stud=STUD):
    """A timber-framed face in one of the regional styles of DESIGN.md section 9: "tudor" close studs with curved
    braces in the two corner bays, "fachwerk" a saltire in each closed panel, "colombage" a fine diagonal lattice.
    Sole and top plates, posts between bays, sill and head rails round window and door bays, and plaster patches.
    openings maps a bay index to "window", "door" or "panel" (a plain plaster bay left for pargeting), or to
    (kind, shift) to slide the opening along the bay. A door stands on the floor, so the sole plate stops at it.
    Returns the objects and the openings as (kind, cx, z0, width, height) for the caller."""
    hw = width / 2
    xs = [-hw + width * k / bays for k in range(bays + 1)]
    rail = post * 0.8
    fitted = {}
    for k, spec in (openings or {}).items():
        kind, shift = (spec, 0.0) if isinstance(spec, str) else spec
        left, right = xs[k] + post / 2, xs[k + 1] - post / 2
        cap = door_width if kind == "door" else window_width
        fitted[k] = (kind, (left + right) / 2 + shift, min(cap, right - left - 2 * abs(shift)))
    sole = [-hw]
    for kind, cx, w in fitted.values():
        if kind == "door":
            sole += [cx - w / 2 - 0.02, cx + w / 2 + 0.02]
    sole.append(hw)
    objs = [member((a, plate / 2), (b, plate / 2), plate, rng, proud) for a, b in zip(sole[0::2], sole[1::2])]
    objs.append(member((-hw, height - plate / 2), (hw, height - plate / 2), plate, rng, proud))
    objs += [member((x, plate), (x, height - plate), post, rng, proud) for x in xs[1:-1]]
    holes = []
    for k in range(bays):
        left, right = xs[k] + post / 2, xs[k + 1] - post / 2
        cells = [(plate, height - plate)]
        if k in fitted and fitted[k][0] == "panel":
            holes.append(("panel", (left + right) / 2, plate + 0.08, right - left - 0.12, height - 2 * plate - 0.16))
            continue
        if k in fitted:
            kind, cx, w = fitted[k]
            bottom = sill if kind == "window" else plate
            objs.append(member((left - 0.06, head), (right + 0.06, head), rail, rng, proud - 0.008))
            cells = [(head + rail / 2, height - plate)]
            for s, gap in ((-1, cx - w / 2 - left), (1, right - cx - w / 2)):
                if gap >= 0.2:
                    objs.append(member((cx + s * (w / 2 + 0.08), bottom), (cx + s * (w / 2 + 0.08), head), post * 0.7, rng,
                                       proud - 0.004))
            if kind == "window":
                objs.append(member((left - 0.06, sill), (right + 0.06, sill), rail, rng, proud - 0.008))
                holes.append(("window", cx, sill + rail / 2, w, head - sill - rail))
                cells.append((plate, sill - rail / 2))
            else:
                holes.append(("door", cx, 0.0, w, head - rail / 2))
        elif frame == "tudor" and k in (0, bays - 1):
            objs += _corner_brace(xs[k], xs[k + 1], plate, height - plate, k == 0, post, rng, proud)
        for z0, z1 in cells:
            objs += _infill(frame, left, right, z0, z1, stud, post, rng, proud)
            if z1 - z0 > 0.2 and rng.random() < patch_chance:
                objs.append(patch(left, right, z0, z1, rng))
    return objs, holes


def _infill(frame, x0, x1, z0, z1, stud, post, rng, proud):
    """The timbers inside one panel of a framed face, in the face's regional style."""
    if z1 - z0 < 0.25:
        return []
    if frame == "tudor":
        return _studs(x0, x1, z0, z1, stud, post * 0.6, rng, proud - 0.012)
    if frame == "fachwerk":
        return _cross(x0, x1, z0, z1, post * 0.7, rng, proud - 0.015)
    if frame == "colombage":
        return _lattice(x0, x1, z0, z1, stud, post * 0.45, rng, proud - 0.014)
    return []


def _corner_brace(x0, x1, z0, z1, at_left, post, rng, proud):
    """A curved tension brace in a corner bay of a Tudor face, from high on the corner post down to the sole plate
    at the far side of the bay, bowed into the bay."""
    corner, far = (x0 + post / 2, x1 - post / 2) if at_left else (x1 - post / 2, x0 + post / 2)
    return curved_member((corner, z1 - 0.15), (far, z0 + 0.05), 0.14 if at_left else -0.14, post * 0.85, rng,
                         proud - 0.012)


def curved_member(a, b, bow, size, rng, proud, segments=3):
    """A curved timber on a wall face from (x, z) point a to b, bulging `bow` to the left of the a-to-b direction,
    built from short straight pieces that overlap at their joints."""
    a, b = Vector(a), Vector(b)
    d = b - a
    n = Vector((-d.y, d.x)).normalized()
    points = [a + d * (i / segments) + n * (bow * 4 * (i / segments) * (1 - i / segments)) for i in range(segments + 1)]
    pieces = []
    for p, q in zip(points, points[1:]):
        e = (q - p).normalized() * size * 0.3
        pieces.append(member(tuple(p - e), tuple(q + e), size, rng, proud))
    return pieces


def _lattice(x0, x1, z0, z1, spacing, size, rng, proud):
    """A fine diagonal lattice across a panel: braces at 45 degrees both ways, `spacing` apart, clipped to it."""
    objs = []
    step = spacing * math.sqrt(2)
    for sign in (1, -1):
        c = x0 - (z1 - z0) + step / 2 if sign == 1 else x0 + step / 2
        end = x1 if sign == 1 else x1 + (z1 - z0)
        while c < end:
            lo, hi = sorted((z0 + sign * (x0 - c), z0 + sign * (x1 - c)))
            za, zb = max(z0, lo), min(z1, hi)
            if zb - za > 0.12:
                objs.append(member((c + sign * (za - z0), za), (c + sign * (zb - z0), zb), size, rng, proud))
            c += step
    return objs


def _studs(x0, x1, z0, z1, spacing, size, rng, proud):
    """Upright studs about `spacing` apart filling a panel between x0 and x1."""
    count = max(1, round((x1 - x0) / spacing))
    return [member((x, z0), (x, z1), size, rng, proud) for x in (x0 + (x1 - x0) * i / count for i in range(1, count))]


def post_pad(x, y, size=0.34, height=0.1):
    """The stone pad a free-standing post lands on (DESIGN.md section 9: posts stand on stone)."""
    return mesh.box("post_pad", (size, size, height), at=(x, y, 0.0), origin="bottom", mat=mat("stone_light"))


def _cross(x0, x1, z0, z1, size, rng, proud):
    """A St Andrew's cross of two timbers filling a panel."""
    return [member((x0, z0), (x1, z1), size, rng, proud), member((x0, z1), (x1, z0), size, rng, proud - 0.004)]


def corner_posts(x0, x1, y0, y1, z0, z1, rng, size=0.26, proud=0.05, key="timber_dark"):
    """Square posts standing proud of both faces at the four corners of a storey."""
    objs = []
    for cx, sx in ((x0, 1), (x1, -1)):
        for cy, sy in ((y0, 1), (y1, -1)):
            s = size * (1 + jitter(rng, 0.06))
            centre = (cx + sx * (s / 2 - proud), cy + sy * (s / 2 - proud), (z0 + z1) / 2)
            objs.append(mesh.box("corner_post", (s, s, z1 - z0), at=centre, mat=mat(key), bevel=0.015))
    return objs


def timber_storey(x0, x1, y0, y1, z0, height, rng, faces, core_key="plaster", post=0.2):
    """A plaster core with timber framing. faces maps "front", "right", "back" or "left" to timber_wall keyword
    arguments; returns the objects and, per face, (matrix, openings, width) for placing windows and doors."""
    objs = [mesh.box("core", (x1 - x0, y1 - y0, height), at=((x0 + x1) / 2, (y0 + y1) / 2, z0),
                     mat=mat(core_key), origin="bottom")]
    objs += corner_posts(x0, x1, y0, y1, z0, z0 + height, rng, size=post * 1.3)
    placed = {}
    for face, spec in faces.items():
        m, width = face_frame(face, x0, x1, y0, y1, z0)
        wall, holes = timber_wall(width, height, rng, post=post, **spec)
        objs += mesh.transform(wall, m)
        placed[face] = (m, holes, width)
    return objs, placed


def stone_face(width, height, rng, openings=(), course=(0.26, 0.4), length=(0.45, 1.0), gap=0.022,
               relief=(0.006, 0.028), keys=STONE_KEYS, moss=0.0):
    """Rough stone courses on a face as one object: each stone is a slightly tilted quad standing proud of the
    mortar-coloured core in one of the stone tones. openings are (cx, z0, width, height, arched) holes; a `moss`
    share of the stones in the lowest courses turn green."""
    bm = bmesh.new()
    index = {key: i for i, (key, _) in enumerate(keys)}
    z = 0.0
    while z < height - 0.04:
        h = rng.uniform(*course)
        if height - (z + h) < 0.14:
            h = height - z
        for a, b in _free_spans(-width / 2, width / 2, z, z + h, openings):
            x = a
            while b - x > 0.06:
                step = rng.uniform(*length)
                if b - (x + step) < 0.22:
                    step = b - x
                green = moss and rng.random() < moss * max(0.0, 1.0 - z / 0.8)
                _stone(bm, x + gap / 2, x + step - gap / 2, z + gap / 2, z + h - gap / 2, rng, relief,
                       len(keys) if green else index[pick(rng, keys)])
                x += step
        z += h
    return mesh.from_bmesh("stones", bm, [mat(k) for k, _ in keys] + ([mat("moss")] if moss else []))


def stone_patch(x0, x1, z0, z1, rng, inside, course=(0.26, 0.4), length=(0.45, 1.0), gap=0.022, relief=(0.006, 0.028),
                keys=STONE_KEYS):
    """Rough stone courses like stone_face's over the x0..x1, z0..z1 rectangle of a face, keeping only the stones whose
    four corners all pass inside(x, z): masonry for faces whose outline is not a rectangle, such as a bridge's side
    between its deck and its arch."""
    bm = bmesh.new()
    index = {key: i for i, (key, _) in enumerate(keys)}
    z = z0
    while z < z1 - 0.04:
        h = min(rng.uniform(*course), z1 - z)
        x = x0
        while x1 - x > 0.06:
            step = min(rng.uniform(*length), x1 - x)
            corners = ((x, z), (x + step, z), (x, z + h), (x + step, z + h))
            key = index[pick(rng, keys)]
            if all(inside(cx, cz) for cx, cz in corners):
                _stone(bm, x + gap / 2, x + step - gap / 2, z + gap / 2, z + h - gap / 2, rng, relief, key)
            x += step
        z += h
    return mesh.from_bmesh("stones", bm, [mat(k) for k, _ in keys])


def _stone(bm, x0, x1, z0, z1, rng, relief, material_index):
    d = rng.uniform(*relief)
    corners = [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]
    coords = [(x + jitter(rng, 0.012), -max(0.003, d + jitter(rng, 0.006)), z + jitter(rng, 0.01)) for x, z in corners]
    add_face(bm, coords, (0, -1, 0), material_index)


def _free_spans(xa, xb, z0, z1, openings, ring=0.32):
    """The parts of [xa, xb] that a course between z0 and z1 may fill around the openings and their surrounds."""
    blocked = []
    for cx, oz, w, h, arched in openings:
        if arched:
            spring, radius = oz + h - w / 2, w / 2 + ring
            if z1 <= oz or z0 >= spring + radius:
                continue
            half = math.sqrt(max(0.0, radius ** 2 - (z0 - spring) ** 2)) if z0 > spring else radius
        else:
            if z1 <= oz - 0.1 or z0 >= oz + h + 0.2:
                continue
            half = w / 2 + 0.08
        blocked.append((cx - half, cx + half))
    spans = [(xa, xb)]
    for b0, b1 in blocked:
        spans = [piece for s0, s1 in spans for piece in ((s0, min(s1, b0)), (max(s0, b1), s1))
                 if piece[1] - piece[0] > 0.05]
    return spans


def quoins(x0, x1, y0, y1, z0, height, rng, proud=0.035, course=(0.3, 0.42), long=0.62, short=0.36, sides=(-1, 1),
           ends=(-1, 1), keys=QUOIN_KEYS):
    """Corner stones alternating long and short faces up the corners of a stone storey on the x0 (-1) and x1 (+1)
    sides and the y0 (-1) and y1 (+1) ends asked for; corners hidden inside a neighbouring block are left out."""
    objs = []
    for cx, sx in [(x0, 1)] * (-1 in sides) + [(x1, -1)] * (1 in sides):
        for cy, sy in [(y0, 1)] * (-1 in ends) + [(y1, -1)] * (1 in ends):
            z, flip = z0, rng.random() < 0.5
            while z < z0 + height - 0.1:
                h = min(rng.uniform(*course), z0 + height - z)
                lx, ly = (long, short) if flip else (short, long)
                lx, ly = lx + jitter(rng, 0.06), ly + jitter(rng, 0.06)
                out = proud + jitter(rng, 0.01)
                centre = (cx + sx * (lx / 2 - out), cy + sy * (ly / 2 - out), z + h / 2)
                key = pick(rng, keys)
                objs.append(mesh.box("quoin", (lx, ly, h - 0.02), at=centre, mat=mat(key)))
                z += h
                flip = not flip
    return objs


def stone_storey(x0, x1, y0, y1, z0, height, rng, faces, core_key="stone_dark", quoin_sides=(-1, 1), quoin_ends=(-1, 1),
                 moss=None, quoin_keys=QUOIN_KEYS, **stone_kwargs):
    """A mortar-coloured core faced with rough stone courses and quoins. faces maps a face name to its openings
    (cx, z0, width, height, arched) in wall-local coordinates; stone_kwargs go to stone_face. Returns the
    objects and each face's matrix."""
    objs = [mesh.box("core", (x1 - x0, y1 - y0, height), at=((x0 + x1) / 2, (y0 + y1) / 2, z0),
                     mat=mat(core_key), origin="bottom")]
    frames = {}
    for face, openings in faces.items():
        m, width = face_frame(face, x0, x1, y0, y1, z0)
        objs += mesh.transform([stone_face(width, height, rng, openings, moss=(moss or {}).get(face, 0.0), **stone_kwargs)], m)
        frames[face] = m
    objs += quoins(x0, x1, y0, y1, z0, height, rng, sides=quoin_sides, ends=quoin_ends, keys=quoin_keys)
    return objs, frames


def shutter_sides(holes, cx, width, face_width):
    """Fold a shutter back on a side only where it stays on the face and clear of the other openings and the
    shutters those may fold back."""
    def clear(s):
        a, b = sorted((cx + s * width / 2, cx + s * (width + 0.12)))
        if a < -face_width / 2 or b > face_width / 2:
            return False
        for kind, other, _, w, _ in holes:
            reach = w / 2 + (w / 2 + 0.12 if kind == "window" else 0.0)
            if other != cx and b > other - reach and a < other + reach:
                return False
        return True
    return clear(-1), clear(1)


def dress(placed, rng, window_kwargs=None, door_kwargs=None, leaded=()):
    """Windows, doors and pargeted panels for every opening timber_storey returned; windows on the faces named in
    `leaded` get diamond leaded lights. Returns the objects and each door as (face matrix, cx, width, height) so
    steps, lanterns and carving can be set round it."""
    objs, doors = [], []
    for face, (m, holes, face_width) in placed.items():
        for kind, cx, z0, w, h in holes:
            if kind == "door":
                objs += place(door(w, h, rng, **(door_kwargs or {})), m, (cx, 0.0, z0))
                doors.append((m, cx, w, h))
            elif kind == "panel":
                objs += place(pargeting(w, h), m, (cx, 0.0, z0))
            else:
                kwargs = {"shutters": shutter_sides(holes, cx, w, face_width), "leaded": face in leaded,
                          **(window_kwargs or {})}
                objs += place(window(w, h, rng, **kwargs), m, (cx, 0.0, z0))
    return objs, doors


def plate(name, width, height, at, key):
    """A flat quad facing -Y: straps and hinges that only need a face (2 triangles)."""
    x, y, z = at
    bm = bmesh.new()
    add_face(bm, ((x - width / 2, y, z - height / 2), (x + width / 2, y, z - height / 2),
                  (x + width / 2, y, z + height / 2), (x - width / 2, y, z + height / 2)), (0, -1, 0))
    return mesh.from_bmesh(name, bm, mat(key))


def _closed_ring(name, outer, inner, y_front, y_back, key):
    """A closed frame between an outer and an inner rectangle, each (x0, z0, x1, z1), from y_front to y_back."""
    bm = bmesh.new()

    def loop(rect, y):
        x0, z0, x1, z1 = rect
        return [bm.verts.new(c) for c in ((x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1))]

    outer_front, inner_front = loop(outer, y_front), loop(inner, y_front)
    outer_back, inner_back = loop(outer, y_back), loop(inner, y_back)
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((outer_front[i], outer_front[j], inner_front[j], inner_front[i]))
        bm.faces.new((outer_back[j], outer_back[i], inner_back[i], inner_back[j]))
        bm.faces.new((outer_front[j], outer_front[i], outer_back[i], outer_back[j]))
        bm.faces.new((inner_front[i], inner_front[j], inner_back[j], inner_back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh.from_bmesh(name, bm, mat(key))


def _pane(width, height, material, y=-0.012):
    bm = bmesh.new()
    hw = width / 2
    add_face(bm, ((-hw, y, 0.0), (hw, y, 0.0), (hw, y, height), (-hw, y, height)), (0, -1, 0))
    return mesh.from_bmesh("pane", bm, material)


def window(width, height, rng, panes=(2, 2), lit=True, shutters=(True, True), frame_key="timber",
           shutter_key="plank", stone=False, leaded=False, cracked=False):
    """A window standing proud of the wall (wall-local, origin at the bottom centre of the opening): casing,
    glass that glows amber when lit, glazing bars or, with leaded=True, diamond leaded lights, a sill, plank shutters
    folded back slightly ajar on the (left, right) sides asked for and, on stone walls, a stone lintel and sill; a
    cracked lintel is the building's deliberate imperfection."""
    border = 0.07
    hw = width / 2
    objs = [_closed_ring("casing", (-hw - border, -border, hw + border, height + border), (-hw, 0.0, hw, height),
                         -0.075, 0.02, frame_key),
            _pane(width, height, style.window_glass() if lit else mat("glass"))]
    if leaded:
        objs.append(_leading(width, height))
    else:
        cols, rows = panes
        objs += [mesh.box("glazing_bar", (0.035, 0.03, height), at=(-hw + width * i / cols, -0.03, height / 2),
                          mat=mat(frame_key)) for i in range(1, cols)]
        objs += [mesh.box("glazing_bar", (width, 0.03, 0.035), at=(0.0, -0.03, height * j / rows),
                          mat=mat(frame_key)) for j in range(1, rows)]
    sill_key = "stone_light" if stone else frame_key
    objs.append(mesh.box("sill", (width + 2 * border + 0.14, 0.15, 0.065), at=(0.0, -0.06, -border - 0.03),
                         rot=(0, math.radians(jitter(rng, 0.6)), 0), mat=mat(sill_key)))
    if stone:
        objs += _lintel(width + 2 * border + 0.24, height + border + 0.1, cracked)
    for side, wanted in zip((-1, 1), shutters):
        if wanted:
            objs += _shutter(width / 2 + border, height + 2 * border, side, rng, shutter_key,
                             (side * (hw + border + 0.01), -0.045, -border))
    return objs


def _lintel(length, z, cracked):
    """A stone lintel over an opening; a cracked one has split near the middle and its right half has dropped."""
    if not cracked:
        return [mesh.box("lintel", (length, 0.08, 0.2), at=(0.0, -0.035, z), mat=mat("stone_light"))]
    split = length * 0.08
    left = mesh.box("lintel", (length / 2 + split - 0.008, 0.08, 0.2), at=(-length / 4 + split / 2 - 0.004, -0.035, z),
                    mat=mat("stone_light"))
    right = mesh.box("lintel", (length / 2 - split - 0.008, 0.08, 0.2),
                     at=(length / 4 + split / 2 + 0.004, -0.035, z - 0.012), rot=(0, math.radians(-2.5), 0),
                     mat=mat("stone_light"))
    return [left, right]


def _leading(width, height, size=0.15, came=0.013):
    """Diamond leaded lights: thin dark cames at 60 degrees both ways across a pane, clipped to it, as one object."""
    bm = bmesh.new()
    hw = width / 2
    for theta in (math.radians(60), math.radians(120)):
        d = Vector((math.cos(theta), math.sin(theta)))
        n = Vector((-d.y, d.x))
        corners = [Vector((x, z)) for x in (-hw, hw) for z in (0.0, height)]
        lo, hi = min(n.dot(c) for c in corners), max(n.dot(c) for c in corners)
        offset = lo + size / 2
        while offset < hi:
            span = _clip(n * offset, d, -hw, hw, 0.0, height)
            if span:
                a, b = n * offset + d * span[0], n * offset + d * span[1]
                w = n * (came / 2)
                quad = [(p.x, -0.022, p.y) for p in (a - w, b - w, b + w, a + w)]
                add_face(bm, quad, (0.0, -1.0, 0.0))
            offset += size
    return mesh.from_bmesh("leading", bm, mat("iron"))


def _clip(p, d, x0, x1, z0, z1):
    """The (t0, t1) range of the line p + t d inside a rectangle, or None when it misses it."""
    t0, t1 = -math.inf, math.inf
    for pc, dc, lo, hi in ((p.x, d.x, x0, x1), (p.y, d.y, z0, z1)):
        if abs(dc) < 1e-9:
            if not lo <= pc <= hi:
                return None
            continue
        a, b = sorted(((lo - pc) / dc, (hi - pc) / dc))
        t0, t1 = max(t0, a), min(t1, b)
    return (t0, t1) if t1 - t0 > 0.02 else None


def _shutter(leaf_width, leaf_height, side, rng, key, hinge):
    """One plank shutter folded back beside its window and swung a few degrees off the wall: a slab with board
    joints, two ledges and iron straps."""
    x = side * leaf_width / 2
    objs = [mesh.box("shutter", (leaf_width, 0.03, leaf_height + jitter(rng, 0.015)), at=(x, 0.0, leaf_height / 2),
                     mat=mat(key))]
    for i in (1, 2):
        objs.append(plate("shutter_joint", 0.012, leaf_height * 0.98, (side * leaf_width * i / 3, -0.0155, leaf_height / 2),
                          "timber_dark"))
    for z in (0.2, 0.8):
        objs.append(plate("shutter_ledge", leaf_width - 0.05, 0.08, (x, -0.0165, leaf_height * z), "timber"))
        objs.append(plate("shutter_strap", leaf_width * 0.7, 0.03, (side * leaf_width * 0.35, -0.018, leaf_height * z), "iron"))
    swing = math.radians(rng.uniform(3.0, 10.0)) * -side
    return mesh.transform(objs, Matrix.Translation(Vector(hinge)) @ Matrix.Rotation(swing, 4, "Z"))


def extrude_xz(name, points, y0, y1, key):
    """A slab from a polygon in the XZ plane, extruded from y0 to y1; key is a palette key or a material."""
    bm = bmesh.new()
    front = [bm.verts.new((x, y0, z)) for x, z in points]
    back = [bm.verts.new((x, y1, z)) for x, z in points]
    bm.faces.new(front)
    bm.faces.new(back[::-1])
    n = len(points)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], back[i], back[j], front[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh.from_bmesh(name, bm, mat(key) if isinstance(key, str) else key)


def _door_top(x, width, height, arched):
    if not arched:
        return height
    spring = height - width / 2
    return spring + math.sqrt(max(0.0, (width / 2) ** 2 - x * x))


def _strap_length(z, width, height, arched):
    """How long an iron strap at height z can run across the door; under an arch it shortens with the curve."""
    above_spring = z - (height - width / 2)
    if not arched or above_spring <= 0:
        return width - 0.1
    return 2 * math.sqrt(max(0.0, (width / 2) ** 2 - above_spring ** 2)) - 0.12


def _door_outline(x0, x1, width, height, arched, samples=4):
    top = [(x1 - (x1 - x0) * i / samples, _door_top(x1 - (x1 - x0) * i / samples, width, height, arched))
           for i in range(samples + 1)]
    return [(x0, 0.0), (x1, 0.0)] + top


def door(width, height, rng, arched=False, leaf_key="plank", frame_key="timber", frame=True, strap_end="arrow"):
    """A plank door (wall-local, origin at the bottom centre of the opening): uneven boards over a dark backing,
    iron straps ending in an arrowhead or a scroll, a ring handle and, unless frame is False, a timber casing.
    arched=True rounds the top; the stone arch around it is arch_surround's job."""
    objs = [extrude_xz("door_backing", _door_outline(-width / 2, width / 2, width, height, arched, 8), -0.008,
                        -0.004, "timber_dark")]
    boards = max(3, round(width / 0.19))
    bw = width / boards
    for i in range(boards):
        x0, x1 = -width / 2 + i * bw + 0.005, -width / 2 + (i + 1) * bw - 0.005
        y0 = -0.05 - rng.uniform(0.0, 0.012)
        objs.append(extrude_xz("door_board", _door_outline(x0, x1, width, height - 0.005, arched), y0, -0.008, leaf_key))
    straps = (0.22, 0.6) if arched else (0.18, 0.5, 0.82)
    for z in straps:
        z *= height
        reach = _strap_length(z, width, height, arched)
        objs.append(mesh.box("door_strap", (reach, 0.012, 0.055), at=(-width / 2 + 0.05 + reach / 2, -0.066, z),
                             mat=mat("iron")))
        objs += _strap_end(-width / 2 + 0.05 + reach, z, strap_end)
    objs += ring_handle((width / 2 - 0.16, -0.07, 1.0))
    if frame:
        objs.append(mesh.box("door_jamb", (0.12, 0.1, height + 0.08), at=(-width / 2 - 0.05, -0.04, (height + 0.08) / 2),
                             mat=mat(frame_key), bevel=0.012))
        objs.append(mesh.box("door_jamb", (0.12, 0.1, height + 0.08), at=(width / 2 + 0.05, -0.04, (height + 0.08) / 2),
                             mat=mat(frame_key), bevel=0.012))
        objs.append(mesh.box("door_head", (width + 0.34, 0.12, 0.16), at=(0.0, -0.05, height + 0.08),
                             mat=mat(frame_key), bevel=0.012))
    return objs


def _strap_end(x, z, kind):
    """The end of an iron door strap at (x, z): an arrowhead, or a pair of flat curls for a scrolled strap."""
    if kind == "scroll":
        return [_curl((x, z + s * 0.035), 0.035, 0.01, -s * math.pi / 2, 0.85) for s in (-1, 1)]
    dart = [(x - 0.01, z - 0.042), (x + 0.085, z), (x - 0.01, z + 0.042), (x + 0.018, z)]
    return [extrude_xz("strap_arrow", dart, -0.072, -0.06, "iron")]


def _curl(centre, r0, r1, start, turns, width=0.014, samples=5):
    """A flat iron curl on a door face: a band `width` wide following a spiral round `centre` in the XZ plane,
    its radius shrinking from r0 to r1."""
    cx, cz = centre
    line = []
    for i in range(samples + 1):
        f = i / samples
        r, a = r0 + (r1 - r0) * f, start + 2 * math.pi * turns * f
        line.append(Vector((cx + r * math.cos(a), cz + r * math.sin(a))))
    left, right = [], []
    for i, p in enumerate(line):
        t = (line[min(i + 1, samples)] - line[max(i - 1, 0)]).normalized()
        n = Vector((-t.y, t.x)) * (width / 2)
        left.append(tuple(p + n))
        right.append(tuple(p - n))
    return extrude_xz("strap_scroll", left + right[::-1], -0.072, -0.06, "iron")


def ring_handle(at, radius=0.06, tube=0.011):
    """An iron ring pull hanging from a round backplate, facing -Y."""
    profile = [(radius + tube * math.cos(2 * math.pi * k / 4), tube * math.sin(2 * math.pi * k / 4)) for k in range(5)]
    ring = mesh.lathe("ring_handle", profile, segments=8, mat=mat("iron"), cap_bottom=False, cap_top=False)
    ring.matrix_world = (Matrix.Translation(Vector(at) + Vector((0.0, -0.01, -radius)))
                         @ Matrix.Rotation(math.pi / 2, 4, "X"))
    backplate = mesh.cylinder("handle_plate", 0.05, 0.012, at=Vector(at) + Vector((0.0, 0.006, 0.0)),
                              rot=(math.pi / 2, 0, 0), mat=mat("iron"), segments=8)
    return [ring, backplate]


def arch_surround(width, height, rng, ring=0.3, stones=9, key="stone_light"):
    """Voussoirs with a proud keystone around an arched opening and jamb stones down to the ground (wall-local)."""
    spring = height - width / 2
    ri, ro = width / 2 + 0.02, width / 2 + ring
    objs = []
    for k in range(stones):
        a0, a1 = math.pi * k / stones + 0.012, math.pi * (k + 1) / stones - 0.012
        rk = ro + (0.1 if k == stones // 2 else 0.0) + jitter(rng, 0.025)
        face = [(ri * math.cos(a0), spring + ri * math.sin(a0)), (rk * math.cos(a0), spring + rk * math.sin(a0)),
                (rk * math.cos(a1), spring + rk * math.sin(a1)), (ri * math.cos(a1), spring + ri * math.sin(a1))]
        front = -0.06 - rng.uniform(0.0, 0.02) - (0.03 if k == stones // 2 else 0.0)
        objs.append(mesh.hexa("voussoir", [(x, front, z) for x, z in face] + [(x, 0.02, z) for x, z in face], mat(key)))
    for side in (-1, 1):
        z, wide = 0.0, rng.random() < 0.5
        while z < spring - 0.05:
            h = min(rng.uniform(0.3, 0.42), spring - z)
            w = ring + (0.1 if wide else -0.06)
            x = side * (ri + w / 2)
            objs.append(mesh.box("jamb_stone", (w, 0.08, h - 0.02), at=(x, -0.02, z + h / 2), mat=mat(key)))
            z += h
            wide = not wide
    return objs


def steps(count, width, rise, tread, rng, key="stone_light", wear=0.035):
    """Stone steps up to a door (wall-local): the lowest is the widest and stands farthest out, and every tread is
    worn hollow along its front edge where people have walked."""
    objs = []
    for i in range(count):
        depth = tread * (count - i)
        w = width + 0.16 * (count - i - 1) + jitter(rng, 0.03)
        step = _worn_step(w, depth, rise * i, rise * (i + 1), wear * rng.uniform(0.7, 1.2), key)
        step.location = (jitter(rng, 0.02), 0.02, 0.0)
        step.rotation_euler = (0.0, 0.0, math.radians(jitter(rng, 0.8)))
        objs.append(step)
    return objs


def _worn_step(width, depth, z0, z1, wear, key):
    """One step lofted across its width: its tread dips towards the middle of the front edge."""
    rings = []
    for x in (-width / 2, -width / 4, 0.0, width / 4, width / 2):
        dip = wear * math.cos(math.pi * x / width) ** 2
        rings.append([(x, 0.0, z0), (x, -depth, z0), (x, -depth, z1 - dip), (x, -depth * 0.5, z1 - dip * 0.6),
                      (x, 0.0, z1)])
    return mesh.loft("step", rings, mat=mat(key))


def slope_point(span, pitch_deg, side, u, s, t=0.0):
    """A point on a gable_roof slope in roof-local coordinates: u along the ridge, s down the slope from the ridge,
    t out of the deck's underside; side -1 is the slope facing -Y."""
    p = math.radians(pitch_deg)
    return (Vector((u, 0.0, span / 2 * math.tan(p))) + s * Vector((0.0, side * math.cos(p), -math.sin(p)))
            + t * Vector((0.0, side * math.sin(p), math.cos(p))))


def gable_roof(length, span, pitch_deg, rng, keys=SHINGLE_KEYS, eave=OVERHANG, gable=OVERHANG, exposure=0.24,
               thickness=0.035, run=(0.35, 0.9), missing=0.05, ridge_key="timber", barge_key="timber",
               rafters=0.75, extent=None, barges=(True, True), barge_size=(0.26, 0.05), sides=(-1, 1), carved=False,
               moss=None):
    """A gable roof in roof-local coordinates: the ridge runs along X from 0 to `length` above Y = 0 and the wall
    plates sit at Z = 0, Y = ±span/2. Each slope is a timber deck under stepped rows of shingles or slates laid in
    runs with thin joints and a few missing pieces; a ridge cap, crossed bargeboards and rafter tails finish it.
    extent(z) may return the (u_min, u_max) a row at height z above the plates may cover, which stops a wing's
    roof against the main roof in a valley; barges says which gable ends (start, end) get bargeboards, each
    barge_size (depth across the slope, thickness), with carved=True a scalloped lower edge; rafters is the
    spacing of the rafter tails (0 for none); sides=(1,) builds a single lean-to slope; moss=(side, share) greens
    that share of one slope's pieces, most towards the eave."""
    p = math.radians(pitch_deg)
    slope = (span / 2 + eave) / math.cos(p)
    deck = 0.06
    lift = deck + 2.4 * thickness

    def limits(z):
        lo, hi = -gable, length + gable
        if extent:
            e0, e1 = extent(z)
            lo, hi = max(lo, e0), min(hi, e1)
        return lo, hi

    def height(s, t):
        return span / 2 * math.tan(p) - s * math.sin(p) + t * math.cos(p)

    objs = []
    for side in sides:
        def at(u, s, t, side=side):
            return slope_point(span, pitch_deg, side, u, s, t)

        d = Vector((0.0, side * math.cos(p), -math.sin(p)))
        n = Vector((0.0, side * math.sin(p), math.cos(p)))
        r0, r1 = limits(height(0.0, deck))
        e0, e1 = limits(height(slope, deck))
        objs.append(_strip("roof_deck", at, (r0, r1), (e0, e1), ((0.0, deck), (0.0, 0.0), (slope, 0.0), (slope, deck)),
                           mat("timber_dark")))
        green = moss[1] if moss and moss[0] == side else 0.0
        objs.append(_roof_rows(at, d, n, slope, deck, keys, exposure, thickness, run, missing, rng,
                               lambda s: limits(height(s, lift)), green))
        c0, c1 = limits(height(0.0, lift))
        objs.append(_strip("ridge_cap", at, (c0, c1), (c0, c1),
                           ((-0.03, lift), (0.26, lift), (0.26, lift + 0.045), (-0.03, lift + 0.045)), mat(ridge_key)))
        for end, wanted in zip((-gable - 0.03, length + gable + 0.03), barges):
            if wanted:
                depth, thick = barge_size
                shift = Vector((thick if end > 0 else -thick, 0.0, 0.0))
                if carved:
                    objs.append(_carved_barge(at, end, -0.3, slope + 0.02, lift + 0.06, depth, shift, barge_key))
                    continue
                face = [at(end, -0.3, lift + 0.06 - depth), at(end, slope + 0.02, lift + 0.06 - depth),
                        at(end, slope + 0.02, lift + 0.06), at(end, -0.3, lift + 0.06)]
                objs.append(mesh.hexa("bargeboard", face + [c + shift for c in face], mat(barge_key), bevel=0.012))
        if rafters:
            wall = span / 2 / math.cos(p)
            t0, t1 = limits(height(wall, -0.15))
            u = 0.3
            while u < length - 0.25:
                if t0 < u < t1:
                    tail = [at(u - 0.05, wall - 0.3, -0.15), at(u + 0.05, wall - 0.3, -0.15),
                            at(u + 0.05, slope - 0.04, -0.15), at(u - 0.05, slope - 0.04, -0.15)]
                    objs.append(mesh.hexa("rafter_tail", tail + [c + n * 0.15 for c in tail], mat("timber")))
                u += rafters
    return objs


def _strip(name, at, upper, lower, corners, material, spacing=2.5):
    """A slab on a roof slope from u0 to u1 along its upper edge and l0 to l1 along its lower edge, its section
    traced by four (s, t) corners; the side from the last corner back to the first is never seen and left open.
    It is cut every `spacing` along the ridge so it bends with bow()."""
    (u0, u1), (l0, l1) = upper, lower
    top = min(s for s, _ in corners)
    count = max(1, round(max(u1 - u0, l1 - l0) / spacing))
    rings = []
    for k in range(count + 1):
        f = k / count
        ua, ub = u0 + (u1 - u0) * f, l0 + (l1 - l0) * f
        rings.append([at(ua if s == top else ub, s, t) for s, t in corners])
    bm = bmesh.new()
    for a, b in zip(rings, rings[1:]):
        centre = sum(a + b, Vector()) / 8
        for i in range(3):
            quad = (a[i], a[i + 1], b[i + 1], b[i])
            add_face(bm, quad, sum(quad, Vector()) / 4 - centre)
    for ring, sign in ((rings[0], -1), (rings[-1], 1)):
        add_face(bm, ring, (rings[-1][0] - rings[0][0]) * sign)
    return mesh.from_bmesh(name, bm, material)


def _carved_barge(at, u, s0, s1, top, depth, shift, key, scallop=0.3):
    """A bargeboard whose lower edge is cut into scallops: a slab in the gable plane at u, thickened by `shift` along
    the ridge, its face towards the roof left out."""
    count = max(2, round((s1 - s0) / scallop))
    outline = [(s0, top), (s1, top)]
    for i in range(count, 0, -1):
        a, b = s0 + (s1 - s0) * i / count, s0 + (s1 - s0) * (i - 1) / count
        outline += [(a + (b - a) * f, top - depth + depth * 0.5 * math.sin(math.pi * f)) for f in (0.0, 0.25, 0.5, 0.75)]
    outline.append((s0, top - depth))
    inner = [at(u, s, t) for s, t in outline]
    outer = [p + shift for p in inner]
    centre = at(u, sum(s for s, _ in outline) / len(outline), sum(t for _, t in outline) / len(outline))
    bm = bmesh.new()
    add_face(bm, outer, shift)
    for i in range(len(outline)):
        j = (i + 1) % len(outline)
        add_face(bm, (inner[i], inner[j], outer[j], outer[i]), (inner[i] + inner[j]) / 2 - centre)
    return mesh.from_bmesh("bargeboard", bm, mat(key))


def _roof_rows(at, d, n, slope, deck, keys, exposure, thickness, run, missing, rng, limits, moss=0.0):
    """Stepped rows of one slope as a single object. Each run is an open board, only its top and lower edge: the
    ends hide in the joints, under the bargeboards or inside the roof they meet. A `moss` share of the pieces turn
    green, more of them towards the eave."""
    bm = bmesh.new()
    index = {key: i for i, (key, _) in enumerate(keys)}

    def piece(s):
        if moss and rng.random() < moss * (0.4 + 0.8 * s / slope):
            return len(keys)
        return index[pick(rng, keys)]

    k = 0
    while True:
        s_low = slope - k * exposure + jitter(rng, 0.008)
        if s_low < exposure * 0.6:
            break
        s_up = max(0.0, s_low - exposure * 1.7)
        lo, hi = limits((s_low + s_up) / 2)
        u = lo
        while hi - u > 0.08:
            length = rng.uniform(*run)
            if hi - (u + length) < 0.4:
                length = hi - u
            if rng.random() < missing and length > 0.75:
                gap = rng.uniform(0.16, 0.28)
                cut = u + rng.uniform(0.2, length - gap - 0.2)
                _board(bm, at, d, n, u, cut, s_low, s_up, deck, thickness, k == 0, rng, piece(s_low))
                _board(bm, at, d, n, cut + gap, u + length, s_low, s_up, deck, thickness, k == 0, rng, piece(s_low))
            else:
                _board(bm, at, d, n, u, u + length - 0.012, s_low, s_up, deck, thickness, k == 0, rng, piece(s_low))
            u += length
        k += 1
    return mesh.from_bmesh("roof_rows", bm, [mat(key) for key, _ in keys] + ([mat("moss")] if moss else []))


def _board(bm, at, d, n, ua, ub, s_low, s_up, deck, thickness, first, rng, material_index):
    thk = thickness * (1 + jitter(rng, 0.15))
    s_low += jitter(rng, 0.012)
    t_low = deck + 1.4 * thickness + jitter(rng, 0.004)
    t_up = deck + abs(jitter(rng, 0.003))
    edge = deck if first else t_low
    top = [at(ua, s_low, t_low + thk), at(ub, s_low, t_low + thk), at(ub, s_up, t_up + thk), at(ua, s_up, t_up + thk)]
    add_face(bm, top, n, material_index)
    add_face(bm, (at(ua, s_low, edge), at(ub, s_low, edge), top[1], top[0]), d, material_index)


def gable_wall(width, rise, rng, proud=0.05, depth=0.25, key="plaster", opening=None):
    """Triangular gable infill (wall-local, base on the storey's top plate): plaster core, tie beam, king post,
    collar, struts and rakes under the roof line. opening = (width, height, z0) frames a centred window with
    studs and rails instead of the lower king post; the caller adds the window."""
    hw, t = width / 2, 0.18
    objs = [mesh.prism("gable_core", width, rise, depth, at=(0.0, depth / 2, 0.0), mat=mat(key)),
            member((-hw, t / 2), (hw, t / 2), t, rng, proud)]
    collar = rise * 0.42
    king_from = t
    if opening:
        w, h, z0 = opening
        side = w / 2 + 0.09
        objs += [member((s * side, t), (s * side, z0 + h + 0.06), 0.16, rng, proud) for s in (-1, 1)]
        objs.append(member((-side, z0 - 0.06), (side, z0 - 0.06), 0.13, rng, proud - 0.008))
        objs.append(member((-side, z0 + h + 0.06), (side, z0 + h + 0.06), 0.13, rng, proud - 0.008))
        collar = max(collar, z0 + h + 0.32)
        king_from = z0 + h + 0.12
    objs.append(member((0.0, king_from), (0.0, rise - 0.3), t, rng, proud))
    half = hw * (1 - collar / rise) - 0.14
    if half > 0.3:
        objs.append(member((-half, collar), (half, collar), t * 0.85, rng, proud - 0.008))
        objs.append(member((-hw * 0.6, t), (-half + 0.04, collar), t * 0.8, rng, proud - 0.015))
        objs.append(member((hw * 0.6, t), (half - 0.04, collar), t * 0.8, rng, proud - 0.015))
    if width > 2.5:
        edge = math.hypot(hw, rise)
        off = Vector((rise, -hw)) * (0.16 / edge)
        lo = (t - off.y + 0.02) / rise
        hi = (hw - 0.1 - off.x) / hw
        a = Vector((-hw + lo * hw, lo * rise)) + off
        b = Vector((-hw + hi * hw, hi * rise)) + off
        objs += [member((s * a.x, a.y), (s * b.x, b.y), t, rng, proud) for s in (-1, 1)]
    return objs


def dormer(width, height, main_pitch_deg, rng, keys=SHINGLE_KEYS, pitch_deg=52.0, lit=True, roof_kwargs=None,
           hatch=False, body_key="plaster"):
    """A gabled dormer on a roof slope. The origin is the bottom centre of its front wall, on the main roof's
    surface, and the front faces -Y; body and roof run back into the main roof until they are covered. hatch=True
    makes it a hay hood: a dark loft opening with its two plank doors swung open instead of a window."""
    rise = width / 2 * math.tan(math.radians(pitch_deg))
    tan_main = math.tan(math.radians(main_pitch_deg))
    back = (height + rise + 0.5) / tan_main
    objs = [mesh.box("dormer_body", (width, back, height + 0.6), at=(0.0, back / 2, height / 2 - 0.3), mat=mat(body_key))]
    for sx in (-1, 1):
        objs.append(member((sx * (width / 2 - 0.08), -0.1), (sx * (width / 2 - 0.08), height - 0.1), 0.16, rng))
    objs.append(member((-width / 2, height - 0.08), (width / 2, height - 0.08), 0.16, rng))
    objs.append(member((-width / 2, 0.06), (width / 2, 0.06), 0.14, rng))
    if hatch:
        objs += _hatch(width - 0.32, height - 0.26, 0.12)
    else:
        objs += place(window(width - 0.62, height - 0.62, rng, panes=(2, 2), lit=lit, shutters=(False, False)), Matrix(),
                      (0.0, 0.0, 0.3))
    objs += place(gable_wall(width + 0.04, rise, rng, depth=0.2, key=body_key), Matrix(), (0.0, 0.0, height))
    kwargs = {"eave": 0.18, "gable": 0.22, "exposure": 0.18, "rafters": 0, "barges": (True, False),
              "barge_size": (0.13, 0.035)}
    kwargs.update(roof_kwargs or {})
    roof = gable_roof(back, width + 0.04, pitch_deg, rng, keys,
                      extent=lambda z: (-10.0, (height + z) / tan_main + 0.12), **kwargs)
    return objs + mesh.transform(roof, mesh.frame((0.0, 0.0, height), math.pi / 2))


def _hatch(width, height, z0):
    """A dark loft opening with its two plank doors swung open against the wall (wall-local)."""
    objs = [plate("hatch_dark", width, height, (0.0, -0.02, z0 + height / 2), "timber_dark")]
    for s in (-1, 1):
        leaf = mesh.box("hatch_door", (width / 2, 0.04, height), at=(s * width / 4, -0.02, z0), origin="bottom",
                        mat=mat("plank"))
        objs += mesh.transform([leaf], Matrix.Translation((s * width / 2, -0.03, 0.0)) @ Matrix.Rotation(s * math.radians(-100), 4, "Z")
                               @ Matrix.Translation((-s * width / 2, 0.0, 0.0)))
    return objs


def chimney(width, depth, height, rng, lean_deg=1.5, pots=2):
    """A stone stack from its base (hidden inside the roof) to a corbelled cap with clay pots, leaning a little.
    Origin at the bottom centre."""
    objs = [mesh.box("chimney_core", (width, depth, height), origin="bottom", mat=mat("stone_dark"))]
    for face in ("front", "right", "back", "left"):
        m, w = face_frame(face, -width / 2, width / 2, -depth / 2, depth / 2)
        objs += mesh.transform([stone_face(w, height, rng, course=(0.22, 0.32), length=(0.32, 0.7))], m)
    objs.append(mesh.box("chimney_band", (width + 0.1, depth + 0.1, 0.09), at=(0.0, 0.0, height - 0.32),
                         mat=mat("stone_light"), bevel=0.015))
    objs.append(mesh.box("chimney_cap", (width + 0.18, depth + 0.18, 0.12), at=(0.0, 0.0, height + 0.06),
                         mat=mat("stone_light"), bevel=0.02))
    for i in range(pots):
        x = (i - (pots - 1) / 2) * width * 0.45
        r = rng.uniform(0.08, 0.1)
        h = rng.uniform(0.28, 0.4)
        objs.append(mesh.cylinder("chimney_pot", r, h, at=(x, 0.0, height + 0.12), radius_top=r * 1.18,
                                  mat=mat("copper"), segments=8))
    lean(objs, 0.0, lean_deg, "X")
    return lean(objs, 0.0, jitter(rng, 0.8), "Y")


def jetty(rng, length, overhang, corbels, spacing=0.46):
    """The floor of a jettied storey seen from outside (wall-local, origin on the lower wall's face at the underside
    of the overhanging floor; corbels lists x positions): a moulded bressummer carrying the upper wall along the
    jetty edge, joist ends standing out a hand's width beyond it so they read from above, and brace corbels under
    some of them."""
    objs = [mesh.box("bressummer", (length + 0.12, 0.2, 0.28), at=(0.0, -overhang + 0.02, 0.11), mat=mat("timber"),
                     bevel=0.02),
            mesh.box("bressummer_bead", (length + 0.12, 0.05, 0.05), at=(0.0, -overhang - 0.08, -0.03),
                     mat=mat("timber_dark"))]
    count = max(1, int(length / spacing))
    for i in range(count + 1):
        x = -length / 2 + 0.12 + (length - 0.24) * i / count
        objs.append(mesh.box("joist_end", (0.15, overhang + 0.2, 0.17), at=(x, -overhang / 2 - 0.04, -0.115),
                             rot=(0, 0, math.radians(jitter(rng, 1.0))), mat=mat("timber")))
    for x in corbels:
        objs.append(mesh.beam("corbel", (x, 0.02, -1.0), (x, -overhang + 0.06, -0.2), 0.15, 0.16, mat("timber_dark"),
                              bevel=0.015))
    return objs


def stair(rng, rise, run, width, rail_side=1):
    """An outside timber stair rising along +Y from its foot at the origin to (0, run, rise): two stringers, plank
    treads and a handrail on posts along the rail side (+1 for +X)."""
    count = max(2, round(rise / 0.21))
    objs = [mesh.beam("stringer", (sx * width / 2, 0.12, 0.12), (sx * width / 2, run, rise - 0.14), 0.07, 0.24,
                      mat("timber"), bevel=0.012) for sx in (-1, 1)]
    for i in range(count):
        objs.append(mesh.box("tread", (width + 0.08, run / count + 0.06, 0.05),
                             at=(jitter(rng, 0.01), run * (i + 0.55) / count, rise * (i + 1) / count - 0.025),
                             rot=(0, 0, math.radians(jitter(rng, 1.2))), mat=mat("plank")))
    x = rail_side * (width / 2 + 0.05)
    for t in (0.0, 0.5, 1.0):
        foot = Vector((x, run * t, max(0.0, rise * t - 0.12)))
        objs.append(mesh.beam("rail_post", foot, foot + Vector((0.0, 0.0, 1.05)), 0.08, 0.08, mat("timber"), bevel=0.01))
    objs.append(mesh.beam("handrail", (x, 0.0, 0.9), (x, run, rise + 0.9), 0.07, 0.06, mat("timber"), bevel=0.01))
    return objs


def rope(points, radius, key="rope", sides=6, closed=False, name="rope"):
    """A rope or cable through points: a bevelled poly curve converted to a mesh straight away."""
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = max(0, (sides - 4) // 2)
    curve.use_fill_caps = not closed
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, co in zip(spline.points, points):
        point.co = (co[0], co[1], co[2], 1.0)
    spline.use_cyclic_u = closed
    holder = mesh.link(bpy.data.objects.new(name, curve))
    me = bpy.data.meshes.new_from_object(holder.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(holder)
    bpy.data.curves.remove(curve)
    me.materials.clear()
    me.materials.append(mat(key))
    return mesh.link(bpy.data.objects.new(name, me))


def sag(a, b, drop, samples=8):
    """Points along a rope hung between a and b that sags `drop` at its middle."""
    a, b = Vector(a), Vector(b)
    return [a.lerp(b, i / samples) - Vector((0.0, 0.0, drop * 4 * (i / samples) * (1 - i / samples)))
            for i in range(samples + 1)]


def rope_coil(radius=0.32, turns=3.5, thickness=0.028, sides=6, per_turn=16):
    """A flat coil of rope lying on a deck, origin at its centre."""
    steps = int(turns * per_turn)
    points = []
    for i in range(steps + 1):
        a = 2 * math.pi * i / per_turn
        r = radius * (0.4 + 0.6 * i / steps)
        points.append((r * math.cos(a), r * math.sin(a), thickness * (1.0 + 0.2 * math.sin(a * 3))))
    return [rope(points, thickness, sides=sides, name="rope_coil")]


def lantern(size=1.0, hook=True):
    """The brand lantern (DESIGN.md section 9), the one lantern used everywhere: an iron cage, origin at the bottom
    centre, 0.55 m tall at size 1, with foot and base plates, amber glass in a material of its own, corner posts and
    cage bars, top ring, pyramid cap, finial and, unless hook is False, a hook ring."""
    s = size
    iron = mat("iron")
    objs = [mesh.box("lantern_foot", (0.16 * s, 0.16 * s, 0.025 * s), origin="bottom", mat=iron, bevel=0.004 * s),
            mesh.box("lantern_base", (0.22 * s, 0.22 * s, 0.03 * s), at=(0, 0, 0.025 * s), origin="bottom", mat=iron,
                     bevel=0.006 * s),
            mesh.box("lantern_glass", (0.16 * s, 0.16 * s, 0.24 * s), at=(0, 0, 0.055 * s), origin="bottom",
                     mat=style.lantern_glass()),
            mesh.box("lantern_ring", (0.21 * s, 0.21 * s, 0.03 * s), at=(0, 0, 0.295 * s), origin="bottom", mat=iron,
                     bevel=0.005 * s),
            mesh.cylinder("lantern_cap", 0.155 * s, 0.12 * s, at=(0, 0, 0.325 * s), radius_top=0.02 * s, segments=4,
                          rot=(0, 0, math.pi / 4), mat=iron),
            mesh.cylinder("lantern_finial", 0.016 * s, 0.05 * s, at=(0, 0, 0.44 * s), segments=6, mat=iron)]
    post, bar_ = (0.022 * s, 0.022 * s, 0.24 * s), 0.012 * s
    for cx in (-1, 1):
        for cy in (-1, 1):
            objs.append(mesh.box("lantern_post", post, at=(cx * 0.088 * s, cy * 0.088 * s, 0.055 * s), origin="bottom",
                                 mat=iron))
    for side in (-1, 1):
        objs += [mesh.box("cage_bar", (bar_, bar_, 0.24 * s), at=(0, side * 0.083 * s, 0.055 * s), origin="bottom", mat=iron),
                 mesh.box("cage_bar", (bar_, bar_, 0.24 * s), at=(side * 0.083 * s, 0, 0.055 * s), origin="bottom", mat=iron),
                 mesh.box("cage_bar", (0.17 * s, bar_, bar_), at=(0, side * 0.083 * s, 0.175 * s), mat=iron),
                 mesh.box("cage_bar", (bar_, 0.17 * s, bar_), at=(side * 0.083 * s, 0, 0.175 * s), mat=iron)]
    if hook:
        ring = [(0.035 * s * math.sin(2 * math.pi * k / 12), 0.0, 0.525 * s + 0.035 * s * math.cos(2 * math.pi * k / 12))
                for k in range(12)]
        objs.append(rope(ring, 0.007 * s, key="iron", sides=4, closed=True, name="lantern_hook"))
    return objs


def lantern_bracket(arm=0.55, size=0.8):
    """An iron wall bracket with a lantern hanging from its tip (wall-local, origin where the arm meets the wall,
    the arm pointing out along -Y)."""
    iron = mat("iron")
    objs = [mesh.box("bracket_plate", (0.08, 0.02, 0.36), at=(0.0, -0.01, -0.13), mat=iron, bevel=0.004),
            mesh.beam("bracket_arm", (0.0, -0.01, 0.0), (0.0, -arm, 0.0), 0.026, 0.026, iron),
            mesh.beam("bracket_brace", (0.0, -0.01, -0.28), (0.0, -arm * 0.6, -0.01), 0.02, 0.02, iron),
            rope([(0.0, -arm * 0.78 + 0.05 * math.sin(a), -0.07 + 0.05 * math.cos(a)) for a in
                  [2 * math.pi * k / 10 for k in range(10)]], 0.006, key="iron", sides=4, closed=True, name="bracket_scroll")]
    hang = lantern(size)
    return objs + mesh.transform(hang, Matrix.Translation((0.0, -arm + 0.035, -0.56 * size)))


def hanging_sign(arm=1.1, board=(0.7, 0.5), key="plank_light", emblem_key="iron", iron=False, emblem="disc"):
    """A framed board hanging from two short chains (wall-local, origin where the arm meets the wall, pointing out
    along -Y), edge-on to the wall so both faces show, with its emblem standing out of both faces: a disc, the
    island's crest or one of the trade shapes in EMBLEMS. The arm is a timber with an iron brace or, with iron=True,
    a wrought-iron bracket with a scrolled stay."""
    w, h = board
    y0, y1 = -arm * 0.22, -arm * 0.92
    objs = _iron_bracket(arm) if iron else _timber_bracket(arm)
    cy = (y0 + y1) / 2
    top = -0.18
    for y in (cy - w * 0.4, cy + w * 0.4):
        objs.append(mesh.rod("sign_chain", (0.0, y, -0.03), (0.0, y, top), 0.008, mat("iron"), segments=4))
    objs.append(mesh.box("sign_frame", (0.045, w + 0.06, h + 0.06), at=(0.0, cy, top - h / 2), mat=mat("timber_dark"),
                         bevel=0.01))
    objs.append(mesh.box("sign_board", (0.06, w, h), at=(0.0, cy, top - h / 2), mat=mat(key)))
    on_board = Matrix.Translation((0.0, cy, top - h / 2)) @ Matrix.Rotation(math.pi / 2, 4, "Z")
    if emblem == "crest":
        # One crest on each face, turned rather than mirrored, so the letters read the right way from both sides.
        faces = []
        for yaw in (0.0, math.pi):
            faces += mesh.transform(crest(h * 0.86, 0.02), Matrix.Rotation(yaw, 4, "Z") @ Matrix.Translation((0.0, -0.03, -h * 0.43)))
        return objs + mesh.transform(faces, on_board)
    if emblem in EMBLEMS:
        size = min(w, h) * 0.8
        shapes = [[(x * size, z * size) for x, z in poly] for poly in EMBLEMS[emblem]]
        return objs + mesh.transform(relief(shapes, emblem_key, 0.08, through=True), on_board)
    objs.append(mesh.cylinder("sign_emblem", h * 0.24, 0.075, at=(0.0, cy, top - h / 2), rot=(0, math.pi / 2, 0),
                              mat=mat(emblem_key), segments=12, origin="center"))
    return objs


def _timber_bracket(arm):
    return [mesh.beam("sign_arm", (0.0, 0.0, 0.0), (0.0, -arm, 0.0), 0.1, 0.12, mat("timber"), bevel=0.012),
            mesh.beam("sign_brace", (0.0, -0.01, -0.55), (0.0, -arm * 0.55, -0.05), 0.03, 0.03, mat("iron")),
            mesh.box("sign_plate", (0.14, 0.03, 0.7), at=(0.0, -0.015, -0.25), mat=mat("timber"), bevel=0.01)]


def _iron_bracket(arm):
    """A wrought-iron sign bracket: a wall strap, a square arm with a curled tip and a stay under it, with a scroll
    filling the corner between them."""
    iron = mat("iron")
    return [mesh.box("bracket_strap", (0.07, 0.02, 0.62), at=(0.0, -0.01, -0.22), mat=iron),
            mesh.beam("bracket_arm", (0.0, -0.01, 0.0), (0.0, -arm, 0.0), 0.035, 0.035, iron),
            mesh.beam("bracket_stay", (0.0, -0.01, -0.5), (0.0, -arm * 0.6, -0.02), 0.025, 0.025, iron),
            rope(spiral((0.0, -arm * 0.3, -0.17), 0.14, 0.03, math.pi * 0.5, 1.6, 12), 0.011, key="iron", sides=4,
                 name="bracket_scroll"),
            rope(spiral((0.0, -arm + 0.06, 0.075), 0.075, 0.02, -math.pi * 0.5, 1.2, 12), 0.011, key="iron", sides=4,
                 name="bracket_curl")]


def spiral(centre, r0, r1, start, turns, samples=24, plane="YZ"):
    """Points of a flat spiral in the YZ or XZ plane round `centre`, its radius shrinking from r0 to r1 over
    `turns`."""
    c = Vector(centre)
    count = max(4, int(samples * turns))
    points = []
    for i in range(count + 1):
        r = r0 + (r1 - r0) * i / count
        a = start + 2 * math.pi * turns * i / count
        offset = (0.0, r * math.cos(a), r * math.sin(a)) if plane == "YZ" else (r * math.cos(a), 0.0, r * math.sin(a))
        points.append(c + Vector(offset))
    return points


def barrel(rng, height=0.9, belly=0.31, ends=0.265, open_top=False, segments=16, brand=False):
    """A coopered barrel, origin at the bottom centre: flat staves bulging to the belly, three iron hoops at the
    chimes and the belly, recessed heads at both ends, or an open top with a dark inside; with brand=True the closed
    head carries the owner's QH burnt into it (DESIGN.md section 13)."""
    t, inset, hb = 0.008, 0.028, 0.075 * height

    def r(z):
        u = 2 * z / height - 1
        return ends + (belly - ends) * (1 - u * u) + t

    mid = height / 2
    depth = height * 0.75 if open_top else 0.05
    profile = [(r(0) - inset, 0.05), (r(0), 0.0), (r(hb), hb), (r(mid - hb / 2), mid - hb / 2),
               (r(mid + hb / 2), mid + hb / 2), (r(height - hb), height - hb), (r(height), height),
               (r(height) - inset, height - depth)]
    bands = [0, 1, 0, 1, 0, 1, 0, 2 if open_top else 0]
    ob = mesh.lathe("barrel", profile, segments=segments, mat=[mat("plank"), mat("iron"), mat("timber_dark")],
                    band_materials=bands, sharp_meridians=True)
    yaw = rng.uniform(0.0, math.pi)
    ob.rotation_euler = (0.0, 0.0, yaw)
    if not brand or open_top:
        return [ob]
    mark = decal(lettering("QH", (r(height) - inset) * 0.75), "burnt", lift=0.003, name="barrel_brand")
    mark.matrix_basis = (Matrix.Translation((0.0, 0.0, height - depth)) @ Matrix.Rotation(yaw, 4, "Z")
                         @ Matrix.Rotation(-math.pi / 2, 4, "X") @ Matrix.Translation((0.0, 0.0, -(r(height) - inset) * 0.375)))
    return [ob, mark]


def crate(rng, size=(0.82, 0.41, 0.35), key="plank_light"):
    """A slatted crate, origin at the bottom centre: dark inside, corner posts, edge frames, three slats per side
    with gaps, a slatted lid and a rope handle at each end."""
    length, width, height = size
    b = 0.035
    wood = mat(key)
    objs = [mesh.box("crate_inside", (length - 0.03, width - 0.03, height - 0.03), at=(0, 0, 0.015), origin="bottom",
                     mat=mat("timber_dark"))]
    for sx in (-1, 1):
        for sy in (-1, 1):
            objs.append(mesh.box("crate_post", (b, b, height), at=(sx * (length / 2 - b / 2), sy * (width / 2 - b / 2), 0.0),
                                 origin="bottom", mat=mat("plank"), bevel=0.006))
    for z in (b / 2, height - b / 2):
        for s in (-1, 1):
            objs.append(mesh.box("crate_frame", (length - 2 * b, b * 0.8, b), at=(0, s * (width / 2 - b * 0.4), z), mat=mat("plank"),
                                 bevel=0.005))
            objs.append(mesh.box("crate_frame", (b * 0.8, width - 2 * b, b), at=(s * (length / 2 - b * 0.4), 0, z), mat=mat("plank"),
                                 bevel=0.005))
    slat = (height - 2 * b - 0.04) / 3
    for i in range(3):
        z = b + 0.01 + slat * (i + 0.5) + i * 0.01
        for s in (-1, 1):
            objs.append(mesh.box("crate_slat", (length - 2 * b, 0.018, slat - 0.012), at=(0, s * (width / 2 - 0.012), z + jitter(rng, 0.004)),
                                 mat=wood))
            objs.append(mesh.box("crate_slat", (0.018, width - 2 * b, slat - 0.012), at=(s * (length / 2 - 0.012), 0, z), mat=wood))
    boards = 4
    for i in range(boards):
        y = -width / 2 + width * (i + 0.5) / boards
        objs.append(mesh.box("crate_lid", (length - 0.02, width / boards - 0.012, 0.02), at=(0, y, height + 0.01 + abs(jitter(rng, 0.003))),
                             mat=wood))
    for s in (-1, 1):
        x = s * (length / 2 + 0.004)
        handle = [(x + s * 0.05 * math.sin(math.pi * i / 8), -0.075 * math.cos(math.pi * i / 8),
                   height * (0.72 - 0.18 * math.sin(math.pi * i / 8))) for i in range(9)]
        objs.append(rope(handle, 0.011, sides=6, name="crate_handle"))
    return objs


def woodpile(rng, length=1.5, rows=3, depth=0.5):
    """Split logs stacked on two rails against a wall (wall-local, the stack standing out along -Y)."""
    objs = [mesh.box("woodpile_rail", (0.08, depth, 0.06), at=(x, -depth / 2, 0.03), mat=mat("timber"))
            for x in (-length / 2 + 0.15, length / 2 - 0.15)]
    z = 0.06
    for row in range(rows):
        count = int(length / 0.17) - row % 2
        for i in range(count):
            r = rng.uniform(0.06, 0.08)
            x = -length / 2 + 0.09 + (i + 0.5 * (row % 2)) * (length - 0.18) / max(1, count - 1 + (row % 2))
            y_out = -depth + jitter(rng, 0.04)
            objs.append(mesh.rod("log", (x, y_out, z + r), (x + jitter(rng, 0.03), -0.02, z + r + jitter(rng, 0.02)), r,
                                 mat(pick(rng, (("bark", 0.6), ("plank", 0.4)))), segments=5))
        z += 0.14
    return objs


def pier_post(bottom, top, radius, rng, water=0.0, lean_deg=1.2):
    """A round harbor post standing on its foot at (0, 0, bottom): wet dark wood below the waterline, weathered
    wood above and a rounded head; it leans a little."""
    h = top - bottom
    wet = max(0.1, min(h - 0.2, water - bottom))
    profile = [(radius * 0.9, 0.0), (radius, 0.08), (radius, wet), (radius * 0.97, h - 0.06), (radius * 0.72, h)]
    ob = mesh.lathe("pier_post", profile, segments=8, mat=[mat("water_wood"), mat("driftwood")],
                    band_materials=[0, 0, 1, 1], cap_bottom=False)
    ob.location = (0.0, 0.0, bottom)
    ob.rotation_euler = (math.radians(jitter(rng, lean_deg)), math.radians(jitter(rng, lean_deg)), rng.uniform(0, math.pi))
    return [ob]


def bollard(height=0.55, radius=0.13, segments=12):
    """A cast-iron mooring bollard: flared foot, waist and mushroom cap; origin at the bottom centre."""
    profile = [(radius * 1.35, 0.0), (radius * 1.2, 0.06), (radius, 0.12), (radius * 0.86, height * 0.66),
               (radius * 1.28, height * 0.82), (radius * 1.22, height * 0.95), (radius * 0.55, height)]
    return [mesh.lathe("bollard", profile, segments=segments, mat=mat("iron"), cap_bottom=False)]


def hull_side_x(beam, keel, bilge, rail, fullness, tumblehome, z):
    """Half-breadth of a hull station at height z: a superellipse from the keel to the bilge, then a slight
    tumblehome up to the rail."""
    if z <= bilge:
        f = (bilge - z) / max(1e-6, bilge - keel)
        return beam * max(0.0, 1 - f ** fullness) ** (1 / fullness)
    f = (z - bilge) / max(1e-6, rail - bilge)
    return beam * (1 - tumblehome * f * f)


def hull_section(beam, keel, bilge, rail, deck, fullness=2.6, strakes=12, step=0.03, wales=(), paint=(),
                 bulwark=0.16, tumblehome=0.06, deck_bands=6):
    """Half cross-section of a planked hull at one station: (x, z) points from the keel up the outside in
    clinker-stepped strakes, over the rail cap, down the bulwark and across the deck to the centreline, plus a
    palette key per band between consecutive points. Underwater strakes and wales are dark, painted strakes
    copper red, and the narrow step under each strake's lower edge is dark so the planking reads as lines."""
    samples = [Vector((hull_side_x(beam, keel, bilge, rail, fullness, tumblehome, keel + (rail - keel) * i / 200),
                       keel + (rail - keel) * i / 200)) for i in range(201)]
    samples[0] = Vector((0.0, keel))
    lengths = [0.0]
    for a, b in zip(samples, samples[1:]):
        lengths.append(lengths[-1] + (b - a).length)

    def at(fraction):
        target = fraction * lengths[-1]
        i = next(k for k in range(1, len(lengths)) if lengths[k] >= target or k == len(lengths) - 1)
        a, b = samples[i - 1], samples[i]
        u = (target - lengths[i - 1]) / max(1e-9, lengths[i] - lengths[i - 1])
        tangent = (b - a).normalized() if (b - a).length > 1e-9 else Vector((0.0, 1.0))
        return a.lerp(b, u), Vector((tangent.y, -tangent.x))

    points, keys = [Vector((0.0, keel))], []
    for i in range(strakes):
        lower, normal = at(i / strakes)
        upper, _ = at((i + 1) / strakes)
        wale = i in wales
        dark = wale or (lower.y + upper.y) / 2 < 0.0
        key = "hull_dark" if dark else "copper" if i in paint else "hull"
        if i > 0:
            points.append(lower + normal * (step * (2.4 if wale else 1.0)))
            keys.append("hull_dark")
        points.append(upper)
        keys.append(key)
    x_rail = points[-1].x
    inner = max(0.0, x_rail - bulwark)
    lip = max(0.0, inner - 0.03)
    cap = [Vector((x_rail + 0.03, rail)), Vector((x_rail + 0.03, rail + 0.08)), Vector((lip, rail + 0.08)),
           Vector((lip, rail)), Vector((inner, rail)), Vector((inner, deck))]
    points += cap
    keys += ["hull", "timber", "timber", "timber", "plank", "plank"]
    for j in range(deck_bands):
        x = inner * (1 - (j + 1) / deck_bands)
        camber = 0.06 * (1 - (x / inner) ** 2) if inner > 0 else 0.0
        points.append(Vector((x, deck + camber)))
        keys.append("plank_light" if j % 3 else "plank")
    return [(p.x, p.y) for p in points], keys



def hull_loft(stations, **section_kwargs):
    """A mirrored hull from stations, each a dict with y and the hull_section arguments (beam, keel, bilge, rail,
    deck, fullness). Band colours follow the middle station; the end caps close the stern and the stem."""
    rings, keys = [], None
    for st in stations:
        args = {k: v for k, v in st.items() if k != "y"}
        section, section_keys = hull_section(**args, **section_kwargs)
        rings.append([(x, st["y"], z) for x, z in section])
        if st is stations[len(stations) // 2]:
            keys = section_keys
    return [mesh.loft("hull", rings, mat=[mat(k) for k in HULL_KEYS], mirror_x=True,
                      band_materials=[HULL_KEYS.index(k) for k in keys])]



def bow(objs, axis, a0, a1, z0, z1, sag=RIDGE_SAG):
    """Sag roof parts like an old ridge: points between a0 and a1 along `axis` ("X" or "Y") drop at mid-length by
    `sag` per metre of that length, by nothing at the eave height z0 and by the full amount from the ridge height z1
    up, so walls and gable ends stay where they are."""
    i = 0 if axis == "X" else 1
    depth = sag * abs(a1 - a0)
    for ob in objs:
        basis = ob.matrix_basis.copy()
        inverse = basis.inverted()
        for v in ob.data.vertices:
            w = basis @ v.co
            u = (w[i] - a0) / (a1 - a0)
            if 0.0 < u < 1.0 and w.z > z0:
                w.z -= depth * math.sin(math.pi * u) * min(1.0, (w.z - z0) / (z1 - z0))
                v.co = inverse @ w
    return objs


def string_course(x0, x1, y0, y1, z, height=0.16, proud=0.07, key="stone_light"):
    """A projecting stone band round an x0..x1, y0..y1 block with its underside at height z."""
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    sides = (((cx, y0), (x1 - x0 + 2 * proud, 2 * proud)), ((cx, y1), (x1 - x0 + 2 * proud, 2 * proud)),
             ((x0, cy), (2 * proud, y1 - y0)), ((x1, cy), (2 * proud, y1 - y0)))
    return [mesh.box("string_course", (sx, sy, height), at=(x, y, z), origin="bottom", mat=mat(key), bevel=0.012)
            for (x, y), (sx, sy) in sides]


def ring_point(r, angle, z):
    """A point at radius r and height z; angle 0 faces -Y and grows towards +X, like a face's x axis."""
    return Vector((r * math.sin(angle), -r * math.cos(angle), z))


def stone_ring(radius, height, rng, radius_top=None, course=(0.2, 0.3), length=(0.3, 0.6), gap=0.02,
               relief=(0.008, 0.03), keys=STONE_KEYS, openings=(), moss=0.0):
    """Rough stone courses round a circular wall, origin at the centre of its foot, the radius tapering from
    `radius` to radius_top: one object of stones, each two facets bent round the curve standing proud of a core the
    caller builds. openings are (angle, z0, width, height) gaps the courses leave for doors and windows; a `moss`
    share of the low stones on the seaward (+Y) side turn green."""
    top = radius if radius_top is None else radius_top

    def r_at(z):
        return radius + (top - radius) * z / height

    bm = bmesh.new()
    index = {key: i for i, (key, _) in enumerate(keys)}
    z = 0.0
    while z < height - 0.04:
        h = rng.uniform(*course)
        if height - (z + h) < 0.14:
            h = height - z
        r = r_at(z + h / 2)
        for a, b in _free_arcs(rng.uniform(0.0, 2 * math.pi), z, z + h, r, openings):
            x = a
            while (b - x) * r > 0.06:
                step = rng.uniform(*length) / r
                if (b - x - step) * r < 0.2:
                    step = b - x
                seaward = max(0.0, -math.cos(x + step / 2)) * max(0.0, 1.0 - z / 1.2)
                green = moss and rng.random() < moss * seaward
                _ring_stone(bm, x + gap / 2 / r, x + step - gap / 2 / r, z + gap / 2, z + h - gap / 2, r_at, rng,
                            relief, len(keys) if green else index[pick(rng, keys)])
                x += step
        z += h
    return mesh.from_bmesh("ring_stones", bm, [mat(k) for k, _ in keys] + ([mat("moss")] if moss else []))


def _free_arcs(start, z0, z1, r, openings):
    """The arcs of one turn from `start` that a course between z0 and z1 may fill around the openings."""
    spans = [(start, start + 2 * math.pi)]
    for angle, oz, w, oh in openings:
        if z1 <= oz - 0.1 or z0 >= oz + oh + 0.2:
            continue
        half = (w / 2 + 0.08) / r
        centre = start + (angle - start) % (2 * math.pi)
        for c in (centre - 2 * math.pi, centre, centre + 2 * math.pi):
            spans = [piece for s0, s1 in spans for piece in ((s0, min(s1, c - half)), (max(s0, c + half), s1))
                     if (piece[1] - piece[0]) * r > 0.05]
    return spans


def _ring_stone(bm, a0, a1, z0, z1, r_at, rng, relief, material_index):
    d = rng.uniform(*relief)
    columns = [a0, (a0 + a1) / 2 + jitter(rng, 0.1) * (a1 - a0), a1]
    rows = [z0 + jitter(rng, 0.01), z1 + jitter(rng, 0.01)]
    grid = [[ring_point(r_at(z) + max(0.003, d + jitter(rng, 0.006)), a, z) for a in columns] for z in rows]
    for i in range(2):
        add_face(bm, (grid[0][i], grid[0][i + 1], grid[1][i + 1], grid[1][i]),
                 ring_point(1.0, (columns[i] + columns[i + 1]) / 2, 0.0), material_index)


def rock(rng, size, key=None, rough=0.2):
    """An irregular stone, origin at the centre of its foot: a jittered icosphere squashed to `size` (x, y, z) and
    cut flat where it meets the ground; key is a palette key, a material or None for a random stone tone."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.5)
    sx, sy, sz = size
    for v in bm.verts:
        v.co *= 1 + jitter(rng, rough)
        v.co = Vector((v.co.x * sx, v.co.y * sy, max(0.0, (v.co.z + 0.2) * sz / 0.7)))
    if key is None:
        key = pick(rng, STONE_KEYS)
    return mesh.from_bmesh("rock", bm, mat(key) if isinstance(key, str) else key)


def blob(rng, radius, key, squash=0.85, at=(0.0, 0.0, 0.0), subdivisions=1):
    """A small lumpy ball, 20 triangles at one subdivision, for fruit, coal, embers and seed clocks; key is a
    palette key or a material."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=radius)
    for v in bm.verts:
        v.co *= 1 + jitter(rng, 0.12)
        v.co.z *= squash
    ob = mesh.from_bmesh("blob", bm, mat(key) if isinstance(key, str) else key)
    ob.location = at
    return ob


def cone_roof(radius, height, rng, keys=SLATE_KEYS, exposure=0.2, thickness=0.03, run=(0.2, 0.34), missing=0.02,
              collar_key="iron"):
    """A conical roof, origin at the centre of its eave ring of `radius`, apex `height` above: a timber deck with a
    closed soffit under courses of slates or shingles laid round the cone, each course stepping out over the one
    above it, a few pieces missing, and an iron collar at the top whose tip sits 0.15 above the apex."""
    slant = math.hypot(radius, height)
    nr, nz = height / slant, radius / slant
    deck = 0.05
    lift = deck + 2.4 * thickness

    def at(s, a, t):
        return ring_point(radius * (1 - s / slant) + t * nr, a, height * s / slant + t * nz)

    objs = [mesh.lathe("cone_deck", [(radius, 0.0), (0.04, height * (1 - 0.04 / radius))], segments=24,
                       mat=mat("timber_dark"), cap_top=False)]
    bm = bmesh.new()
    index = {key: i for i, (key, _) in enumerate(keys)}
    k = 0
    while radius * (1 - k * exposure / slant) > 0.36:
        s_low = k * exposure + jitter(rng, 0.006)
        s_up = min(slant - 0.05, s_low + exposure * 1.7)
        r_low = radius * (1 - s_low / slant)
        a = rng.uniform(0.0, 2 * math.pi)
        end = a + 2 * math.pi
        while (end - a) * r_low > 0.02:
            step = rng.uniform(*run) / r_low
            if (end - a - step) * r_low < 0.12:
                step = end - a
            if rng.random() >= missing:
                _slate(bm, at, a, a + step - 0.012 / r_low, s_low, s_up, deck, thickness, k == 0, rng,
                       index[pick(rng, keys)])
            a += step
        k += 1
    objs.append(mesh.from_bmesh("cone_rows", bm, [mat(key) for key, _ in keys]))
    s_top = k * exposure
    r_top, z_top = radius * (1 - s_top / slant), height * s_top / slant
    objs.append(mesh.lathe("cone_collar", [(r_top + lift * nr + 0.03, z_top + lift * nz - 0.02),
                                           (r_top * 0.5 + 0.05, (z_top + height) / 2 + 0.08), (0.05, height + 0.15)],
                           segments=12, mat=mat(collar_key), cap_bottom=False))
    return objs


def _slate(bm, at, a0, a1, s_low, s_up, deck, thickness, first, rng, material_index):
    thk = thickness * (1 + jitter(rng, 0.15))
    t_low = deck + 1.4 * thickness + jitter(rng, 0.004)
    t_up = deck + abs(jitter(rng, 0.003))
    edge = deck if first else t_low
    top = [at(s_low, a0, t_low + thk), at(s_low, a1, t_low + thk), at(s_up, a1, t_up + thk), at(s_up, a0, t_up + thk)]
    mid = (a0 + a1) / 2
    add_face(bm, top, at(s_low, mid, 1.0) - at(s_low, mid, 0.0), material_index)
    add_face(bm, (at(s_low, a0, edge), at(s_low, a1, edge), top[1], top[0]),
             at(s_low, mid, 0.0) - at(s_low + 1.0, mid, 0.0), material_index)


def _two_sided(bm, coords, outward, material_index, gap=0.003):
    """A face each way, the back one a hair behind, for thin cloth that has to show from both sides."""
    out = Vector(outward).normalized()
    add_face(bm, coords, out, material_index)
    add_face(bm, [Vector(c) - out * gap for c in coords][::-1], -out, material_index)


def awning(width, depth, rise, rng, stripes=9, keys=("canvas", "paint_red"), sag=0.05, valance=0.2, rows=3):
    """A striped canvas sheet with its front edge along X at the origin and its back edge `depth` behind (+Y) and
    `rise` higher, sagging `sag` between the corners, and a scalloped valance hanging from the front edge. It is
    double-sided because the materials cull back faces and an awning has to show from below too."""
    bm = bmesh.new()

    def point(u, v):
        drop = sag * 4 * u * (1 - u) * (1 + 2 * v * (1 - v))
        return Vector((width * (u - 0.5), depth * v, rise * v - drop + jitter(rng, 0.004)))

    normal = Vector((0.0, -rise, depth)) if depth > 1e-6 else Vector((0.0, -1.0, 0.0))
    grid = [[point(j / stripes, i / rows) for j in range(stripes + 1)] for i in range(rows + 1)]
    for i in range(rows):
        for j in range(stripes):
            _two_sided(bm, (grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]), normal, j % 2)
    if valance:
        down = Vector((0.0, 0.0, valance))
        for j in range(stripes):
            a, b = grid[0][j], grid[0][j + 1]
            _two_sided(bm, (a, b, b - down, (a + b) / 2 - down * 1.4, a - down), (0.0, -1.0, 0.0), j % 2)
    return mesh.from_bmesh("awning", bm, [mat(k) for k in keys])


def flag(width, height, rng, keys=("paint_red", "paint_gold"), waves=1.3, amplitude=0.1, segments=8):
    """A cloth flag flying from its hoist on the Z axis out along +X in gentle waves, origin at the foot of the
    hoist, its fly end drooping; double-sided, with the second colour on the hoist and fly bands."""
    bm = bmesh.new()
    phase = rng.uniform(0.0, math.pi)

    def point(u, v):
        wave = amplitude * math.sin(2 * math.pi * waves * u + phase + v) * u
        return Vector((width * u, wave, height * v - 0.12 * height * u * u))

    for j in range(segments):
        u0, u1 = j / segments, (j + 1) / segments
        key = 1 if j in (0, segments - 1) else 0
        for v0, v1 in ((0.0, 0.5), (0.5, 1.0)):
            _two_sided(bm, (point(u0, v0), point(u1, v0), point(u1, v1), point(u0, v1)), (0.0, -1.0, 0.0), key)
    return [mesh.from_bmesh("flag", bm, [mat(k) for k in keys])]


def wheel(radius, width, rng, spokes=8, key="plank", felloe=0.07, hub=0.08, spoke=0.022, segments=14):
    """A spoked wheel in the YZ plane with its axle along X through the origin: a felloe rim shod with an iron
    tyre, tapered round spokes and a hub with iron bands at both ends."""
    hw = width / 2
    r_in = radius - felloe
    rim = mesh.lathe("wheel_rim", [(radius, -hw), (radius, hw), (r_in, hw), (r_in, -hw), (radius, -hw)],
                     segments=segments, mat=[mat("iron"), mat(key)], band_materials=[0, 1, 1, 1], cap_bottom=False,
                     cap_top=False)
    nave = mesh.lathe("wheel_hub", [(hub * 0.75, -hw * 2.2), (hub, -hw * 1.6), (hub, hw * 1.6), (hub * 0.75, hw * 2.2)],
                      segments=8, mat=[mat("iron"), mat(key)], band_materials=[0, 1, 0])
    objs = mesh.transform([rim, nave], Matrix.Rotation(math.pi / 2, 4, "Y"))
    offset = rng.uniform(0.0, math.pi)
    for k in range(spokes):
        a = offset + 2 * math.pi * k / spokes
        d = Vector((0.0, math.cos(a), math.sin(a)))
        objs.append(mesh.rod("spoke", d * hub * 0.9, d * (r_in + 0.01), spoke, mat(key), segments=4,
                             radius_b=spoke * 0.75, cap=False))
    return objs


def water_wheel(radius, rng, half_width=0.36, paddles=16, axle=(1.3, -0.2)):
    """An overshot water wheel turning about an axle along X through the origin: two spoked rims half_width either
    side of its middle, `paddles` boards between them, and a log axle of axle = (length, x offset) running into the
    wall it turns beside."""
    objs = []
    for dx in (-half_width, half_width):
        objs += mesh.transform(wheel(radius, 0.1, rng, spokes=8, key="timber", felloe=0.16, hub=0.22, spoke=0.06, segments=16),
                               mesh.frame((dx, 0.0, 0.0)))
    for k in range(paddles):
        a = 2 * math.pi * k / paddles
        centre = Vector((0.0, (radius - 0.12) * math.cos(a), (radius - 0.12) * math.sin(a)))
        objs.append(mesh.box("paddle", (2 * half_width + 0.04, 0.05, 0.3), at=centre, rot=(a, 0, 0), mat=mat("plank")))
    length, offset = axle
    shaft = log(rng, length, 0.13, bark="timber", ends=("timber_dark", "timber_dark"), segments=10)
    shaft.location = (offset, 0.0, 0.0)
    return objs + [shaft]


def sack(rng, size=(0.6, 0.4, 0.3), key="rope", upright=False):
    """A filled burlap sack, origin at the bottom centre: a rounded pillow lying along X with its tied end pulled
    out at +X or, with upright=True, standing with the neck gathered on top."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True)
    tie = 2 if upright else 0
    others = [i for i in range(3) if i != tie]
    for v in bm.verts:
        c = v.co.copy()
        v.co = c.lerp(c.normalized() * 0.62, 0.55)
        if c[tie] > 0.49:
            if all(abs(c[i]) < 1e-6 for i in others):
                v.co[tie] += 0.07
            else:
                for i in others:
                    v.co[i] *= 0.8
        v.co += Vector((jitter(rng, 0.025), jitter(rng, 0.025), jitter(rng, 0.02)))
        v.co.z = max(v.co.z, -0.34)
    sx, sy, sz = size
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, v.co.y * sy, (v.co.z + 0.34) * sz))
    return mesh.from_bmesh("sack", bm, mat(key))


def basket(rng, radius=0.2, height=0.15, goods="paint_red", pieces=4, piece=0.04):
    """A round wicker basket heaped with produce, origin at the bottom centre: a flared bowl in two wicker tones
    with a rolled rim, a mound in the produce colour and a few whole pieces on top."""
    bowl = mesh.lathe("basket", [(radius * 0.7, 0.0), (radius * 0.9, height * 0.5), (radius, height * 0.92),
                                 (radius * 1.05, height), (radius * 0.97, height * 1.05)], segments=10,
                      mat=[mat("plank_light"), mat("plank")], band_materials=[0, 1, 0, 1], cap_top=False)
    heap = mesh.lathe("goods", [(radius * 0.97, height), (radius * 0.6, height + radius * 0.3),
                                (radius * 0.08, height + radius * 0.4)], segments=8, mat=mat(goods), cap_bottom=False)
    objs = [bowl, heap]
    for i in range(pieces):
        a = 2 * math.pi * i / pieces + jitter(rng, 0.4)
        r = radius * rng.uniform(0.15, 0.5)
        z = height + radius * 0.4 * (1 - r / radius) + piece * 0.5
        objs.append(blob(rng, piece, goods, at=(r * math.cos(a), r * math.sin(a), z)))
    return objs


def trestle_table(length, width, height, rng, key="plank_light", frame_key="timber", boards=3, overhang=0.18):
    """A board top on two trestles, origin at the bottom centre with the length along X: splayed legs under a head
    bar at each end, a stretcher between them and the top laid as slightly uneven boards."""
    frame = mat(frame_key)
    top = 0.05
    objs = []
    for x in (-length / 2 + overhang, length / 2 - overhang):
        for s in (-1, 1):
            objs.append(mesh.beam("trestle_leg", (x, s * width * 0.42, 0.03), (x, s * width * 0.22, height - top - 0.06),
                                  0.06, 0.06, frame))
        objs.append(mesh.box("trestle_head", (0.09, width * 0.72, 0.08), at=(x, 0.0, height - top - 0.04), mat=frame))
    objs.append(mesh.box("stretcher", (length - 2 * overhang, 0.06, 0.07), at=(0.0, 0.0, height * 0.3), mat=frame))
    bw = width / boards
    for i in range(boards):
        objs.append(mesh.box("table_board", (length + jitter(rng, 0.03), bw - 0.012, top),
                             at=(jitter(rng, 0.015), -width / 2 + bw * (i + 0.5), height - top / 2 + jitter(rng, 0.004)),
                             rot=(0, 0, math.radians(jitter(rng, 0.5))), mat=mat(key)))
    return objs


def bench(length, rng, height=0.45, depth=0.3, key="plank"):
    """A plank bench, origin at the bottom centre with the length along X: a thick seat on two slab legs and a
    stretcher."""
    objs = [mesh.box("bench_seat", (length, depth, 0.06), at=(0.0, jitter(rng, 0.01), height - 0.03), mat=mat(key),
                     bevel=0.01)]
    for x in (-length / 2 + 0.2, length / 2 - 0.2):
        objs.append(mesh.box("bench_leg", (0.06, depth * 0.85, height - 0.06), at=(x, 0.0, 0.0), origin="bottom",
                             mat=mat("timber")))
    objs.append(mesh.box("bench_stretcher", (length - 0.5, 0.05, 0.06), at=(0.0, 0.0, height * 0.35), mat=mat("timber")))
    return objs


def trough(length, width=0.5, height=0.45, key="plank"):
    """A plank water trough on two stone blocks, origin at the bottom centre with the length along X."""
    wood = mat(key)
    t, base = 0.05, 0.12
    h = height - base
    objs = [mesh.box("trough_block", (0.3, width + 0.1, base), at=(x, 0.0, 0.0), origin="bottom",
                     mat=mat("stone_light")) for x in (-length / 2 + 0.3, length / 2 - 0.3)]
    objs += [mesh.box("trough_side", (length, t, h), at=(0.0, s * (width / 2 - t / 2), base), origin="bottom", mat=wood)
             for s in (-1, 1)]
    objs += [mesh.box("trough_end", (t, width - 2 * t, h), at=(s * (length / 2 - t / 2), 0.0, base), origin="bottom",
                      mat=wood) for s in (-1, 1)]
    objs.append(mesh.box("trough_bottom", (length - 2 * t, width - 2 * t, t), at=(0.0, 0.0, base), origin="bottom",
                         mat=wood))
    objs.append(mesh.box("trough_water", (length - 2 * t, width - 2 * t, 0.01), at=(0.0, 0.0, height - 0.09),
                         mat=mat("water")))
    return objs


def log(rng, length, radius, bark="bark", ends=("plank_light", "plank_light"), segments=12):
    """A round log lying along X, centred on the origin: bark round the sides and end grain at the -X and +X ends;
    ends and bark are palette keys or materials, so a burning end can glow."""
    c = min(0.03, radius * 0.25)
    profile = [(radius * 0.9, -length / 2), (radius, -length / 2 + c), (radius, length / 2 - c), (radius * 0.9, length / 2)]
    mats = [mat(k) if isinstance(k, str) else k for k in (ends[0], bark, ends[1])]
    ob = mesh.lathe("log", profile, segments=segments, mat=mats, band_materials=[0, 1, 2])
    ob.matrix_basis = Matrix.Rotation(math.pi / 2, 4, "Y") @ Matrix.Rotation(rng.uniform(0.0, math.pi), 4, "Z")
    return ob


def log_pile(rng, length=2.4, rows=3, radius=0.16, bark="bark", end="plank_light", segments=10):
    """Round logs stacked in a pyramid along X, origin at the bottom centre: each row rests in the hollows of the
    one below, every log a little longer or shorter and pushed out of line."""
    objs = []
    for row in range(rows):
        count = rows + 1 - row
        for i in range(count):
            r = radius * rng.uniform(0.85, 1.05)
            ob = log(rng, length * rng.uniform(0.9, 1.05), r, bark, (end, end), segments)
            ob.location = (jitter(rng, 0.12), (i - (count - 1) / 2) * 2 * radius, radius * (1 + row * math.sqrt(3)) - (radius - r))
            objs.append(ob)
    return objs


def arched_wall(width, height, depth, openings, key, samples=8):
    """A wall slab in wall-local coordinates, face on y = 0 and back at y = depth, with openings notched up from its
    foot: each (cx, width, height, arch) leaves a doorway or belfry opening through it, square when arch is False,
    round-headed when True and a Gothic equilateral point when "pointed"."""
    points = [(-width / 2, 0.0)]
    for cx, w, h, arch in sorted(openings):
        points.append((cx - w / 2, 0.0))
        points += arch_outline(cx, w, h, arch, samples)
        points.append((cx + w / 2, 0.0))
    points += [(width / 2, 0.0), (width / 2, height), (-width / 2, height)]
    return extrude_xz("arched_wall", points, 0.0, depth, key)


def arch_outline(cx, w, h, arch, samples=8):
    """The head of an opening from its left jamb to its right, as (x, z) points: square, round or pointed."""
    if arch == "pointed":
        spring = h - w * math.sqrt(3) / 2
        half = samples // 2
        left = [(cx + w / 2 + w * math.cos(math.pi - math.pi / 3 * i / half), spring + w * math.sin(math.pi - math.pi / 3 * i / half))
                for i in range(half + 1)]
        right = [(cx - w / 2 + w * math.cos(math.pi / 3 * (1 - i / half)), spring + w * math.sin(math.pi / 3 * (1 - i / half)))
                 for i in range(1, half + 1)]
        return left + right
    if arch:
        spring = h - w / 2
        return [(cx - w / 2 * math.cos(math.pi * i / samples), spring + w / 2 * math.sin(math.pi * i / samples))
                for i in range(samples + 1)]
    return [(cx - w / 2, h), (cx + w / 2, h)]


def brick_arch(width, height, ring=0.22, depth=0.08, samples=8, keys=("brick", "tile_dark")):
    """Voussoir bricks round a pointed opening (wall-local, origin at the foot of the opening's centre), alternating
    two brick tones and standing `depth` proud of the wall."""
    inner = arch_outline(0.0, width, height, "pointed", samples)
    outer = arch_outline(0.0, width + 2 * ring, height + ring * 1.4, "pointed", samples)
    objs = []
    for i in range(len(inner) - 1):
        quad = [inner[i], outer[i], outer[i + 1], inner[i + 1]]
        objs.append(extrude_xz("voussoir", quad, -depth, 0.02, keys[i % 2]))
    return objs


def hand_cart(rng, canopy=False, load=True):
    """A two-wheeled hand cart, origin at the bottom centre with its shafts reaching forward along -Y: a plank bed
    with low sides and corner stakes on an iron axle between two spoked wheels, the shafts resting on a prop leg, a
    load of sacks lashed down with rope and, with canopy=True, a striped awning on four poles like a market cart."""
    wood, frame = mat("plank"), mat("timber")
    radius, axle_y = 0.48, 0.12
    bed_z, bed_w, y0, y1 = 0.62, 0.82, -0.5, 0.8
    objs = []
    for s in (-1, 1):
        objs += mesh.transform(wheel(radius, 0.07, rng), mesh.frame((s * 0.52, axle_y, radius)))
        objs.append(mesh.beam("shaft", (s * 0.36, y1 + 0.02, bed_z - 0.05), (s * 0.28, -1.28, bed_z - 0.02), 0.06, 0.07, frame))
    objs.append(mesh.rod("axle", (-0.6, axle_y, radius), (0.6, axle_y, radius), 0.035, mat("iron"), segments=6))
    objs.append(mesh.box("shaft_bar", (0.66, 0.06, 0.06), at=(0.0, -1.0, bed_z - 0.04), mat=frame))
    objs.append(mesh.box("prop_leg", (0.07, 0.07, bed_z - 0.07), at=(0.0, -1.0, 0.0), origin="bottom", mat=frame))
    for i in range(4):
        objs.append(mesh.box("bed_board", (bed_w / 4 - 0.012, y1 - y0, 0.035),
                             at=(-bed_w / 2 + bed_w / 4 * (i + 0.5), (y0 + y1) / 2, bed_z + 0.0175 + jitter(rng, 0.003)), mat=wood))
    for s in (-1, 1):
        for z in (0.1, 0.25):
            objs.append(mesh.box("side_board", (0.03, y1 - y0, 0.13), at=(s * (bed_w / 2 + 0.015), (y0 + y1) / 2, bed_z + z),
                                 mat=wood))
        for y in (y0, y1):
            objs.append(mesh.box("stake", (0.05, 0.05, 0.62 if not canopy else 1.25), at=(s * (bed_w / 2 + 0.045), y, bed_z - 0.1),
                                 origin="bottom", mat=frame))
    for y in (y0 - 0.015, y1 + 0.015):
        objs.append(mesh.box("end_board", (bed_w, 0.03, 0.3), at=(0.0, y, bed_z + 0.035), origin="bottom", mat=wood))
    if load:
        objs += _cart_load(rng, bed_z + 0.035, bed_w, y0, y1)
    if canopy:
        sheet = awning(bed_w + 0.34, y1 - y0 + 0.3, 0.12, rng, stripes=7, sag=0.04, valance=0.14, rows=2)
        objs += mesh.transform([sheet], mesh.frame((0.0, y0 - 0.15, bed_z - 0.1 + 1.25 + 0.02)))
    return objs


def _cart_load(rng, z, width, y0, y1):
    """Two layers of sacks across the bed, an upright one at the back and a rope lashed over them."""
    objs = []
    for y in (y0 + 0.24, (y0 + y1) / 2, y1 - 0.24):
        sk = sack(rng, (width * 0.82, 0.4, 0.27))
        yaw = math.pi * (rng.random() < 0.5) + math.radians(jitter(rng, 6))
        objs += mesh.transform([sk], mesh.frame((jitter(rng, 0.03), y, z), yaw))
    for x, y in ((-0.17, (y0 + y1) / 2 - 0.18), (0.18, (y0 + y1) / 2 + 0.12)):
        sk = sack(rng, (0.55, 0.36, 0.26))
        objs += mesh.transform([sk], mesh.frame((x, y, z + 0.24), math.pi / 2 + math.radians(jitter(rng, 12))))
    objs += mesh.transform([sack(rng, (0.34, 0.32, 0.5), upright=True)], mesh.frame((0.12, y1 - 0.22, z + 0.22)))
    y = (y0 + y1) / 2 - 0.05
    arc = [Vector((width / 2 * math.cos(a), y, z + 0.24 + 0.28 * math.sin(a))) for a in (math.pi * i / 8 for i in range(9))]
    objs.append(rope(arc, 0.012, sides=4, name="lashing"))
    return objs



def _rect(x0, z0, x1, z1):
    return [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]


# Block letters on a 3 by 5 grid for carved dates, the ship's name and the crest (DESIGN.md section 9).
GLYPHS = {
    "0": [_rect(0, 0, 1, 5), _rect(2, 0, 3, 5), _rect(1, 0, 2, 1), _rect(1, 4, 2, 5)],
    "2": [_rect(0, 4, 3, 5), _rect(2, 2, 3, 4), _rect(0, 2, 2, 3), _rect(0, 0, 1, 2), _rect(1, 0, 3, 1)],
    "6": [_rect(0, 0, 1, 5), _rect(1, 4, 3, 5), _rect(1, 2, 3, 3), _rect(1, 0, 3, 1), _rect(2, 1, 3, 2)],
    "Q": [_rect(0, 1, 1, 5), _rect(2, 1, 3, 5), _rect(1, 4, 2, 5), _rect(0, 0, 2.2, 1),
          [(1.6, 1.5), (2.5, 1.5), (3.3, -0.3), (2.4, -0.3)]],
    "H": [_rect(0, 0, 1, 5), _rect(2, 0, 3, 5), _rect(1, 2, 2, 3)],
    "R": [_rect(0, 0, 1, 5), _rect(1, 4, 3, 5), _rect(2, 2, 3, 4), _rect(1, 2, 2, 3), [(1.3, 2), (2.3, 2), (3, 0), (2, 0)]],
    "E": [_rect(0, 0, 1, 5), _rect(1, 4, 3, 5), _rect(1, 2, 2.5, 3), _rect(1, 0, 3, 1)],
    "V": [[(0, 5), (1, 5), (1.5, 1.6), (2, 5), (3, 5), (2, 0), (1, 0)]],
    "A": [_rect(0, 0, 1, 4), _rect(2, 0, 3, 4), [(0.3, 4), (2.7, 4), (2.2, 5), (0.8, 5)], _rect(1, 2, 2, 3)],
}
# Trade shapes for hanging signs, in a unit square round the origin.
EMBLEMS = {
    "anvil": [[(-0.48, 0.28), (0.3, 0.28), (0.48, 0.2), (0.3, 0.14), (0.14, 0.12), (0.08, -0.1), (0.22, -0.28),
               (-0.22, -0.28), (-0.08, -0.1), (-0.14, 0.12), (-0.48, 0.18)]],
    "horseshoe": [[(0.45 * math.cos(math.radians(a)), 0.45 * math.sin(math.radians(a)) + 0.05) for a in range(200, -21, -30)]
                  + [(0.27 * math.cos(math.radians(a)), 0.27 * math.sin(math.radians(a)) + 0.05) for a in range(-20, 201, 30)]],
    "saw": [[(-0.46, 0.1), (0.28, 0.1)] + [(0.28 - 0.0925 * i, -0.1 - 0.07 * (i % 2)) for i in range(9)], _rect(0.28, -0.16, 0.46, 0.16)],
    "book": [[(-0.46, -0.3), (-0.02, -0.22), (-0.02, 0.3), (-0.46, 0.22)], [(0.02, -0.22), (0.46, -0.3), (0.46, 0.22), (0.02, 0.3)]],
    "sheaf": [_rect(-0.03, -0.42, 0.03, 0.2), [(-0.2, -0.4), (-0.15, -0.42), (-0.02, 0.18), (-0.08, 0.2)],
              [(0.15, -0.42), (0.2, -0.4), (0.08, 0.2), (0.02, 0.18)], _rect(-0.16, -0.12, 0.16, -0.05),
              [(0.0, 0.16), (0.07, 0.3), (0.0, 0.46), (-0.07, 0.3)], [(-0.12, 0.14), (-0.06, 0.27), (-0.15, 0.4), (-0.2, 0.26)],
              [(0.12, 0.14), (0.2, 0.26), (0.15, 0.4), (0.06, 0.27)]],
    "shield": [[(-0.4, 0.45), (0.4, 0.45), (0.4, 0.0), (0.0, -0.45), (-0.4, 0.0)]],
}


def relief(polygons, key, depth, through=False):
    """Flat (x, z) polygons standing `depth` proud of a face towards -Y, or with through=True straddling a board so
    they show on both of its faces."""
    y0, y1 = (-depth / 2, depth / 2) if through else (-depth, 0.0)
    return [extrude_xz("relief", poly, y0, y1, key) for poly in polygons]


def lettering(string, height):
    """Block letters as (x, z) polygons, `height` tall, the line centred on the origin at its foot."""
    unit = height / 5
    advance = 4 * unit
    start = -(len(string) * advance - unit) / 2
    return [[(start + i * advance + x * unit, z * unit) for x, z in poly] for i, ch in enumerate(string) for poly in GLYPHS[ch]]


def text(string, height, depth, key):
    """Block letters in relief (wall-local, origin at the bottom centre of the line), `height` tall."""
    return relief(lettering(string, height), key, depth)


def decal(polygons, key, lift=0.002, name="decal"):
    """Flat (x, z) polygons laid on a face `lift` in front of it (towards -Y) and facing out, one object: a brand
    burnt into wood or a stencil painted on it."""
    bm = bmesh.new()
    for poly in polygons:
        face = bm.faces.new([bm.verts.new((x, -lift, z)) for x, z in poly])
        face.normal_update()
        if face.normal.y > 0.0:
            face.normal_flip()
    return mesh.from_bmesh(name, bm, mat(key) if isinstance(key, str) else key)


def crest_shapes(height):
    """The crest's parts as (x, z) polygons, origin at its bottom centre: the brand lantern's iron frame and its glass,
    the QH monogram above it and a small crown on top."""
    h = height
    frame = [_rect(-0.075 * h, 0.0, 0.075 * h, 0.035 * h), _rect(-0.065 * h, 0.035 * h, -0.045 * h, 0.22 * h),
             _rect(0.045 * h, 0.035 * h, 0.065 * h, 0.22 * h), _rect(-0.07 * h, 0.22 * h, 0.07 * h, 0.245 * h),
             [(-0.085 * h, 0.245 * h), (0.085 * h, 0.245 * h), (0.0, 0.3 * h)]]
    crown = [[(x * h, z * h) for x, z in ((-0.2, 0.72), (0.2, 0.72), (0.2, 0.93), (0.11, 0.82), (0.0, 0.98), (-0.11, 0.82),
                                          (-0.2, 0.93))]]
    letters = [[(x, z + 0.36 * h) for x, z in poly] for poly in lettering("QH", 0.3 * h)]
    return {"frame": frame, "glass": [_rect(-0.045 * h, 0.035 * h, 0.045 * h, 0.22 * h)], "crown": crown, "letters": letters}


def crest(height, depth):
    """The island's crest (DESIGN.md section 9) in relief, origin at its bottom centre facing -Y: the brand lantern
    with lit glass at the foot, QH above it and a small crown on top."""
    shapes = crest_shapes(height)
    return (relief(shapes["frame"], "iron", depth) + relief(shapes["glass"], style.lantern_glass(), depth * 0.8)
            + relief(shapes["crown"], "paint_gold", depth) + relief(shapes["letters"], "paint_gold", depth))


def stencil(height, key):
    """The crest stencilled flat in one colour, the lantern's glass left bare (DESIGN.md section 13)."""
    shapes = crest_shapes(height)
    return decal(shapes["frame"] + shapes["crown"] + shapes["letters"], key, name="crest_stencil")


def crown(radius, height, rng, key="paint_gold"):
    """A crown finial (DESIGN.md section 9) standing at the origin: a band with five points, a ball on every point
    and an orb with a cross on top."""
    band = mesh.lathe("crown_band", [(radius * 0.88, 0.0), (radius, 0.0), (radius * 1.04, height * 0.35),
                                     (radius * 0.9, height * 0.35), (radius * 0.88, 0.0)], segments=10, mat=mat(key),
                      cap_bottom=False, cap_top=False)
    objs = [band]
    for k in range(5):
        a = 2 * math.pi * k / 5
        foot = Vector((radius * 0.97 * math.cos(a), radius * 0.97 * math.sin(a), height * 0.33))
        objs.append(mesh.cylinder("crown_point", radius * 0.22, height * 0.4, at=foot, radius_top=radius * 0.03,
                                  mat=mat(key), segments=4))
        objs.append(blob(rng, radius * 0.11, key, squash=1.0, at=foot + Vector((0.0, 0.0, height * 0.42))))
    objs.append(blob(rng, radius * 0.32, key, squash=1.0, at=(0.0, 0.0, height * 0.62)))
    objs.append(mesh.box("crown_cross", (radius * 0.08, radius * 0.08, height * 0.36), at=(0.0, 0.0, height * 0.78),
                         origin="bottom", mat=mat(key)))
    objs.append(mesh.box("crown_cross", (radius * 0.3, radius * 0.08, radius * 0.08), at=(0.0, 0.0, height * 1.02),
                         mat=mat(key)))
    return objs


def pennant(length, height, rng, keys=("columbia", "white"), segments=8, notch=0.28):
    """A swallow-tailed pennant flying from its hoist on the Z axis out along +X, origin at the foot of the hoist:
    it tapers towards the fly, which is cut into two tails, and waves a little; the upper half in the first colour
    and the lower half in the second, double-sided."""
    bm = bmesh.new()
    phase = rng.uniform(0.0, math.pi)

    def point(u, v):
        half = height / 2 * (1 - 0.5 * u)
        x = length * u - (notch * length * max(0.0, (u - 0.7) / 0.3) if v == 0.5 else 0.0)
        z = height / 2 + (v - 0.5) * 2 * half - 0.1 * height * u * u
        return Vector((x, 0.08 * height * math.sin(4 * u + phase) * u, z))

    for j in range(segments):
        u0, u1 = j / segments, (j + 1) / segments
        for v0, v1, key in ((0.0, 0.5, 1), (0.5, 1.0, 0)):
            _two_sided(bm, (point(u0, v0), point(u1, v0), point(u1, v1), point(u0, v1)), (0.0, -1.0, 0.0), key)
    return [mesh.from_bmesh("pennant", bm, [mat(k) for k in keys])]


def pargeting(width, height, key="plaster_warm", relief_key="plaster"):
    """A pargeted plaster panel between studs (wall-local, origin at the bottom centre, facing -Y): a raised border,
    a lozenge and a rosette in shallow relief, the East Anglian way of decorating plaster."""
    hw, b = width / 2, 0.045
    objs = [mesh.box("parget_panel", (width, 0.012, height), at=(0.0, -0.006, height / 2), mat=mat(key))]
    cz = height / 2
    lw, lh = hw - 0.1, height / 2 - 0.1
    shapes = [_rect(-hw, 0.0, hw, b), _rect(-hw, height - b, hw, height), _rect(-hw, b, -hw + b, height - b),
              _rect(hw - b, b, hw, height - b)]
    for (x0, z0), (x1, z1) in (((-lw, cz), (0.0, cz + lh)), ((0.0, cz + lh), (lw, cz)), ((lw, cz), (0.0, cz - lh)),
                               ((0.0, cz - lh), (-lw, cz))):
        shapes.append([(x0, z0 - 0.02), (x1, z1 - 0.02), (x1, z1 + 0.02), (x0, z0 + 0.02)])
    r = min(lw, lh) * 0.45
    shapes.append([((r if i % 2 == 0 else r * 0.45) * math.cos(math.pi * i / 8),
                    cz + (r if i % 2 == 0 else r * 0.45) * math.sin(math.pi * i / 8)) for i in range(16)])
    return objs + mesh.transform(relief(shapes, relief_key, 0.018), Matrix.Translation((0.0, -0.012, 0.0)))


def flower_box(width, rng):
    """An Alsace flower box (wall-local, origin at the top of the wall where it hangs, facing -Y): a plank box on
    two iron brackets heaped with leaves and red flowers."""
    objs = [mesh.box("flower_box", (width, 0.2, 0.16), at=(0.0, -0.12, -0.16), origin="bottom", mat=mat("plank"),
                     bevel=0.01)]
    for x in (-width / 2 + 0.08, width / 2 - 0.08):
        objs.append(mesh.beam("box_bracket", (x, 0.0, -0.32), (x, -0.2, -0.15), 0.025, 0.025, mat("iron")))
    for i in range(3):
        x = -width / 2 + width * (i + 0.5) / 3
        leaf = rock(rng, (width / 3 + 0.08, 0.24, 0.16), key="leaf", rough=0.25)
        leaf.location = (x, -0.12, -0.02)
        objs.append(leaf)
    for i in range(6):
        x = -width / 2 + 0.08 + (width - 0.16) * (i + jitter(rng, 0.3)) / 5
        objs.append(blob(rng, 0.045, "paint_red", at=(x, -0.13 + jitter(rng, 0.05), 0.13 + jitter(rng, 0.02))))
    return objs


def porch(width, depth, top, ground, main_z, main_pitch_deg, rng, keys=SHINGLE_KEYS, pitch_deg=52.0, date=None,
          roof_kwargs=None):
    """A gabled timber porch over a door (wall-local, origin at the bottom centre of the door on the wall face, the
    porch reaching out along -Y): two posts on stone pads at `ground`, side plates back to the wall at `top`, an
    infilled gable whose tie beam carries an optional carved date, and a roof running back until the main roof,
    whose top surface stands main_z above the origin at the wall and rises at main_pitch_deg, covers it."""
    front = -depth + 0.07
    timber = mat("timber")
    objs = []
    for x in (-width / 2 + 0.07, width / 2 - 0.07):
        objs += [mesh.box("porch_post", (0.14, 0.14, top - ground), at=(x, front, ground), origin="bottom", mat=timber),
                 mesh.box("post_pad", (0.26, 0.26, 0.1), at=(x, front, ground), origin="bottom", mat=mat("stone_light"))]
        objs.append(mesh.beam("porch_plate", (x, front, top - 0.08), (x, 0.0, top - 0.08), 0.14, 0.16, timber))
        inward = 1 if x < 0 else -1
        objs.append(mesh.beam("porch_brace", (x, front, top - 0.6), (x + inward * 0.4, front, top - 0.02), 0.09, 0.09, timber))
    rise = (width + 0.1) / 2 * math.tan(math.radians(pitch_deg))
    objs += place(gable_wall(width + 0.1, rise, rng, depth=0.12, key="plaster"), Matrix(), (0.0, front, top))
    if date:
        objs += place(text(date, 0.1, 0.02, "plank_light"), Matrix(), (0.0, front - 0.07, top + 0.04))
    tan_main = math.tan(math.radians(main_pitch_deg))
    reach = -front

    def into_main_roof(z):
        return -10.0, reach + (top + z - main_z) / tan_main + 0.12

    kwargs = {"eave": 0.2, "gable": 0.25, "exposure": 0.2, "rafters": 0, "barges": (True, False),
              "barge_size": (0.16, 0.04), "carved": True}
    kwargs.update(roof_kwargs or {})
    roof = gable_roof(reach + 1.5, width + 0.1, pitch_deg, rng, keys, extent=into_main_roof, **kwargs)
    return objs + mesh.transform(roof, mesh.frame((0.0, front, top), math.pi / 2))


def turret(radius, height, rng, sides=8, corbel=0.8, windows=(), window_z=0.7, roof_height=2.4, keys=SLATE_KEYS,
           core_key="plaster", finial=True):
    """A corbelled corner turret, the Rothenburg oriel of DESIGN.md section 10: a timber-framed polygon on a stone
    corbel, origin at the centre of its floor. Corner posts, sill and head rails, leaded windows on the facets
    listed in `windows` (facet 0 faces -Y, numbered towards +X), a slate spire overhanging the walls and an iron
    finial."""
    step = 2 * math.pi / sides
    corners = [ring_point(radius, step * k + step / 2, 0.0) for k in range(sides)]
    objs = [mesh.polygon("turret_core", [(p.x, p.y) for p in reversed(corners)], height, mat=mat(core_key))]
    timber = mat("timber_dark")
    for p in corners:
        objs.append(mesh.box("turret_post", (0.13, 0.13, height), at=(p.x, p.y, 0.0), origin="bottom", mat=timber))
    apothem = radius * math.cos(step / 2)
    width = 2 * radius * math.sin(step / 2)
    for k in range(sides):
        m = mesh.frame(ring_point(apothem, step * k, 0.0), step * k)
        rails = [member((-width / 2, z), (width / 2, z), 0.12, rng, 0.04) for z in (0.06, window_z - 0.06, height - 0.08)]
        objs += place(rails, m)
        if k in windows:
            objs += place(window(width - 0.26, height - window_z - 0.35, rng, shutters=(False, False), leaded=True), m,
                          (0.0, 0.0, window_z + 0.06))
    base = mesh.lathe("turret_corbel", [(0.12, -corbel), (radius * 0.45, -corbel * 0.55), (radius * 0.9, -0.12),
                                        (radius + 0.06, -0.02), (radius + 0.06, 0.0)], segments=sides,
                      mat=[mat("stone_light"), mat("stone"), mat("stone_light"), mat("stone_light")],
                      band_materials=[0, 1, 2, 3], cap_top=False)
    base.rotation_euler = (0.0, 0.0, step / 2 - math.pi / 2 + math.pi)
    objs.append(base)
    spire = cone_roof(radius / math.cos(step / 2) + 0.18, roof_height, rng, keys=keys, exposure=0.17, thickness=0.028,
                      run=(0.16, 0.28))
    objs += mesh.transform(spire, mesh.frame((0.0, 0.0, height)))
    if finial:
        tip = Vector((0.0, 0.0, height + roof_height + 0.15))
        objs += [mesh.rod("turret_finial", tip, tip + Vector((0.0, 0.0, 0.45)), 0.022, mat("iron"), segments=6),
                 blob(rng, 0.055, "paint_gold", squash=1.0, at=tip + Vector((0.0, 0.0, 0.2)))]
    return objs


def stepped_gable(width, depth, rise, steps, rng, keys=STONE_KEYS, course=(0.3, 0.42), length=(0.55, 1.1)):
    """A Hanseatic crow-stepped gable wall (wall-local, origin at the bottom centre of its outer face, -Y out): `steps`
    blocks narrowing toward the apex, `rise` in all, each faced with rough stone courses on its outer face and capped
    with a coping stone; its first block is the full width, so a roof of the same rise hides behind the steps."""
    objs = []
    step = rise / steps
    for i in range(steps):
        w = width * (1.0 - i / steps)
        z0 = i * step
        objs.append(mesh.box("gable_block", (w, depth, step), at=(0.0, depth / 2, z0), origin="bottom", mat=mat("stone_dark")))
        objs += mesh.transform([stone_face(w, step, rng, keys=keys, course=course, length=length)], mesh.frame((0.0, 0.0, z0)))
        objs.append(mesh.box("gable_coping", (w + 0.1, depth + 0.1, 0.1), at=(0.0, depth / 2, z0 + step), mat=mat("stone_light"),
                             bevel=0.01))
    return objs


# A stave-church dragon head in side view, looking along +X with its jaw open, in a unit 1 m long.
DRAGON_HEAD = [(0.0, -0.06), (0.32, -0.08), (0.62, -0.02), (0.92, -0.1), (1.0, -0.05), (0.7, 0.04), (0.98, 0.1),
               (0.96, 0.17), (0.62, 0.15), (0.5, 0.22), (0.36, 0.34), (0.3, 0.52), (0.18, 0.44), (0.2, 0.28),
               (0.0, 0.16)]


def dragon_head(length, thickness=0.12, key="timber_dark"):
    """A carved dragon head finial, the stave-church kind (DESIGN.md section 10), as a profile slab looking along
    +X from the origin at the back of its neck, with an eye and a crest curl."""
    profile = [(x * length, z * length) for x, z in DRAGON_HEAD]
    head = extrude_xz("dragon_head", profile, -thickness / 2, thickness / 2, key)
    eye = mesh.cylinder("dragon_eye", 0.035 * length, thickness + 0.02, at=(0.6 * length, 0.0, 0.1 * length),
                        rot=(math.pi / 2, 0, 0), mat=mat("paint_gold"), segments=6, origin="center")
    return [head, eye]


def market_counter(length, depth, height, rng, tint="plaster_rose"):
    """A boxed market counter, origin at the bottom centre with the length along X and the customers' side towards
    -Y: a plank top over a front panel in a Colmar tint framed by oak stiles and rails, and a kick board."""
    timber = mat("timber")
    top = 0.05
    objs = [mesh.box("counter_body", (length - 0.1, depth - 0.1, height - top - 0.1), at=(0.0, 0.0, 0.1), origin="bottom",
                     mat=mat("plank")),
            mesh.box("counter_panel", (length - 0.1, 0.03, height - top - 0.18), at=(0.0, -depth / 2 + 0.035, 0.14),
                     origin="bottom", mat=mat(tint)),
            mesh.box("kick_board", (length - 0.06, depth - 0.06, 0.12), at=(0.0, 0.0, 0.0), origin="bottom", mat=timber)]
    stiles = max(2, round(length / 0.8))
    for i in range(stiles + 1):
        x = -length / 2 + 0.06 + (length - 0.12) * i / stiles
        objs.append(mesh.box("counter_stile", (0.07, 0.05, height - top - 0.1), at=(x, -depth / 2 + 0.01, 0.1),
                             origin="bottom", mat=timber))
    objs.append(mesh.box("counter_rail", (length, 0.05, 0.07), at=(0.0, -depth / 2 + 0.01, height - top - 0.06), mat=timber))
    for i in range(3):
        bw = depth / 3
        objs.append(mesh.box("counter_top", (length + 0.08 + jitter(rng, 0.02), bw - 0.01, top),
                             at=(jitter(rng, 0.01), -depth / 2 + bw * (i + 0.5), height - top / 2 + jitter(rng, 0.003)),
                             mat=mat("plank_light")))
    return objs


# Beams sit this far below the post heads so a sagging awning laid over the heads clears them.
STALL_DROP = 0.17


def stall_frame(length, front_top, back_top, front_y, back_y, rng):
    """The squared oak frame of a market stall, origin at the floor between its posts, the length along X: four posts
    on stone pads, a head beam along the front and back, curved knee braces from posts to beams, and tie beams across
    the ends."""
    timber = mat("timber")
    half = length / 2
    objs = []
    for y, top in ((front_y, front_top), (back_y, back_top)):
        for x in (-half, half):
            objs.append(mesh.box("stall_post", (0.1, 0.1, top - 0.05), at=(x, y, 0.05), origin="bottom", mat=timber))
            objs.append(mesh.box("post_pad", (0.18, 0.18, 0.05), at=(x, y, 0.0), origin="bottom", mat=mat("stone_light")))
        objs.append(mesh.box("stall_beam", (length + 0.24, 0.1, 0.12), at=(0.0, y, top - STALL_DROP), mat=timber))
        frame = mesh.frame((0.0, y + 0.06, 0.0))
        for x, s in ((-half, 1), (half, -1)):
            objs += place(curved_member((x, top - 0.6), (x + s * 0.42, top - STALL_DROP - 0.05), s * 0.05, 0.07, rng, 0.06,
                                        segments=2), frame)
    for x in (-half, half):
        objs.append(mesh.beam("tie_beam", (x, front_y, front_top - STALL_DROP), (x, back_y, back_top - STALL_DROP), 0.09, 0.1,
                              timber))
    return objs

