import * as THREE from "three"

/** How long a slice of the work may run before it hands the frame back, in milliseconds. */
const SLICE_MS = 8
/** A warm-up draw uploads about this many bytes of buffers at most, unless one mesh alone holds more. */
const UPLOAD_BATCH_BYTES = 512 * 1024
/** Where the textures, the programs and the buffers end on the warm-up's share of the load; the shadow pass takes the rest. */
const TEXTURES_END = 0.3
const PROGRAMS_END = 0.7
const BUFFERS_END = 0.95

type Schedule = { now: () => number; nextFrame: () => Promise<unknown> }

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))

/**
 * Waits for a frame by which the GPU process has done all it was sent, polling a fence instead of asking outright: the
 * calls three.js makes on a program's first use wait for that process, and while it is behind they hold the page up.
 * A lost context ends the wait, as its fence never signals.
 */
async function nextCaughtUpFrame(gl: WebGL2RenderingContext) {
  const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
  gl.flush()
  do await nextFrame()
  while (fence && !gl.isContextLost() && gl.getSyncParameter(fence, gl.SYNC_STATUS) !== gl.SIGNALED)
  gl.deleteSync(fence)
}

/** Runs `work` on each item in turn, waiting for the next frame whenever a slice is spent, and reports the share done. */
export async function inSlices<T>(items: readonly T[], work: (item: T) => void, onShare: (share: number) => void, schedule: Schedule) {
  let sliceStart = schedule.now()
  for (let i = 0; i < items.length; i += 1) {
    work(items[i])
    if (schedule.now() - sliceStart >= SLICE_MS) {
      onShare((i + 1) / items.length)
      await schedule.nextFrame()
      sliceStart = schedule.now()
    }
  }
  onShare(1)
}

/** The bytes of a mesh's buffers that `uploaded` has not seen yet, noting them as seen. */
function newBufferBytes(mesh: THREE.Mesh, uploaded: Set<unknown>) {
  const buffers = [
    ...Object.values(mesh.geometry.attributes),
    mesh.geometry.index,
    mesh instanceof THREE.InstancedMesh ? mesh.instanceMatrix : null
  ]
  let bytes = 0
  for (const buffer of buffers) {
    if (!buffer || uploaded.has(buffer)) continue
    uploaded.add(buffer)
    bytes += (buffer.array as ArrayBufferView).byteLength
  }
  return bytes
}

/** Groups meshes in order so that drawing a group uploads about UPLOAD_BATCH_BYTES at most. */
export function uploadBatches(meshes: readonly THREE.Mesh[]) {
  const uploaded = new Set<unknown>()
  const batches: THREE.Mesh[][] = []
  let bytes = 0
  for (const mesh of meshes) {
    const added = newBufferBytes(mesh, uploaded)
    if (batches.length === 0 || bytes + added > UPLOAD_BATCH_BYTES) {
      batches.push([])
      bytes = 0
    }
    batches[batches.length - 1].push(mesh)
    bytes += added
  }
  return batches
}

/** One mesh for each program the meshes will need: the program follows the material, the instancing and the buffers it reads. */
export function oneMeshPerProgram(meshes: readonly THREE.Mesh[]) {
  const byProgram = new Map<string, THREE.Mesh>()
  for (const mesh of meshes) {
    const { attributes } = mesh.geometry
    const material = mesh.material as THREE.Material
    const colourSize = attributes.color?.itemSize ?? 0
    const key = [
      material.uuid,
      mesh instanceof THREE.InstancedMesh,
      mesh.receiveShadow,
      colourSize,
      ...Object.keys(attributes).sort()
    ].join()
    if (!byProgram.has(key)) byProgram.set(key, mesh)
  }
  return [...byProgram.values()]
}

/**
 * One caster for each program the shadow pass may need. Unless a caster brings its own depth material, three.js sets the
 * shared one up from the caster's material (its side, map and alpha test), so casters share a program only when they
 * share both materials and are instanced alike.
 */
