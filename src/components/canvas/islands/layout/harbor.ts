import { MODEL_PATHS } from "@/config/modelPaths"
import { ISLAND_UNITS_PER_METRE, islandFitHeight, islandSize } from "@/config/modelSizes"
import type { InstancedGroup, Placement, Vec3Tuple } from "../village/types"
import { type MapPoint, facingToYaw, mapToScene } from "../terrain/terrainData"
import type { TerrainSite } from "../terrain/terrainSite"

// How far each model's waterline sits above its lowest point, in metres, measured on the GLBs: the
// pier's built waterline (its deck stands 2.7 m above the water), the top of the ship's dark bottom
// paint amidships, the dark ring round the sea marker. Models stand on their lowest point, so each is
// lowered by this much.
const PIER_WATERLINE_M = 0.99
const SHIP_WATERLINE_M = 2.66
const MARKER_WATERLINE_M = 1.24
// Where the water meets the harbour, in metres, for the sea's foam. The pier's bents stand every 2.35 m
// from 9.4 m before to 9.4 m past its middle, a post 1.45 m to either side, as blender/island/assets/pier.py
// builds them. The ship's hull at its waterline from its centre: the stem 15 m forward along its +z, the
// transom 16.5 m aft, 4.5 m to either side amidships. The marker's float is 3 m across.
const PIER_BENT_SPACING_M = 2.35
const PIER_BENT_REACH_M = 9.4
const PIER_POST_SIDE_M = 1.45
const PIER_POST_RADIUS_M = 0.13
const SHIP_STEM_M = 15
const SHIP_TRANSOM_M = 16.5
const SHIP_HALF_BEAM_M = 4.5
const MARKER_FLOAT_RADIUS_M = 1.5

/**
 * The pier is two lengths of pier.glb laid end to end, ending at terrain.json's pier head: its landward
 * end runs under the quay apron, so the deck, 1.1 m below the quay, steps out of the quay wall's face.
 */
const PIER_PIECES = 2
/** Metres between the pier's side and the ship's, where her fenders hang. */
const SHIP_FENDER_GAP_M = 0.8
/** How far back from the pier head the ship's middle lies, in metres: she berths along the outer piece. */
const SHIP_BACK_FROM_HEAD_M = 6
/**
 * The two lateral marks of the bay's mouth, in map pixels: the port mark off the breakwater's head and
 * the starboard mark opposite it, the channel between them about 24 m wide.
 */
const MARKER_POINTS: readonly MapPoint[] = [
  [296, 578],
  [268, 552]
]
/**
 * Shares of the beach's length where the two rowing boats are drawn up, each lying where the sand stands
 * BOAT_DRY_METRES above the water, searched inland in steps of a pixel.
 */
const BOAT_BEACH_SHARES = [0.2, 0.55] as const
const BOAT_DRY_METRES = 0.45
const BOAT_SEARCH_PX = 30
/** Points on the quay apron for the net rack and the lobster pots, in map pixels. */
const NET_RACK_POINT: MapPoint = [341, 502]
const LOBSTER_POTS_POINT: MapPoint = [352, 505]

export type HarborWaterline = {
  /** The pier's outer length's middle and the way its front faces, its bents of posts, and its lengths laid `pieceStep` apart along that way. */
  pier: {
    x: number
    z: number
    dirX: number
    dirZ: number
    postSpacing: number
    postReach: number
    postSide: number
    postRadius: number
    pieces: number
    pieceStep: number
  }
  ship: { x: number; z: number; bowX: number; bowZ: number; stem: number; transom: number; halfBeam: number }
  markers: Array<readonly [number, number]>
  markerRadius: number
  /** The sheltered water round the pier and the ship, where the swell drops so the ship sits steady at her waterline. */
  calm: { x: number; z: number; radius: number }
}

export type Harbor = {
  placements: Placement[]
  instanced: InstancedGroup[]
  waterline: HarborWaterline
}

