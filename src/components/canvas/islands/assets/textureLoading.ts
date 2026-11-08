import { ImageBitmapLoader, Texture, TextureLoader } from "three"
import type { TextureRequest } from "./islandManifest"

/** three.js's GLTFLoader keeps Safari off createImageBitmap, whose options it does not honour, and so does this. */
function decodesOffThread() {
  return typeof createImageBitmap !== "undefined" && !/^((?!chrome|android).)*safari/i.test(navigator.userAgent)
}

/**
 * Loads a texture with its image decoded off the main thread: createImageBitmap decodes on a background thread, where an
 * <img> would decode on the main one at upload. The bitmap carries its orientation, so the texture itself never flips,
 * and the options keep the pixels exactly as an image upload would give them.
 */
export async function loadTexture({ url, flipY }: TextureRequest): Promise<Texture> {
  if (!decodesOffThread()) {
    const texture = await new TextureLoader().loadAsync(url)
    texture.flipY = flipY
    return texture
  }
  const loader = new ImageBitmapLoader().setOptions({
    premultiplyAlpha: "none",
    colorSpaceConversion: "none",
    ...(flipY ? { imageOrientation: "flipY" } : {})
  })
  const bitmap = await loader.loadAsync(url)
  const texture = new Texture(bitmap)
  texture.flipY = false
  texture.needsUpdate = true
  return texture
}
