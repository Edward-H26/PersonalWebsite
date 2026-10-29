import type * as THREE from "three"
import type { Footprint, IslandOutline, RoadSample } from "../islandGeometry"

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
  meshName?: string
  fitHeight: number
  instances: InstanceTransform[]
  castShadow: boolean
  excludeFromReflection: boolean
}

/** Everything the placement rules need to know about the island being decorated. */
export type LayoutContext = {
  routeCurve: THREE.CatmullRomCurve3
  outline: IslandOutline
  roads: ReadonlyArray<RoadSample>
  worldScale: number
  /** Height of the rendered terrain at a local x/z. */
  sampleGroundY: (x: number, z: number) => number
}

export type VillageLayout = {
  buildings: Placement[]
  props: Placement[]
  harbor: Placement[]
  instanced: InstancedGroup[]
  footprints: Footprint[]
}
