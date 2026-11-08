// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest"
import { Vector3 } from "three"
import { MODEL_PATHS } from "@/config/modelPaths"
import { ISLAND_MOUNTS, islandSize } from "@/config/modelSizes"
import type { InstancedGroup, Placement } from "../village/types"
import { type FieldPlan, facingToYaw, mapToScene, sceneToMap } from "../terrain/terrainData"
import { loadIslandTerrain } from "../terrain/terrainFixture"
import { TerrainSite } from "../terrain/terrainSite"
import type { IslandTerrain } from "../terrain/islandTerrain"
import { createLayoutContext } from "./context"
import { placeFields } from "./fields"
import { shipBoxAfloat } from "./harbor"
import { type IslandLayout, buildIslandLayout } from "./index"
import { mountRotor } from "./landmarks"
import { type GroundRect, type RoadSample, distanceToRoadEdge, rectDistanceToRoadEdge } from "./placement"
import { DENSE_REACH_M, MEADOW_COPSES } from "./vegetation"
import { BUILDING_ROAD_CLEARANCE, VILLAGE_BUILDINGS } from "./village"

let terrain: IslandTerrain
let site: TerrainSite
let layout: IslandLayout
let roads: ReadonlyArray<RoadSample>

beforeAll(async () => {
  terrain = await loadIslandTerrain()
  site = new TerrainSite(terrain)
  layout = buildIslandLayout(site)
  roads = createLayoutContext(site).roads
})

const groups = (pattern: RegExp) => layout.instanced.filter((group) => pattern.test(group.key))
const instancesOf = (found: InstancedGroup[]) => found.flatMap((group) => group.instances)
const mapPoint = ([x, , z]: readonly [number, number, number]) => sceneToMap(terrain.data.map, x, z)

/** A placed model's ground plan at its real size. */
function groundRect(placement: Pick<Placement, "path" | "position" | "rotation">): GroundRect {
  const { width, depth } = islandSize(placement.path)
  return { x: placement.position[0], z: placement.position[2], yaw: placement.rotation[1], halfX: width / 2, halfZ: depth / 2 }
}

/** Signed distance from x/z to a ground rectangle, negative inside it. */
function distanceToRect(rect: GroundRect, x: number, z: number) {
  const dx = x - rect.x
  const dz = z - rect.z
  const u = Math.abs(dx * Math.cos(rect.yaw) - dz * Math.sin(rect.yaw)) - rect.halfX
  const v = Math.abs(dx * Math.sin(rect.yaw) + dz * Math.cos(rect.yaw)) - rect.halfZ
  const outside = Math.hypot(Math.max(u, 0), Math.max(v, 0))
  return outside > 0 ? outside : Math.max(u, v)
}

const buildingKeys = new Set(VILLAGE_BUILDINGS.map((b) => b.key))
const buildings = () => layout.placements.filter((p) => buildingKeys.has(p.key))

describe("the village", () => {
  it("stands every building on land near its place on the plan, facing a road", () => {
    expect(buildings()).toHaveLength(VILLAGE_BUILDINGS.length)
    for (const building of buildings()) {
      const plan = VILLAGE_BUILDINGS.find((b) => b.key === building.key)!
      const [x, y] = mapPoint(building.position)
      expect(site.h(x, y)).toBeGreaterThan(0.05)
      expect(Math.hypot(x - plan.at[0], y - plan.at[1])).toBeLessThan(16)
    }
  })

  it("keeps every building's walls clear of the roads", () => {
    for (const building of buildings()) {
      expect(rectDistanceToRoadEdge(groundRect(building), roads)).toBeGreaterThanOrEqual(BUILDING_ROAD_CLEARANCE - 1e-6)
    }
  })

  it("keeps every building clear of the others", () => {
    for (const a of buildings()) {
      for (const b of buildings()) {
        if (a === b) continue
        const rect = groundRect(b)
        const corners = [-1, 1].flatMap((u) => [-1, 1].map((v) => groundRect({ ...a, position: a.position }) && [u, v]))
        for (const [u, v] of corners) {
          const own = groundRect(a)
          const x = own.x + Math.cos(own.yaw) * u * own.halfX + Math.sin(own.yaw) * v * own.halfZ
          const z = own.z - Math.sin(own.yaw) * u * own.halfX + Math.cos(own.yaw) * v * own.halfZ
          expect(distanceToRect(rect, x, z)).toBeGreaterThan(1)
        }
      }
    }
  })

  it("keeps plants, rocks, clusters and lanterns out of the buildings", () => {
    const rects = buildings().map(groundRect)
    // A building's own planter, hedge, bed and espalier stand within its ground plan, at the door and walls.
    const others = layout.instanced.filter((group) => !/seaMarkers|planters|doorHedges|raisedBeds|espaliers/.test(group.key))
    for (const { position } of [...instancesOf(others), ...layout.lanterns.instances]) {
      for (const rect of rects) expect(distanceToRect(rect, position[0], position[2])).toBeGreaterThan(0)
    }
  })
})

