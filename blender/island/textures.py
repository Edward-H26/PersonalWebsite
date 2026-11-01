"""Tileable textures painted with numpy for the vegetation atlases and the island ground (DESIGN.md section 13b):
bark for oak and ash, birch, spruce and apple, end grain for sawn faces, the cypress's scale foliage, slate with its
strata and lichen, the ground of meadow grass, clover and worn earth, and the terrain's dark earth, cobbles, gravel and
sand. Noise is white noise shaped in the Fourier domain and stamps wrap round the edges, so every texture repeats
without a seam. Colours are sRGB-encoded arrays of shape (height, width, 3) in
[0, 1], rows from the top; bark runs along the image's vertical axis."""

import math

import numpy as np


def noise(shape, rng, scale, stretch=(1.0, 1.0), power=2.0):
    """Seamless noise in [0, 1] with features about `scale` pixels across; stretch (y, x) above 1 lengthens them
    along that axis."""
    h, w = shape
    fy = np.fft.fftfreq(h)[:, None] * stretch[0]
    fx = np.fft.fftfreq(w)[None, :] * stretch[1]
    radius = np.sqrt(fx * fx + fy * fy) * scale
    field = np.real(np.fft.ifft2(np.fft.fft2(rng.standard_normal(shape)) * np.exp(-radius ** power)))
    field -= field.min()
    return field / max(1e-9, field.max())


def octaves(shape, rng, scales, weights, stretch=(1.0, 1.0)):
    field = sum(w * noise(shape, rng, s, stretch) for s, w in zip(scales, weights))
    field -= field.min()
    return field / max(1e-9, field.max())


def hexes(*codes):
    return [np.array([int(c[i:i + 2], 16) / 255.0 for i in (1, 3, 5)]) for c in codes]


def ramp(t, stops):
    """Colours along `stops` [(position, rgb)] for values `t`."""
    positions = np.array([p for p, _ in stops])
    colours = np.array([c for _, c in stops])
    return np.stack([np.interp(t, positions, colours[:, i]) for i in range(3)], axis=-1)


