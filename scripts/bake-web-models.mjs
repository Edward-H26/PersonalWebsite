import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

// Turns the Poly Haven originals in .cache/polyhaven-originals (see fetch-polyhaven-hq-models.mjs)
// into web-sized public/models/hq/*_web.glb files: simplified meshes (meshoptimizer) for the large
// scans, 1k textures, and draco compression. The originals are photogrammetry scans (up to 877k
// triangles and 110 MB each), far too heavy to instance in real time.

const ROOT = process.cwd()
const ORIGINALS_DIR = path.join(ROOT, ".cache", "polyhaven-originals")
const HQ_DIR = path.join(ROOT, "public", "models", "hq")
const NPM_CACHE_DIR = path.join(ROOT, ".npm-cache")
const TEXTURE_SIZE = 1024

const ASSETS = [
  { id: "island_tree_02", ratio: 0.12, error: 0.02 },
  { id: "island_tree_01", ratio: 0.05, error: 0.03 },
  { id: "tree_small_02", ratio: 0.035, error: 0.03 },
  { id: "tree_stump_01", ratio: 0.15, error: 0.02 },
  { id: "boulder_01", ratio: 0.1, error: 0.15 },
  { id: "namaqualand_boulder_02", ratio: 0.1, error: 0.15 },
  { id: "rock_moss_set_01", ratio: 0.3, error: 0.05 },
  { id: "fern_02" },
  { id: "grass_medium_01" },
  { id: "grass_medium_02" },
  { id: "grass_bermuda_01" },
  { id: "dandelion_01", ratio: 0.5, error: 0.02 },
  { id: "shrub_sorrel_01", ratio: 0.3, error: 0.02 },
  { id: "flower_gazania", ratio: 0.5, error: 0.02 },
  { id: "wooden_lantern_01", ratio: 0.15, error: 0.05 },
  { id: "modular_wooden_pier", ratio: 0.2, error: 0.05 },
  { id: "ship_pinnace", ratio: 0.1, error: 0.05 },
  { id: "stone_fire_pit", ratio: 0.15, error: 0.05 },
  { id: "wooden_barrels_01", ratio: 0.15, error: 0.05 },
  { id: "wooden_crate_01", ratio: 0.15, error: 0.05 },
  { id: "lateral_sea_marker", ratio: 0.2, error: 0.05 }
]

function run(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["--yes", "@gltf-transform/cli", ...args], {
      stdio: "inherit",
      env: { ...process.env, npm_config_cache: NPM_CACHE_DIR, npm_config_update_notifier: "false" },
      ...opts
    })
    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`gltf-transform ${args[0]} exited with code ${code}`))
    })
  })
}

async function bake(asset, workDir) {
  const source = path.join(ORIGINALS_DIR, `${asset.id}.glb`)
  const output = path.join(HQ_DIR, `${asset.id}_web.glb`)
  const simplified = path.join(workDir, `${asset.id}.simplified.glb`)
  const resized = path.join(workDir, `${asset.id}.resized.glb`)

  console.log(`\n==> ${asset.id}`)
  if (asset.ratio) {
    await run(["simplify", source, simplified, "--ratio", String(asset.ratio), "--error", String(asset.error)])
  } else {
    await fs.copyFile(source, simplified)
  }
  await run(["resize", simplified, resized, "--width", String(TEXTURE_SIZE), "--height", String(TEXTURE_SIZE)])
  await run(["draco", resized, output])

  const before = (await fs.stat(source)).size
  const after = (await fs.stat(output)).size
  console.log(`${path.relative(ROOT, output)}: ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(2)} MB`)
}

async function main() {
  // Optional asset ids as arguments re-bake a subset, e.g. `node scripts/bake-web-models.mjs boulder_01`.
  const only = new Set(process.argv.slice(2))
  const assets = only.size > 0 ? ASSETS.filter((asset) => only.has(asset.id)) : ASSETS

  await fs.mkdir(NPM_CACHE_DIR, { recursive: true })
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "bake-web-models-"))
  try {
    for (const asset of assets) {
      await bake(asset, workDir)
    }
  } finally {
    await fs.rm(workDir, { recursive: true, force: true })
  }
  console.log("\nDone.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
