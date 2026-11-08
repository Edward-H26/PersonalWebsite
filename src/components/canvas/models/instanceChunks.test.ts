import { describe, expect, it } from "vitest"
import { Sphere, Vector3 } from "three"
import type { InstanceTransform } from "@/components/canvas/islands/village/types"
import { chunkInReach, packChunks, sortIntoChunks } from "./instanceChunks"

const at = (x: number, z: number): InstanceTransform => ({ position: [x, 3, z], rotation: [0, 0, 0], scale: 1 })

describe("sortIntoChunks", () => {
  it("groups every copy with the others in the square its origin stands in, exactly once", () => {
    const copies = [at(1, 1), at(66, 1), at(64, 64), at(-1, 1), at(65, 70)]
    const { instances, chunks } = sortIntoChunks(copies, 65)
    expect(instances).toEqual([copies[0], copies[2], copies[1], copies[3], copies[4]])
    expect(chunks).toEqual([
      { start: 0, count: 2 },
      { start: 2, count: 1 },
      { start: 3, count: 1 },
      { start: 4, count: 1 }
    ])
  })

  it("makes no squares for no copies", () => {
    expect(sortIntoChunks([], 65)).toEqual({ instances: [], chunks: [] })
  })
})

describe("chunkInReach", () => {
  const bounds = new Sphere(new Vector3(100, 0, 0), 20)

  it("keeps a square while the nearest of its bounds lies within reach", () => {
    expect(chunkInReach(new Vector3(0, 0, 0), bounds, 80)).toBe(true)
    expect(chunkInReach(new Vector3(100, 0, 0), bounds, 1)).toBe(true)
  })

  it("drops it once all of its bounds lie beyond reach", () => {
    expect(chunkInReach(new Vector3(0, 0, 0), bounds, 79.9)).toBe(false)
  })
})

describe("packChunks", () => {
  // Five copies' transforms, each copy's 16 floats all set to its index.
  const matrices = Float32Array.from({ length: 5 * 16 }, (_, i) => Math.floor(i / 16))
  const chunks = [
    { start: 0, count: 2 },
    { start: 2, count: 1 },
    { start: 3, count: 2 }
  ]
  const copiesIn = (target: Float32Array, count: number) => Array.from({ length: count }, (_, i) => target[i * 16])

  it("packs the squares in reach at the front, in order, and counts their copies", () => {
    const target = new Float32Array(matrices.length)
    expect(packChunks(matrices, chunks, [1, 0, 1], target)).toBe(4)
    expect(copiesIn(target, 4)).toEqual([0, 1, 3, 4])
  })

  it("packs every copy when every square is in reach, and none when none is", () => {
    const target = new Float32Array(matrices.length)
    expect(packChunks(matrices, chunks, [1, 1, 1], target)).toBe(5)
    expect(target).toEqual(matrices)
    expect(packChunks(matrices, chunks, [0, 0, 0], target)).toBe(0)
  })
})
