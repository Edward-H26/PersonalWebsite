import { assembleGeometry } from "./bufferGeometry"
import { ISLAND_OUTLINE_SEGMENTS, type IslandOutline, outlinePoint } from "./outline"

/** Height of the cliff wall below the terrain rim, in island-local units. */
export const ISLAND_DEPTH = 42
const ISLAND_RINGS = 44
const CLIFF_ROWS = 14

// Texture tile sizes in local units; UVs are generated in tile space so every surface tiles squarely.
const GRASS_TILE = 11
const CLIFF_TILE = 15

/**
 * The island top: a fan of ISLAND_RINGS concentric rings from the centroid to the rim, each
 * vertex lifted by `heightAt`. The outermost ring is the rim shared with the cliff wall.
 */
export function makeIslandTopGeometry(outline: IslandOutline, heightAt: (x: number, z: number) => number) {
  const M = ISLAND_OUTLINE_SEGMENTS
  const K = ISLAND_RINGS
  const vertexCount = 1 + K * M
  const positions = new Float32Array(vertexCount * 3)
  const uvs = new Float32Array(vertexCount * 2)

  const setVertex = (v: number, x: number, z: number) => {
    positions[v * 3 + 0] = x
    positions[v * 3 + 1] = heightAt(x, z)
    positions[v * 3 + 2] = z
    uvs[v * 2 + 0] = x / GRASS_TILE
    uvs[v * 2 + 1] = z / GRASS_TILE
  }

  setVertex(0, outline.centerX, outline.centerZ)
  for (let k = 1; k <= K; k += 1) {
    const s = k / K
    for (let i = 0; i < M; i += 1) {
      const rim = outlinePoint(outline, i)
      const x = outline.centerX + (rim.x - outline.centerX) * s
      const z = outline.centerZ + (rim.z - outline.centerZ) * s
      setVertex(1 + (k - 1) * M + i, x, z)
    }
  }

  const indices: number[] = []
  for (let i = 0; i < M; i += 1) {
    indices.push(0, 1 + ((i + 1) % M), 1 + i)
  }
  for (let k = 1; k < K; k += 1) {
    const inner = 1 + (k - 1) * M
    const outer = 1 + k * M
    for (let i = 0; i < M; i += 1) {
      const j = (i + 1) % M
      indices.push(inner + i, outer + j, outer + i)
      indices.push(inner + i, inner + j, outer + j)
    }
  }

  const geo = assembleGeometry(positions, uvs, indices)
  geo.computeBoundingSphere()
  return geo
}

function cliffOffset(theta: number, depthFraction: number, y: number) {
  const lip = 1.4 * Math.sin(Math.PI * Math.min(1, depthFraction * 1.6))
  const striations = 0.55 * Math.sin(theta * 11 + y * 0.35) + 0.45 * Math.sin(theta * 29 + 1.3) * Math.cos(y * 0.22)
  return lip + 1.7 * striations
}

/**
 * Cliff walls hang from the rim to `baseY`, below the waterline, and close with a flat base.
 * UVs run along the rim (u) and down the wall (v) in tile units, so the rock texture tiles
 * uniformly instead of smearing down the face.
 */
export function makeCliffGeometry(outline: IslandOutline, rimHeightAt: (x: number, z: number) => number, baseY: number) {
  const M = ISLAND_OUTLINE_SEGMENTS
  const R = CLIFF_ROWS
  const columns = M + 1
  const wallVertexCount = columns * (R + 1)
  const vertexCount = wallVertexCount + 1 + M
  const positions = new Float32Array(vertexCount * 3)
  const uvs = new Float32Array(vertexCount * 2)

  for (let c = 0; c < columns; c += 1) {
    const i = c % M
    const theta = (i / M) * Math.PI * 2
    const rim = outlinePoint(outline, i)
    const rimY = rimHeightAt(rim.x, rim.z)
    const ux = Math.cos(theta)
    const uz = Math.sin(theta)
    const u = outline.arcLengths[c] / CLIFF_TILE

    for (let r = 0; r <= R; r += 1) {
      const f = r / R
      const y = rimY + (baseY - rimY) * f
      const offset = r === 0 ? 0 : cliffOffset(theta, f, y)
      const v = c * (R + 1) + r
      positions[v * 3 + 0] = rim.x + ux * offset
      positions[v * 3 + 1] = y
      positions[v * 3 + 2] = rim.z + uz * offset
      uvs[v * 2 + 0] = u
      uvs[v * 2 + 1] = (rimY - y) / CLIFF_TILE
    }
  }

  const indices: number[] = []
  for (let c = 0; c < M; c += 1) {
    const a = c * (R + 1)
    const b = (c + 1) * (R + 1)
    for (let r = 0; r < R; r += 1) {
      indices.push(a + r, b + r, a + r + 1)
      indices.push(b + r, b + r + 1, a + r + 1)
    }
  }

  const baseCenter = wallVertexCount
  positions[baseCenter * 3 + 0] = outline.centerX
  positions[baseCenter * 3 + 1] = baseY
  positions[baseCenter * 3 + 2] = outline.centerZ
  for (let i = 0; i < M; i += 1) {
    const src = i * (R + 1) + R
    const v = baseCenter + 1 + i
    positions[v * 3 + 0] = positions[src * 3 + 0]
    positions[v * 3 + 1] = baseY
    positions[v * 3 + 2] = positions[src * 3 + 2]
    uvs[v * 2 + 0] = positions[v * 3 + 0] / CLIFF_TILE
    uvs[v * 2 + 1] = positions[v * 3 + 2] / CLIFF_TILE
  }
  for (let i = 0; i < M; i += 1) {
    indices.push(baseCenter, baseCenter + 1 + i, baseCenter + 1 + ((i + 1) % M))
  }

  const geo = assembleGeometry(positions, uvs, indices)
  geo.computeBoundingSphere()
  return geo
}
