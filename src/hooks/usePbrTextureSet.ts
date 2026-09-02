import { useLoader, useThree } from "@react-three/fiber"
import { useMemo } from "react"
import * as THREE from "three"
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js"
import { withBase } from "@/utils/assets"
import {
  configureColorTexture,
  configureDataTexture,
  supportsKtx2Textures,
  toKtx2Url,
} from "@/utils/textures"

export type PbrTextureSetId =
  | "cliffSide"
  | "cobblestonePavement"
  | "sparseGrass"

export type PbrTextureSet = {
  map: THREE.Texture
  normalMap: THREE.Texture
  armMap: THREE.Texture
}

const PBR_TEXTURE_URLS: Record<PbrTextureSetId, { map: string; normalMap: string; armMap: string }> = {
  cliffSide: {
    map: withBase("/textures/hq/cliff_side/cliff_side_diff_2k.jpg"),
    normalMap: withBase("/textures/hq/cliff_side/cliff_side_nor_gl_2k.jpg"),
    armMap: withBase("/textures/hq/cliff_side/cliff_side_arm_2k.jpg")
  },
  cobblestonePavement: {
    map: withBase("/textures/hq/cobblestone_pavement/cobblestone_pavement_diff_2k.jpg"),
    normalMap: withBase("/textures/hq/cobblestone_pavement/cobblestone_pavement_nor_gl_2k.jpg"),
    armMap: withBase("/textures/hq/cobblestone_pavement/cobblestone_pavement_arm_2k.jpg")
  },
  sparseGrass: {
    map: withBase("/textures/hq/sparse_grass/sparse_grass_diff_2k.jpg"),
    normalMap: withBase("/textures/hq/sparse_grass/sparse_grass_nor_gl_2k.jpg"),
    armMap: withBase("/textures/hq/sparse_grass/sparse_grass_arm_2k.jpg")
  }
}

export function usePbrTextureSet(id: PbrTextureSetId): PbrTextureSet {
  const { gl } = useThree()

  const useKtx2 = useMemo(() => supportsKtx2Textures(gl), [gl])
  const urls = useMemo(() => {
    const base = PBR_TEXTURE_URLS[id]
    if (!useKtx2) return [base.map, base.normalMap, base.armMap]
    return [toKtx2Url(base.map), toKtx2Url(base.normalMap), toKtx2Url(base.armMap)]
  }, [id, useKtx2])

  const textures = useLoader(
    useKtx2 ? KTX2Loader : THREE.TextureLoader,
    urls,
    useKtx2
      ? (loader) => {
          const ktx2 = loader as KTX2Loader
          ktx2.setTranscoderPath(withBase("/examples/jsm/libs/basis/"))
          ktx2.detectSupport(gl)
        }
      : undefined
  ) as [THREE.Texture, THREE.Texture, THREE.Texture]

  // Configure during render, not in an effect: useTiledPbrTextureSet clones these textures in the
  // same render pass, and clones only inherit wrap, color space, and anisotropy that are already set.
  return useMemo<PbrTextureSet>(() => {
    const [map, normalMap, armMap] = textures
    configureColorTexture(map)
    configureDataTexture(normalMap)
    configureDataTexture(armMap)
    return { map, normalMap, armMap }
  }, [textures])
}
