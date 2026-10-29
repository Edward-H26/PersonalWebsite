import { readFileSync, writeFileSync } from "node:fs"
import { buildBody } from "./body.mjs"
import { loadContent } from "./content.mjs"
import { buildHead } from "./head.mjs"
import { buildLlmsTxt } from "./llms.mjs"
import { BODY_MARKERS, HEAD_MARKERS, replaceBetween } from "./markers.mjs"
import { INDEX_HTML_PATH, LLMS_TXT_PATH, SITEMAP_PATH } from "./paths.mjs"
import { buildSitemap } from "./sitemap.mjs"

/** Regenerates the marker blocks in index.html plus public/sitemap.xml and public/llms.txt. */
export async function writeSeoFiles() {
  const content = await loadContent()
  let html = readFileSync(INDEX_HTML_PATH, "utf8")
  html = replaceBetween(html, HEAD_MARKERS, buildHead(content), "    ")
  html = replaceBetween(html, BODY_MARKERS, buildBody(content), "      ")
  writeFileSync(INDEX_HTML_PATH, html)
  writeFileSync(SITEMAP_PATH, buildSitemap())
  writeFileSync(LLMS_TXT_PATH, buildLlmsTxt(content))
  console.log("index.html, sitemap.xml, and llms.txt regenerated")
}
