import { BASE_PATH, SITE_URL } from "./site.mjs"

export function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/** The text of a card bullet, whether it is a plain string or carries a logo. */
export const bulletText = (bullet) => (typeof bullet === "string" ? bullet : bullet.text)

// Content asset paths come from withBase, which prefixes the base path in the app but not under
// vitest, so the base is stripped before the site URL is added.
export const absoluteUrl = (assetPath) => `${SITE_URL}/${assetPath.replace(BASE_PATH, "").replace(/^\//, "")}`

/** Lower-case, hyphen-separated form of a heading, for ids and anchors. */
export const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