def _stamp(canvas, mask, value, cy, cx):
    """Blend `value` into `canvas` through `mask`, centred at (cy, cx), wrapping at the edges so the result tiles."""
    h, w = canvas.shape[:2]
    mh, mw = mask.shape
    rows = (np.arange(mh) - mh // 2 + cy) % h
    cols = (np.arange(mw) - mw // 2 + cx) % w
    region = canvas[np.ix_(rows, cols)]
    m = mask[..., None] if canvas.ndim == 3 else mask
    canvas[np.ix_(rows, cols)] = region * (1.0 - m) + value * m


def bark(rng, size=256, kind="oak"):
    """oak: grey-brown ridges split by deep vertical fissures and broken across into blocks; birch: chalk white with
    dark horizontal lenticels and black diamond scars; spruce: thin grey-brown scales flaking at their rims; apple:
    grey-brown plates flaking to warmer underbark."""
    shape = (size, size)
    if kind == "birch":
        base = ramp(octaves(shape, rng, (40, 10), (0.7, 0.3)), [(0.0, hexes("#c9c6bb")[0]), (1.0, hexes("#f2f0e8")[0])])
        lenticels = np.clip((noise(shape, rng, 2.5, stretch=(0.6, 9.0)) - 0.66) * 7.0, 0, 1)
        scars = np.clip((octaves(shape, rng, (26, 8), (0.7, 0.3), stretch=(0.8, 2.2)) - 0.74) * 6.0, 0, 1)
        dark = np.clip(lenticels * 0.85 + scars, 0, 1)
        return base * (1.0 - 0.88 * dark[..., None]) + hexes("#2b2622")[0] * (0.88 * dark[..., None])
    if kind == "spruce":
        flakes = octaves(shape, rng, (9, 3), (0.75, 0.25), stretch=(1.3, 1.0))
        rims = np.clip(np.abs(np.gradient(flakes, axis=0)) * 30.0, 0, 1)
        colour = ramp(flakes, [(0.0, hexes("#3a2a22")[0]), (0.55, hexes("#6a5143")[0]), (1.0, hexes("#8c7461")[0])])
        return colour * (1.0 - 0.45 * rims[..., None])
    ridges = octaves(shape, rng, (10, 3), (0.8, 0.2), stretch=(5.0, 1.0) if kind == "oak" else (1.6, 1.0))
    breaks = np.clip((noise(shape, rng, 4, stretch=(1.0, 6.0)) - 0.7) * 5.0, 0, 1)
    depth = np.clip((ridges - 0.36) * 2.6, 0, 1) * (1.0 - 0.6 * breaks)
    light = noise(shape, rng, 2)
    if kind == "apple":
        stops = [(0.0, hexes("#2a221c")[0]), (0.45, hexes("#5a4c40")[0]), (0.8, hexes("#82786a")[0]), (1.0, hexes("#9c8f7c")[0])]
    else:
        stops = [(0.0, hexes("#1e1914")[0]), (0.45, hexes("#4e463d")[0]), (0.8, hexes("#77706a")[0]), (1.0, hexes("#8e877e")[0])]
    return ramp(depth * (0.82 + 0.18 * light), stops)


def end_grain(rng, size=256):
    """The sawn face of a log filling the cell: pale sapwood to darker heartwood in uneven annual rings, a radial
    check and a bark rim."""
    y, x = (np.mgrid[0:size, 0:size] + 0.5) / size - 0.5
    wobble = (noise((size, size), rng, 24) - 0.5) * 0.04
    r = np.sqrt(x * x + y * y) / 0.5 + wobble
    widths = np.cumsum(rng.uniform(0.6, 1.4, 64))
    ring_pos = np.interp(r, np.linspace(0, 1.2, 64), widths / widths[48])
    rings = 0.5 + 0.5 * np.cos(ring_pos * 2 * math.pi * 16)
    wood = ramp(np.clip(r, 0, 1), [(0.0, hexes("#8a5a32")[0]), (0.55, hexes("#b88c5a")[0]), (0.9, hexes("#cfa877")[0]),
                                    (1.0, hexes("#cfa877")[0])])
    wood *= (0.82 + 0.18 * rings)[..., None]
    angle = np.arctan2(y, x)
    check = np.clip(1.0 - np.abs(angle - 0.7) * r * 40.0, 0, 1) * (r < 0.85)
    wood *= (1.0 - 0.75 * check)[..., None]
    return np.where((r > 0.93)[..., None], hexes("#3a2e24")[0], wood)


def scale_foliage(rng, size=256, sprays=900):
    """Dense cypress foliage as a neutral tone that tiles: upright feathery sprays stamped back to front, each lit
    from above and shading down to its base, deep shadow in the gaps between them."""
    canvas = np.full((size, size), 0.14)
    yy, xx = np.mgrid[-16:17, -10:11]
    for _ in range(sprays):
        cy, cx = rng.integers(0, size), rng.integers(0, size)
        length, width = rng.uniform(9.0, 15.0), rng.uniform(3.5, 6.0)
        lean = rng.uniform(-0.35, 0.35)
        u = yy + xx * lean
        v = xx - yy * lean
        edge = 1.0 + 0.35 * np.sin(u * 1.9 + rng.uniform(0, 6))
        d = np.sqrt((v / (width * edge)) ** 2 + (u / length) ** 2)
        mask = np.clip((1.0 - d) * 3.0, 0, 1)
        lit = np.clip(0.62 - 0.5 * u / length, 0.18, 1.0) * rng.uniform(0.7, 1.0)
        _stamp(canvas, mask, lit, cy, cx)
    return np.repeat(canvas[..., None], 3, axis=-1)


def rock(rng, size=1024):
    """Grey slate in horizontal beds of uneven thickness, darker partings between them, the top of each bed a little
    lighter where it weathers, crusts of grey-green lichen and small rosettes in sulphur and orange."""
    shape = (size, size)
    y = np.arange(size)[:, None] / size
    warp = (octaves(shape, rng, (120, 30), (0.75, 0.25), stretch=(1.0, 3.0)) - 0.5) * 0.06
    beds = 11
    edges = np.concatenate([[0.0], np.cumsum(rng.uniform(0.45, 1.55, beds))])
    edges /= edges[-1]
    pos = np.clip((y + warp) % 1.0, 0.0, 0.999999)
    index = np.searchsorted(edges, pos, side="right") - 1
    band = (pos - edges[index]) / (edges[index + 1] - edges[index])
    tones = rng.uniform(0.84, 1.1, beds)
    grain = octaves(shape, rng, (30, 8, 2), (0.45, 0.35, 0.2), stretch=(1.0, 4.0))
    stone = ramp(grain, [(0.0, hexes("#45474b")[0]), (0.55, hexes("#6a6d72")[0]), (1.0, hexes("#93948f")[0])])
    stone = stone * tones[index][..., None]
    parting = np.clip(1.0 - band / 0.05, 0, 1) * 0.55
    weathered = np.clip((band - 0.7) / 0.3, 0, 1) * 0.16
    stone = stone * (1.0 - parting + weathered)[..., None]
    crust = np.clip((octaves(shape, rng, (40, 6), (0.7, 0.3)) - 0.62) * 4.0, 0, 1) * 0.7
    stone = stone * (1.0 - crust[..., None]) + hexes("#9aa088")[0] * (0.85 + 0.3 * noise(shape, rng, 2))[..., None] * crust[..., None]
    for _ in range(int(size * size / 7000)):
        r = rng.uniform(2.5, 9.0)
        span = int(r * 1.6) + 3
        yy, xx = np.mgrid[-span:span + 1, -span:span + 1]
        lobes = noise(yy.shape, rng, 2.0) * 0.6 + 0.7
        mask = np.clip((1.0 - np.sqrt(xx * xx + yy * yy) / (r * lobes)) * 2.5, 0, 1) * rng.uniform(0.55, 0.9)
        colour = hexes("#b4a65a")[0] if rng.random() < 0.65 else hexes("#c0843e")[0]
        _stamp(stone, mask, colour * rng.uniform(0.8, 1.05), rng.integers(0, size), rng.integers(0, size))
    return np.clip(stone, 0, 1)


def ground(rng, size=1024, clover=9000, pebbles=900):
    """The island's turf, seamless: mottled meadow greens with fine blade strokes, drifts of white clover with
    three round leaflets, and worn-earth patches of soil and pebbles where feet and carts pass."""
    shape = (size, size)
    meadow = ramp(octaves(shape, rng, (120, 30, 8), (0.5, 0.3, 0.2)),
                  [(0.0, hexes("#3d5a1f")[0]), (0.5, hexes("#56752b")[0]), (1.0, hexes("#7a9440")[0])])
    strokes = noise(shape, rng, 0.7, stretch=(5.0, 1.0)) * 0.55 + noise(shape, rng, 0.7, stretch=(1.0, 5.0)) * 0.45
    meadow *= (0.5 + 0.9 * strokes ** 1.3)[..., None]
    drift = np.clip((noise(shape, rng, 70) - 0.5) * 4.0, 0, 1)
    cover = np.zeros(shape)
    yy, xx = np.mgrid[-7:8, -7:8]
    for _ in range(clover):
        cy, cx = rng.integers(0, size), rng.integers(0, size)
        if rng.random() > 0.15 + 0.85 * drift[cy, cx]:
            continue
        turn, leaflet = rng.uniform(0, 2 * math.pi), rng.uniform(2.2, 3.4)
        stamp = np.zeros(yy.shape)
        for k in range(3):
            a = turn + 2 * math.pi * k / 3
            stamp = np.maximum(stamp, np.clip(1.0 - np.hypot(xx - math.cos(a) * leaflet, yy - math.sin(a) * leaflet) / leaflet, 0, 1))
        _stamp(cover, (stamp > 0.1) * (0.75 + 0.25 * stamp), 1.0, cy, cx)
    clover_colour = hexes("#6a9a3e")[0] * (0.85 + 0.3 * noise(shape, rng, 2))[..., None]
    turf = meadow * (1.0 - cover[..., None]) + clover_colour * cover[..., None]
    worn = np.clip((noise(shape, rng, 150) - 0.64) * 5.0, 0, 1) * np.clip(noise(shape, rng, 18) * 1.7, 0, 1)
    soil = ramp(octaves(shape, rng, (24, 5), (0.6, 0.4)), [(0.0, hexes("#4a3826")[0]), (1.0, hexes("#7a6448")[0])])
    for _ in range(pebbles):
        r = rng.uniform(1.5, 4.0)
        span = int(r) + 2
        py, px = np.mgrid[-span:span + 1, -span:span + 1]
        mask = np.clip((1.0 - np.hypot(px, py * 1.2) / r) * 3.0, 0, 1)
        lit = np.clip(0.9 - 0.25 * py / r, 0.5, 1.1)[..., None]
        _stamp(soil, mask, hexes("#9a958a")[0] * rng.uniform(0.7, 1.1) * lit, rng.integers(0, size), rng.integers(0, size))
    return np.clip(turf * (1.0 - worn[..., None]) + soil * worn[..., None], 0, 1)


def _cells(size, rows, cols, rng, jitter=0.35):
    """Seamless Voronoi cells over a jittered rows x cols grid of points: per pixel the distances to the nearest and
    the second nearest point, the nearest point's index, and the pixel's (y, x) offset from that point."""
    ch, cw = size / rows, size / cols
    py = (np.arange(rows)[:, None] + 0.5 + rng.uniform(-jitter, jitter, (rows, cols))) * ch
    px = (np.arange(cols)[None, :] + 0.5 + rng.uniform(-jitter, jitter, (rows, cols))) * cw
    y, x = np.mgrid[0:size, 0:size] + 0.5
    r0, c0 = np.floor(y / ch).astype(int), np.floor(x / cw).astype(int)
    first, second = np.full((size, size), np.inf), np.full((size, size), np.inf)
    index, dy, dx = np.zeros((size, size), int), np.zeros((size, size)), np.zeros((size, size))
    for step_r in (-1, 0, 1):
        for step_c in (-1, 0, 1):
            rr, cc = r0 + step_r, c0 + step_c
            r, c = rr % rows, cc % cols
            # The neighbouring cell's point, moved by whole tiles when the neighbour lies across the edge.
            qy, qx = py[r, c] + (rr // rows) * size, px[r, c] + (cc // cols) * size
            d = np.hypot(y - qy, x - qx)
            nearer = d < first
            second = np.where(nearer, first, np.minimum(second, d))
            first = np.where(nearer, d, first)
            index = np.where(nearer, r * cols + c, index)
            dy, dx = np.where(nearer, y - qy, dy), np.where(nearer, x - qx, dx)
    return first, second, index, dy, dx


def _darken(canvas, mask, cy, cx):
    """Darken `canvas` by `mask` (0 to 1) centred at (cy, cx), wrapping at the edges like _stamp."""
    h, w = canvas.shape[:2]
    rows = (np.arange(mask.shape[0]) - mask.shape[0] // 2 + cy) % h
    cols = (np.arange(mask.shape[1]) - mask.shape[1] // 2 + cx) % w
    canvas[np.ix_(rows, cols)] *= (1.0 - mask)[..., None]


def _pebbles(canvas, rng, count, radius, colours, shadow=0.45):
    """Stamp `count` pebbles of `radius` (min, max) px into `canvas`: rounded, a little angular, lit from the top
    left with a soft shadow to the bottom right, each in one of `colours` at its own tone."""
    for _ in range(count):
        r = rng.uniform(*radius)
        span = int(r * 1.6) + 3
        yy, xx = np.mgrid[-span:span + 1, -span:span + 1]
        turn, squash = rng.uniform(0, math.pi), rng.uniform(0.6, 1.0)
        u, v = xx * math.cos(turn) + yy * math.sin(turn), (yy * math.cos(turn) - xx * math.sin(turn)) / squash
        rim = r * (0.85 + 0.25 * noise(yy.shape, rng, 1.5))
        d = np.hypot(u, v) / rim
        cy, cx = rng.integers(0, canvas.shape[0]), rng.integers(0, canvas.shape[1])
        _darken(canvas, np.clip((1.0 - np.hypot(xx - r * 0.35, yy - r * 0.35) / (r * 1.4)), 0, 1) * shadow, cy, cx)
        lit = np.clip(1.05 - 0.35 * (xx + yy) / (r * 1.4) - 0.25 * d * d, 0.45, 1.2)[..., None]
        colour = colours[rng.integers(len(colours))] * rng.uniform(0.82, 1.1)
        _stamp(canvas, np.clip((1.0 - d) * 4.0, 0, 1), colour * lit, cy, cx)


def earth(rng, size=1024, clods=700, stones=420):
    """Dark earth for lanes, verges and the stream's bed, seamless: damp mottled soil with fine crumb, lumps of clod
    lit from above and a scatter of small stones."""
    shape = (size, size)
    soil = ramp(octaves(shape, rng, (90, 20, 5), (0.5, 0.3, 0.2)),
                [(0.0, hexes("#241a12")[0]), (0.5, hexes("#3d2e20")[0]), (1.0, hexes("#5e4a36")[0])])
    damp = np.clip((noise(shape, rng, 110) - 0.45) * 2.5, 0, 1) * 0.35
    soil *= (1.0 - damp)[..., None] * (0.82 + 0.3 * noise(shape, rng, 0.8))[..., None]
    for _ in range(clods):
        r = rng.uniform(3.0, 11.0)
        span = int(r * 1.5) + 2
        yy, xx = np.mgrid[-span:span + 1, -span:span + 1]
        d = np.hypot(xx, yy * rng.uniform(0.9, 1.4)) / (r * (0.8 + 0.4 * noise(yy.shape, rng, 1.5)))
        lit = np.clip(1.1 - 0.45 * yy / r, 0.55, 1.25)[..., None]
        _stamp(soil, np.clip((1.0 - d) * 3.0, 0, 1) * 0.8, hexes("#4f3c2a")[0] * rng.uniform(0.8, 1.15) * lit,
               rng.integers(0, size), rng.integers(0, size))
    _pebbles(soil, rng, stones, (1.5, 4.5), hexes("#7d776c", "#8f8676", "#5f5a52"))
    return np.clip(soil, 0, 1)


def cobble(rng, size=1024, rows=22, cols=20):
    """The village's cobbles, seamless: rounded setts in a loose grid, each domed, lit from the top left and in its own
    honey or slate tone, set in dark joints of soil with moss in some of them."""
    first, second, index, dy, dx = _cells(size, rows, cols, rng)
    radius = 0.5 * size / max(rows, cols)
    edge = (second - first) / 2.0
    # Cut each cell's corners off so the setts read as rounded cobbles rather than crazy paving.
    stone = np.clip((edge - 2.0) / 3.0, 0, 1) * np.clip((radius * 1.3 - first) / 4.0, 0, 1)
    dome = 1.0 - np.clip(first / (radius * 1.25), 0, 1) ** 2
    light = np.clip(0.5 - 0.35 * (dy + dx) / radius, 0, 1)
    tones = rng.uniform(0.8, 1.12, rows * cols)
    palette = np.array(hexes("#9a8f7c", "#a89c86", "#7e7a72", "#8c8577", "#b3a68c"))
    colour = palette[rng.integers(len(palette), size=rows * cols)][index] * tones[index][..., None]
    grain = noise((size, size), rng, 1.2)
    stones = colour * (0.55 + 0.3 * dome + 0.3 * light + 0.12 * (grain - 0.5))[..., None]
    moss = np.clip((noise((size, size), rng, 60) - 0.55) * 3.0, 0, 1)
    joint = hexes("#2e2820")[0] * (1.0 - moss[..., None]) + hexes("#46552a")[0] * moss[..., None]
    joint = joint * (0.8 + 0.4 * noise((size, size), rng, 1.0))[..., None]
    return np.clip(stones * stone[..., None] + joint * (1.0 - stone[..., None]), 0, 1)


def gravel(rng, size=1024, pebbles=26000):
    """Gravel for the roads outside the village, seamless: a packed bed of small angular stones in greys, buff and a
    little rust over sandy soil showing between them."""
    shape = (size, size)
    bed = ramp(octaves(shape, rng, (60, 12, 3), (0.5, 0.3, 0.2)),
               [(0.0, hexes("#5a5044")[0]), (0.6, hexes("#7c705f")[0]), (1.0, hexes("#998c78")[0])])
    _pebbles(bed, rng, pebbles, (2.0, 6.5), hexes("#8f8b84", "#a39d92", "#77736c", "#b5a68a", "#8a6f55", "#c9c4b8"), shadow=0.35)
    return np.clip(bed * (0.9 + 0.2 * noise(shape, rng, 0.8))[..., None], 0, 1)


def sand(rng, size=1024, ripples=14, shells=260):
    """Beach sand, seamless: fine grains rippled by the tide, dry and pale on the crests, darker and damp in patches
    and the troughs, with a few broken shells."""
    shape = (size, size)
    y, x = np.mgrid[0:size, 0:size] / size
    warp = (octaves(shape, rng, (180, 50), (0.7, 0.3)) - 0.5) * 0.9
    # A whole number of ripples across the tile and a periodic warp keep the ridges seamless.
    phase = 2 * math.pi * (ripples * y + 2 * x + warp)
    ridge = np.sin(phase)
    flank = np.cos(phase)
    tone = octaves(shape, rng, (70, 14, 3), (0.5, 0.3, 0.2))
    dry = ramp(tone, [(0.0, hexes("#b8a47c")[0]), (0.6, hexes("#cdbb92")[0]), (1.0, hexes("#ddd0ac")[0])])
    damp = np.clip((noise(shape, rng, 90) - 0.5) * 2.4, 0, 1) * 0.6 + np.clip(-ridge, 0, 1) * 0.15
    wet = hexes("#8f8064")[0]
    colour = dry * (1.0 - damp[..., None]) + wet * damp[..., None]
    colour = colour * (0.94 + 0.08 * flank + 0.1 * (noise(shape, rng, 0.6) - 0.5))[..., None]
    for _ in range(shells):
        r = rng.uniform(1.5, 4.0)
        span = int(r) + 2
        yy, xx = np.mgrid[-span:span + 1, -span:span + 1]
        mask = np.clip((1.0 - np.hypot(xx, yy * rng.uniform(1.0, 2.0)) / r) * 3.0, 0, 1)
        shell = hexes("#f1ece2", "#e8d6c8", "#d9cdb8")[rng.integers(3)] * rng.uniform(0.85, 1.05)
        _stamp(colour, mask, shell, rng.integers(0, size), rng.integers(0, size))
    return np.clip(colour, 0, 1)
