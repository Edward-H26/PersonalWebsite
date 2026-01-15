import { createWriteStream } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { pipeline } from "node:stream/promises"

const USER_AGENT = "EdwardPersonalWebsite/1.0"

const ROOT = process.cwd()
const TEX_DIR = path.join(ROOT, "public", "textures", "hq")

const RESOLUTION = process.env.POLYHAVEN_TEX_RESOLUTION || "2k"

const TEXTURES = [
  { id: "marble_01", maps: ["Diffuse", "arm", "nor_gl"] },
  { id: "rocky_terrain", maps: ["Diffuse", "arm", "nor_gl"] },
  { id: "volcanic_rock_tiles", maps: ["Diffuse", "arm", "nor_gl"] },
  { id: "coast_sand_02", maps: ["Diffuse", "arm", "nor_gl"] },
  { id: "cliff_side", maps: ["Diffuse", "arm", "nor_gl"] },
  { id: "forest_ground_04", maps: ["Diffuse", "arm", "nor_gl"] },
  { id: "mud_forest", maps: ["Diffuse", "arm", "nor_gl"] },
  { id: "damp_sand", maps: ["Diffuse", "arm", "nor_gl"] },
  { id: "low_tide_rocks", maps: ["Diffuse", "arm", "nor_gl"] },
  { id: "burned_ground_01", maps: ["Diffuse", "arm", "nor_gl"] },
  { id: "marble_tiles", maps: ["Diffuse", "arm", "nor_gl"] },
  { id: "cobblestone_pavement", maps: ["Diffuse", "arm", "nor_gl"] },
  { id: "leafy_grass", maps: ["Diffuse", "arm", "nor_gl"] }
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
  if (await pathExists(outPath)) return

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "")
    throw new Error(`Download failed: HTTP ${res.status} for ${url}\n${text.slice(0, 500)}`)
  }

  await pipeline(res.body, createWriteStream(outPath))
}

function pickUrl(node) {
  // Prefer jpg for size (normal maps are also jpg on Poly Haven).
  if (node?.jpg?.url) return node.jpg.url
  if (node?.png?.url) return node.png.url
  if (node?.exr?.url) return node.exr.url
  return null
}

async function fetchTextureSet({ id, maps }) {
  console.log(`\n==> Fetching Poly Haven texture: ${id} (${RESOLUTION})`)
  const meta = await fetchJson(`https://api.polyhaven.com/files/${id}`)

  const outDir = path.join(TEX_DIR, id)
  await ensureDir(outDir)

  for (const mapKey of maps) {
    const resNode = meta?.[mapKey]?.[RESOLUTION]
    const url = pickUrl(resNode)
    if (!url) {
      console.warn(`[warn] Missing ${mapKey} ${RESOLUTION} for ${id}`)
      continue
    }

    const outPath = path.join(outDir, path.basename(url))
    process.stdout.write(`- ${mapKey}: ${path.basename(url)}\n`)
    await downloadToFile(url, outPath)
  }
}

async function main() {
  await ensureDir(TEX_DIR)
  for (const tex of TEXTURES) {
    await fetchTextureSet(tex)
  }
  console.log("\nDone.")
  console.log(`HQ textures directory: ${path.relative(ROOT, TEX_DIR)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})


