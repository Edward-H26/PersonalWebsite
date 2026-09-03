import { spawn } from "node:child_process"
import { createWriteStream } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { pipeline } from "node:stream/promises"

// Downloads Poly Haven models as single-file GLBs into the gitignored originals cache,
// ready for scripts/bake-web-models.mjs. Usage: node scripts/fetch-polyhaven-hq-models.mjs <asset id> [...]
// Options: --keep-staging keeps the downloaded glTF folders; POLYHAVEN_RESOLUTION picks the texture size (default 2k).

const USER_AGENT = "EdwardPersonalWebsite/1.0"
const ROOT = process.cwd()
const ORIGINALS_DIR = path.join(ROOT, ".cache", "polyhaven-originals")
const STAGING_DIR = path.join(ORIGINALS_DIR, "_staging")
const NPM_CACHE_DIR = path.join(ROOT, ".npm-cache")
const KEEP_STAGING = process.argv.includes("--keep-staging")
const RESOLUTION = process.env.POLYHAVEN_RESOLUTION || "2k"

async function pathExists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } })
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  return response.json()
}

async function downloadToFile(url, outPath) {
  await fs.mkdir(path.dirname(outPath), { recursive: true })
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } })
  if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status} for ${url}`)
  await pipeline(response.body, createWriteStream(outPath))
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      env: { ...process.env, npm_config_cache: NPM_CACHE_DIR, npm_config_update_notifier: "false" }
    })
    child.on("error", reject)
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`))))
  })
}

async function fetchModelAsGlb(id) {
  const outGlb = path.join(ORIGINALS_DIR, `${id}.glb`)
  if (await pathExists(outGlb)) {
    console.log(`[skip] ${id} already exists: ${path.relative(ROOT, outGlb)}`)
    return
  }
  console.log(`\n==> Fetching Poly Haven model: ${id} (${RESOLUTION})`)
  const meta = await fetchJson(`https://api.polyhaven.com/files/${id}`)
  const gltfEntry = meta?.gltf?.[RESOLUTION]?.gltf
  if (!gltfEntry?.url) throw new Error(`No glTF entry found for ${id} at resolution ${RESOLUTION}`)

  const stagingRoot = path.join(STAGING_DIR, id)
  const gltfFile = path.join(stagingRoot, path.basename(gltfEntry.url))
  await downloadToFile(gltfEntry.url, gltfFile)
  const includes = Object.entries(gltfEntry.include ?? {}).filter(([, file]) => file?.url)
  console.log(`Downloading include files: ${includes.length}`)
  for (const [relPath, file] of includes) await downloadToFile(file.url, path.join(stagingRoot, relPath))

  console.log(`Converting to GLB: ${path.relative(ROOT, outGlb)}`)
  await run("npx", ["--yes", "@gltf-transform/cli", "copy", gltfFile, outGlb])
  if (!KEEP_STAGING) await fs.rm(stagingRoot, { recursive: true, force: true })
}

async function main() {
  const ids = process.argv.slice(2).filter((arg) => !arg.startsWith("--"))
  if (ids.length === 0) {
    console.error("Usage: node scripts/fetch-polyhaven-hq-models.mjs <asset id> [more ids]")
    process.exit(1)
  }
  await fs.mkdir(STAGING_DIR, { recursive: true })
  await fs.mkdir(NPM_CACHE_DIR, { recursive: true })
  // Sequential on purpose: parallel runs share the staging directory.
  for (const id of ids) await fetchModelAsGlb(id)
  console.log(`\nDone. Originals directory: ${path.relative(ROOT, ORIGINALS_DIR)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
