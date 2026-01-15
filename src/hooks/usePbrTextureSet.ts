import { useLoader, useThree } from "@react-three/fiber"
import { useEffect, useMemo } from "react"
import * as THREE from "three"
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js"

export type PbrTextureSetId =
  | "forestGround04"
  | "burnedGround01"
  | "sand"
  | "dampSand"
  | "cliffSide"
  | "cobblestonePavement"
  | "leafyGrass"
  | "sparseGrass"
  | "marbleTiles"

export type PbrTextureSet = {
  map: THREE.Texture
  normalMap: THREE.Texture
  armMap: THREE.Texture
}

const PBR_TEXTURE_URLS: Record<PbrTextureSetId, { map: string; normalMap: string; armMap: string }> = {
  forestGround04: {
    map: "/textures/hq/forest_ground_04/forest_ground_04_diff_2k.jpg",
    normalMap: "/textures/hq/forest_ground_04/forest_ground_04_nor_gl_2k.jpg",
    armMap: "/textures/hq/forest_ground_04/forest_ground_04_arm_2k.jpg"
  },
  burnedGround01: {
    map: "/textures/hq/burned_ground_01/burned_ground_01_diff_2k.jpg",
    normalMap: "/textures/hq/burned_ground_01/burned_ground_01_nor_gl_2k.jpg",
    armMap: "/textures/hq/burned_ground_01/burned_ground_01_arm_2k.jpg"
  },
  sand: {
    map: "/textures/hq/coast_sand_02/coast_sand_02_diff_2k.jpg",
    normalMap: "/textures/hq/coast_sand_02/coast_sand_02_nor_gl_2k.jpg",
    armMap: "/textures/hq/coast_sand_02/coast_sand_02_arm_2k.jpg"
  },
  dampSand: {
    map: "/textures/hq/damp_sand/damp_sand_diff_2k.jpg",
    normalMap: "/textures/hq/damp_sand/damp_sand_nor_gl_2k.jpg",
    armMap: "/textures/hq/damp_sand/damp_sand_arm_2k.jpg"
  },
  cliffSide: {
    map: "/textures/hq/cliff_side/cliff_side_diff_2k.jpg",
    normalMap: "/textures/hq/cliff_side/cliff_side_nor_gl_2k.jpg",
    armMap: "/textures/hq/cliff_side/cliff_side_arm_2k.jpg"
  },
  cobblestonePavement: {
    map: "/textures/hq/cobblestone_pavement/cobblestone_pavement_diff_2k.jpg",
    normalMap: "/textures/hq/cobblestone_pavement/cobblestone_pavement_nor_gl_2k.jpg",
    armMap: "/textures/hq/cobblestone_pavement/cobblestone_pavement_arm_2k.jpg"
  },
  leafyGrass: {
    map: "/textures/hq/leafy_grass/leafy_grass_diff_2k.jpg",
    normalMap: "/textures/hq/leafy_grass/leafy_grass_nor_gl_2k.jpg",
    armMap: "/textures/hq/leafy_grass/leafy_grass_arm_2k.jpg"
  },
  sparseGrass: {
    map: "/textures/hq/sparse_grass/sparse_grass_diff_2k.jpg",
    normalMap: "/textures/hq/sparse_grass/sparse_grass_nor_gl_2k.jpg",
    armMap: "/textures/hq/sparse_grass/sparse_grass_arm_2k.jpg"
  },
  marbleTiles: {
    map: "/textures/hq/marble_tiles/marble_tiles_diff_2k.jpg",
    normalMap: "/textures/hq/marble_tiles/marble_tiles_nor_gl_2k.jpg",
    armMap: "/textures/hq/marble_tiles/marble_tiles_arm_2k.jpg"
  }
}

function configureColorTexture(tex: THREE.Texture) {
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  tex.flipY = false
  tex.needsUpdate = true
}

function configureDataTexture(tex: THREE.Texture) {
  tex.colorSpace = THREE.NoColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  tex.flipY = false
  tex.needsUpdate = true
}

export function toKtx2Url(url: string) {
  if (url.endsWith(".ktx2")) return url
  if (url.endsWith(".jpg")) return url.replace(/\.jpg$/u, ".ktx2")
  if (url.endsWith(".jpeg")) return url.replace(/\.jpeg$/u, ".ktx2")
  if (url.endsWith(".png")) return url.replace(/\.png$/u, ".ktx2")
  return `${url}.ktx2`
}

export function supportsKtx2Textures(renderer: THREE.WebGLRenderer) {
  const exts = [
    "WEBGL_compressed_texture_astc",
    "WEBGL_compressed_texture_s3tc",
    "WEBGL_compressed_texture_s3tc_srgb",
    "WEBGL_compressed_texture_etc",
    "WEBGL_compressed_texture_etc1",
    "WEBGL_compressed_texture_pvrtc",
    "WEBGL_compressed_texture_pvrtc_srgb",
    "EXT_texture_compression_bptc"
  ]

  return exts.some((ext) => renderer.extensions.has(ext))
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
          ktx2.setTranscoderPath("/examples/jsm/libs/basis/")
          ktx2.detectSupport(gl)
        }
      : undefined
  ) as [THREE.Texture, THREE.Texture, THREE.Texture]

  const set: PbrTextureSet = {
    map: textures[0],
    normalMap: textures[1],
    armMap: textures[2]
  }

  useEffect(() => {
    configureColorTexture(set.map)
    configureDataTexture(set.normalMap)
    configureDataTexture(set.armMap)
  }, [set.armMap, set.map, set.normalMap])

  return set
}


