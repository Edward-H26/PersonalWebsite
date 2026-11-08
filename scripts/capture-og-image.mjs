// Captures the Open Graph image, public/images/og-island.png: the scene held at the `og` still
// (src/components/canvas/camera/stillShots.ts) in its warmest light, rendered at twice 1200 by 630 on a
// private dev server and downscaled in the browser. scripts/seo.mjs points og:image and twitter:image at it.
import { writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "@playwright/test"
import { createServer } from "vite"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const OUTPUT = path.join(ROOT, "public/images/og-island.png")
const WIDTH = 1200
const HEIGHT = 630
const SCALE = 2
// After the loader leaves, the road lanterns finish their fade and the shadow maps settle.
const SETTLE_MS = 2000
const LOAD_TIMEOUT_MS = 180_000

/** Downscales a PNG data URL with the browser's high-quality resampling and returns the new data URL. */
async function downscale(page, dataUrl) {
  return page.evaluate(
    async ({ dataUrl, width, height }) => {
      /* global document, Image */
      const image = new Image()
      image.src = dataUrl
      await image.decode()
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext("2d")
      context.imageSmoothingQuality = "high"
      context.drawImage(image, 0, 0, width, height)
      return canvas.toDataURL("image/png")
    },
    { dataUrl, width: WIDTH, height: HEIGHT }
  )
}

const server = await createServer({ root: ROOT, logLevel: "error", server: { host: "127.0.0.1", port: 0 } })
await server.listen()
// Full Chromium on Metal renders the scene at a real frame rate; the headless shell falls back to SwiftShader.
const browser = await chromium.launch({
  channel: "chromium",
  args: process.platform === "darwin" ? ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] : []
})
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: SCALE })
  await page.goto(`${server.resolvedUrls.local[0]}?shot=og`, { waitUntil: "domcontentloaded" })
  // The still's scene is imported on demand, so the loader only appears a moment after the document has loaded.
  await page.waitForSelector(".voyage", { timeout: LOAD_TIMEOUT_MS })
  await page.waitForSelector(".voyage", { state: "detached", timeout: LOAD_TIMEOUT_MS })
  await page.waitForTimeout(SETTLE_MS)
  const capture = await page.screenshot({ type: "png" })
  const image = await downscale(page, `data:image/png;base64,${capture.toString("base64")}`)
  writeFileSync(OUTPUT, Buffer.from(image.split(",")[1], "base64"))
  console.log(`${path.relative(ROOT, OUTPUT)} written at ${WIDTH}x${HEIGHT} from a ${WIDTH * SCALE}x${HEIGHT * SCALE} capture`)
} finally {
  await browser.close()
  await server.close()
}