export function oneCasterPerDepthProgram(meshes: readonly THREE.Mesh[]) {
  const byProgram = new Map<string, THREE.Mesh>()
  for (const mesh of meshes) {
    if (!mesh.castShadow) continue
    const material = mesh.material as THREE.Material
    const key = [material.uuid, mesh.customDepthMaterial?.uuid, mesh instanceof THREE.InstancedMesh].join()
    if (!byProgram.has(key)) byProgram.set(key, mesh)
  }
  return [...byProgram.values()]
}

function visibleMeshes(scene: THREE.Scene) {
  const meshes: THREE.Mesh[] = []
  scene.traverseVisible((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object)
  })
  return meshes
}

/**
 * Hides every mesh and points the renderer at a throwaway target with its shadow pass off, so a draw of a few meshes costs
 * only those few. Nothing moves meanwhile, so the world matrices hold still too. Returns how to put it all back.
 */
function enterWarmUp(renderer: THREE.WebGLRenderer, scene: THREE.Scene, meshes: readonly THREE.Mesh[]) {
  const previousTarget = renderer.getRenderTarget()
  const target = new THREE.WebGLRenderTarget(1, 1)
  const wasFrustumCulled = meshes.map((mesh) => mesh.frustumCulled)
  scene.updateMatrixWorld(true)
  scene.matrixWorldAutoUpdate = false
  // The scene draws into the composer's buffers, so its programs must be built for a render target, not for the screen.
  renderer.setRenderTarget(target)
  renderer.shadowMap.autoUpdate = false
  for (const mesh of meshes) {
    mesh.visible = false
    mesh.frustumCulled = false
  }
  return () => {
    meshes.forEach((mesh, i) => {
      mesh.visible = true
      mesh.frustumCulled = wasFrustumCulled[i]
    })
    renderer.shadowMap.autoUpdate = true
    renderer.setRenderTarget(previousTarget)
    scene.matrixWorldAutoUpdate = true
    target.dispose()
  }
}

/**
 * Does what a mounted scene's first frame would do, a slice per frame and unseen: uploads its textures, links its
 * programs off the main thread's clock, uploads its buffers by drawing them into nowhere, and links the shadow pass's
 * programs. After it, no view of the island asks anything new of the GPU.
 */
export async function warmUpScene(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  textures: Iterable<THREE.Texture>,
  onShare: (share: number) => void
) {
  // The programs depend on the environment, which the sky bakes on a frame of its own.
  while (!scene.environment) await nextFrame()

  const schedule: Schedule = {
    now: () => performance.now(),
    nextFrame: () => nextCaughtUpFrame(renderer.getContext() as WebGL2RenderingContext)
  }
  const shareBetween = (from: number, to: number) => (share: number) => onShare(from + (to - from) * share)
  const meshes = visibleMeshes(scene)
  const camera = new THREE.PerspectiveCamera()
  camera.layers.enableAll()
  const draw = (batch: readonly THREE.Mesh[]) => {
    for (const mesh of batch) mesh.visible = true
    renderer.render(scene, camera)
    for (const mesh of batch) mesh.visible = false
  }

  const leaveWarmUp = enterWarmUp(renderer, scene, meshes)
  try {
    await inSlices([...textures], (texture) => renderer.initTexture(texture), shareBetween(0, TEXTURES_END), schedule)

    const links: Promise<unknown>[] = []
    await inSlices(
      oneMeshPerProgram(meshes),
      (mesh) => links.push(renderer.compileAsync(mesh, camera, scene)),
      () => {},
      schedule
    )
    await Promise.all(links)
    shareBetween(TEXTURES_END, PROGRAMS_END)(1)

    await inSlices(uploadBatches(meshes), draw, shareBetween(PROGRAMS_END, BUFFERS_END), schedule)

    const castShadow = (caster: THREE.Mesh) => {
      renderer.shadowMap.needsUpdate = true
      draw([caster])
    }
    await inSlices(oneCasterPerDepthProgram(meshes), castShadow, shareBetween(BUFFERS_END, 1), schedule)
  } finally {
    leaveWarmUp()
  }
}
