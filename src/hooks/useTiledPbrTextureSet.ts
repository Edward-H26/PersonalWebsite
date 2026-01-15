import { useMemo } from "react"
import type { PbrTextureSet, PbrTextureSetId } from "./usePbrTextureSet"
import { usePbrTextureSet } from "./usePbrTextureSet"

type Repeat = number | [number, number]

const tiledTextureCache = new Map<string, PbrTextureSet>()

function repeatToKey(repeat: Repeat) {
  if (Array.isArray(repeat)) return `${repeat[0]}:${repeat[1]}`
  return `${repeat}:${repeat}`
}

function repeatToValues(repeat: Repeat): [number, number] {
  if (Array.isArray(repeat)) return [repeat[0], repeat[1]]
  return [repeat, repeat]
}

export function useTiledPbrTextureSet(id: PbrTextureSetId, repeat: Repeat): PbrTextureSet {
  const base = usePbrTextureSet(id)
  const repeatKey = repeatToKey(repeat)
  const [repeatX, repeatY] = repeatToValues(repeat)

  return useMemo(() => {
    const key = `${id}:${repeatKey}`
    const cached = tiledTextureCache.get(key)
    if (cached) return cached

    const map = base.map.clone()
    const normalMap = base.normalMap.clone()
    const armMap = base.armMap.clone()

    map.repeat.set(repeatX, repeatY)
    normalMap.repeat.set(repeatX, repeatY)
    armMap.repeat.set(repeatX, repeatY)

    map.needsUpdate = true
    normalMap.needsUpdate = true
    armMap.needsUpdate = true

    const tiled: PbrTextureSet = { map, normalMap, armMap }
    tiledTextureCache.set(key, tiled)
    return tiled
  }, [base.armMap, base.map, base.normalMap, id, repeatKey, repeatX, repeatY])
}


