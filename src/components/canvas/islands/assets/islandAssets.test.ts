import { describe, expect, it } from "vitest"
import { Object3D, Texture } from "three"
import { type IslandLoads, gatherIslandAssets } from "./islandAssets"
import { ISLAND_MODEL_PATHS, ISLAND_TEXTURES } from "./islandManifest"
import type { ArrivedPlan } from "./islandPlan"

/** Stands in for the network: every load waits until the test lets it finish. */
function heldLoads() {
  const started: string[] = []
  const finishers: Array<() => void> = []
  const hold = <T>(name: string, value: T) =>
    new Promise<T>((resolve, reject) => {
      started.push(name)
      finishers.push(() => (name === "fail" ? reject(new Error("fail")) : resolve(value)))
    })
  const loads: IslandLoads = {
    plan: () => hold("plan", {} as ArrivedPlan),
    model: (path) => hold(path, new Object3D()),
    texture: ({ url }) => hold(url, new Texture())
  }
  return { loads, started, finishers }
}

const flush = () => new Promise((resolve) => setTimeout(resolve))

describe("gatherIslandAssets", () => {
  it("starts every load in one go, before the first of them has finished", () => {
    const { loads, started, finishers } = heldLoads()
    void gatherIslandAssets(loads, () => {})
    expect(started).toHaveLength(1 + ISLAND_MODEL_PATHS.length + ISLAND_TEXTURES.length)
    expect(finishers).toHaveLength(started.length)
  })

  it("reports a share that only grows, in steps, from above 0 up to exactly 1", async () => {
    const { loads, finishers } = heldLoads()
    const shares: number[] = []
    const gathered = gatherIslandAssets(loads, (share) => shares.push(share))
    for (const finish of [...finishers].reverse()) {
      finish()
      await flush()
    }
    await gathered
    expect(shares).toHaveLength(finishers.length)
    expect(shares[0]).toBeGreaterThan(0)
    for (let i = 1; i < shares.length; i += 1) expect(shares[i]).toBeGreaterThan(shares[i - 1])
    expect(shares[shares.length - 1]).toBeCloseTo(1, 10)
  })

  it("files every model and texture under its own address", async () => {
    const { loads, finishers } = heldLoads()
    const gathered = gatherIslandAssets(loads, () => {})
    for (const finish of finishers) finish()
    const assets = await gathered
    expect([...assets.models.keys()]).toEqual(ISLAND_MODEL_PATHS)
    expect([...assets.textures.keys()]).toEqual(ISLAND_TEXTURES.map(({ url }) => url))
  })

  it("fails as a whole when one load fails", async () => {
    const loads: IslandLoads = {
      plan: async () => ({}) as ArrivedPlan,
      model: async () => {
        throw new Error("no such model")
      },
      texture: async () => new Texture()
    }
    await expect(gatherIslandAssets(loads, () => {})).rejects.toThrow("no such model")
  })
})