/** The point `share` of the way along the coastline's points from index `from` to `to`, by length, and the way along it there. */
function alongCoast(outline: ReadonlyArray<MapPoint>, from: number, to: number, share: number) {
  const stretch = outline.slice(from, to + 1)
  const lengths = stretch.slice(1).map((p, i) => Math.hypot(p[0] - stretch[i][0], p[1] - stretch[i][1]))
  let left = share * lengths.reduce((sum, length) => sum + length, 0)
  for (let i = 0; i < lengths.length; i += 1) {
    if (left <= lengths[i] || i === lengths.length - 1) {
      const t = Math.min(left / lengths[i], 1)
      const [ax, ay] = stretch[i]
      const [bx, by] = stretch[i + 1]
      return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, dirX: (bx - ax) / lengths[i], dirY: (by - ay) / lengths[i] }
    }
    left -= lengths[i]
  }
  throw new Error("The coast's stretch has no length")
}

/** A unit vector in the map from a map angle, north 0 and clockwise. */
function mapDirection(facing: number): [number, number] {
  const angle = (facing * Math.PI) / 180
  return [Math.sin(angle), -Math.cos(angle)]
}

/**
 * The harbour of DESIGN.md section 17: the quay wall and the breakwater as blender/island built them in
 * the terrain's own coordinates, the pier from the quay to terrain.json's pier head with the REVA berthed
 * along it, two lateral marks at the bay's mouth, rowing boats drawn up on the beach, and a net rack and
 * lobster pots on the quay. Everything floats at the water's height, y 0.
 */
