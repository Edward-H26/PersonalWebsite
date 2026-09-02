import * as THREE from "three"

export function configureColorTexture(texture: THREE.Texture) {
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 16
  texture.flipY = false
  texture.needsUpdate = true
}

export function configureDataTexture(texture: THREE.Texture) {
  texture.colorSpace = THREE.NoColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 16
  texture.flipY = false
  texture.needsUpdate = true
}

export function toKtx2Url(url: string) {
  if (url.endsWith(".ktx2")) return url
  if (url.endsWith(".jpg")) return url.replace(/\.jpg$/u, ".ktx2")
  if (url.endsWith(".jpeg")) return url.replace(/\.jpeg$/u, ".ktx2")
  if (url.endsWith(".png")) return url.replace(/\.png$/u, ".ktx2")
  return `${url}.ktx2`
}

export function supportsKtx2Textures(renderer: THREE.WebGLRenderer) {
  const extensions = [
    "WEBGL_compressed_texture_astc",
    "WEBGL_compressed_texture_s3tc",
    "WEBGL_compressed_texture_s3tc_srgb",
    "WEBGL_compressed_texture_etc",
    "WEBGL_compressed_texture_etc1",
    "WEBGL_compressed_texture_pvrtc",
    "WEBGL_compressed_texture_pvrtc_srgb",
    "EXT_texture_compression_bptc"
  ]

  return extensions.some((extension) => renderer.extensions.has(extension))
}
