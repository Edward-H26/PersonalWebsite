// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest"
import { type BufferAttribute, type BufferGeometry, Vector3 } from "three"
import { buildStreamGeometry, streamFoam, streamToSea } from "./streamGeometry"
import type { ProfileRow } from "./terrainData"
import { loadIslandTerrain } from "./terrainFixture"
import type { IslandTerrain } from "./useTerrain"

const POND_OVERLAP_PX = 4

let terrain: IslandTerrain
let map: IslandTerrain["data"]["map"]
let pondLevel: number
/** The profile's rows carried on to the sea, as the ribbon is built from them. */
let rows: ProfileRow[]
let geometry: BufferGeometry
let position: BufferAttribute
let along: BufferAttribute
let foam: BufferAttribute
let flow: BufferAttribute
let index: BufferAttribute
/** The rows the ribbon was built from, in order, with each row's place in the carried profile and its first vertex. */
let ribbonRows: Array<{ row: ProfileRow; i: number; vertex: number }>
/** Where the ribbon runs into the pond and where it leaves it: the last row before the gap and the first after. */
let inlet: (typeof ribbonRows)[number]
let outlet: (typeof ribbonRows)[number]
let gap: number

const pondRim = (row: ProfileRow) =>
  Math.hypot(row[0] - terrain.data.stream.pond.centre[0], row[1] - terrain.data.stream.pond.centre[1]) - terrain.data.stream.pond.radiusPx

beforeAll(async () => {
  terrain = await loadIslandTerrain()
  map = terrain.data.map
  pondLevel = terrain.data.stream.pond.level
  rows = streamToSea(terrain.data.stream.points, terrain.data.map, (x, y) => terrain.heights.sample(x, y))
  geometry = buildStreamGeometry(terrain)
  position = geometry.getAttribute("position") as BufferAttribute
  along = geometry.getAttribute("aAlong") as BufferAttribute
  foam = geometry.getAttribute("aFoam") as BufferAttribute
  flow = geometry.getAttribute("aFlow") as BufferAttribute
  index = geometry.getIndex()!
  ribbonRows = rows
    .flatMap((row, i) => (pondRim(row) >= -POND_OVERLAP_PX ? [{ row, i }] : []))
    .map((entry, n) => ({ ...entry, vertex: 2 * n }))
  gap = ribbonRows.findIndex((entry, n) => n > 0 && entry.i !== ribbonRows[n - 1].i + 1)
  inlet = ribbonRows[gap - 1]
  outlet = ribbonRows[gap]
})

function vertex(i: number) {
  return new Vector3().fromBufferAttribute(position, i)
}

function speed(v: number) {
  return Math.hypot(flow.getX(v), flow.getY(v))
}

describe("the stream's water", () => {
  it("lays a pair of vertices across every row of the profile but the pond's middle, within a pixel of its line", () => {
    expect(position.count).toBe(2 * ribbonRows.length)
    for (const { row, vertex: v } of ribbonRows) {
      const middle = vertex(v)
        .add(vertex(v + 1))
        .multiplyScalar(0.5)
      const offLine = Math.hypot(middle.x - (row[0] - map.origin[0]) * map.unitsPerPx, middle.z - (row[1] - map.origin[1]) * map.unitsPerPx)
      expect(offLine).toBeLessThan(map.unitsPerPx)
    }
  })

  it("lies on the profile's water surface", () => {
    for (const { row, vertex: v } of ribbonRows) {
      expect(vertex(v).y).toBeCloseTo(row[2] * map.heightScale, 4)
      expect(vertex(v + 1).y).toBeCloseTo(row[2] * map.heightScale, 4)
    }
  })

  it("runs into the pond and out of it on the pond's own surface, so neither end leaves a gap", () => {
    for (const end of [inlet, outlet]) {
      expect(pondRim(end.row)).toBeLessThan(-POND_OVERLAP_PX + 1)
      expect(end.row[2]).toBeCloseTo(pondLevel, 6)
      expect(vertex(end.vertex).y).toBeCloseTo(pondLevel * map.heightScale, 4)
    }
    // Every row from the spring to the inlet and from the outlet to the sea is drawn: no row is skipped but the pond's middle.
    expect(inlet.i).toBe(gap - 1)
    expect(ribbonRows[ribbonRows.length - 1].i).toBe(rows.length - 1)
  })

  it("slows to the pond's stillness at both ends and runs at full pace down the stream", () => {
    expect(speed(inlet.vertex)).toBeLessThan(0.01)
    expect(speed(outlet.vertex)).toBeLessThan(0.01)
    const downstream = ribbonRows.filter(({ row }) => pondRim(row) > 10)
    for (const { vertex: v } of downstream) expect(speed(v)).toBeCloseTo(1, 6)
  })

  it("is about 5 m wide, widening from nothing at the spring", () => {
    const widthAt = (n: number) => vertex(ribbonRows[n].vertex).distanceTo(vertex(ribbonRows[n].vertex + 1)) / map.unitsPerMetre
    expect(widthAt(0)).toBeCloseTo(0, 6)
    expect(widthAt(10)).toBeGreaterThan(0)
    expect(widthAt(10)).toBeLessThan(5)
    for (let n = 40; n < ribbonRows.length; n += 1) expect(widthAt(n)).toBeCloseTo(5, 4)
  })

  it("faces up and never bridges the pond's middle", () => {
    const a = new Vector3()
    const b = new Vector3()
    const c = new Vector3()
    const maxStep = 1.5 * map.unitsPerPx
    for (let i = 0; i < index.count; i += 3) {
      const [ia, ib, ic] = [index.getX(i), index.getX(i + 1), index.getX(i + 2)]
      a.fromBufferAttribute(position, ia)
      b.fromBufferAttribute(position, ib)
      c.fromBufferAttribute(position, ic)
      const normal = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a))
      if (normal.lengthSq() > 1e-10) expect(normal.y).toBeGreaterThan(0)
      const span = Math.max(along.getX(ia), along.getX(ib), along.getX(ic)) - Math.min(along.getX(ia), along.getX(ib), along.getX(ic))
      expect(span).toBeLessThan(maxStep)
    }
    // Two pieces, the stream above the pond and below it: one quad fewer than rows in each.
    expect(index.count).toBe(6 * (ribbonRows.length - 2))
  })
})

