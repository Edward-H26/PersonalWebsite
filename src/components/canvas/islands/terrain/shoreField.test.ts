// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest"
import { HalfFloatType, RedFormat } from "three"
import { ShoreField, shoreTexture } from "./shoreField"
import { mapToScene } from "./terrainData"
import { TERRAIN, loadIslandTerrain } from "./terrainFixture"

let shore: ShoreField

beforeAll(async () => {
  shore = new ShoreField(await loadIslandTerrain())
})

const at = (x: number, y: number) => {
  const [sx, , sz] = mapToScene(TERRAIN.map, x, y)
  return shore.distance(sx, sz)
}

describe("ShoreField", () => {
  it("is positive at sea and negative on land", () => {
    expect(at(...(TERRAIN.points.pier_end.slice(0, 2) as [number, number]))).toBeGreaterThan(0)
    expect(at(...(TERRAIN.points.bay_centre.slice(0, 2) as [number, number]))).toBeGreaterThan(0)
    expect(at(...(TERRAIN.points.square.slice(0, 2) as [number, number]))).toBeLessThan(0)
    expect(at(...(TERRAIN.points.peak.slice(0, 2) as [number, number]))).toBeLessThan(0)
    // The sea stacks and the islet stand out of the water as land of their own.
    expect(at(...(TERRAIN.points.stack1.slice(0, 2) as [number, number]))).toBeLessThan(0)
    expect(at(...(TERRAIN.points.islet.slice(0, 2) as [number, number]))).toBeLessThan(0)
  })

  it("is about zero on the coastline", () => {
    for (const [x, y] of TERRAIN.coast.outline.filter((_, i) => i % 20 === 0)) {
      expect(Math.abs(at(x, y))).toBeLessThan(2.2)
    }
  })

  it("grows with the way out beyond its edge", () => {
    const edge = shore.distance(shore.rect.minX + shore.rect.sizeX, shore.centre.z)
    const beyond = shore.distance(shore.rect.minX + shore.rect.sizeX + 500, shore.centre.z)
    expect(beyond - edge).toBeGreaterThan(490)
  })

  it("knows how near the open water comes to the island's middle", () => {
    expect(shore.nearestWater).toBeGreaterThan(50)
    expect(shore.nearestWater).toBeLessThan(400)
  })

  it("hands the shader a half-float texture of the same field", () => {
    const texture = shoreTexture(shore.halfFloats())
    expect(texture.type).toBe(HalfFloatType)
    expect(texture.format).toBe(RedFormat)
    expect(texture.image.width * (shore.rect.sizeZ / shore.rect.sizeX)).toBeCloseTo(texture.image.height, 0)
    texture.dispose()
  })
})
