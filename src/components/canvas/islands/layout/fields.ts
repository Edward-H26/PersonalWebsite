import { MODEL_PATHS } from "@/config/modelPaths"
import { ISLAND_UNITS_PER_METRE, islandFitHeight, islandGroundRadius, islandSize } from "@/config/modelSizes"
import { seededRandom } from "@/utils/math"
import type { InstanceTransform, InstancedGroup, Vec3Tuple } from "../village/types"
import { type FieldPlan, type MapPoint, mapToScene } from "../terrain/terrainData"
import type { LayoutContext } from "./context"
import { type GroundRect, rectFootprints } from "./placement"

/** Boundary pieces sink this far below the lowest ground under them, so a piece across a slope never floats. */
const BOUNDARY_SINK = 0.15
/** Haystacks settle this far into the stubble. */
const HAYSTACK_SINK = 0.12
/**
 * A hawthorn about every HAWTHORN_SPACING_PX along a field's side, at least one on every side, standing
 * HAWTHORN_OUTSIDE_PX outside it and none within HAWTHORN_CORNER_PX of a corner.
 */
const HAWTHORN_SPACING_PX = 22
const HAWTHORN_OUTSIDE_PX = 5
const HAWTHORN_CORNER_PX = 6
/** A hawthorn keeps this much ground round its trunk, in metres; its crown may lean over the hedge. */
const HAWTHORN_TRUNK_M = 1.2
/** Hawthorns grow on grass, their trunks at least HAWTHORN_ROAD_CLEAR_PX from a road's centreline. */
const HAWTHORN_GRASS_COVER = 0.5
const HAWTHORN_ROAD_CLEAR_PX = 12

/** A field's outline in world x/z, for what grows inside it. */
export type FieldOutline = ReadonlyArray<readonly [number, number]>

export type Fields = { groups: InstancedGroup[]; outlines: FieldOutline[] }

type Run = { from: readonly [number, number]; to: readonly [number, number] }

/** The copies of one model placed so far, keyed by path. */
class Copies {
  private readonly byPath = new Map<string, InstanceTransform[]>()

  add(path: string, instance: InstanceTransform) {
    const copies = this.byPath.get(path)
    if (copies) copies.push(instance)
    else this.byPath.set(path, [instance])
  }

  groups(keys: ReadonlyMap<string, string>): InstancedGroup[] {
    return [...this.byPath].map(([path, instances]) => ({
      key: keys.get(path) ?? path,
      path,
      fitHeight: islandFitHeight(path),
      instances,
      castShadow: true,
      excludeFromReflection: true
    }))
  }
}

const GROUP_KEYS: ReadonlyMap<string, string> = new Map([
  [MODEL_PATHS.earth.hedgerow, "hedgerows"],
  [MODEL_PATHS.earth.hedgerowB, "hedgerowsB"],
  [MODEL_PATHS.earth.dryStoneWall, "dryStoneWalls"],
  [MODEL_PATHS.earth.dryStoneWallGateway, "fieldGateways"],
  [MODEL_PATHS.earth.fence, "fieldGates"],
  [MODEL_PATHS.earth.haystack, "haystacks"],
  [MODEL_PATHS.earth.haystackB, "haystacksB"],
  [MODEL_PATHS.earth.hawthorn, "hawthorns"]
])

/**
 * One boundary piece centred at x/z and turned along (dirX, dirZ): its model's length runs along its
 * own x, so the yaw turns +x onto the run, and `flip` turns it end for end so a run does not repeat.
 * It stands on the lowest ground under its middle and ends, and claims its ground plan.
 */
function placePiece(ctx: LayoutContext, copies: Copies, path: string, x: number, z: number, dirX: number, dirZ: number, flip: boolean) {
  const { width, depth } = islandSize(path)
  const yaw = Math.atan2(-dirZ, dirX) + (flip ? Math.PI : 0)
  const toEndX = (dirX * width) / 2
  const toEndZ = (dirZ * width) / 2
  const ground = Math.min(ctx.sampleGroundY(x, z), ctx.sampleGroundY(x - toEndX, z - toEndZ), ctx.sampleGroundY(x + toEndX, z + toEndZ))
  const rect: GroundRect = { x, z, yaw, halfX: width / 2, halfZ: depth / 2 }
  ctx.footprints.add(...rectFootprints(rect))
  copies.add(path, { position: [x, ground - BOUNDARY_SINK, z], rotation: [0, yaw, 0], scale: 1 })
}

