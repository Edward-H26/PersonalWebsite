import type { Object3D, Texture } from "three"
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { useWorldStore } from "@/store/worldStore"
import { withBase } from "@/utils/assets"
import { ISLAND_MODEL_PATHS, ISLAND_TEXTURES, type TextureRequest } from "./islandManifest"
import { type ArrivedPlan, type IslandPlan, arrivePlan } from "./islandPlan"
import { loadTexture } from "./textureLoading"

/** Everything the island needs before it mounts; its components read it without ever suspending. */
export type IslandAssets = ArrivedPlan & {
  /** Each model's scene, by its path. */
  models: ReadonlyMap<string, Object3D>
  /** Each texture, by its URL. */
  textures: ReadonlyMap<string, Texture>
}

/** The share of the loading bar that the downloads and the worker fill, and the share reached once the island has mounted. */
const ASSETS_LOAD_SHARE = 0.8
export const MOUNTED_LOAD_SHARE = 0.85

/** How much of that share one finished item fills: an atlas weighs about as much as ten models, the plan as five. */
const LOAD_WEIGHT = { model: 1, texture: 10, plan: 5 } as const

/** The loads an island asks for, each a promise, so a test can stand in for the network and the worker. */
export type IslandLoads = {
  plan: () => Promise<ArrivedPlan>
  model: (path: string) => Promise<Object3D>
  texture: (request: TextureRequest) => Promise<Texture>
}

/**
 * Starts every load in one go, so the total is known from the first moment and the share done can only grow, and
 * reports that share from 0 to 1 as each load finishes.
 */
export async function gatherIslandAssets(loads: IslandLoads, onShare: (share: number) => void): Promise<IslandAssets> {
  const total = LOAD_WEIGHT.plan + ISLAND_MODEL_PATHS.length * LOAD_WEIGHT.model + ISLAND_TEXTURES.length * LOAD_WEIGHT.texture
  let done = 0
  const counted = async <T>(load: Promise<T>, weight: number) => {
    const result = await load
    done += weight
    onShare(done / total)
    return result
  }
  const [plan, models, textures] = await Promise.all([
    counted(loads.plan(), LOAD_WEIGHT.plan),
    Promise.all(ISLAND_MODEL_PATHS.map((path) => counted(loads.model(path), LOAD_WEIGHT.model))),
    Promise.all(ISLAND_TEXTURES.map((request) => counted(loads.texture(request), LOAD_WEIGHT.texture)))
  ])
  return {
    ...plan,
    models: new Map(ISLAND_MODEL_PATHS.map((path, i) => [path, models[i]])),
    textures: new Map(ISLAND_TEXTURES.map(({ url }, i) => [url, textures[i]]))
  }
}

function requestIslandPlan() {
  return new Promise<ArrivedPlan>((resolve, reject) => {
    const worker = new Worker(new URL("./islandPlan.worker.ts", import.meta.url), { type: "module" })
    worker.onmessage = ({ data }: MessageEvent<{ plan?: IslandPlan; error?: string }>) => {
      worker.terminate()
      if (data.plan) resolve(arrivePlan(data.plan))
      else reject(new Error(data.error))
    }
    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message))
    }
  })
}

let loading: Promise<IslandAssets> | null = null

/** Loads the island once, however many times it is asked for, reporting its progress to the store. */
export function loadIslandAssets() {
  if (!loading) {
    const draco = new DRACOLoader().setDecoderPath(withBase("/draco/"))
    const gltf = new GLTFLoader().setDRACOLoader(draco)
    const { reportLoadProgress } = useWorldStore.getState()
    loading = gatherIslandAssets(
      {
        plan: requestIslandPlan,
        model: async (path) => (await gltf.loadAsync(path)).scene,
        texture: loadTexture
      },
      (share) => reportLoadProgress(share * ASSETS_LOAD_SHARE)
    ).finally(() => draco.dispose())
  }
  return loading
}
