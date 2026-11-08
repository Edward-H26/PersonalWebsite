import { Vector3 } from "three"
import type { OverviewScene } from "@/components/canvas/camera/overviewFraming"
import { buildSeaGeometry } from "@/components/canvas/environment/seaGeometry"
import { type IslandLayout, buildIslandLayout } from "../layout"
import type { HarborWaterline } from "../layout/harbor"
import { islandOverviewScene } from "../layout/overview"
import { HeightField } from "../terrain/heightField"
import { type IslandTerrain, islandTerrain } from "../terrain/islandTerrain"
import { ShoreField, type ShoreHalfFloats } from "../terrain/shoreField"
import type { TerrainData } from "../terrain/terrainData"
import { TerrainSite } from "../terrain/terrainSite"

/** The sea's mesh and shore field, computed and ready to hand to the GPU. */
export type SeaPlan = {
  positions: Float32Array
  /** Each vertex's distance from the shore. */
  shoreDistances: Float32Array
  indices: Uint16Array | Uint32Array
  shoreField: ShoreHalfFloats
  /** Where the shore field lies in world x/z and where its middle is. */
  shoreRect: ShoreField["rect"]
  shoreCentre: ShoreField["centre"]
  waterline: HarborWaterline
}

/**
 * All the island computes from its terrain before anything is drawn. It is built once, in a worker, so it costs the
 * page no frames however long it takes, and it holds only what survives the trip back: plain data and typed arrays.
 */
export type IslandPlan = {
  data: TerrainData
  heights: { width: number; height: number; values: Float32Array }
  layout: IslandLayout
  /** The overview's points as x, y, z triples. */
  overviewPoints: Float64Array
  sea: SeaPlan
}

/** What the page builds from a plan on arrival: the terrain's paths and samplers and the overview's points. */
export type ArrivedPlan = { terrain: IslandTerrain; layout: IslandLayout; overview: OverviewScene; sea: SeaPlan }

function planSea(terrain: IslandTerrain, waterline: HarborWaterline): SeaPlan {
  const shore = new ShoreField(terrain)
  const geometry = buildSeaGeometry(shore)
  return {
    positions: geometry.getAttribute("position").array as Float32Array,
    shoreDistances: geometry.getAttribute("aShore").array as Float32Array,
    indices: geometry.getIndex()!.array as Uint16Array | Uint32Array,
    shoreField: shore.halfFloats(),
    shoreRect: shore.rect,
    shoreCentre: shore.centre,
    waterline
  }
}

export function buildIslandPlan(terrain: IslandTerrain): IslandPlan {
  const site = new TerrainSite(terrain)
  const layout = buildIslandLayout(site)
  const { points } = islandOverviewScene(site, layout.harbor)
  return {
    data: terrain.data,
    heights: { width: terrain.heights.width, height: terrain.heights.height, values: terrain.heights.values },
    layout,
    overviewPoints: Float64Array.from(points.flatMap((p) => [p.x, p.y, p.z])),
    sea: planSea(terrain, layout.harbor.waterline)
  }
}

/** The plan's large arrays, which move to the page instead of being copied. */
export function planTransfers({ heights, overviewPoints, sea }: IslandPlan): ArrayBuffer[] {
  return [heights.values, overviewPoints, sea.positions, sea.shoreDistances, sea.indices, sea.shoreField.data].map(
    (array) => array.buffer as ArrayBuffer
  )
}

export function arrivePlan(plan: IslandPlan): ArrivedPlan {
  const { width, height, values } = plan.heights
  const points: Vector3[] = []
  for (let i = 0; i < plan.overviewPoints.length; i += 3) points.push(new Vector3().fromArray(plan.overviewPoints, i))
  return {
    terrain: islandTerrain(plan.data, new HeightField(width, height, values)),
    layout: plan.layout,
    overview: { points },
    sea: plan.sea
  }
}