describe("the landmarks", () => {
  it("stand on their anchors in terrain.json, the castle on the bailey and the mill at the pond's outlet", () => {
    const anchors: Record<string, string> = {
      castleKeep: "castle_keep",
      watermill: "watermill",
      lighthouse: "lighthouse",
      shrine: "shrine"
    }
    for (const [key, anchor] of Object.entries(anchors)) {
      const placed = layout.placements.find((p) => p.key === key)!
      const [x, y, h] = terrain.data.landmarks[anchor].at
      expect(placed.position).toEqual(mapToScene(terrain.data.map, x, y, h))
      expect(placed.pivot).toBe("origin")
    }
  })

  it("hangs the water wheel on its axle at the wheel's anchor", () => {
    const wheel = layout.rotors.find((rotor) => rotor.key === "waterWheel")!
    const [x, y, h] = terrain.data.landmarks.watermill_wheel.at
    expect(wheel.position).toEqual(mapToScene(terrain.data.map, x, y, h))
    expect(wheel.path).toBe(MODEL_PATHS.earth.watermillWheel)
    expect(wheel.turnsPerMinute).toBeGreaterThan(0)
  })

  it("mounts a rotor on its host's hub, its axle along the host's front, wherever the host faces", () => {
    // The windmill's sails as stats.json mounts them on the mill: 9.35 m up and 3.579 m out of its front, turned a quarter.
    const mount = ISLAND_MOUNTS.mill_sails
    for (const yaw of [0, 0.7, -2.4]) {
      const mill: Placement = { key: "mill", path: "mill.glb", position: [10, 2, -5], rotation: [0, yaw, 0], scale: 1.3 }
      const sails = mountRotor(mill, mount, "millSails", "mill_sails.glb", 3)
      const front = new Vector3(Math.sin(yaw), 0, Math.cos(yaw))
      const hub = new Vector3(...sails.position).sub(new Vector3(...mill.position))
      expect(hub.y).toBeCloseTo(9.35 * 1.3, 9)
      expect(hub.dot(front)).toBeCloseTo(3.579 * 1.3, 9)
      expect(Math.hypot(hub.x, hub.z)).toBeCloseTo(3.579 * 1.3, 9)
      // The sails turn about their own x, which the extra quarter turn lays along the mill's front.
      const axle = new Vector3(Math.cos(sails.yaw), 0, -Math.sin(sails.yaw))
      expect(Math.abs(axle.dot(front))).toBeCloseTo(1, 9)
    }
  })
})

