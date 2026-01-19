import { create } from "zustand"

interface WorldState {
  routeT: number
  overviewBlend: number
  titleCardBlend: number
  isEarthTexturedReady: boolean
  isLoaderBypassed: boolean
  isLoadingOverlayVisible: boolean
  travelDir: 1 | -1
  mousePosition: { x: number; y: number }
}

interface WorldActions {
  setRouteT: (t: number) => void
  setOverviewBlend: (t: number) => void
  setTitleCardBlend: (t: number) => void
  setEarthTexturedReady: (ready: boolean) => void
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
  isEarthTexturedReady: false,
  isLoaderBypassed: false,
  isLoadingOverlayVisible: true,
  travelDir: 1,
  mousePosition: { x: 0, y: 0 },

  setRouteT: (t) => {
    set({ routeT: Math.max(0, Math.min(1, t)) })
  },

  setOverviewBlend: (t) => {
    set({ overviewBlend: Math.max(0, Math.min(1, t)) })
  },

  setTitleCardBlend: (t) => {
    set({ titleCardBlend: Math.max(0, Math.min(1, t)) })
  },

  setEarthTexturedReady: (ready) => {
    set({ isEarthTexturedReady: ready })
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
