import { Vector3 } from "three"
import { MODEL_PATHS } from "@/config/modelPaths"
import { ISLAND_UNITS_PER_METRE, islandFitHeight } from "@/config/modelSizes"
import type { InstancedGroup, Placement, Vec3Tuple } from "../village/types"
import { type MapPoint, type TerrainData, facingToYaw, mapToScene } from "../terrain/terrainData"
import type { TerrainSite } from "../terrain/terrainSite"

// How far each floating model's waterline sits above its lowest point, in metres, measured on the GLBs: the
// top of the ship's dark bottom paint amidships, the dark ring round the sea marker. They stand on their
// lowest point, so each is lowered by this much.
const SHIP_WATERLINE_M = 2.66
const MARKER_WATERLINE_M = 1.24
// The pier as blender/island/assets/pier.py builds it, for the sea's foam: bents of two posts from its root to
// its head, the first 0.5 m out and the last 0.3 m short of the head, about 2.4 m apart and evenly spread, each
// post 1.6 m either side of its middle and 0.16 m thick. The berth's bollards stand 0.3 m inside the deck's edge.
const PIER_BENT_SPACING_M = 2.4
const PIER_FIRST_BENT_M = 0.5
const PIER_LAST_BENT_M = 0.3
const PIER_POST_SIDE_M = 1.6
const PIER_POST_RADIUS_M = 0.16
const BOLLARD_INSET_M = 0.3
// The ship's hull at its waterline from its centre: the stem 15 m forward along its +z, the transom 16.5 m aft,
// 4.5 m to either side amidships. The marker's float is 3 m across.
const SHIP_STEM_M = 15
const SHIP_TRANSOM_M = 16.5
const SHIP_HALF_BEAM_M = 4.5
const MARKER_FLOAT_RADIUS_M = 1.5
/** Metres between the pier's side and the ship's, where her fenders hang. */
const SHIP_FENDER_GAP_M = 0.8
/**
 * Metres of water the ship keeps all round her hull. Moored with her middle at the berth's middle bollard her
 * stern would lie on the quay, so she slides out along the berth, in steps, until she keeps this much.
 */
