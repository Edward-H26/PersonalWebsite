type Vec3 = [number, number, number]

export const EARTH_ISLAND: { id: "earth"; position: Vec3; rotation: Vec3; scale: number } = {
  id: "earth",
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: 1.6
}

export const EARTH_ROUTE_POINTS: ReadonlyArray<Vec3> = [
  [-25, 0, -120],
  [70, 0, -120],
  [110, 0, -25],
  [70, 0, 60],
  [0, 0, 95],
  [-70, 0, 70],
  [-110, 0, -5],
  [-70, 0, -95],
  [5, 0, -90]
]

export const EARTH_SECTION_T_STOPS = [0.0, 0.2, 0.34, 0.53, 0.84, 0.98] as const

export const WORLD_CONFIG = {
  cameraHeight: 5.5
} as const
