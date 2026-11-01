import * as THREE from "three"
import { MODEL_PATHS } from "@/config/modelPaths"
import { ISLAND_UNITS_PER_METRE, islandFitHeight, islandSize } from "@/config/modelSizes"
import type { LayoutContext } from "../layout/context"
import type { FootprintIndex } from "../layout/placement"
import type { InstanceTransform, InstancedGroup, Placement, Vec3Tuple } from "./types"

// The garden pieces of blender/DESIGN.md section 13 (planters, clipped box hedges, raised beds, the
// espalier and the arbour) are built at real size and drawn at the island's one scale, like the
// buildings they stand beside.

/** A spot in a model's own metres: right of its centre, in front of it, and how far the piece is turned. */
type GardenSpot = { right: number; front: number; turn?: number }

type GardenPiece = "planter" | "hedge" | "bed" | "espalier"

/** Where a model's garden pieces stand, measured on the GLBs blender/island builds. */
type GardenPlan = Partial<Record<GardenPiece, GardenSpot>>

const QUARTER_TURN = Math.PI / 2

// Planter and hedge flank the front door; the raised bed runs along a side wall clear of windows,
// shutters and the woodshed. The espalier is trained flat against the inn's right-hand wall between
// two windows.
const GARDEN_PLANS: ReadonlyMap<string, GardenPlan> = new Map([
  [
    MODEL_PATHS.earth.house01,
    {
      planter: { right: 1.55, front: 2.45 },
      hedge: { right: -1.1, front: 2.45 },
      bed: { right: 5.6, front: 0, turn: QUARTER_TURN }
    }
  ],
  [
    MODEL_PATHS.earth.house02,
    {
      planter: { right: -2.6, front: 3.45 },
      hedge: { right: -0.6, front: 3.45 },
      bed: { right: -4.4, front: 0, turn: QUARTER_TURN }
    }
  ],
  [
    MODEL_PATHS.earth.house03,
    {
      planter: { right: -2.81, front: 4.2 },
      hedge: { right: -0.41, front: 4.2 },
      bed: { right: -4.35, front: -0.81, turn: QUARTER_TURN }
    }
  ],
  [MODEL_PATHS.earth.inn, { planter: { right: -1.05, front: 5.2 }, espalier: { right: 6.13, front: 1.03, turn: QUARTER_TURN } }]
])

/** Model and footprint radius in metres of each piece placed by the buildings. */
const PIECES: Record<GardenPiece, { key: string; path: string; footprintM: number }> = {
  planter: { key: "planters", path: MODEL_PATHS.earth.planterHydrangea, footprintM: 0.45 },
  hedge: { key: "doorHedges", path: MODEL_PATHS.earth.hedgeBall, footprintM: 0.4 },
  bed: { key: "raisedBeds", path: MODEL_PATHS.earth.raisedBed, footprintM: 1.3 },
  espalier: { key: "espaliers", path: MODEL_PATHS.earth.espalier, footprintM: 0.6 }
}

// The arbour spans the path from the road to the well, between the road and the well's front, with a
// clipped box cube on either side of its mouth.
const ARBOUR_TOWARDS_ROAD = 4.0
const PATH_HEDGE_SIDEWAYS = 1.6
const GARDEN_GROUND_OFFSET = -0.04
const UP = new THREE.Vector3(0, 1, 0)

/** A copy standing at `right`/`front` (island units) from an anchor at x/z turned by `yaw`. */
function besideAnchor(
  ctx: Pick<LayoutContext, "sampleGroundY">,
  anchor: Vec3Tuple,
  yaw: number,
  right: number,
  front: number,
  turn: number,
  scale: number
) {
  const offset = new THREE.Vector3(right, 0, front).applyAxisAngle(UP, yaw)
  const x = anchor[0] + offset.x
  const z = anchor[2] + offset.z
  return { position: [x, ctx.sampleGroundY(x, z) + GARDEN_GROUND_OFFSET, z] as Vec3Tuple, rotation: [0, yaw + turn, 0] as Vec3Tuple, scale }
}

function instancedGroup(key: string, path: string, instances: InstanceTransform[], fitHeight?: number): InstancedGroup {
  return { key, path, fitHeight, instances, castShadow: true, excludeFromReflection: true }
}

/** The arbour on the path to the well and the pair of clipped cubes at its mouth. */
function placeWellArbour(ctx: Pick<LayoutContext, "sampleGroundY">, well: Placement, footprints: FootprintIndex): InstancedGroup[] {
  const yaw = well.rotation[1]
  const arbour = besideAnchor(ctx, well.position, yaw, 0, ARBOUR_TOWARDS_ROAD, 0, 1)
  const hedges = [-1, 1].map((side) => besideAnchor(ctx, arbour.position, yaw, side * PATH_HEDGE_SIDEWAYS, 0, 0, ISLAND_UNITS_PER_METRE))
  footprints.add({ x: arbour.position[0], z: arbour.position[2], radius: islandSize(MODEL_PATHS.earth.arbour).width / 2 })
  for (const hedge of hedges)
    footprints.add({ x: hedge.position[0], z: hedge.position[2], radius: PIECES.hedge.footprintM * ISLAND_UNITS_PER_METRE })
  return [
    instancedGroup("arbour", MODEL_PATHS.earth.arbour, [arbour], islandFitHeight(MODEL_PATHS.earth.arbour)),
    instancedGroup("pathHedges", MODEL_PATHS.earth.hedgeCube, hedges)
  ]
}

/**
 * The gardens of the village: a planter and a clipped box at every house door, a raised bed beside
 * every house, the inn's planter and espalier, and the arbour on the path to the well. Each piece
 * keeps grass and flowers out of its footprint. Buildings must still carry their base model paths.
 */
export function placeGardens(
  ctx: Pick<LayoutContext, "sampleGroundY">,
  buildings: readonly Placement[],
  props: readonly Placement[],
  footprints: FootprintIndex
): InstancedGroup[] {
  const placed = new Map<GardenPiece, InstanceTransform[]>()
  for (const building of buildings) {
    const plan = GARDEN_PLANS.get(building.path)
    if (!plan) continue
    for (const [piece, spot] of Object.entries(plan) as [GardenPiece, GardenSpot][]) {
      const right = spot.right * ISLAND_UNITS_PER_METRE
      const front = spot.front * ISLAND_UNITS_PER_METRE
      const instance = besideAnchor(ctx, building.position, building.rotation[1], right, front, spot.turn ?? 0, ISLAND_UNITS_PER_METRE)
      footprints.add({ x: instance.position[0], z: instance.position[2], radius: PIECES[piece].footprintM * ISLAND_UNITS_PER_METRE })
      const copies = placed.get(piece) ?? []
      copies.push(instance)
      placed.set(piece, copies)
    }
  }
  const groups = [...placed].map(([piece, instances]) => instancedGroup(PIECES[piece].key, PIECES[piece].path, instances))
  const well = props.find((p) => p.key === "well")
  return well ? [...groups, ...placeWellArbour(ctx, well, footprints)] : groups
}
