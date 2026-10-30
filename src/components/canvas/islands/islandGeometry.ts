/**
 * Entry point for the generated island, all in island-local units (world = local * EARTH_ISLAND.scale):
 * the analytic terrain height, the road network and its ribbons, the coastline, the terrain and
 * cliff meshes, and the placement rules that keep props on land and off the roads.
 */
export { surfaceHeight } from "./geometry/terrainHeight"
export {
  BRANCH_WIDTH,
  PATH_RIBBON_SEGMENTS,
  PATH_WIDTH,
  PATH_Y_OFFSET,
  SIDE_ROAD_OVERRUN,
  SIDE_ROAD_Y_OFFSET,
  buildSideRoadCurves,
  getTrackFrameAt,
  junctionPoints,
  makePathRibbonGeometry,
  makeSideRoadCurve,
  trackPointAt
} from "./geometry/roads"
export {
  ISLAND_OUTLINE_SEGMENTS,
  ISLAND_SHORE_RADIUS,
  type IslandOutline,
  buildIslandOutline,
  distanceInsideOutline,
  outlineRadiusToward
} from "./geometry/outline"
export { ISLAND_DEPTH, makeCliffGeometry, makeIslandTopGeometry } from "./geometry/terrainMeshes"
export {
  type Footprint,
  type RoadSample,
  type ScatterOptions,
  type ScatteredInstance,
  clampOffsetToIsland,
  distanceToRoadEdge,
  pushClearOfRoads,
  sampleRoadNetwork,
  scatterOnIsland
} from "./geometry/placement"
