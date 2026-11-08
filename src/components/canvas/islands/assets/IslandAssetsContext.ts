import { createContext, useContext, useMemo } from "react"
import type { IslandAssets } from "./islandAssets"

const IslandAssetsContext = createContext<IslandAssets | null>(null)

export const IslandAssetsProvider = IslandAssetsContext.Provider

function useIslandAssets() {
  const assets = useContext(IslandAssetsContext)
  if (!assets) throw new Error("The island's parts mount only inside its assets' provider")
  return assets
}

function arrived<T>(found: T | undefined, url: string) {
  if (found === undefined) throw new Error(`${url} is missing from the island's manifest`)
  return found
}

/** A model's scene; the island mounts once all of them have arrived. */
export function useIslandModel(path: string) {
  return arrived(useIslandAssets().models.get(path), path)
}

/** Textures by their URLs, the list a constant of the caller's; the island mounts once all of them have arrived. */
export function useIslandTextures(urls: readonly string[]) {
  const { textures } = useIslandAssets()
  return useMemo(() => urls.map((url) => arrived(textures.get(url), url)), [textures, urls])
}
