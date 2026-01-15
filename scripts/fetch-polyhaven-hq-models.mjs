import { spawn } from "node:child_process"
import { createWriteStream } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { pipeline } from "node:stream/promises"

const USER_AGENT = "EdwardPersonalWebsite/1.0"

const ROOT = process.cwd()
const HQ_DIR = path.join(ROOT, "public", "models", "hq")
const STAGING_DIR = path.join(HQ_DIR, "_staging")
const NPM_CACHE_DIR = path.join(ROOT, ".npm-cache")

const KEEP_STAGING = process.argv.includes("--keep-staging")
const RESOLUTION = process.env.POLYHAVEN_RESOLUTION || "2k"

// Keep the list small and web-friendly (high quality, but not hundreds of MB).
const ASSETS = [
  { id: "island_tree_01", type: "models" },
  { id: "island_tree_02", type: "models" },
  { id: "island_tree_03", type: "models" },
  { id: "rock_moss_set_01", type: "models" },
  { id: "fern_02", type: "models" },
  { id: "boulder_01", type: "models" },
  { id: "tree_stump_01", type: "models" },
  { id: "moss_01", type: "models" },
  { id: "barrel_stove", type: "models" },
  { id: "stone_fire_pit", type: "models" },
  { id: "antique_katana_01", type: "models" },
  { id: "katana_stand_01", type: "models" },
  { id: "Lantern_01", type: "models" },
  { id: "lambis_shell", type: "models" },
  { id: "lateral_sea_marker", type: "models" },
  { id: "wooden_bucket_01", type: "models" },
  { id: "modular_wooden_pier", type: "models" },
  { id: "wooden_lantern_01", type: "models" },
  { id: "treasure_chest", type: "models" },
  { id: "wooden_barrels_01", type: "models" },
  { id: "wooden_crate_01", type: "models" },
  { id: "pachira_aquatica_01", type: "models" },
  { id: "grass_bermuda_01", type: "models" },
  { id: "grass_medium_01", type: "models" },
  { id: "grass_medium_02", type: "models" },
  { id: "tree_small_02", type: "models" },
  { id: "namaqualand_boulder_02", type: "models" },
  { id: "mid_century_lounge_chair", type: "models" },
  { id: "industrial_coffee_table", type: "models" },
  { id: "modular_pipes", type: "models" },
  { id: "industrial_wall_lamp", type: "models" },
  { id: "ship_pinnace", type: "models" },
  { id: "ceiling_fan", type: "models" }
]

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true })
}

async function pathExists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`HTTP ${res.status} for ${url}\n${text.slice(0, 500)}`)
  }
  return await res.json()
}

async function downloadToFile(url, outPath) {
  await ensureDir(path.dirname(outPath))

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "")
    throw new Error(`Download failed: HTTP ${res.status} for ${url}\n${text.slice(0, 500)}`)
  }

  await pipeline(res.body, createWriteStream(outPath))
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      env: {
        ...process.env,
        npm_config_cache: NPM_CACHE_DIR,
        npm_config_update_notifier: "false"
      },
      ...opts
    })
    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`))
    })
  })
}

async function fetchModelAsGlb({ id }) {
  const outGlb = path.join(HQ_DIR, `${id}.glb`)
  if (await pathExists(outGlb)) {
    console.log(`[skip] ${id} already exists: ${path.relative(ROOT, outGlb)}`)
    return
  }

  console.log(`\n==> Fetching Poly Haven model: ${id} (${RESOLUTION})`)
  const meta = await fetchJson(`https://api.polyhaven.com/files/${id}`)
  const gltfEntry = meta?.gltf?.[RESOLUTION]?.gltf
  if (!gltfEntry?.url) {
    throw new Error(`No glTF entry found for ${id} at resolution ${RESOLUTION}`)
  }

  const stagingRoot = path.join(STAGING_DIR, id)
  await ensureDir(stagingRoot)

  const gltfUrl = gltfEntry.url
  const gltfFile = path.join(stagingRoot, path.basename(gltfUrl))

  // Download root .gltf
  await downloadToFile(gltfUrl, gltfFile)

  // Download all included files (textures + .bin) preserving paths
  const include = gltfEntry.include || {}
  const includeEntries = Object.entries(include)
  console.log(`Downloading include files: ${includeEntries.length}`)

  for (const [relPath, f] of includeEntries) {
    if (!f?.url) continue
    await downloadToFile(f.url, path.join(stagingRoot, relPath))
  }

  // Convert to .glb (embed textures/buffers)
  console.log(`Converting to GLB: ${path.relative(ROOT, outGlb)}`)
  await ensureDir(HQ_DIR)
  await run("npx", ["--yes", "@gltf-transform/cli", "copy", gltfFile, outGlb])

  if (!KEEP_STAGING) {
    await fs.rm(stagingRoot, { recursive: true, force: true })
  }
}

async function main() {
  await ensureDir(HQ_DIR)
  await ensureDir(STAGING_DIR)
  await ensureDir(NPM_CACHE_DIR)

  for (const asset of ASSETS) {
    // Currently only models (glTF) are fetched in this script.
    if (asset.type !== "models") continue
    await fetchModelAsGlb(asset)
  }

  console.log("\nDone.")
  console.log(`HQ models directory: ${path.relative(ROOT, HQ_DIR)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})


