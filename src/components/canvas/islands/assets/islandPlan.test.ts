// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest"
import { ISLAND_MODEL_PATHS } from "./islandManifest"
import { type IslandPlan, arrivePlan, buildIslandPlan, planTransfers } from "./islandPlan"
import { loadIslandTerrain } from "../terrain/terrainFixture"

let plan: IslandPlan

beforeAll(async () => {
  plan = buildIslandPlan(await loadIslandTerrain())
})

describe("the island plan", () => {
  it("survives the trip from the worker intact", () => {
    const copy = structuredClone(plan)
    expect(copy.layout).toEqual(plan.layout)
    const arrived = structuredClone(copy, { transfer: planTransfers(copy) })
    expect(arrived.sea.positions).toEqual(plan.sea.positions)
    expect(arrived.overviewPoints).toEqual(plan.overviewPoints)
    expect(copy.sea.positions).toHaveLength(0)
  })

  it("arrives as the terrain, the walk and the overview the scene expects", () => {
    const arrived = arrivePlan(plan)
    expect(arrived.terrain.groundHeightAt(0, 0)).toBeGreaterThan(0)
    expect(arrived.terrain.walk.length).toBeGreaterThan(0)
    expect(arrived.overview.points).toHaveLength(plan.overviewPoints.length / 3)
  })

  it("names only models the manifest fetches, and the manifest fetches nothing it does not name", () => {
    const { layout } = plan
    const placed = new Set([
      ...layout.placements.map((p) => p.path),
      ...layout.instanced.map((g) => g.path),
      layout.lanterns.path,
      ...layout.rotors.map((r) => r.path)
    ])
    const terrain = ISLAND_MODEL_PATHS.filter((path) => path.endsWith("/terrain.glb"))
    expect(new Set(ISLAND_MODEL_PATHS)).toEqual(new Set([...placed, ...terrain]))
  })
})
