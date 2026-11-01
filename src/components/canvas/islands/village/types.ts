export type Vec3Tuple = [number, number, number]

/** One model placed on the island, in island-local coordinates. */
export type Placement = {
  key: string
  path: string
  position: Vec3Tuple
  rotation: Vec3Tuple
  fitHeight?: number
  scale: number
  pivot?: "origin" | "center" | "center-bottom"
}

export type InstanceTransform = { position: Vec3Tuple; rotation: Vec3Tuple; scale: number }

/** Many copies of one model drawn as a single instanced mesh. */
export type InstancedGroup = {
  key: string
  path: string
  /** Omitted for models drawn at their modelled size times each instance's scale. */
  fitHeight?: number
  instances: InstanceTransform[]
  castShadow: boolean
  excludeFromReflection: boolean
}

/** The lanterns along the main road, ordered by `routeT`, the route position at which each stands. */
export type RoadLanternGroup = {
  path: string
  fitHeight: number
  instances: Array<InstanceTransform & { routeT: number }>
}

export type VillageLayout = {
  buildings: Placement[]
  props: Placement[]
  harbor: Placement[]
  lanterns: RoadLanternGroup
  instanced: InstancedGroup[]
}
