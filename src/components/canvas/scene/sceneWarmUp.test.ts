import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { inSlices, oneCasterPerDepthProgram, oneMeshPerProgram, uploadBatches, warmUpScene } from "./sceneWarmUp"

function positions(vertices: number) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vertices * 3), 3))
  return geometry
}

describe("inSlices", () => {
  it("does every item in order and waits for a frame whenever a slice is spent", async () => {
    let clock = 0
    let frames = 0
    const done: number[] = []
    const shares: number[] = []
    await inSlices(
      [1, 2, 3, 4, 5],
      (item) => {
        done.push(item)
        clock += 3
      },
      (share) => shares.push(share),
      {
        now: () => clock,
        nextFrame: async () => {
          frames += 1
        }
      }
    )
    expect(done).toEqual([1, 2, 3, 4, 5])
    expect(frames).toBe(1)
    for (let i = 1; i < shares.length; i += 1) expect(shares[i]).toBeGreaterThan(shares[i - 1])
    expect(shares[shares.length - 1]).toBe(1)
  })

  it("reports a share of 1 for no items at all", async () => {
    const shares: number[] = []
    await inSlices(
      [],
      () => {},
      (share) => shares.push(share),
      { now: () => 0, nextFrame: async () => {} }
    )
    expect(shares).toEqual([1])
  })
})

describe("uploadBatches", () => {
  const material = new THREE.MeshBasicMaterial()

  it("holds every mesh once, in order, and closes a batch once it would upload too much", () => {
    const meshes = [
      new THREE.Mesh(positions(20000), material),
      new THREE.Mesh(positions(20000), material),
      new THREE.Mesh(positions(20000), material)
    ]
    const batches = uploadBatches(meshes)
    expect(batches.flat()).toEqual(meshes)
    expect(batches.map((batch) => batch.length)).toEqual([2, 1])
  })

  it("counts a buffer shared by several meshes only once", () => {
    const shared = positions(40000)
    const meshes = [new THREE.Mesh(shared, material), new THREE.Mesh(shared, material), new THREE.Mesh(shared, material)]
    expect(uploadBatches(meshes)).toHaveLength(1)
  })

  it("counts an instanced mesh's transforms", () => {
    const small = positions(3)
    const crowd = (count: number) => new THREE.InstancedMesh(small, material, count)
    expect(uploadBatches([crowd(5000), crowd(5000)])).toHaveLength(2)
  })
})

describe("oneMeshPerProgram", () => {
  const material = new THREE.MeshStandardMaterial()
  const other = new THREE.MeshStandardMaterial()

  it("keeps one mesh for each material, instancing and set of buffers", () => {
    const plain = positions(3)
    const coloured = positions(3)
    coloured.setAttribute("color", new THREE.BufferAttribute(new Float32Array(9), 3))
    const a = new THREE.Mesh(plain, material)
    const sameAsA = new THREE.Mesh(positions(9), material)
    const b = new THREE.Mesh(plain, other)
    const c = new THREE.Mesh(coloured, material)
    const d = new THREE.InstancedMesh(plain, material, 2)
    expect(oneMeshPerProgram([a, sameAsA, b, c, d])).toEqual([a, b, c, d])
  })
})

describe("oneCasterPerDepthProgram", () => {
  it("keeps one caster for each material, depth material and instancing, and no mesh that casts nothing", () => {
    const geometry = positions(3)
    const material = new THREE.MeshStandardMaterial()
    const twoSided = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })
    const caster = (mesh: THREE.Mesh, depth?: THREE.Material) => {
      mesh.castShadow = true
      mesh.customDepthMaterial = depth
      return mesh
    }
    const depth = new THREE.MeshDepthMaterial()
    const plain = caster(new THREE.Mesh(geometry, material))
    const plainAgain = caster(new THREE.Mesh(positions(9), material))
    const sheet = caster(new THREE.Mesh(geometry, twoSided))
    const crowd = caster(new THREE.InstancedMesh(geometry, material, 2))
    const cut = caster(new THREE.InstancedMesh(geometry, material, 2), depth)
    const silent = new THREE.Mesh(geometry, material)
    expect(oneCasterPerDepthProgram([silent, plain, plainAgain, sheet, crowd, cut])).toEqual([plain, sheet, crowd, cut])
  })
})

