import { spawnSync } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"

const ROOT_DIR = process.cwd()
const TOOL_ROOT = path.join(ROOT_DIR, ".tools", "ktx-software")
const TOOL_BIN = path.join(TOOL_ROOT, "usr", "local", "bin")
const TOOL_LIB = path.join(TOOL_ROOT, "usr", "local", "lib")
const TOKTX_PATH = path.join(TOOL_BIN, "toktx")

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true })
}

async function downloadFile(url, outPath) {
  const res = await fetch(url, {
    headers: {
      "accept": "application/octet-stream",
      "user-agent": "PersonalWebsite-ktx2-textures"
    }
  })

  if (!res.ok) {
    throw new Error(`Failed to download ${url}, status ${res.status}`)
  }

  const arrayBuffer = await res.arrayBuffer()
  await fs.writeFile(outPath, new Uint8Array(arrayBuffer))
}

async function fetchLatestKtxSoftwareRelease() {
  const res = await fetch("https://api.github.com/repos/KhronosGroup/KTX-Software/releases/latest", {
    headers: {
      "accept": "application/vnd.github+json",
      "user-agent": "PersonalWebsite-ktx2-textures"
    }
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch KTX-Software release metadata, status ${res.status}`)
  }

  return await res.json()
}

function getDarwinAssetName(version, arch) {
  const suffix = arch === "arm64" ? "arm64" : "x86_64"
  return `KTX-Software-${version}-Darwin-${suffix}.pkg`
}

function getDarwinToolPkgName(version, arch) {
  const suffix = arch === "arm64" ? "arm64" : "x86_64"
  return `KTX-Software-${version}-Darwin-${suffix}-tools.pkg`
}

function getDarwinLibraryPkgName(version, arch) {
  const suffix = arch === "arm64" ? "arm64" : "x86_64"
  return `KTX-Software-${version}-Darwin-${suffix}-library.pkg`
}

async function ensureToktx() {
  if (await pathExists(TOKTX_PATH)) return TOKTX_PATH

  if (process.platform !== "darwin") {
    throw new Error(`Unsupported platform ${process.platform}. Install toktx manually and re-run.`)
  }

  await ensureDir(TOOL_BIN)
  await ensureDir(TOOL_LIB)

  const release = await fetchLatestKtxSoftwareRelease()
  const tag = typeof release.tag_name === "string" ? release.tag_name : "v0.0.0"
  const version = tag.startsWith("v") ? tag.slice(1) : tag

  const assetName = getDarwinAssetName(version, process.arch)
  const asset = Array.isArray(release.assets)
    ? release.assets.find((a) => a?.name === assetName)
    : null

  if (!asset?.browser_download_url) {
    throw new Error(`Could not find KTX-Software asset ${assetName} in release ${tag}`)
  }

  const downloadDir = path.join(TOOL_ROOT, "downloads")
  await ensureDir(downloadDir)

  const pkgPath = path.join(downloadDir, assetName)
  if (!(await pathExists(pkgPath))) {
    await downloadFile(asset.browser_download_url, pkgPath)
  }

  const expandedDir = path.join(downloadDir, `expanded-${version}-${process.arch}`)
  if (!(await pathExists(expandedDir))) {
    const expand = spawnSync("pkgutil", ["--expand-full", pkgPath, expandedDir], { stdio: "inherit" })
    if (expand.status !== 0) {
      throw new Error("Failed to expand KTX-Software pkg with pkgutil")
    }
  }

  const toolsPkg = getDarwinToolPkgName(version, process.arch)
  const libraryPkg = getDarwinLibraryPkgName(version, process.arch)

  const toktxSrc = path.join(expandedDir, toolsPkg, "Payload", "usr", "local", "bin", "toktx")
  const libSrc = path.join(expandedDir, libraryPkg, "Payload", "usr", "local", "lib", "libktx.4.dylib")
  const libAltSrc = path.join(expandedDir, libraryPkg, "Payload", "usr", "local", "lib", "libktx.dylib")

  if (!(await pathExists(toktxSrc))) {
    throw new Error(`toktx binary not found at ${toktxSrc}`)
  }
  if (!(await pathExists(libSrc))) {
    throw new Error(`libktx.4.dylib not found at ${libSrc}`)
  }

  await fs.copyFile(toktxSrc, TOKTX_PATH)
  await fs.chmod(TOKTX_PATH, 0o755)

  await fs.copyFile(libSrc, path.join(TOOL_LIB, "libktx.4.dylib"))
  if (await pathExists(libAltSrc)) {
    await fs.copyFile(libAltSrc, path.join(TOOL_LIB, "libktx.dylib"))
  }

  return TOKTX_PATH
}

async function getTextureInputs() {
  const texturesRoot = path.join(ROOT_DIR, "public", "textures", "hq")
  const results = []

  const walk = async (dir) => {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
        continue
      }
      if (!entry.isFile()) continue
      if (!fullPath.endsWith("_2k.jpg")) continue
      results.push(fullPath)
    }
  }

  if (await pathExists(texturesRoot)) {
    await walk(texturesRoot)
  }

  results.sort()
  return results
}

function getEncodeArgsForFile(inputPath) {
  const baseArgs = ["--t2", "--genmipmap"]
  const name = path.basename(inputPath).toLowerCase()
  const isNormal = name.includes("_nor_") || name.includes("nor_gl") || name.includes("normal")

  if (isNormal) {
    return [...baseArgs, "--encode", "uastc", "--uastc_quality", "2"]
  }

  return [...baseArgs, "--encode", "etc1s"]
}

async function main() {
  const toktx = await ensureToktx()
  const inputs = await getTextureInputs()

  if (inputs.length === 0) {
    process.stderr.write("No matching *_2k.jpg textures found under public/textures/hq.\n")
    process.exitCode = 1
    return
  }

  for (const input of inputs) {
    const output = input.replace(/\.jpg$/u, ".ktx2")

    const inStat = await fs.stat(input)
    const outExists = await pathExists(output)
    if (outExists) {
      const outStat = await fs.stat(output)
      if (outStat.mtimeMs >= inStat.mtimeMs) continue
    }

    const args = [...getEncodeArgsForFile(input), output, input]
    const result = spawnSync(toktx, args, { stdio: "inherit" })
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1
      return
    }
  }
}

await main()


