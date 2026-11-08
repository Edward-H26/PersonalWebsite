import { fetchIslandTerrain } from "../terrain/islandTerrain"
import { buildIslandPlan, planTransfers } from "./islandPlan"

fetchIslandTerrain().then(
  (terrain) => {
    const plan = buildIslandPlan(terrain)
    postMessage({ plan }, { transfer: planTransfers(plan) })
  },
  (error: unknown) => postMessage({ error: String(error) })
)
