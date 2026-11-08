import type { Sphere, Vector3 } from "three"
import type { InstanceTransform } from "@/components/canvas/islands/village/types"

/** One square of the ground's grid: the run of sorted copies that stand in it, by its first copy and its length. */
export type InstanceChunk = { start: number; count: number }

/** Floats in one copy's transform. */
const MATRIX_FLOATS = 16

/**
 * Sorts copies by the square of a grid `cellSize` world units wide that their origins stand in, so that each square's
 * copies lie together. The squares come in the order their first copies do, and copies keep their order within one.
 */
export function sortIntoChunks(instances: readonly InstanceTransform[], cellSize: number) {
  const cells = new Map<string, InstanceTransform[]>()
  for (const instance of instances) {
    const key = `${Math.floor(instance.position[0] / cellSize)},${Math.floor(instance.position[2] / cellSize)}`
    const cell = cells.get(key)
    if (cell) cell.push(instance)
    else cells.set(key, [instance])
  }
  const sorted: InstanceTransform[] = []
  const chunks: InstanceChunk[] = []
  for (const copies of cells.values()) {
    chunks.push({ start: sorted.length, count: copies.length })
    sorted.push(...copies)
  }
  return { instances: sorted, chunks }
}

/** Whether any part of the bounds round a square's copies lies within `reach` of the camera. */
export function chunkInReach(camera: Vector3, bounds: Sphere, reach: number) {
  return camera.distanceTo(bounds.center) - bounds.radius <= reach
}

/**
 * Copies the transforms of the squares in reach from the sorted copies' `matrices` to the front of `target`, one square
 * after another, and returns how many copies they hold.
 */
export function packChunks(matrices: Float32Array, chunks: readonly InstanceChunk[], inReach: ArrayLike<number>, target: Float32Array) {
  let packed = 0
  for (let i = 0; i < chunks.length; i += 1) {
    if (!inReach[i]) continue
    const { start, count } = chunks[i]
    target.set(matrices.subarray(start * MATRIX_FLOATS, (start + count) * MATRIX_FLOATS), packed * MATRIX_FLOATS)
    packed += count
  }
  return packed
}