/** Pieces laid end to end from one end of a run to the other, as many as close it, slightly overlapping where it does not divide evenly. */
function layRun(ctx: LayoutContext, copies: Copies, run: Run, pathAt: (i: number) => string, seed: number) {
  const dx = run.to[0] - run.from[0]
  const dz = run.to[1] - run.from[1]
  const length = Math.hypot(dx, dz)
  if (length <= 0) return
  const pieceLength = islandSize(pathAt(0)).width
  const count = Math.max(1, Math.ceil(length / pieceLength))
  for (let i = 0; i < count; i += 1) {
    const along = (length / count) * (i + 0.5)
    const flip = seededRandom(seed + i * 3.7) < 0.5
    placePiece(
      ctx,
      copies,
      pathAt(i),
      run.from[0] + (dx / length) * along,
      run.from[1] + (dz / length) * along,
      dx / length,
      dz / length,
      flip
    )
  }
}

/** A field's sides: hedgerow (its two builds mixed) or dry-stone wall, broken at each gate by a stone gateway with a gate hung between its posts. */
function placeBoundary(ctx: LayoutContext, copies: Copies, field: FieldPlan, fieldIndex: number) {
  const { map } = ctx.site.terrain.data
  const scene = ([x, y]: MapPoint): [number, number] => {
    const [sx, , sz] = mapToScene(map, x, y)
    return [sx, sz]
  }
  field.edges.forEach((edge, edgeIndex) => {
    const seed = 97 + fieldIndex * 41 + edgeIndex * 13
    const pathAt =
      edge.kind === "wall"
        ? () => MODEL_PATHS.earth.dryStoneWall
        : (i: number) => (seededRandom(seed + i * 1.9) < 0.5 ? MODEL_PATHS.earth.hedgerow : MODEL_PATHS.earth.hedgerowB)
    const from = scene(edge.from)
    const to = scene(edge.to)
    if (!edge.gate) {
      layRun(ctx, copies, { from, to }, pathAt, seed)
      return
    }
    const gate = scene(edge.gate)
    const length = Math.hypot(to[0] - from[0], to[1] - from[1])
    const dirX = (to[0] - from[0]) / length
    const dirZ = (to[1] - from[1]) / length
    const half = islandSize(MODEL_PATHS.earth.dryStoneWallGateway).width / 2
    layRun(ctx, copies, { from, to: [gate[0] - dirX * half, gate[1] - dirZ * half] }, pathAt, seed)
    layRun(ctx, copies, { from: [gate[0] + dirX * half, gate[1] + dirZ * half], to }, pathAt, seed + 7)
    placePiece(ctx, copies, MODEL_PATHS.earth.dryStoneWallGateway, gate[0], gate[1], dirX, dirZ, false)
    const ground = ctx.sampleGroundY(gate[0], gate[1])
    copies.add(MODEL_PATHS.earth.fence, {
      position: [gate[0], ground - BOUNDARY_SINK / 2, gate[1]],
      rotation: [0, Math.atan2(-dirZ, dirX), 0],
      scale: 1
    })
  })
}

/** The haystacks at the field's own spots, the two builds alternating, each turned at random. */
function placeHaystacks(ctx: LayoutContext, copies: Copies, field: FieldPlan, fieldIndex: number) {
  const { map } = ctx.site.terrain.data
  field.haystacks.forEach(([px, py], i) => {
    const path = (fieldIndex + i) % 2 === 0 ? MODEL_PATHS.earth.haystack : MODEL_PATHS.earth.haystackB
    const [x, , z] = mapToScene(map, px, py)
    ctx.footprints.add({ x, z, radius: islandGroundRadius(path) })
    const yaw = seededRandom(fieldIndex * 17 + i * 5.3) * Math.PI * 2
    copies.add(path, { position: [x, ctx.sampleGroundY(x, z) - HAYSTACK_SINK, z], rotation: [0, yaw, 0], scale: 1 })
  })
}

