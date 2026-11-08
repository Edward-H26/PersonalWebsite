import { BufferAttribute, BufferGeometry, Box3, Euler, Matrix4, Mesh, Quaternion, Vector3 } from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import type { Placement } from "../village/types"
import { loadIslandTerrain } from "../terrain/terrainFixture"
import { TerrainSite } from "../terrain/terrainSite"
import { type Harbor, buildHarbor } from "./harbor"

// The published GLBs, read for the unit tests. vitest runs on Node, whose types the app leaves out, so its
// modules come through the process object, and the draco decoder is the one the site itself serves.
type NodeProcess = {
  cwd(): string
  getBuiltinModule(id: "node:fs"): { readFileSync(path: string): Uint8Array }
  getBuiltinModule(id: "node:module"): { createRequire(path: string): (id: string) => unknown }
}
const nodeProcess = (globalThis as unknown as { process: NodeProcess }).process
const publicDir = `${nodeProcess.cwd()}/public`

type DracoAttribute = { num_components(): number }
type DracoMesh = { num_faces(): number; num_points(): number }
type Draco = {
  TRIANGULAR_MESH: number
  DT_FLOAT32: number
  HEAP32: Int32Array
  _malloc(bytes: number): number
  _free(pointer: number): void
  Mesh: new () => DracoMesh
  Decoder: new () => {
    GetEncodedGeometryType(array: Int8Array): number
    DecodeArrayToMesh(array: Int8Array, length: number, mesh: DracoMesh): { ok(): boolean; error_msg(): string }
    GetAttributeByUniqueId(mesh: DracoMesh, id: number): DracoAttribute
    GetAttributeDataArrayForAllPoints(mesh: DracoMesh, attribute: DracoAttribute, type: number, bytes: number, pointer: number): void
    GetTrianglesUInt32Array(mesh: DracoMesh, bytes: number, pointer: number): void
  }
  destroy(object: unknown): void
}

let dracoModule: Promise<Draco> | null = null

// The decoder is an old-style script, but the package's "type" would make Node read it as an ES module, so it runs by hand.
function loadDraco() {
  if (!dracoModule) {
    const decoderPath = `${publicDir}/draco/draco_decoder.js`
    const source = new TextDecoder().decode(nodeProcess.getBuiltinModule("node:fs").readFileSync(decoderPath))
    const module = { exports: {} as () => Promise<Draco> }
    const require = nodeProcess.getBuiltinModule("node:module").createRequire(decoderPath)
    new Function("module", "exports", "require", "__filename", "__dirname", source)(
      module,
      module.exports,
      require,
      decoderPath,
      `${publicDir}/draco`
    )
    dracoModule = Promise.resolve(module.exports())
  }
  return dracoModule
}

/** Copies `count` values of one kind out of the decoder's heap, through a block it fills. */
function readHeap<T extends Float32Array | Uint32Array>(
  draco: Draco,
  Kind: new (buffer: ArrayBuffer, offset: number, length: number) => T,
  count: number,
  fill: (bytes: number, pointer: number) => void
) {
  const bytes = count * 4
  const pointer = draco._malloc(bytes)
  fill(bytes, pointer)
  const values = new Kind(draco.HEAP32.buffer as ArrayBuffer, pointer, count).slice() as T
  draco._free(pointer)
  return values
}

/** Stands in for DRACOLoader, which needs a browser's workers: it decodes a primitive's positions and triangles here and now. */
class PositionsOnlyDraco {
  preload() {
    return this
  }

