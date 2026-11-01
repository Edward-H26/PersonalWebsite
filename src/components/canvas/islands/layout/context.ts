import { FootprintIndex, type RoadSample } from "./placement"
import { mapToScene } from "../terrain/terrainData"
import type { TerrainSite } from "../terrain/terrainSite"

/** Half the width of the gravelled road, in map pixels: terrain.json lays gravel within 6 px of every centreline. */
export const ROAD_HALF_WIDTH_PX = 6
/** Rows between road samples, in map pixels. */
const ROAD_SAMPLE_STRIDE_PX = 2

/** Everything the placement rules need to know about the island they decorate. */
export type LayoutContext = {
  site: TerrainSite
  /** Every road's centreline in world units, for clearance tests. */
  roads: ReadonlyArray<RoadSample>
  /** Height of the ground at a world x/z. */
  sampleGroundY: (x: number, z: number) => number
  /** The nearest point of the coastline to a world x/z, and how far it is, in world units. */
  nearestCoast: (x: number, z: number) => { x: number; z: number; distance: number }
  /** Ground claimed so far: each placement keeps out of what was placed before it. */
  footprints: FootprintIndex
}

/** The roads of terrain.json as world-space samples every two pixels. */
function roadSamples(site: TerrainSite): RoadSample[] {
  const { roads, map } = site.terrain.data
  const halfWidth = ROAD_HALF_WIDTH_PX * map.unitsPerPx
  return [roads.ring, ...Object.values(roads.spurs)].flatMap((road) => {
    const samples: RoadSample[] = []
    for (let i = 0; i < road.points.length; i += ROAD_SAMPLE_STRIDE_PX) {
      const [x, y] = road.points[i]
      const [nextX, nextY] = road.points[Math.min(i + 1, road.points.length - 1)]
      const [prevX, prevY] = road.points[Math.max(i - 1, 0)]
      const length = Math.hypot(nextX - prevX, nextY - prevY) || 1
      const [sx, , sz] = mapToScene(map, x, y)
      samples.push({ x: sx, z: sz, halfWidth, tangentX: (nextX - prevX) / length, tangentZ: (nextY - prevY) / length })
    }
    return samples
  })
}

export function createLayoutContext(site: TerrainSite): LayoutContext {
  const { map, coast } = site.terrain.data
  const coastline = coast.outline.map(([x, y]) => {
    const [sx, , sz] = mapToScene(map, x, y)
    return { x: sx, z: sz }
  })
  return {
    site,
    roads: roadSamples(site),
    sampleGroundY: site.terrain.groundHeightAt,
    nearestCoast: (x, z) => {
      let best = { x: coastline[0].x, z: coastline[0].z, distance: Number.POSITIVE_INFINITY }
      for (const p of coastline) {
        const distance = Math.hypot(p.x - x, p.z - z)
        if (distance < best.distance) best = { x: p.x, z: p.z, distance }
      }
      return best
    },
    footprints: new FootprintIndex()
  }
}