describe("the vegetation", () => {
  it("plants the orchard's apple trees in their rows, leaving out the places a road runs over", () => {
    const apples = instancesOf(groups(/^appleTrees/))
    const clear = terrain.data.layout.orchard.filter(([x, y]) => site.roadDistance(x, y, 8) >= 8)
    expect(apples).toHaveLength(clear.length)
    expect(apples.length).toBeGreaterThanOrEqual(12)
    for (const { position } of apples) {
      const [x, y] = mapPoint(position)
      expect(Math.min(...terrain.data.layout.orchard.map(([ox, oy]) => Math.hypot(ox - x, oy - y)))).toBeLessThan(0.5)
    }
  })

  it("grows the meadow trees in their copses and spruce on the ridge, none on rock, sand or a road", () => {
    const meadow = instancesOf(groups(/^(oaks|ashes|birches)/))
    expect(meadow.length).toBeGreaterThan(30)
    for (const { position } of meadow) {
      const [x, y] = mapPoint(position)
      expect(MEADOW_COPSES.some(({ centre, radiusPx }) => Math.hypot(x - centre[0], y - centre[1]) <= radiusPx + 1)).toBe(true)
      expect(site.rockWithin(x, y, 10)).toBeLessThan(0.05)
    }
    const spruce = instancesOf(groups(/^spruces/))
    expect(spruce.length).toBeGreaterThan(15)
    for (const { position } of spruce) {
      const [x, y] = mapPoint(position)
      expect(site.rockWithin(x, y, 5)).toBeLessThan(0.05)
    }
    for (const { position } of [...meadow, ...spruce, ...instancesOf(groups(/^(appleTrees|hawthorns|cypress)/))]) {
      const [x, y] = mapPoint(position)
      expect(site.cover(x, y).grass).toBeGreaterThan(0.5)
      expect(distanceToRoadEdge(position[0], position[2], roads)).toBeGreaterThan(0.5)
    }
  })

  it("grows grass and flowers only on grass within 40 m of a road or the village", () => {
    const { metresPerPx } = terrain.data.map
    const village = layout.placements.map((p) => mapPoint(p.position))
    const plants = instancesOf(groups(/^(grass|dandelions|gazanias|cornflowers|sorrel|daisies)/))
    expect(plants.length).toBeGreaterThan(5000)
    for (const { position } of plants) {
      const [x, y] = mapPoint(position)
      const nearest = Math.min(site.roadDistance(x, y, 80), ...village.map(([vx, vy]) => Math.hypot(vx - x, vy - y)))
      // The density field's cells are 4 px, so its distances run up to 3 px short.
      expect(nearest * metresPerPx).toBeLessThan(DENSE_REACH_M + 3 * metresPerPx)
      expect(site.cover(x, y).grass).toBeGreaterThanOrEqual(0.75)
    }
  })

  it("keeps rocks and stumps off the roads", () => {
    for (const { position } of instancesOf(groups(/^(boulders|mossRocks|cragBoulders|stumps)/))) {
      expect(distanceToRoadEdge(position[0], position[2], roads)).toBeGreaterThan(0.5)
    }
  })

  it("lays out the same island on every visit", () => {
    const again = buildIslandLayout(site)
    expect(again.instanced.map((group) => group.instances)).toEqual(layout.instanced.map((group) => group.instances))
    expect(again.placements).toEqual(layout.placements)
  })
})

describe("the road lanterns", () => {
  it("stand about every 33 m round the ring, in road order and clear of every road", () => {
    const lanterns = layout.lanterns.instances
    const ringMetres = terrain.data.roads.ring.lengthPx * terrain.data.map.metresPerPx
    expect(lanterns.length).toBe(Math.round(ringMetres / 33))
    for (let i = 1; i < lanterns.length; i += 1) expect(lanterns[i].routeT).toBeGreaterThan(lanterns[i - 1].routeT)
    for (const { position } of lanterns) expect(distanceToRoadEdge(position[0], position[2], roads)).toBeGreaterThan(0.5)
  })
})

