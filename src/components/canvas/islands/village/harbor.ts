import { MODEL_PATHS } from "@/config/modelPaths"
import { seededRandomSigned } from "@/utils/math"
import { type IslandOutline, outlineRadiusToward } from "../islandGeometry"
import type { InstancedGroup, LayoutContext, Placement, Vec3Tuple } from "./types"

// A harbor off the coast that the overview shows at the lower left, under the hero card: a pier, a
// moored pinnace, and two lateral sea markers. Everything floats at sea level, below the cliff top.
const HARBOR_BEARING = -0.4 * Math.PI
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
/** Half the pinnace's length from bowsprit to stern at SHIP_SCALE, in island-local units. */
const SHIP_HALF_LENGTH = 17
/** The ship moors broadside to the pier, nudged a little off square. */
const SHIP_YAW_OFFSET = Math.PI / 2 + 0.25
const MARKER_YAW_JITTER = 0.3
const MARKER_FIT_HEIGHT = 6

/** Places harbor points `offset` beyond the coastline along the harbor bearing and `sideways` across it. */
function harborFrame(outline: IslandOutline) {
  const dirX = Math.cos(HARBOR_BEARING)
  const dirZ = Math.sin(HARBOR_BEARING)
  const sideX = -dirZ
  const sideZ = dirX
  const shore = outlineRadiusToward(outline, outline.centerX + dirX, outline.centerZ + dirZ)
  const at = (offset: number, sideways: number): [number, number] => [
    outline.centerX + dirX * (shore + offset) + sideX * sideways,
    outline.centerZ + dirZ * (shore + offset) + sideZ * sideways
  ]
  return { at, outward: Math.atan2(dirX, dirZ) }
}

/** The harbor's extent on the water as a circle in island-local units, so the overview can keep it in frame. */
export function harborBounds(outline: IslandOutline) {
  const { at } = harborFrame(outline)
  const points = [
    at(HARBOR.pierOffset, 0),
    at(HARBOR.pierOffset + HARBOR.pierLength, 0),
    at(HARBOR.shipOffset, HARBOR.shipSideways),
    at(HARBOR.markerOffset, -HARBOR.markerSideways),
    at(HARBOR.markerOffset, HARBOR.markerSideways)
  ]
  const x = points.reduce((sum, p) => sum + p[0], 0) / points.length
  const z = points.reduce((sum, p) => sum + p[1], 0) / points.length
  const radius = Math.max(...points.map((p) => Math.hypot(p[0] - x, p[1] - z))) + SHIP_HALF_LENGTH
  return { x, z, radius }
}

/** The pier and the ship as placements, plus the two sea markers as an instanced group. */
export function buildHarbor(ctx: LayoutContext): { placements: Placement[]; markers: InstancedGroup } {
  const { at, outward } = harborFrame(ctx.outline)

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
