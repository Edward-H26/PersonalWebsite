import { buildJsonLd } from "./jsonLd.mjs"
import { getContact } from "./sections.mjs"
import { JOB_TITLE, OG_IMAGE_URL, PAGE_URL, SISTER_SITE_URL, SITE_DESCRIPTION } from "./site.mjs"
import { escapeHtml } from "./text.mjs"

// Styles for the static profile that crawlers see; React replaces that markup on mount.
const STATIC_PROFILE_STYLE = `.static-profile{max-width:52rem;margin:0 auto;padding:2.5rem 1.25rem;line-height:1.6;font-size:1.05rem;color:#e6e9f2;background:#0a0a0f}
.static-profile a{color:#8ec5ff}
.static-profile h1{font-size:2rem;margin:0 0 .25rem}
.static-profile h2{font-size:1.4rem;margin:2rem 0 .5rem}
.static-profile h3{font-size:1.1rem;margin:1.25rem 0 .25rem}
.static-profile .meta{margin:0 0 .35rem;color:#aab3c5}
.static-profile nav ul{display:flex;flex-wrap:wrap;gap:.75rem;list-style:none;padding:0}`

/** The head block: title, description, canonical URL, Open Graph and Twitter tags, rel=me links, and the JSON-LD graph. */
export function buildHead(content) {
  const { PROFILE_OVERVIEW } = content
  const contact = getContact(content)
  const title = `${PROFILE_OVERVIEW.name} | ${JOB_TITLE}`
  const [givenName, ...familyParts] = PROFILE_OVERVIEW.name.split(" ")
  const xProfile = contact.links.find((link) => link.label === "X")
  const handle = xProfile ? `@${new URL(xProfile.url).pathname.replace(/^\/+|\/+$/g, "")}` : ""
  const jsonLd = JSON.stringify(buildJsonLd(content)).replace(/</g, "\\u003c")
  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(SITE_DESCRIPTION)}" />`,
    `<meta name="author" content="${escapeHtml(PROFILE_OVERVIEW.name)}" />`,
    `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />`,
    `<link rel="canonical" href="${PAGE_URL}" />`,
    `<meta property="og:type" content="profile" />`,
    `<meta property="og:site_name" content="${escapeHtml(`${PROFILE_OVERVIEW.name} 3D Portfolio`)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(SITE_DESCRIPTION)}" />`,
    `<meta property="og:url" content="${PAGE_URL}" />`,
    `<meta property="og:image" content="${OG_IMAGE_URL}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${escapeHtml(`${PROFILE_OVERVIEW.name}, ${JOB_TITLE}`)}" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta property="profile:first_name" content="${escapeHtml(givenName)}" />`,
    `<meta property="profile:last_name" content="${escapeHtml(familyParts.join(" "))}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    ...(handle
      ? [`<meta name="twitter:site" content="${escapeHtml(handle)}" />`, `<meta name="twitter:creator" content="${escapeHtml(handle)}" />`]
      : []),
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(SITE_DESCRIPTION)}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE_URL}" />`,
    ...contact.links.filter((link) => link.url !== SISTER_SITE_URL).map((link) => `<link rel="me" href="${escapeHtml(link.url)}" />`),
    `<style>${STATIC_PROFILE_STYLE}</style>`,
    `<script type="application/ld+json">${jsonLd}</script>`
  ].join("\n")
}
