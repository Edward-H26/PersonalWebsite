import path from "node:path"
import { fileURLToPath } from "node:url"

/** Repository root, resolved from this file so the generator works from any working directory. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
export const INDEX_HTML_PATH = path.join(ROOT, "index.html")
export const SITEMAP_PATH = path.join(ROOT, "public/sitemap.xml")
export const LLMS_TXT_PATH = path.join(ROOT, "public/llms.txt")
