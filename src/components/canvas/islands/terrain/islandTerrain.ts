import { withBase } from "@/utils/assets"
import { type HeightField, decodeHeightPng, groundHeightSampler } from "./heightField"
import { RoadPath } from "./roadPath"
import type { SpurName, TerrainData } from "./terrainData"

/** terrain.json, written by blender/island beside terrain.glb and the heightmap it names. */
const TERRAIN_DATA_PATH = withBase("/models/island/terrain.json")

/**
 * Rows either side over which the walk averages the ring's plan: its corners become arcs of about 12 m
 * that stay on the 7 m road, so the camera turns into a corner instead of swinging round at it.
 */
const WALK_CORNER_ROWS = 10

/** Everything the island is built from: terrain.json, its heightmap decoded, and its roads as paths. */
export type IslandTerrain = {
  data: TerrainData
  heights: HeightField
  /** The ground's scene height under a scene x/z. */
  groundHeightAt: (x: number, z: number) => number
  /** The ring road's centreline, starting at the quay. */
  ring: RoadPath
  /** The line the deck's walk follows round the ring: the centreline with its corners rounded. */
  walk: RoadPath
  spurs: Readonly<Record<SpurName, RoadPath>>
}

/** Builds the paths and samplers of a loaded terrain; also the entry point for tests that read the files from disk. */
export function islandTerrain(data: TerrainData, heights: HeightField): IslandTerrain {
  const spurs = Object.fromEntries(
    Object.entries(data.roads.spurs).map(([name, profile]) => [name, new RoadPath(profile, data.map)])
  ) as Record<SpurName, RoadPath>
  return {
    data,
    heights,
    groundHeightAt: groundHeightSampler(heights, data.map),
    ring: new RoadPath(data.roads.ring, data.map),
    walk: new RoadPath(data.roads.ring, data.map, WALK_CORNER_ROWS),
    spurs
  }
}

async function fetchOk(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return response
}

/** Downloads terrain.json and its heightmap and decodes them into the island's terrain. */
export async function fetchIslandTerrain(): Promise<IslandTerrain> {
  const data = (await (await fetchOk(TERRAIN_DATA_PATH)).json()) as TerrainData
  const heightmapUrl = TERRAIN_DATA_PATH.slice(0, TERRAIN_DATA_PATH.lastIndexOf("/") + 1) + data.heightmap.file
  const png = await (await fetchOk(heightmapUrl)).arrayBuffer()
  return islandTerrain(data, await decodeHeightPng(png, data.heightmap.range))
}
