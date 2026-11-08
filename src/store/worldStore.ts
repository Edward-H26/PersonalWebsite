import type { Vector3 } from "three"
import { create } from "zustand"
import type { OverviewScene } from "@/components/canvas/camera/overviewFraming"
import { clamp01 } from "@/utils/math"

// Ground height in world units at a world-space x/z, published by the island once it is built.
type GroundHeightSampler = (x: number, z: number) => number

/**
 * The road the deck walks, by route t from 0 to 1, published by the island once its terrain has loaded. It is a
 * loop: t = 0 and t = 1 are the same point, the quay.
 */
export type WalkRoute = {
  /** Length in world units. */
  readonly length: number
  getPointAt(t: number, target: Vector3): Vector3
  getTangentAt(t: number, target: Vector3): Vector3
}

// Horizontal look-around limit in radians (about 70 degrees either side of the road).
const LOOK_YAW_LIMIT = 1.2

interface WorldState {
  routeT: number
  overviewBlend: number
  titleCardBlend: number
  lookYaw: number
  groundHeightAt: GroundHeightSampler | null
  walkRoute: WalkRoute | null
  /** What the overview camera fits into view, published with the island's layout. */
  overviewScene: OverviewScene | null
  /** How much of the island's load is done, from 0 to 1; it only ever grows. */
  loadProgress: number
  isEarthSceneReady: boolean
  isLoaderBypassed: boolean
  isLoadingOverlayVisible: boolean
  travelDir: 1 | -1
  mousePosition: { x: number; y: number }
}

interface WorldActions {
  setRouteT: (t: number) => void
  setOverviewBlend: (t: number) => void
  setTitleCardBlend: (t: number) => void
  setLookYaw: (yaw: number) => void
  setGroundHeightSampler: (sampler: GroundHeightSampler | null) => void
  setWalkRoute: (route: WalkRoute | null) => void
  setOverviewScene: (scene: OverviewScene | null) => void
  reportLoadProgress: (share: number) => void
  setEarthSceneReady: (ready: boolean) => void
  setLoaderBypassed: (bypassed: boolean) => void
  setLoadingOverlayVisible: (visible: boolean) => void
  setTravelDir: (dir: 1 | -1) => void
  setMousePosition: (x: number, y: number) => void
}

type WorldStore = WorldState & WorldActions

export const useWorldStore = create<WorldStore>((set) => ({
  routeT: 0,
  overviewBlend: 0,
  titleCardBlend: 0,
  lookYaw: 0,
  groundHeightAt: null,
  walkRoute: null,
  overviewScene: null,
  loadProgress: 0,
  isEarthSceneReady: false,
  isLoaderBypassed: false,
  isLoadingOverlayVisible: true,
  travelDir: 1,
  mousePosition: { x: 0, y: 0 },

  setRouteT: (t) => {
    set({ routeT: clamp01(t) })
  },

  setOverviewBlend: (t) => {
    set({ overviewBlend: clamp01(t) })
  },

  setTitleCardBlend: (t) => {
    set({ titleCardBlend: clamp01(t) })
  },

  setLookYaw: (yaw) => {
    set({ lookYaw: Math.max(-LOOK_YAW_LIMIT, Math.min(LOOK_YAW_LIMIT, yaw)) })
  },

  setGroundHeightSampler: (sampler) => {
    set({ groundHeightAt: sampler })
  },

  setWalkRoute: (route) => {
    set({ walkRoute: route })
  },

  setOverviewScene: (scene) => {
    set({ overviewScene: scene })
  },

  reportLoadProgress: (share) => {
    set((state) => ({ loadProgress: Math.max(state.loadProgress, clamp01(share)) }))
  },

  setEarthSceneReady: (ready) => {
    set({ isEarthSceneReady: ready })
  },

  setLoaderBypassed: (bypassed) => {
    set({ isLoaderBypassed: bypassed })
  },

  setLoadingOverlayVisible: (visible) => {
    set({ isLoadingOverlayVisible: visible })
  },

  setTravelDir: (dir) => {
    set({ travelDir: dir === -1 ? -1 : 1 })
  },

  setMousePosition: (x, y) => {
    set({ mousePosition: { x, y } })
  }
}))
