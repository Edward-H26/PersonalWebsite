// @vitest-environment node
import { describe, expect, it } from "vitest"
import { decodeHeightPng, groundHeightSampler } from "./heightField"
import { mapToScene } from "./terrainData"
import { TERRAIN, loadHeightField } from "./terrainFixture"

describe("the heightmap", async () => {
  const field = await loadHeightField()

  it("decodes the full 16-bit greyscale map", () => {
    expect([field.width, field.height]).toEqual(TERRAIN.heightmap.sizePx)
    const highest = field.values.reduce((a, b) => Math.max(a, b))
    const lowest = field.values.reduce((a, b) => Math.min(a, b))
    expect(highest).toBeCloseTo(TERRAIN.heightmap.range[1], 4)
    expect(lowest).toBeCloseTo(TERRAIN.heightmap.range[0], 4)
  })

  it("agrees with the named points of terrain.json to well under a centimetre", () => {
    for (const name of ["quay", "street", "square", "upper", "gate", "bailey", "peak", "lighthouse"]) {
      const [x, y, h] = TERRAIN.points[name]
      expect(Math.abs(field.sample(x, y) - h) * TERRAIN.map.peakMetres, name).toBeLessThan(0.01)
    }
  })

  it("blends between pixels and holds the edge value beyond the map", () => {
    const between = field.sample(450.5, 420)
    expect(between).toBeCloseTo((field.sample(450, 420) + field.sample(451, 420)) / 2, 6)
    expect(field.sample(-20, -20)).toBe(field.sample(0, 0))
  })

  it("gives scene heights under scene positions", () => {
    const height = groundHeightSampler(field, TERRAIN.map)
    const [x, y, z] = mapToScene(TERRAIN.map, ...TERRAIN.points.square)
    expect(height(x, z)).toBeCloseTo(y, 1)
  })
})

async function deflate(bytes: Uint8Array) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function paethPredictor(left: number, up: number, upLeft: number) {
  const p = left + up - upLeft
  const [toLeft, toUp, toUpLeft] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)]
  if (toLeft <= toUp && toLeft <= toUpLeft) return left
  return toUp <= toUpLeft ? up : upLeft
}

/** A 16-bit greyscale PNG of `rows`, each row written with its own filter type (CRCs left blank). */
async function encodeGrey16(rows: number[][], filters: number[]) {
  const width = rows[0].length
  const stride = width * 2
  const raw = rows.map((row) => Uint8Array.from(row.flatMap((v) => [v >> 8, v & 0xff])))
  const filtered = new Uint8Array(rows.length * (stride + 1))
  raw.forEach((line, y) => {
    const above = y > 0 ? raw[y - 1] : new Uint8Array(stride)
    filtered[y * (stride + 1)] = filters[y]
    for (let i = 0; i < stride; i += 1) {
      const left = i >= 2 ? line[i - 2] : 0
      const upLeft = i >= 2 ? above[i - 2] : 0
      const predictor = [0, left, above[i], (left + above[i]) >> 1, paethPredictor(left, above[i], upLeft)][filters[y]]
      filtered[y * (stride + 1) + 1 + i] = (line[i] - predictor) & 0xff
    }
  })
  const chunk = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(body.length + 12)
    new DataView(out.buffer).setUint32(0, body.length)
    out.set(
      [...type].map((c) => c.charCodeAt(0)),
      4
    )
    out.set(body, 8)
    return out
  }
  const header = new Uint8Array(13)
  new DataView(header.buffer).setUint32(0, width)
  new DataView(header.buffer).setUint32(4, rows.length)
  header.set([16, 0, 0, 0, 0], 8)
  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", await deflate(filtered)),
    chunk("IEND", new Uint8Array(0))
  ]
  const png = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  parts.reduce((at, part) => (png.set(part, at), at + part.length), 0)
  return png.buffer
}

describe("decodeHeightPng", () => {
  it("undoes every PNG row filter", async () => {
    const rows = Array.from({ length: 5 }, (_, y) => Array.from({ length: 4 }, (_, x) => (y * 13_001 + x * 7_919) % 65_536))
    const field = await decodeHeightPng(await encodeGrey16(rows, [0, 1, 2, 3, 4]), [0, 65_535])
    expect(Array.from(field.values)).toEqual(rows.flat())
  })
})
