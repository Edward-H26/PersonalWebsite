import { MODEL_PATHS } from "@/config/modelPaths"
import { seededRandomSigned } from "@/utils/math"
import { outlineRadiusToward } from "../islandGeometry"
import type { InstancedGroup, LayoutContext, Placement, Vec3Tuple } from "./types"

// A harbor off the north-west coast, which faces the overview camera: a pier, a moored pinnace,
// and two lateral sea markers. Everything floats at sea level, below the cliff top.
const HARBOR_BEARING = Math.atan2(-1, -1)
const HARBOR = {
  pierOffset: 7,
  pierLength: 24,
  shipOffset: 34,
  shipSideways: 16,
  markerOffset: 26,
  markerSideways: 28,
  // Sea level sits 0.4 world units below the origin; the island is drawn at a scale of 1.6.
  waterY: -0.4 / 1.6
} as const
// Each model's pivot sits above its waterline by this much, so it is lowered to float correctly.
const PIER_DRAFT = 3
const SHIP_DRAFT = 2.6
const MARKER_DRAFT = 1.2
const PIER_SCALE = 1.3
const SHIP_SCALE = 0.9
/** The ship moors broadside to the pier, nudged a little off square. */
const SHIP_YAW_OFFSET = Math.PI / 2 + 0.25
const MARKER_YAW_JITTER = 0.3
const MARKER_FIT_HEIGHT = 6

/** The pier and the ship as placements, plus the two sea markers as an instanced group. */
export function buildHarbor(ctx: LayoutContext): { placements: Placement[]; markers: InstancedGroup } {
  const dirX = Math.cos(HARBOR_BEARING)
  const dirZ = Math.sin(HARBOR_BEARING)
  const sideX = -dirZ
  const sideZ = dirX
  const shore = outlineRadiusToward(ctx.outline, ctx.outline.centerX + dirX, ctx.outline.centerZ + dirZ)
  const at = (offset: number, sideways: number): [number, number] => [
    ctx.outline.centerX + dirX * (shore + offset) + sideX * sideways,
    ctx.outline.centerZ + dirZ * (shore + offset) + sideZ * sideways
  ]
  const outward = Math.atan2(dirX, dirZ)

  const [pierX, pierZ] = at(HARBOR.pierOffset + HARBOR.pierLength / 2, 0)
  const [shipX, shipZ] = at(HARBOR.shipOffset, HARBOR.shipSideways)
  const placements: Placement[] = [
    {
      key: "pier",
      path: MODEL_PATHS.earth.hqPier,
      position: [pierX, HARBOR.waterY - PIER_DRAFT, pierZ],
      rotation: [0, outward, 0],
      scale: PIER_SCALE,
      pivot: "center-bottom"
    },
    {
      key: "ship",
      path: MODEL_PATHS.earth.hqShip,
      position: [shipX, HARBOR.waterY - SHIP_DRAFT, shipZ],
      rotation: [0, outward + SHIP_YAW_OFFSET, 0],
      scale: SHIP_SCALE,
      pivot: "center-bottom"
    }
  ]

  const markers: InstancedGroup = {
    key: "seaMarkers",
    path: MODEL_PATHS.earth.hqSeaMarker,
    fitHeight: MARKER_FIT_HEIGHT,
    castShadow: false,
    excludeFromReflection: false,
    instances: [-1, 1].map((s) => {
      const [x, z] = at(HARBOR.markerOffset, HARBOR.markerSideways * s)
      return {
        position: [x, HARBOR.waterY - MARKER_DRAFT, z] as Vec3Tuple,
        rotation: [0, seededRandomSigned(s) * MARKER_YAW_JITTER, 0] as Vec3Tuple,
        scale: 1
      }
    })
  }

  return { placements, markers }
}