  decodeDracoFile(
    buffer: ArrayBuffer,
    onDecoded: (geometry: BufferGeometry) => void,
    attributeIds: Record<string, number>,
    _attributeTypes: unknown,
    _colorSpace: unknown,
    onError: (error: Error) => void
  ) {
    loadDraco()
      .then((draco) => {
        const decoder = new draco.Decoder()
        const mesh = new draco.Mesh()
        const array = new Int8Array(buffer)
        const status = decoder.DecodeArrayToMesh(array, array.byteLength, mesh)
        if (!status.ok()) throw new Error(`Draco: ${status.error_msg()}`)
        const position = decoder.GetAttributeByUniqueId(mesh, attributeIds.position)
        const valueCount = mesh.num_points() * position.num_components()
        const positions = readHeap(draco, Float32Array, valueCount, (bytes, pointer) =>
          decoder.GetAttributeDataArrayForAllPoints(mesh, position, draco.DT_FLOAT32, bytes, pointer)
        )
        const triangles = readHeap(draco, Uint32Array, mesh.num_faces() * 3, (bytes, pointer) =>
          decoder.GetTrianglesUInt32Array(mesh, bytes, pointer)
        )
        draco.destroy(mesh)
        draco.destroy(decoder)
        const geometry = new BufferGeometry()
        geometry.setAttribute("position", new BufferAttribute(positions, 3))
        geometry.setIndex(new BufferAttribute(triangles, 1))
        onDecoded(geometry)
      })
      .catch(onError)
  }
}

/** A published model's triangles as one geometry in its own coordinates: positions and indices only. */
export async function loadModelTriangles(asset: string): Promise<BufferGeometry> {
  const bytes = nodeProcess.getBuiltinModule("node:fs").readFileSync(`${publicDir}/models/island/${asset}.glb`)
  const loader = new GLTFLoader()
  loader.setDRACOLoader(new PositionsOnlyDraco() as unknown as Parameters<GLTFLoader["setDRACOLoader"]>[0])
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, "")
  gltf.scene.updateMatrixWorld(true)
  const parts: BufferGeometry[] = []
  gltf.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const part = new BufferGeometry()
    part.setAttribute("position", object.geometry.getAttribute("position"))
    part.setIndex(object.geometry.getIndex())
    parts.push(part.applyMatrix4(object.matrixWorld))
  })
  const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts)
  if (!merged) throw new Error(`${asset}.glb could not be merged`)
  return merged
}

/**
 * The transform GltfModel gives a placement of a model whose triangles span `bounds`: scaled and shifted by its pivot in
 * its own frame, then turned and moved to the placement.
 */
export function placementMatrix(placement: Pick<Placement, "position" | "rotation" | "scale" | "fitHeight" | "pivot">, bounds: Box3) {
  const size = bounds.getSize(new Vector3())
  const centre = bounds.getCenter(new Vector3())
  const scale = (placement.fitHeight && size.y > 0 ? placement.fitHeight / size.y : 1) * placement.scale
  const pivot = placement.pivot ?? "center-bottom"
  const offset =
    pivot === "origin"
      ? new Vector3()
      : new Vector3(-centre.x, pivot === "center" ? -centre.y : -bounds.min.y, -centre.z).multiplyScalar(scale)
  const placed = new Matrix4().compose(
    new Vector3(...placement.position),
    new Quaternion().setFromEuler(new Euler(...placement.rotation)),
    new Vector3(1, 1, 1)
  )
  return placed.multiply(new Matrix4().compose(offset, new Quaternion(), new Vector3().setScalar(scale)))
}

function placedBy(harbor: Harbor, key: string) {
  const placement = harbor.placements.find((p) => p.key === key)
  if (!placement) throw new Error(`The harbour places no ${key}`)
  return placement
}

/** The harbour's five bodies in world units, in the positions the scene draws them, each as a triangle soup. */
export async function loadHarborBodies() {
  const terrain = await loadIslandTerrain()
  const site = new TerrainSite(terrain)
  const harbor = buildHarbor(site)
  const inWorld = async (asset: string, key: string) => {
    const triangles = await loadModelTriangles(asset)
    const bounds = new Box3().setFromBufferAttribute(triangles.getAttribute("position") as BufferAttribute)
    return triangles.applyMatrix4(placementMatrix(placedBy(harbor, key), bounds))
  }
  const [ship, pier, quayWall, breakwater, ground] = await Promise.all([
    inWorld("ship", "ship"),
    inWorld("pier", "pier"),
    inWorld("quay_wall", "quayWall"),
    inWorld("breakwater", "breakwater"),
    loadModelTriangles("terrain")
  ])
  ground.scale(terrain.data.map.unitsPerMetre, terrain.data.map.unitsPerMetre, terrain.data.map.unitsPerMetre)
  return { site, harbor, ship, pier, quayWall, breakwater, ground }
}