/** Hawthorns along the outside of the field's sides, on grass and clear of the roads and of everything placed before them. */
function placeHawthorns(ctx: LayoutContext, copies: Copies, field: FieldPlan, fieldIndex: number) {
  const { map } = ctx.site.terrain.data
  const centre = field.corners.reduce(([cx, cy], [x, y]) => [cx + x / field.corners.length, cy + y / field.corners.length], [0, 0])
  const trunk = HAWTHORN_TRUNK_M * ISLAND_UNITS_PER_METRE
  field.edges.forEach((edge, edgeIndex) => {
    const length = Math.hypot(edge.to[0] - edge.from[0], edge.to[1] - edge.from[1])
    const dirX = (edge.to[0] - edge.from[0]) / length
    const dirY = (edge.to[1] - edge.from[1]) / length
    // The side's normal turned away from the field's centre.
    const mid = [(edge.from[0] + edge.to[0]) / 2, (edge.from[1] + edge.to[1]) / 2]
    const outward = (mid[0] - centre[0]) * -dirY + (mid[1] - centre[1]) * dirX >= 0 ? 1 : -1
    const span = length - 2 * HAWTHORN_CORNER_PX
    const count = Math.max(1, Math.round(span / HAWTHORN_SPACING_PX))
    for (let i = 0; i < count; i += 1) {
      const seed = 211 + fieldIndex * 29 + edgeIndex * 7 + i
      const along = HAWTHORN_CORNER_PX + (span / count) * (i + 0.2 + 0.6 * seededRandom(seed))
      const px = edge.from[0] + dirX * along - dirY * outward * HAWTHORN_OUTSIDE_PX
      const py = edge.from[1] + dirY * along + dirX * outward * HAWTHORN_OUTSIDE_PX
      if (ctx.site.cover(px, py).grass < HAWTHORN_GRASS_COVER) continue
      if (ctx.site.roadDistance(px, py, HAWTHORN_ROAD_CLEAR_PX) < HAWTHORN_ROAD_CLEAR_PX) continue
      const [x, , z] = mapToScene(map, px, py)
      if (ctx.footprints.overlaps(x, z, trunk)) continue
      ctx.footprints.add({ x, z, radius: trunk })
      const scale = 0.85 + 0.3 * seededRandom(seed * 1.7)
      copies.add(MODEL_PATHS.earth.hawthorn, {
        position: [x, ctx.sampleGroundY(x, z) - BOUNDARY_SINK, z] as Vec3Tuple,
        rotation: [0, seededRandom(seed * 2.3) * Math.PI * 2, 0] as Vec3Tuple,
        scale
      })
    }
  })
}

/**
 * The fields of DESIGN.md section 17 as terrain.json lays them out: hedged and walled sides with their
 * gateways, haystacks inside, hawthorns along the outside, and each field's outline for the poppies.
 */
export function placeFields(ctx: LayoutContext): Fields {
  const { map, layout } = ctx.site.terrain.data
  // terrain.json before batch 2 drew a single field as bare corners; only fields with sides are laid out.
  const fields = layout.fields.filter((field) => "edges" in field)
  const copies = new Copies()
  fields.forEach((field, i) => {
    placeBoundary(ctx, copies, field, i)
    placeHaystacks(ctx, copies, field, i)
    placeHawthorns(ctx, copies, field, i)
  })
  return {
    groups: copies.groups(GROUP_KEYS),
    outlines: fields.map((field) =>
      field.corners.map(([x, y]) => {
        const [sx, , sz] = mapToScene(map, x, y)
        return [sx, sz] as const
      })
    )
  }
}

/** The area of a field's outline in world units squared (the shoelace formula). */
export function fieldArea(outline: FieldOutline) {
  let twice = 0
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i, i += 1) {
    twice += outline[j][0] * outline[i][1] - outline[i][0] * outline[j][1]
  }
  return Math.abs(twice) / 2
}

/** Whether a world x/z lies inside a field's outline (even-odd rule). */
export function insideField(outline: FieldOutline, x: number, z: number) {
  let inside = false
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i, i += 1) {
    const [xi, zi] = outline[i]
    const [xj, zj] = outline[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}