export function buildHarbor(site: TerrainSite): Harbor {
  const { map, landmarks, coast } = site.terrain.data
  const units = ISLAND_UNITS_PER_METRE
  const pxPerMetre = 1 / map.metresPerPx

  const [headX, headY] = landmarks.pier_head.at
  const facing = landmarks.pier_head.facing
  const [dx, dy] = mapDirection(facing)
  const yaw = facingToYaw(facing)
  const pieceLengthPx = (islandSize(MODEL_PATHS.earth.pier).depth / units) * pxPerMetre

  const terrainCoordinates = (key: string, path: string, landmark: keyof typeof landmarks): Placement => ({
    key,
    path,
    position: mapToScene(map, landmarks[landmark].at[0], landmarks[landmark].at[1], landmarks[landmark].at[2]),
    rotation: [0, facingToYaw(landmarks[landmark].facing), 0],
    scale: units,
    pivot: "origin"
  })

  const pierPieces = Array.from({ length: PIER_PIECES }, (_, i) => {
    const back = (i + 0.5) * pieceLengthPx
    const [x, , z] = mapToScene(map, headX - dx * back, headY - dy * back)
    return { x, z }
  })

  // The ship lies along the pier's south-east side, towards the open bay, her bow out to sea.
  const [sideX, sideY] = [dy, -dx]
  const shipOffsetPx = (islandSize(MODEL_PATHS.earth.pier).width / units / 2 + SHIP_FENDER_GAP_M + SHIP_HALF_BEAM_M) * pxPerMetre
  const shipBackPx = SHIP_BACK_FROM_HEAD_M * pxPerMetre
  const [shipX, , shipZ] = mapToScene(map, headX - dx * shipBackPx + sideX * shipOffsetPx, headY - dy * shipBackPx + sideY * shipOffsetPx)

  const markers = MARKER_POINTS.map(([x, y]) => {
    const [sx, , sz] = mapToScene(map, x, y)
    return [sx, sz] as const
  })

  const placements: Placement[] = [
    terrainCoordinates("quayWall", MODEL_PATHS.earth.quayWall, "quay_wall"),
    terrainCoordinates("breakwater", MODEL_PATHS.earth.breakwater, "breakwater"),
    ...pierPieces.map(({ x, z }, i) => ({
      key: `pier${i}`,
      path: MODEL_PATHS.earth.pier,
      position: [x, -PIER_WATERLINE_M * units, z] as Vec3Tuple,
      rotation: [0, yaw, 0] as Vec3Tuple,
      scale: units,
      pivot: "center-bottom" as const
    })),
    {
      key: "ship",
      path: MODEL_PATHS.earth.ship,
      position: [shipX, -SHIP_WATERLINE_M * units, shipZ],
      rotation: [0, yaw, 0],
      scale: units,
      pivot: "center-bottom"
    }
  ]

  // Boats drawn up on the beach, bows up the sand, square to the waterline: along the beach's own stretch of
  // the coastline, then up the sand (whichever side of the coast rises) until it stands dry.
  const [beachStart, beachEnd] = coast.beach.outlineIndex
  const boatPaths = [MODEL_PATHS.earth.rowingBoat, MODEL_PATHS.earth.rowingBoatB]
  const dryH = BOAT_DRY_METRES / map.peakMetres
  const boats: InstancedGroup[] = BOAT_BEACH_SHARES.map((share, i) => {
    const shore = alongCoast(coast.outline, beachStart, beachEnd, share)
    const side = site.h(shore.x + shore.dirY, shore.y - shore.dirX) > site.h(shore.x - shore.dirY, shore.y + shore.dirX) ? 1 : -1
    const [inlandX, inlandY] = [shore.dirY * side, -shore.dirX * side]
    let up = 0
    while (up < BOAT_SEARCH_PX && site.h(shore.x + inlandX * up, shore.y + inlandY * up) < dryH) up += 1
    const x = shore.x + inlandX * up
    const y = shore.y + inlandY * up
    const bowYaw = Math.atan2(inlandX, inlandY)
    return {
      key: `rowingBoat${i}`,
      path: boatPaths[i],
      fitHeight: islandFitHeight(boatPaths[i]),
      castShadow: true,
      excludeFromReflection: false,
      instances: [{ position: site.ground(x, y), rotation: [0, bowYaw, 0], scale: 1 }]
    }
  })

  // The net rack stands along the quay wall; the pots sit stacked beside it.
  const [wallX, wallY] = [coast.quayWall.to[0] - coast.quayWall.from[0], coast.quayWall.to[1] - coast.quayWall.from[1]]
  const wallYaw = Math.atan2(wallX, wallY) + Math.PI / 2
  const quayProps: InstancedGroup[] = [
    { key: "netRack", path: MODEL_PATHS.earth.netRack, point: NET_RACK_POINT, yaw: wallYaw },
    { key: "lobsterPots", path: MODEL_PATHS.earth.lobsterPots, point: LOBSTER_POTS_POINT, yaw: wallYaw + 0.3 }
  ].map(({ key, path, point, yaw: propYaw }) => ({
    key,
    path,
    fitHeight: islandFitHeight(path),
    castShadow: true,
    excludeFromReflection: false,
    instances: [{ position: site.ground(...point), rotation: [0, propYaw, 0], scale: 1 }]
  }))

  const markerGroup: InstancedGroup = {
    key: "seaMarkers",
    path: MODEL_PATHS.earth.seaMarker,
    fitHeight: islandFitHeight(MODEL_PATHS.earth.seaMarker),
    castShadow: false,
    excludeFromReflection: false,
    instances: markers.map(([x, z], i) => ({
      position: [x, -MARKER_WATERLINE_M * units, z] as Vec3Tuple,
      rotation: [0, 0.4 + i * 1.3, 0] as Vec3Tuple,
      scale: 1
    }))
  }

  const [pierDirX, pierDirZ] = [Math.sin(yaw), Math.cos(yaw)]
  const calmPoints = [...pierPieces.map(({ x, z }) => [x, z] as const), [shipX, shipZ] as const]
  const calmX = calmPoints.reduce((sum, p) => sum + p[0], 0) / calmPoints.length
  const calmZ = calmPoints.reduce((sum, p) => sum + p[1], 0) / calmPoints.length
  const calmRadius = Math.max(...calmPoints.map((p) => Math.hypot(p[0] - calmX, p[1] - calmZ))) + SHIP_TRANSOM_M * units

  return {
    placements,
    instanced: [markerGroup, ...boats, ...quayProps],
    waterline: {
      // The lengths run back from the head, each one a full length landward of the one before it.
      pier: {
        x: pierPieces[0].x,
        z: pierPieces[0].z,
        dirX: pierDirX,
        dirZ: pierDirZ,
        postSpacing: PIER_BENT_SPACING_M * units,
        postReach: PIER_BENT_REACH_M * units,
        postSide: PIER_POST_SIDE_M * units,
        postRadius: PIER_POST_RADIUS_M * units,
        pieces: PIER_PIECES,
        pieceStep: -islandSize(MODEL_PATHS.earth.pier).depth
      },
      ship: {
        x: shipX,
        z: shipZ,
        bowX: pierDirX,
        bowZ: pierDirZ,
        stem: SHIP_STEM_M * units,
        transom: SHIP_TRANSOM_M * units,
        halfBeam: SHIP_HALF_BEAM_M * units
      },
      markers,
      markerRadius: MARKER_FLOAT_RADIUS_M * units,
      calm: { x: calmX, z: calmZ, radius: calmRadius }
    }
  }
}
