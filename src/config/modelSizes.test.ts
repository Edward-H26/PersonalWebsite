import { describe, expect, it } from "vitest"
import statsJson from "../../blender/island/build/stats.json?raw"
import { MODEL_PATHS, islandModel } from "./modelPaths"
import { ISLAND_MODEL_SIZES_M, ISLAND_MOUNTS, ISLAND_UNITS_PER_METRE, islandFitHeight, islandSize } from "./modelSizes"

type Mount = { on: string; offset: [number, number, number]; rotationY: number; spinsAbout: string }
const stats = JSON.parse(statsJson) as Record<string, { size: [number, number, number]; mount?: Mount }>

describe("island model sizes", () => {
  it("match the size of every model blender/island/build/stats.json records", () => {
    expect(Object.keys(ISLAND_MODEL_SIZES_M).sort()).toEqual(Object.keys(stats).sort())
    for (const [asset, size] of Object.entries(ISLAND_MODEL_SIZES_M)) expect(size).toEqual(stats[asset].size)
  })

  it("draw the island at 1.3 units per metre, house_02 14.5 units tall, and know every model the island uses", () => {
    expect(ISLAND_UNITS_PER_METRE).toBe(1.3)
    expect(islandFitHeight(MODEL_PATHS.earth.house02)).toBeCloseTo(11.153 * 1.3, 9)
    for (const path of Object.values(MODEL_PATHS.earth)) expect(() => islandSize(path)).not.toThrow()
  })

  it("hang every turning model where stats.json mounts it, spinning about its own x", () => {
    const mounted = Object.entries(stats).filter(([, entry]) => entry.mount)
    expect(Object.keys(ISLAND_MOUNTS).sort()).toEqual(mounted.map(([asset]) => asset).sort())
    for (const [asset, { mount }] of mounted) {
      const { on, offset, rotationY } = ISLAND_MOUNTS[asset as keyof typeof ISLAND_MOUNTS]
      expect({ on, offset: [...offset], rotationY }).toEqual({
        on: mount!.on,
        offset: mount!.offset.map((v) => v + 0),
        rotationY: mount!.rotationY
      })
      expect(mount!.spinsAbout).toBe("x")
    }
  })

  it("draw every model at the one scale, flowers and seedling grass included", () => {
    for (const [asset, [, , heightM]] of Object.entries(ISLAND_MODEL_SIZES_M)) {
      expect(islandFitHeight(islandModel(asset))).toBeCloseTo(heightM * ISLAND_UNITS_PER_METRE, 9)
    }
  })
})
