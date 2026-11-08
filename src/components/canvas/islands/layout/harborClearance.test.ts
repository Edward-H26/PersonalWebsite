// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest"
import { BufferGeometry, Matrix4, Vector3 } from "three"
import { MeshBVH } from "three-mesh-bvh"
import { ISLAND_UNITS_PER_METRE } from "@/config/modelSizes"
import { loadHarborBodies } from "./harborFixture"

const IN_WORLD = new Matrix4()
const LOAD_TIMEOUT_MS = 120_000

type Body = { geometry: BufferGeometry; tree: MeshBVH }
type Bodies = Record<"ship" | "pier" | "quayWall" | "breakwater" | "ground", Body>

let bodies: Bodies

// A geometry that carries its own tree is searched tree against tree, which takes these tests from minutes to a moment.
function body(geometry: BufferGeometry): Body {
  const tree = new MeshBVH(geometry)
  geometry.boundsTree = tree
  return { geometry, tree }
}

function intersect(a: keyof Bodies, b: keyof Bodies) {
  return bodies[a].tree.intersectsGeometry(bodies[b].geometry, IN_WORLD)
}

/** The gap between two bodies, in metres. */
function clearanceMetres(a: keyof Bodies, b: keyof Bodies) {
  const nearest = { point: new Vector3(), distance: 0, faceIndex: 0 }
  bodies[a].tree.closestPointToGeometry(bodies[b].geometry, IN_WORLD, nearest)
  return nearest.distance / ISLAND_UNITS_PER_METRE
}

beforeAll(async () => {
  const { ship, pier, quayWall, breakwater, ground } = await loadHarborBodies()
  bodies = {
    ship: body(ship),
    pier: body(pier),
    quayWall: body(quayWall),
    breakwater: body(breakwater),
    ground: body(ground)
  }
}, LOAD_TIMEOUT_MS)

describe("the moored ship", () => {
  it("touches neither the pier, the quay wall nor the breakwater", () => {
    for (const other of ["pier", "quayWall", "breakwater"] as const) {
      expect(intersect("ship", other), `ship and ${other}`).toBe(false)
    }
  })

  it("lies off the pier by more than a hand's width and well clear of the wall and the breakwater", () => {
    expect(clearanceMetres("ship", "pier")).toBeGreaterThan(0.15)
    expect(clearanceMetres("ship", "quayWall")).toBeGreaterThan(4)
    expect(clearanceMetres("ship", "breakwater")).toBeGreaterThan(12)
  })

  // Her keel lies about 2.3 m into the harbour floor: GltfModel's position prop replaces the offset that would have stood
  // her on her lowest point, as harbor.ts intends, so she floats 2.4 m low. Stood on it, she clears the floor by 0.1 m;
  // once GltfModel keeps the offset, this test passes and vitest asks for the `fails` to go.
  it.fails("floats clear of the harbour floor", () => {
    expect(intersect("ship", "ground")).toBe(false)
  })
})

describe("the harbour's fixed works", () => {
  it("are built into the ground and the pier into the quay, as they should be", () => {
    for (const [a, b] of [
      ["pier", "ground"],
      ["quayWall", "ground"],
      ["breakwater", "ground"],
      ["pier", "quayWall"]
    ] as const) {
      expect(intersect(a, b), `${a} and ${b}`).toBe(true)
    }
  })

  it("keep the breakwater apart from the pier and the wall", () => {
    expect(intersect("pier", "breakwater")).toBe(false)
    expect(intersect("quayWall", "breakwater")).toBe(false)
  })
})
