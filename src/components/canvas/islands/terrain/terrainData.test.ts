import { describe, expect, it } from "vitest"
import { Vector3 } from "three"
import { facingToYaw, mapToScene, sceneToMap } from "./terrainData"
import { TERRAIN } from "./terrainFixture"

describe("the island map in the scene", () => {
  const map = TERRAIN.map

  it("puts the map's origin at the scene's origin and scales a pixel to 0.6 m at 1.3 units a metre", () => {
    expect(mapToScene(map, ...map.origin)).toEqual([0, 0, 0])
    expect(map.unitsPerPx).toBeCloseTo(map.metresPerPx * map.unitsPerMetre)
    expect(map.heightScale).toBeCloseTo(map.peakMetres * map.unitsPerMetre)
  })

  it("runs map x east to scene +x and map y south to scene +z, with the peak at heightScale", () => {
    const [x, y, z] = mapToScene(map, 745, 200, 1)
    expect(x).toBeCloseTo((745 - 500) * 0.78)
    expect(y).toBeCloseTo(59.8)
    expect(z).toBeCloseTo((200 - 350) * 0.78)
    expect(sceneToMap(map, x, z)).toEqual([745, 200])
  })

  it("turns a model's +z front to the map angle it faces", () => {
    const front = (facing: number) => new Vector3(0, 0, 1).applyAxisAngle(new Vector3(0, 1, 0), facingToYaw(facing))
    expect(front(180).z).toBeCloseTo(1)
    expect(front(90).x).toBeCloseTo(1)
    expect(front(0).z).toBeCloseTo(-1)
    expect(front(270).x).toBeCloseTo(-1)
  })
})
