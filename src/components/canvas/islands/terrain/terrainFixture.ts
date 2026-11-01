import terrainJson from "../../../../../public/models/island/terrain.json?raw"
import { decodeHeightPng } from "./heightField"
import type { TerrainData } from "./terrainData"
import { islandTerrain } from "./useTerrain"

// The published terrain files, read for the unit tests. vitest runs on Node, whose types the app leaves
// out, so the heightmap's bytes come through Node's file system reached from the process object.
type NodeProcess = { cwd(): string; getBuiltinModule(id: "node:fs"): { readFileSync(path: string): Uint8Array } }
const nodeProcess = (globalThis as unknown as { process: NodeProcess }).process

export const TERRAIN: TerrainData = JSON.parse(terrainJson)

export async function loadHeightField() {
  const png = nodeProcess.getBuiltinModule("node:fs").readFileSync(`${nodeProcess.cwd()}/public/models/island/${TERRAIN.heightmap.file}`)
  return decodeHeightPng(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer, TERRAIN.heightmap.range)
}

/** The island's terrain as the scene builds it, from the files on disk. */
export async function loadIslandTerrain() {
  return islandTerrain(TERRAIN, await loadHeightField())
}
