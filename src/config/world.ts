type Vec3 = [number, number, number]

export const EARTH_ISLAND: { id: "earth"; position: Vec3; rotation: Vec3; scale: number } = {
  id: "earth",
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: 1.6
}

export const EARTH_ROUTE_POINTS: ReadonlyArray<Vec3> = [
  [-20, 0, -110],
  [60, 0, -110],
  [95, 0, -30],
  [55, 0, 45],
  [0, 0, 85],
  [-55, 0, 55],
  [-95, 0, -5],
  [-60, 0, -85],
  [10, 0, -75]
]

export const EARTH_SECTION_T_STOPS = [0.0, 0.27, 0.41, 0.55, 0.79, 0.98] as const

export const WORLD_CONFIG = {
  cameraHeight: 5.5
} as const
