// Generates everything a search engine or AI crawler sees without running JavaScript, from the
// same data the deck renders (src/config): the metadata block and the static profile inside
// index.html plus public/sitemap.xml and public/llms.txt. robots.txt lives at the domain root,
// which the Edward-H26.github.io repository serves, so it is not generated here.
//
// This file is the command line entry and the public surface (typed in seo.d.mts); the work is
// split by concern under scripts/seo/.
import path from "node:path"
import { fileURLToPath } from "node:url"
import { writeSeoFiles } from "./seo/write.mjs"

export { BASE_PATH, JOB_TITLE, OG_IMAGE_URL, PHOTO_URL, SISTER_SITE_URL, SITE_DESCRIPTION, SITE_URL } from "./seo/site.mjs"
export { loadContent } from "./seo/content.mjs"
export { escapeHtml } from "./seo/text.mjs"
export { parseCitation } from "./seo/citation.mjs"
export { cardIds, getContact, getSections } from "./seo/sections.mjs"
export { buildJsonLd } from "./seo/jsonLd.mjs"
export { buildHead } from "./seo/head.mjs"
export { buildBody } from "./seo/body.mjs"
export { buildLlmsTxt } from "./seo/llms.mjs"
export { buildSitemap } from "./seo/sitemap.mjs"
export { BODY_MARKERS, HEAD_MARKERS, extractBetween, replaceBetween } from "./seo/markers.mjs"

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await writeSeoFiles()
}
