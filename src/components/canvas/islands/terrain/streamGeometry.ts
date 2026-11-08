import { BufferGeometry, Float32BufferAttribute } from "three"
import { smoothstep } from "@/utils/math"
import { roundCorners } from "./roadPath"
import { type MapFrame, type ProfileRow, mapToScene } from "./terrainData"
import type { IslandTerrain } from "./islandTerrain"

/** Half the water's width: about 5 m of water down a channel carved wider (DESIGN.md section 17), whose banks hide its edges. */
const HALF_WIDTH_M = 2.5
/** From the spring the water widens to its full width over this many metres. */
const SPRING_WIDENING_M = 15
/**
 * How far inside the mill pond's rim the ribbon runs on, in map pixels, where the stream falls in and where it leaves
 * for the dam. Its ends lie on the pond's surface, standing as still as the pond in the same water, so neither shows.
 */
const POND_OVERLAP_PX = 4
/** The current dies away over this many pixels outside the pond's rim, so the stream slows into the pond's stillness. */
const POND_CALM_PX = 4
/**
 * The surface's fall per metre downstream where the water starts to break into foam, and where it is all foam; below a
 * fall the foam runs on for FOAM_TRAIL_M before it has gone.
 */
const FOAM_SLOPE = [0.15, 0.45] as const
const FOAM_TRAIL_M = 1.5
/** Past its profile's last row the stream runs on down its bed this far above the ground, until it meets the sea. */
const MOUTH_DEPTH_M = 0.25
/** The furthest the stream is carried on past its profile's last row, in map pixels. */
const MOUTH_REACH_PX = 30
/**
 * Rows either side over which the ribbon's line is averaged. The profile turns by up to about 30 degrees at
 * a single row; spread over 13 rows, the ribbon's inner edge no longer folds back on itself at the bend.
 */
const CORNER_ROWS = 6

/**
 * How much foam each row of the profile carries, 0 to 1: where the surface falls steeply, and for FOAM_TRAIL_M below
 * each fall, thinning out; level water carries none.
 */
export function streamFoam(rows: ReadonlyArray<ProfileRow>, map: MapFrame) {
  let carried = 0
  return rows.map((row, i) => {
    const before = rows[Math.max(i - 1, 0)]
    const after = rows[Math.min(i + 1, rows.length - 1)]
    const run = (after[3] - before[3]) * map.metresPerPx
    const fall = run > 0 ? ((before[2] - after[2]) * map.peakMetres) / run : 0
    const stepMetres = (row[3] - before[3]) * map.metresPerPx
    carried = Math.max(carried - stepMetres / FOAM_TRAIL_M, smoothstep(FOAM_SLOPE[0], FOAM_SLOPE[1], fall), 0)
    return carried
  })
}

/**
 * The profile's rows carried on past the last one, along the stream's last stretch, down to the sea: the water keeps
 * MOUTH_DEPTH_M over the ground there and never rises, and its last row lies at sea level, where it meets the bay.
 */
export function streamToSea(rows: ReadonlyArray<ProfileRow>, map: MapFrame, groundAt: (x: number, y: number) => number): ProfileRow[] {
  const last = rows[rows.length - 1]
  const back = rows[Math.max(rows.length - 5, 0)]
  const length = Math.hypot(last[0] - back[0], last[1] - back[1])
  const [dirX, dirY] = [(last[0] - back[0]) / length, (last[1] - back[1]) / length]
  const depth = MOUTH_DEPTH_M / map.peakMetres
  const carried: ProfileRow[] = [...rows]
  let level = last[2]
  for (let step = 1; step <= MOUTH_REACH_PX && level > 0; step += 1) {
    const x = last[0] + dirX * step
    const y = last[1] + dirY * step
    level = Math.max(0, Math.min(level, groundAt(x, y) + depth))
    carried.push([x, y, level, last[3] + step, last[4]])
  }
  return carried
}

/**
 * The stream's water as a ribbon down terrain.json's stream profile, at the profile's water surface, carried on to the
 * sea past the profile's end. It stops POND_OVERLAP_PX inside the mill pond, whose surface the watermill's model
 * carries, and goes on from there to the dam. Each vertex carries its distance downstream in scene units (aAlong),
 * its side of the stream (aAcross, 1 on the right looking downstream, -1 on the left), the foam on it (aFoam) and
 * the current in scene x/z (aFlow), whose length is how fast it runs: 1 down the stream, 0 standing in the pond.
 * The geometry's userData.endAlong is where the water reaches the sea, in aAlong's units.
 */
export function buildStreamGeometry({ data, heights }: Pick<IslandTerrain, "data" | "heights">) {
  const { map, stream } = data
  const rows = streamToSea(stream.points, map, (x, y) => heights.sample(x, y))
  const plan = roundCorners(rows, false, CORNER_ROWS)
  const foamAt = streamFoam(rows, map)
  const outsidePond = (row: ProfileRow) => Math.hypot(row[0] - stream.pond.centre[0], row[1] - stream.pond.centre[1]) - stream.pond.radiusPx

  const positions: number[] = []
  const along: number[] = []
  const across: number[] = []
  const foam: number[] = []
  const flow: number[] = []
  const index: number[] = []
  let joinsPrevious = false

  rows.forEach((row, i) => {
    const pondRim = outsidePond(row)
    if (pondRim < -POND_OVERLAP_PX) {
      joinsPrevious = false
      return
    }
    const [x, y] = plan[i]
    const s = row[3]
    const before = Math.max(i - 1, 0)
    const after = Math.min(i + 1, rows.length - 1)
    const run = Math.hypot(plan[after][0] - plan[before][0], plan[after][1] - plan[before][1])
    const flowX = (plan[after][0] - plan[before][0]) / run
    const flowY = (plan[after][1] - plan[before][1]) / run
    const speed = smoothstep(-POND_OVERLAP_PX, POND_CALM_PX, pondRim)
    const halfWidthPx = (HALF_WIDTH_M / map.metresPerPx) * smoothstep(0, SPRING_WIDENING_M, s * map.metresPerPx)

    for (const side of [1, -1]) {
      positions.push(...mapToScene(map, x - flowY * side * halfWidthPx, y + flowX * side * halfWidthPx, row[2]))
      along.push(s * map.unitsPerPx)
      across.push(side)
      foam.push(foamAt[i])
      flow.push(flowX * speed, flowY * speed)
    }

    // This row's two vertices, right then left, joined by two upward-facing triangles to the row before.
    const first = positions.length / 3 - 2
    if (joinsPrevious) index.push(first - 2, first, first - 1, first - 1, first, first + 1)
    joinsPrevious = true
  })

  const geometry = new BufferGeometry()
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3))
  geometry.setAttribute("aAlong", new Float32BufferAttribute(along, 1))
  geometry.setAttribute("aAcross", new Float32BufferAttribute(across, 1))
  geometry.setAttribute("aFoam", new Float32BufferAttribute(foam, 1))
  geometry.setAttribute("aFlow", new Float32BufferAttribute(flow, 2))
  geometry.setIndex(index)
  geometry.computeBoundingSphere()
  geometry.userData.endAlong = rows[rows.length - 1][3] * map.unitsPerPx
  return geometry
}