describe("the stream's mouth", () => {
  it("carries the stream on past its profile, along its last stretch and never rising, down to the sea", () => {
    const profile = terrain.data.stream.points
    const last = profile[profile.length - 1]
    const carried = rows.slice(profile.length)
    expect(carried.length).toBeGreaterThan(0)
    const [dirX, dirY] = [carried[0][0] - last[0], carried[0][1] - last[1]]
    carried.forEach((row, k) => {
      const before = k === 0 ? last : carried[k - 1]
      expect(row[2]).toBeLessThanOrEqual(before[2])
      expect(Math.abs((row[0] - last[0]) * dirY - (row[1] - last[1]) * dirX)).toBeLessThan(1e-6)
    })
    const mouth = carried[carried.length - 1]
    expect(mouth[2]).toBe(0)
    expect(terrain.heights.sample(mouth[0], mouth[1])).toBeLessThan(0)
  })

  it("tells the material where the water meets the sea", () => {
    expect(geometry.userData.endAlong).toBeCloseTo(rows[rows.length - 1][3] * map.unitsPerPx, 6)
    expect(Math.max(...Array.from(along.array))).toBeCloseTo(geometry.userData.endAlong, 4)
  })
})

describe("the stream's foam", () => {
  let foamAt: number[]
  const drop = (i: number) => (rows[Math.max(i - 1, 0)][2] - rows[Math.min(i + 1, rows.length - 1)][2]) * map.peakMetres

  beforeAll(() => {
    foamAt = streamFoam(rows, map)
  })

  it("gathers where the water falls, the dam below the pond above all", () => {
    const steepest = rows.reduce((best, _, i) => (drop(i) > drop(best) ? i : best), 0)
    expect(foamAt[steepest]).toBe(1)
    const dam = rows.findIndex((row, i) => i > 0 && rows[i - 1][2] === pondLevel && row[2] < pondLevel)
    expect(foamAt[dam]).toBeGreaterThan(0.9)
  })

  it("runs on below a fall for a metre or two and leaves level water clear", () => {
    const fallsFromRow = rows.map((_, i) => drop(i) / (2 * map.metresPerPx))
    foamAt.forEach((foam, i) => {
      // Level for three metres upstream and on the row itself: no fall to carry foam here.
      const levelAbove = fallsFromRow.slice(Math.max(i - 5, 0), i + 1).every((fall) => fall < 0.05)
      if (levelAbove) expect(foam).toBe(0)
    })
    expect(foamAt.filter((f) => f > 0).length).toBeLessThan(rows.length / 4)
  })

  it("rides on the ribbon's vertices", () => {
    for (const { i, vertex: v } of ribbonRows) {
      expect(foam.getX(v)).toBeCloseTo(foamAt[i], 6)
      expect(foam.getX(v + 1)).toBeCloseTo(foamAt[i], 6)
    }
  })
})
