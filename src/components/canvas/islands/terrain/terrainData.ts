import { MathUtils } from "three"

/** A point on the island map in map pixels: x runs east and y south (DESIGN.md section 17). */
export type MapPoint = readonly [x: number, y: number]

/** A map point with the ground's height there, as a fraction of the peak's height. */
export type MapPointH = readonly [x: number, y: number, h: number]

/**
 * One row of a road's or the stream's profile, the rows 1 map pixel apart: the map point, the surface's
 * height, s the plan distance from the first row in map pixels, and t = s / lengthPx.
 */
export type ProfileRow = readonly [x: number, y: number, h: number, s: number, t: number]

export type RoadProfile = {
  closed: boolean
  lengthPx: number
  maxGrade: number
  points: ReadonlyArray<ProfileRow>
}

/** Where a landmark stands and the map angle its front faces, north 0 and clockwise. */
export type Landmark = { at: MapPointH; facing: number }

/** The spurs that leave the ring road: to the viewpoint, the well, the watermill, the standing stones and the beach. */
export type SpurName = "viewpoint" | "well" | "mill" | "stones" | "beach"

/** A stretch of the coast's outline: its ends and the outline's indices between them. */
export type CoastStretch = { from: MapPoint; to: MapPoint; outlineIndex: readonly [number, number] }

/** What some landmarks carry beside their anchor. */
export type LandmarkDetails = {
  /** The road a bridge carries and the stretch of it, in that road's t, that runs over the bridge. */
  road?: SpurName
  roadT?: readonly [number, number]
  /** The watermill's pond level and its dam's crest, as fractions of the peak. */
  pondLevel?: number
  damCrest?: number
  /** Where the castle stair's foot meets the road. */
  foot?: MapPointH
  /** The model that turns on this one's hub (the windmill's sails). */
  sails?: string
  /** The pier's berth: its bollards and the map angle a ship lies along. */
  bollards?: ReadonlyArray<MapPointH>
  alongside?: number
}

/** One side of a field, corner to corner: hedgerow or dry-stone wall, with a gateway centred on `gate` when it has one. */
export type FieldEdge = { from: MapPoint; to: MapPoint; kind: "hedge" | "wall"; gate: MapPoint | null }

/** A field of DESIGN.md section 17: its corners in order, its sides and where its haystacks stand. */
export type FieldPlan = { corners: ReadonlyArray<MapPoint>; edges: ReadonlyArray<FieldEdge>; haystacks: ReadonlyArray<MapPointH> }

/** How the island map lands in the scene; terrain.json's `map` block. */
export type MapFrame = {
  sizePx: readonly [number, number]
  metresPerPx: number
  unitsPerMetre: number
  unitsPerPx: number
  origin: readonly [number, number]
  /** Scene units of one peak height: a fraction h of the peak stands at h * heightScale. */
  heightScale: number
  peakMetres: number
  waterLevel: number
}

/** terrain.json, which blender/island writes beside terrain.glb and terrain_height.png. */
export type TerrainData = {
  map: MapFrame
  heightmap: { file: string; bits: number; sizePx: readonly [number, number]; range: readonly [number, number]; seaLevelGrey: number }
  mesh: { file: string; COLOR_1: { channels: readonly string[] } }
  roads: { ring: RoadProfile; spurs: Record<SpurName, RoadProfile> }
  stream: { points: ReadonlyArray<ProfileRow>; pond: { centre: MapPoint; radiusPx: number; level: number } }
  coast: {
    outline: ReadonlyArray<MapPoint>
    /** The sea stacks and the islet off the coast. */
    islands: ReadonlyArray<ReadonlyArray<MapPoint>>
    /** The quay wall's, the revetment's (under the beach walk's fill) and the beach's stretches of the outline. */
    quayWall: CoastStretch
    revetment: CoastStretch
    beach: CoastStretch
  }
  points: Readonly<Record<string, MapPointH>>
  landmarks: Readonly<Record<string, Landmark & LandmarkDetails>>
  layout: { fields: ReadonlyArray<FieldPlan>; orchard: ReadonlyArray<MapPoint> }
}

/** A map point and height as a scene position: x east, y up, z south, about the map's origin. */
export function mapToScene(map: MapFrame, x: number, y: number, h = 0): [number, number, number] {
  return [(x - map.origin[0]) * map.unitsPerPx, h * map.heightScale, (y - map.origin[1]) * map.unitsPerPx]
}

/** The map point under a scene x/z. */
export function sceneToMap(map: MapFrame, sceneX: number, sceneZ: number): [number, number] {
  return [sceneX / map.unitsPerPx + map.origin[0], sceneZ / map.unitsPerPx + map.origin[1]]
}

/** Distance in map pixels from a map point to the segment from `a` to `b`. */
export function distanceToSegment(x: number, y: number, a: MapPoint, b: MapPoint) {
  const vx = b[0] - a[0]
  const vy = b[1] - a[1]
  const t = Math.min(Math.max(((x - a[0]) * vx + (y - a[1]) * vy) / (vx * vx + vy * vy), 0), 1)
  return Math.hypot(x - (a[0] + vx * t), y - (a[1] + vy * t))
}

/** The yaw about +y that turns a model's front, its +z, to face the map angle `facing` (north 0, clockwise). */
export function facingToYaw(facing: number) {
  return MathUtils.degToRad(180 - facing)
}