const SHIP_SEA_ROOM_M = 1.5
const SHIP_SLIDE_STEP_M = 0.5
const SHIP_SLIDE_MAX_M = 20
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
  /** The pier's bents of posts: the first bent's middle, the way out to the head, how far apart they stand and how many. */
  pier: {
    x: number
    z: number
    dirX: number
    dirZ: number
    postSpacing: number
    postCount: number
    postSide: number
    postRadius: number
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
 * The pier's bents of posts as pier.py spaces them: the first bent's map point, the way out to the head, and
 * the spacing in metres and the count that spread them evenly from the first to the last.
 */
function pierBents(data: TerrainData) {
  const [rootX, rootY] = data.landmarks.pier_root.at
  const [headX, headY] = data.landmarks.pier_head.at
  const lengthPx = Math.hypot(headX - rootX, headY - rootY)
  const [dirX, dirY] = [(headX - rootX) / lengthPx, (headY - rootY) / lengthPx]
  const span = lengthPx * data.map.metresPerPx - PIER_FIRST_BENT_M - PIER_LAST_BENT_M
  const intervals = Math.max(2, Math.round(span / PIER_BENT_SPACING_M))
  const firstPx = PIER_FIRST_BENT_M / data.map.metresPerPx
  return {
    first: [rootX + dirX * firstPx, rootY + dirY * firstPx] as MapPoint,
    dirX,
    dirY,
    spacing: span / intervals,
    count: intervals + 1
  }
}

/**
 * Whether the ship's waterline, widened by SHIP_SEA_ROOM_M and taken as a box, lies over water all round with
 * her middle at the map point x/y and her bow along the unit map direction ahead.
 */
function hullAfloat(site: TerrainSite, x: number, y: number, [aheadX, aheadY]: readonly [number, number]) {
  const pxPerMetre = 1 / site.terrain.data.map.metresPerPx
  const halfBeam = SHIP_HALF_BEAM_M + SHIP_SEA_ROOM_M
  for (let along = -SHIP_TRANSOM_M - SHIP_SEA_ROOM_M; along <= SHIP_STEM_M + SHIP_SEA_ROOM_M; along += 1) {
    for (let across = -halfBeam; across <= halfBeam; across += halfBeam) {
      const px = x + (aheadX * along - aheadY * across) * pxPerMetre
      const py = y + (aheadY * along + aheadX * across) * pxPerMetre
      if (site.h(px, py) >= 0) return false
    }
  }
  return true
}

/**
 * The corners of the pier's deck from its root to its head, at the water and at the deck's height, for the
 * overview to keep in frame: the pier stands in the terrain's own coordinates, so its placement says nothing of
 * where it reaches.
 */
export function pierCorners(data: TerrainData) {
  const { map, landmarks } = data
  const { dirX, dirY } = pierBents(data)
  const halfWidthPx = PIER_POST_SIDE_M / map.metresPerPx
  const deckY = landmarks.pier_root.at[2] * map.heightScale
  return [landmarks.pier_root.at, landmarks.pier_head.at].flatMap(([x, y]) =>
    [-1, 1].flatMap((side) => {
      const [sx, , sz] = mapToScene(map, x - dirY * side * halfWidthPx, y + dirX * side * halfWidthPx)
      return [new Vector3(sx, 0, sz), new Vector3(sx, deckY, sz)]
    })
  )
}

/**
 * The harbour of DESIGN.md section 17: the quay wall, the breakwater and the pier as blender/island built them
 * in the terrain's own coordinates, the REVA berthed along the pier's north side at its bollards, two lateral
 * marks at the bay's mouth, rowing boats drawn up on the beach, and a net rack and lobster pots on the quay.
 * Everything afloat sits at the water's height, y 0.
 */
export function buildHarbor(site: TerrainSite): Harbor {
  const { map, landmarks, coast } = site.terrain.data
  const units = ISLAND_UNITS_PER_METRE
  const pxPerMetre = 1 / map.metresPerPx

  const terrainCoordinates = (key: string, path: string, landmark: keyof typeof landmarks): Placement => ({
    key,
    path,
    position: mapToScene(map, landmarks[landmark].at[0], landmarks[landmark].at[1], landmarks[landmark].at[2]),
    rotation: [0, facingToYaw(landmarks[landmark].facing), 0],
    scale: units,
    pivot: "origin"
  })

  // The ship lies along the berth on the pier's north side with her bow out to sea, her middle from beside the
  // middle bollard slid out along the berth until she floats clear of the quay.
  const berth = landmarks.pier_berth
  const [outX, outY] = mapDirection(berth.facing)
  const ahead = mapDirection(berth.alongside!)
  const besidePx = (BOLLARD_INSET_M + SHIP_FENDER_GAP_M + SHIP_HALF_BEAM_M) * pxPerMetre
  const shipAt = (slide: number): MapPoint => [
    berth.at[0] + outX * besidePx + ahead[0] * slide * pxPerMetre,
    berth.at[1] + outY * besidePx + ahead[1] * slide * pxPerMetre
  ]
  let slide = 0
  while (slide < SHIP_SLIDE_MAX_M && !hullAfloat(site, ...shipAt(slide), ahead)) slide += SHIP_SLIDE_STEP_M
  const [shipX, , shipZ] = mapToScene(map, ...shipAt(slide))
  const shipYaw = facingToYaw(berth.alongside!)

  const markers = MARKER_POINTS.map(([x, y]) => {
    const [sx, , sz] = mapToScene(map, x, y)
    return [sx, sz] as const
  })

  const placements: Placement[] = [
    terrainCoordinates("quayWall", MODEL_PATHS.earth.quayWall, "quay_wall"),
    terrainCoordinates("breakwater", MODEL_PATHS.earth.breakwater, "breakwater"),
    terrainCoordinates("pier", MODEL_PATHS.earth.pier, "pier"),
    {
      key: "ship",
      path: MODEL_PATHS.earth.ship,
      position: [shipX, -SHIP_WATERLINE_M * units, shipZ],
      rotation: [0, shipYaw, 0],
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

  const bents = pierBents(site.terrain.data)
  const [firstX, , firstZ] = mapToScene(map, ...bents.first)
  const lastAlongPx = (bents.spacing * (bents.count - 1)) / map.metresPerPx
  const [lastX, , lastZ] = mapToScene(map, bents.first[0] + bents.dirX * lastAlongPx, bents.first[1] + bents.dirY * lastAlongPx)
  const calmPoints = [[firstX, firstZ] as const, [lastX, lastZ] as const, [shipX, shipZ] as const]
  const calmX = calmPoints.reduce((sum, p) => sum + p[0], 0) / calmPoints.length
  const calmZ = calmPoints.reduce((sum, p) => sum + p[1], 0) / calmPoints.length
  const calmRadius = Math.max(...calmPoints.map((p) => Math.hypot(p[0] - calmX, p[1] - calmZ))) + SHIP_TRANSOM_M * units

  return {
    placements,
    instanced: [markerGroup, ...boats, ...quayProps],
    waterline: {
      pier: {
        x: firstX,
        z: firstZ,
        dirX: bents.dirX,
        dirZ: bents.dirY,
        postSpacing: bents.spacing * units,
        postCount: bents.count,
        postSide: PIER_POST_SIDE_M * units,
        postRadius: PIER_POST_RADIUS_M * units
      },
      ship: {
        x: shipX,
        z: shipZ,
        bowX: Math.sin(shipYaw),
        bowZ: Math.cos(shipYaw),
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
