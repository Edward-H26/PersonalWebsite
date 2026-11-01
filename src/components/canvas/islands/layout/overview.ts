import { Vector3 } from "three"
import { islandSize } from "@/config/modelSizes"
import { type OverviewScene, overviewScene } from "@/components/canvas/camera/overviewFraming"
import type { InstanceTransform, Placement } from "../village/types"
import type { TerrainSite } from "../terrain/terrainSite"
import type { Harbor } from "./harbor"

/**
 * Height in world units that the island's skyline reaches: the peak at 59.8 with spruce on the ridge,
 * and the castle's towers on the knoll.
 */
const ISLAND_RELIEF = 78

/** The eight corners, in world units, of a model's box standing where `placed` puts it and turned with it. */
function boxCorners(placed: Pick<InstanceTransform, "position" | "rotation">, path: string) {
  const size = islandSize(path)
  const [x, y, z] = placed.position
  const cos = Math.cos(placed.rotation[1])
  const sin = Math.sin(placed.rotation[1])
  return [-0.5, 0.5].flatMap((across) =>
    [-0.5, 0.5].flatMap((along) => {
      const dx = across * size.width
      const dz = along * size.depth
      const cornerX = x + dx * cos + dz * sin
      const cornerZ = z - dx * sin + dz * cos
      return [new Vector3(cornerX, y, cornerZ), new Vector3(cornerX, y + size.height, cornerZ)]
    })
  )
}

/** What the overview frames: the coastline up to the island's skyline, and the pier, the ship and the marks. */
export function islandOverviewScene(site: TerrainSite, harbor: Harbor): OverviewScene {
  const coast = site.terrain.data.coast.outline.map((point) => {
    const [x, z] = site.scene(point)
    return new Vector3(x, 0, z)
  })
  const afloat = harbor.placements.filter((p: Placement) => p.key.startsWith("pier") || p.key === "ship")
  const marks = harbor.instanced.find((group) => group.key === "seaMarkers")
  const corners = [
    ...afloat.flatMap((p) => boxCorners(p, p.path)),
    ...(marks ? marks.instances.flatMap((instance) => boxCorners(instance, marks.path)) : [])
  ]
  return overviewScene(coast, ISLAND_RELIEF, corners)
}