describe("the harbour", () => {
  it("stands the quay wall, the breakwater and the whole pier where blender/island built them, about the map's origin", () => {
    for (const [key, anchor] of [
      ["quayWall", "quay_wall"],
      ["breakwater", "breakwater"],
      ["pier", "pier"]
    ]) {
      const placed = layout.placements.find((p) => p.key === key)!
      const [x, y, h] = terrain.data.landmarks[anchor].at
      expect(placed.position).toEqual(mapToScene(terrain.data.map, x, y, h))
      expect(placed.pivot).toBe("origin")
    }
    expect(layout.placements.filter((p) => p.path === MODEL_PATHS.earth.pier)).toHaveLength(1)
  })

  it("moors the ship bow in along the berth on the pier's north side, alongside its bollards, her whole box clear of land", () => {
    const berth = terrain.data.landmarks.pier_berth
    const ship = layout.placements.find((p) => p.key === "ship")!
    const bowFacing = (berth.alongside! + 180) % 360
    expect(ship.rotation[1]).toBeCloseTo(facingToYaw(bowFacing), 9)
    const unit = (facing: number) => [Math.sin((facing * Math.PI) / 180), -Math.cos((facing * Math.PI) / 180)] as const
    const [x, y] = mapPoint(ship.position)
    const { metresPerPx } = terrain.data.map
    const [outX, outY] = unit(berth.facing)
    const besideMetres = ((x - berth.at[0]) * outX + (y - berth.at[1]) * outY) * metresPerPx
    expect(besideMetres).toBeCloseTo(0.3 + 0.8 + 4.5, 6)
    // Slid out along the berth only as far as the land asks: half a metre less and her box would come too near it.
    const ahead = unit(bowFacing)
    const slideMetres = -((x - berth.at[0]) * ahead[0] + (y - berth.at[1]) * ahead[1]) * metresPerPx
    expect(slideMetres).toBeCloseTo(11.5, 6)
    expect(shipBoxAfloat(site, x, y, ahead)).toBe(true)
    const halfMetrePx = 0.5 / metresPerPx
    expect(shipBoxAfloat(site, x + ahead[0] * halfMetrePx, y + ahead[1] * halfMetrePx, ahead)).toBe(false)
    // At least two of the berth's bollards lie within her waterline length, 16.5 m aft to 15 m forward of her middle.
    const alongside = berth.bollards!.filter(([bx, by]) => {
      const metres = ((bx - x) * ahead[0] + (by - y) * ahead[1]) * metresPerPx
      return metres > -16.5 && metres < 15
    })
    expect(alongside.length).toBeGreaterThanOrEqual(2)
  })

  it("sets the starboard mark north of the line into the basin, at sea, the port mark off the breakwater's head", () => {
    const [port, starboard] = instancesOf(groups(/^seaMarkers$/)).map((marker) => mapPoint(marker.position))
    expect(port[0]).toBeCloseTo(296, 6)
    expect(port[1]).toBeCloseTo(578, 6)
    expect(starboard[0]).toBeCloseTo(264, 6)
    expect(starboard[1]).toBeCloseTo(534, 6)
    expect(site.h(...starboard)).toBeLessThan(0)
  })

  it("draws the rowing boats up on the beach above the water", () => {
    for (const { position } of instancesOf(groups(/^rowingBoat/))) {
      const [x, y] = mapPoint(position)
      expect(site.h(x, y)).toBeGreaterThan(0)
    }
  })
})

describe("the fields", () => {
  // A walled field with a gate in the open meadow east of the ring, drawn as terrain.json lays fields out.
  const FIELD: FieldPlan = {
    corners: [
      [760, 430],
      [800, 430],
      [800, 460],
      [760, 460]
    ],
    edges: [
      { from: [760, 430], to: [800, 430], kind: "hedge", gate: null },
      { from: [800, 430], to: [800, 460], kind: "wall", gate: [800, 445] },
      { from: [800, 460], to: [760, 460], kind: "hedge", gate: null },
      { from: [760, 460], to: [760, 430], kind: "wall", gate: null }
    ],
    haystacks: [[780, 445, 0.3]]
  }

  it("lines each side with its pieces end to end, a gateway with its gate where the plan puts one, and a haystack inside", () => {
    const fieldSite = new TerrainSite({ ...terrain, data: { ...terrain.data, layout: { ...terrain.data.layout, fields: [FIELD] } } })
    const { groups: fieldGroups, outlines } = placeFields(createLayoutContext(fieldSite))
    const byKey = (key: string) => fieldGroups.find((group) => group.key === key)?.instances ?? []
    const map = terrain.data.map
    const sideMetres = (40 + 30) * map.metresPerPx
    const hedgeMetres = byKey("hedgerows").length + byKey("hedgerowsB").length
    expect(hedgeMetres * islandSize(MODEL_PATHS.earth.hedgerow).width).toBeGreaterThanOrEqual(sideMetres * map.unitsPerMetre - 1e-6)
    expect(byKey("fieldGateways")).toHaveLength(1)
    expect(byKey("fieldGates")).toHaveLength(1)
    const gate = mapToScene(map, 800, 445)
    expect(byKey("fieldGateways")[0].position[0]).toBeCloseTo(gate[0], 6)
    expect(byKey("fieldGateways")[0].position[2]).toBeCloseTo(gate[2], 6)
    expect(byKey("haystacks")).toHaveLength(1)
    expect(outlines).toHaveLength(1)
  })
})