describe("warmUpScene", () => {
  /** A renderer that only records what is asked of it, and what is visible at each draw. */
  function recordingRenderer() {
    const calls: string[] = []
    const drawnVisible: Array<Set<THREE.Object3D>> = []
    const previousTarget = new THREE.WebGLRenderTarget(1, 1)
    let currentTarget: THREE.WebGLRenderTarget | null = previousTarget
    const gl = {
      SYNC_GPU_COMMANDS_COMPLETE: 1,
      SYNC_STATUS: 2,
      SIGNALED: 3,
      fenceSync: () => ({}),
      flush: () => {},
      isContextLost: () => false,
      getSyncParameter: () => 3,
      deleteSync: () => {}
    }
    const renderer = {
      shadowMap: { autoUpdate: true, needsUpdate: false },
      getContext: () => gl,
      getRenderTarget: () => currentTarget,
      setRenderTarget: (target: THREE.WebGLRenderTarget | null) => {
        currentTarget = target
      },
      initTexture: () => calls.push("texture"),
      compileAsync: async () => calls.push("compile"),
      render: (scene: THREE.Scene) => {
        calls.push("draw")
        const visible = new Set<THREE.Object3D>()
        scene.traverseVisible((object) => {
          if (object instanceof THREE.Mesh) visible.add(object)
        })
        drawnVisible.push(visible)
      }
    }
    return {
      renderer: renderer as unknown as THREE.WebGLRenderer,
      gl,
      calls,
      drawnVisible,
      previousTarget,
      currentTarget: () => currentTarget
    }
  }

  function scene() {
    const world = new THREE.Scene()
    world.environment = new THREE.Texture()
    const material = new THREE.MeshStandardMaterial()
    const meshes = [
      new THREE.Mesh(positions(3), material),
      new THREE.Mesh(positions(3), material),
      new THREE.InstancedMesh(positions(3), material, 2)
    ]
    meshes[0].castShadow = true
    meshes[1].frustumCulled = false
    world.add(...meshes)
    return { world, meshes }
  }

  it("uploads the textures first, then links the programs, then draws every mesh at least once", async () => {
    const { renderer, calls, drawnVisible } = recordingRenderer()
    const { world, meshes } = scene()
    await warmUpScene(renderer, world, [new THREE.Texture(), new THREE.Texture()], () => {})
    expect(calls.slice(0, 2)).toEqual(["texture", "texture"])
    expect(calls.filter((call) => call === "compile")).toHaveLength(2)
    expect(calls.indexOf("draw")).toBeGreaterThan(calls.lastIndexOf("compile"))
    for (const mesh of meshes) expect(drawnVisible.some((visible) => visible.has(mesh))).toBe(true)
  })

  it("puts the scene and the renderer back as it found them", async () => {
    const { renderer, previousTarget, currentTarget } = recordingRenderer()
    const { world, meshes } = scene()
    await warmUpScene(renderer, world, [], () => {})
    expect(meshes.map((mesh) => [mesh.visible, mesh.frustumCulled])).toEqual([
      [true, true],
      [true, false],
      [true, true]
    ])
    expect(world.matrixWorldAutoUpdate).toBe(true)
    expect(renderer.shadowMap.autoUpdate).toBe(true)
    expect(currentTarget()).toBe(previousTarget)
  })

  it("reports a share that only grows, up to 1", async () => {
    const { renderer } = recordingRenderer()
    const shares: number[] = []
    await warmUpScene(renderer, scene().world, [new THREE.Texture()], (share) => shares.push(share))
    for (let i = 1; i < shares.length; i += 1) expect(shares[i]).toBeGreaterThanOrEqual(shares[i - 1])
    expect(shares[shares.length - 1]).toBe(1)
  })

  it("restores everything even when a step fails", async () => {
    const { renderer } = recordingRenderer()
    renderer.initTexture = () => {
      throw new Error("no context")
    }
    const { world, meshes } = scene()
    await expect(warmUpScene(renderer, world, [new THREE.Texture()], () => {})).rejects.toThrow("no context")
    expect(meshes.every((mesh) => mesh.visible)).toBe(true)
    expect(world.matrixWorldAutoUpdate).toBe(true)
  })

  it("stops waiting on the GPU once the context is lost", async () => {
    const { renderer, gl } = recordingRenderer()
    gl.getSyncParameter = () => 0
    gl.isContextLost = () => true
    // An upload that spends a whole slice, so the warm-up waits for a frame by which a fence that never signals is done.
    renderer.initTexture = () => {
      const end = performance.now() + 10
      while (performance.now() < end);
    }
    await expect(warmUpScene(renderer, scene().world, [new THREE.Texture()], () => {})).resolves.toBeUndefined()
  })
})
