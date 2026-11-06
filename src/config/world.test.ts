// @vitest-environment node
import { describe, expect, it } from "vitest"
import { DEFAULT_CARD_PULLBACK, EARTH_SECTION_T_STOPS, cardPullbackAt } from "./world"
import { RoadPath } from "@/components/canvas/islands/terrain/roadPath"
import { type MapPoint, mapToScene } from "@/components/canvas/islands/terrain/terrainData"
import { TERRAIN } from "@/components/canvas/islands/terrain/terrainFixture"

/**
 * Where each stop of the deck stands on the island, DESIGN.md section 17: the overview at the quay, then the
 * title of each chapter in the deck's order (Publications, Research, Projects, Experience, Service, Info).
 */
const CHAPTER_ANCHORS: ReadonlyArray<readonly [name: string, at: MapPoint]> = [
  ["overview", [365, 505]],
  ["publications", [415, 445]],
  ["research", [490, 400]],
  ["projects", [640, 322]],
  ["experience", [470, 205]],
  ["service", [205, 335]],
  ["info", [265, 445]]
]

const ring = new RoadPath(TERRAIN.roads.ring, TERRAIN.map)

describe("the deck's stops on the ring road", () => {
  it("stand where the ring passes each chapter's anchor", () => {
    for (const [name, [x, y]] of CHAPTER_ANCHORS) {
      const nearest = TERRAIN.roads.ring.points.reduce((best, row) =>
        Math.hypot(row[0] - x, row[1] - y) < Math.hypot(best[0] - x, best[1] - y) ? row : best
      )
      expect(Math.hypot(nearest[0] - x, nearest[1] - y), name).toBeLessThan(2)
    }
  })

  it("are each anchor's t along the ring, and the walk ends back at the quay", () => {
    CHAPTER_ANCHORS.forEach(([name, [x, y]], i) => {
      const [sceneX, , sceneZ] = mapToScene(TERRAIN.map, x, y)
      expect(EARTH_SECTION_T_STOPS[i], name).toBeCloseTo(ring.nearestT(sceneX, sceneZ), 4)
    })
    expect(EARTH_SECTION_T_STOPS[CHAPTER_ANCHORS.length]).toBe(1)
  })

  it("keep the camera 3 units back on the Projects title, so the gate's market stalls stay out of frame, and 7 elsewhere", () => {
    CHAPTER_ANCHORS.forEach(([name], i) => {
      expect(cardPullbackAt(EARTH_SECTION_T_STOPS[i]), name).toBe(name === "projects" ? 3 : DEFAULT_CARD_PULLBACK)
    })
    expect(DEFAULT_CARD_PULLBACK).toBe(7)
  })
})
