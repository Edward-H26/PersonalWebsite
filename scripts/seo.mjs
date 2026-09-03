// Generates everything a search engine or AI crawler sees without running JavaScript, from the
// same data the deck renders (src/config): the metadata block and the static profile inside
// index.html plus public/sitemap.xml and public/llms.txt. robots.txt lives at the domain root,
// which the Edward-H26.github.io repository serves, so it is not generated here.
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const SITE_URL = "https://edward-h26.github.io/PersonalWebsite"
export const SISTER_SITE_URL = "https://edward-h26.github.io/"
export const OG_IMAGE_URL = `${SITE_URL}/images/og-card.png`
export const PHOTO_URL = `${SITE_URL}/images/profile-1024.jpg`
export const JOB_TITLE = "Research Assistant"
export const SITE_DESCRIPTION =
  "Interactive 3D portfolio of Qiran Hu, research assistant at UIUC working on multimodal learning, 3D-aware generative models, and multi-agent AI systems."
export const HEAD_MARKERS = ["<!-- seo:head -->", "<!-- /seo:head -->"]
export const BODY_MARKERS = ["<!-- seo:body -->", "<!-- /seo:body -->"]

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const PAGE_URL = `${SITE_URL}/`

const STATIC_STYLE = `.static-profile{font-family:Rajdhani,system-ui,sans-serif;max-width:52rem;margin:0 auto;padding:2.5rem 1.25rem;line-height:1.6;font-size:1.05rem;color:#e6e9f2;background:#0a0a0f}
.static-profile a{color:#8ec5ff}
.static-profile h1{font-family:Orbitron,system-ui,sans-serif;font-size:2rem;margin:0 0 .25rem}
.static-profile h2{font-size:1.4rem;margin:2rem 0 .5rem}
.static-profile h3{font-size:1.1rem;margin:1.25rem 0 .25rem}
.static-profile .meta{margin:0 0 .35rem;color:#aab3c5}
.static-profile nav ul{display:flex;flex-wrap:wrap;gap:.75rem;list-style:none;padding:0}`

// esbuild is imported lazily so that importing this module (tests, vite.config.ts) stays cheap.
export async function loadContent() {
  const { build } = await import("esbuild")
  const { outputFiles } = await build({
    stdin: {
      contents: 'export * from "@/config/storyContent"\nexport * from "@/config/profile"\nexport * from "@/config/scrollDeckPages"',
      resolveDir: ROOT,
      loader: "ts"
    },
    alias: { "@": path.join(ROOT, "src") },
    define: { "import.meta.env.BASE_URL": JSON.stringify("/PersonalWebsite/") },
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    logLevel: "silent"
  })
  const code = Buffer.from(outputFiles[0].text).toString("base64")
  return import(`data:text/javascript;base64,${code}`)
}

export function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

const bulletText = (bullet) => (typeof bullet === "string" ? bullet : bullet.text)
const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")

// Citations look like "[1] A. Author, B. Author. Title. Venue." and a card title may be only a prefix
// of the full title, so the title is located inside the citation and its terminator is searched
// from the end of the known title (author initials and abbreviations contain periods too).
// A closing "." is dropped from the title while "?" and "!" belong to it.
export function parseCitation(citation, title) {
  const body = citation.replace(/^\[\d+\]\s*/, "")
  const start = body.indexOf(title)
  if (start < 0) return { authors: [], title, venue: "" }
  const rest = body.slice(start)
  const terminator = /[.?!](?=\s|$)/g
  terminator.lastIndex = Math.max(0, title.length - 1)
  const hit = terminator.exec(rest)
  const fullTitle = hit ? rest.slice(0, hit[0] === "." ? hit.index : hit.index + 1) : rest
  const venue = hit ? rest.slice(hit.index + 1).trim().replace(/\.\s*$/, "") : ""
  const authors = body
    .slice(0, start)
    .replace(/\.\s*$/, "")
    .split(/\s*,\s*(?:and\s+|&\s*)?|\s+and\s+|\s*&\s*/)
    .map((author) => author.trim().replace(/\s+et\s+al\.?$/i, ""))
    .filter((author) => author && !/^et\s+al\.?$/i.test(author))
  return { authors, title: fullTitle, venue }
}

// Sections in the order the deck shows them, labelled like the navigation.
export function getSections(content) {
  const { STAGE_ORDER, NAV_SECTIONS, STORY_STAGES } = content
  return STAGE_ORDER.map((ref) => ({
    label: NAV_SECTIONS.find((item) => item.section === ref.section)?.label ?? STORY_STAGES[ref.stageId].heading,
    stage: STORY_STAGES[ref.stageId]
  }))
}

// Document-wide unique ids for the cards of a stage (two cards with the same title must not share one).
export function cardIds(stage) {
  const used = new Set()
  return stage.cards.map((card) => {
    const base = `${stage.id}-${slug(card.title)}`
    let id = base
    for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`
    used.add(id)
    return id
  })
}

export function getContact(content) {
  const cards = Object.values(content.STORY_STAGES).flatMap((stage) => stage.cards)
  const card = cards.find((entry) => entry.title === "Contact")
  const field = (name) =>
    card?.bullets.map(bulletText).find((bullet) => bullet.startsWith(`${name}: `))?.slice(name.length + 2) ?? ""
  return { email: field("Email"), phone: field("Phone"), links: card?.links ?? [] }
}

function buildArticle(card, cardId, name, personId) {
  const { authors, title, venue } = parseCitation(card.bullets[0] ? bulletText(card.bullets[0]) : "", card.title)
  const links = card.links ?? []
  const primary = links.find((link) => /arxiv|paper|pdf/i.test(link.label)) ?? links[0]
  const url = primary?.url ?? `${PAGE_URL}#${cardId}`
  const related = links.filter((link) => link !== primary).map((link) => ({ "@type": "WebPage", name: link.label, url: link.url }))
  const status = /under review/i.test(venue)
    ? { creativeWorkStatus: "Under review" }
    : venue
      ? { publication: { "@type": "PublicationEvent", name: venue } }
      : {}
  return {
    "@type": "ScholarlyArticle",
    "@id": url,
    headline: title,
    name: title,
    url,
    author: authors.map((author) => (author === name ? { "@id": personId } : { "@type": "Person", name: author })),
    ...(related.length ? { subjectOf: related } : {}),
    ...status
  }
}

export function buildJsonLd(content) {
  const { PROFILE_OVERVIEW } = content
  const contact = getContact(content)
  const personId = `${PAGE_URL}#person`
  const websiteId = `${PAGE_URL}#website`
  const [givenName, ...familyParts] = PROFILE_OVERVIEW.name.split(" ")
  const publications = getSections(content).find((section) => section.label === "Publications")?.stage
  const publicationIds = publications ? cardIds(publications) : []
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        "@id": personId,
        name: PROFILE_OVERVIEW.name,
        givenName,
        familyName: familyParts.join(" "),
        jobTitle: JOB_TITLE,
        description: PROFILE_OVERVIEW.bio,
        ...(contact.email ? { email: `mailto:${contact.email}` } : {}),
        ...(contact.phone ? { telephone: contact.phone } : {}),
        url: PAGE_URL,
        image: PHOTO_URL,
        affiliation: PROFILE_OVERVIEW.institutions.map((institution) => ({ "@type": "Organization", name: institution.name })),
        ...(contact.links.length ? { sameAs: contact.links.map((link) => link.url) } : {})
      },
      {
        "@type": "WebSite",
        "@id": websiteId,
        url: PAGE_URL,
        name: `${PROFILE_OVERVIEW.name} 3D Portfolio`,
        description: SITE_DESCRIPTION,
        inLanguage: "en",
        author: { "@id": personId },
        publisher: { "@id": personId }
      },
      {
        "@type": "ProfilePage",
        "@id": `${PAGE_URL}#profilepage`,
        url: PAGE_URL,
        name: `${PROFILE_OVERVIEW.name} | ${JOB_TITLE}`,
        description: SITE_DESCRIPTION,
        inLanguage: "en",
        isPartOf: { "@id": websiteId },
        mainEntity: { "@id": personId }
      },
      ...(publications?.cards ?? []).map((card, index) => buildArticle(card, publicationIds[index], PROFILE_OVERVIEW.name, personId))
    ]
  }
}

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
    ...(handle ? [`<meta name="twitter:site" content="${escapeHtml(handle)}" />`, `<meta name="twitter:creator" content="${escapeHtml(handle)}" />`] : []),
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(SITE_DESCRIPTION)}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE_URL}" />`,
    ...contact.links.filter((link) => link.url !== SISTER_SITE_URL).map((link) => `<link rel="me" href="${escapeHtml(link.url)}" />`),
    `<style>${STATIC_STYLE}</style>`,
    `<script type="application/ld+json">${jsonLd}</script>`
  ].join("\n")
}

function renderCard(card, id) {
  const meta = [card.subtitle, card.date, card.location].filter(Boolean).join(", ")
  const links = card.links?.length
    ? `<p>Links: ${card.links.map((link) => `<a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a>`).join(", ")}</p>`
    : ""
  return [
    `<article id="${id}">`,
    `<h3>${escapeHtml(card.title)}</h3>`,
    meta ? `<p class="meta">${escapeHtml(meta)}</p>` : "",
    `<ul>${card.bullets.map((bullet) => `<li>${escapeHtml(bulletText(bullet)).replace(/\n/g, "<br />")}</li>`).join("")}</ul>`,
    links,
    `</article>`
  ]
    .filter(Boolean)
    .join("\n")
}

export function buildBody(content) {
  const { PROFILE_OVERVIEW } = content
  const sections = getSections(content)
  return [
    `<div class="static-profile">`,
    `<header>`,
    `<h1>${escapeHtml(PROFILE_OVERVIEW.name)}</h1>`,
    `<p class="meta">${escapeHtml(`${JOB_TITLE}, ${PROFILE_OVERVIEW.institutions.map((institution) => institution.name).join(" and ")}`)}</p>`,
    `<nav aria-label="Sections"><ul>${sections.map((section) => `<li><a href="#${slug(section.label)}">${escapeHtml(section.label)}</a></li>`).join("")}</ul></nav>`,
    `</header>`,
    `<section id="about">`,
    `<h2>About</h2>`,
    `<p>${escapeHtml(PROFILE_OVERVIEW.bio)}</p>`,
    `<p>Classic version of this portfolio: <a href="${SISTER_SITE_URL}">${SISTER_SITE_URL}</a></p>`,
    `</section>`,
    ...sections.map((section) =>
      [
        `<section id="${slug(section.label)}">`,
        `<h2>${escapeHtml(section.stage.heading)}</h2>`,
        section.stage.subheading ? `<p class="meta">${escapeHtml(section.stage.subheading)}</p>` : "",
        ...section.stage.cards.map((card, index) => renderCard(card, cardIds(section.stage)[index])),
        `</section>`
      ]
        .filter(Boolean)
        .join("\n")
    ),
    `</div>`
  ].join("\n")
}

export function buildLlmsTxt(content) {
  const { PROFILE_OVERVIEW } = content
  const contact = getContact(content)
  const lines = [
    `# ${PROFILE_OVERVIEW.name}`,
    ``,
    `> ${SITE_DESCRIPTION}`,
    ``,
    `- This page: ${PAGE_URL}`,
    `- Classic portfolio: ${SISTER_SITE_URL}`,
    ...contact.links.filter((link) => link.url !== SISTER_SITE_URL).map((link) => `- ${link.label}: ${link.url}`),
    ...(contact.email ? [`- Email: ${contact.email}`] : []),
    ...(contact.phone ? [`- Phone: ${contact.phone}`] : []),
    ``,
    `## About`,
    ``,
    PROFILE_OVERVIEW.bio,
    ``
  ]
  for (const section of getSections(content)) {
    lines.push(`## ${section.stage.heading}`, ``)
    if (section.stage.subheading) lines.push(section.stage.subheading, ``)
    for (const card of section.stage.cards) {
      const meta = [card.subtitle, card.date, card.location].filter(Boolean).join(", ")
      lines.push(`### ${card.title}`, ``)
      if (meta) lines.push(meta, ``)
      lines.push(...card.bullets.map((bullet) => `- ${bulletText(bullet).replace(/\n/g, ", ")}`))
      if (card.links?.length) lines.push(`- Links: ${card.links.map((link) => `[${link.label}](${link.url})`).join(", ")}`)
      lines.push(``)
    }
  }
  return lines.join("\n")
}

export function buildSitemap() {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${PAGE_URL}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>1.0</priority>\n  </url>\n</urlset>\n`
}

export function extractBetween(html, [start, end]) {
  const from = html.indexOf(start)
  const to = html.indexOf(end)
  if (from < 0 || to < from) throw new Error(`Markers ${start} and ${end} were not found`)
  return html.slice(from + start.length, to)
}

export function replaceBetween(html, [start, end], replacement, indent) {
  const from = html.indexOf(start)
  const to = html.indexOf(end)
  if (from < 0 || to < from) throw new Error(`Markers ${start} and ${end} were not found`)
  const block = replacement
    .split("\n")
    .map((line) => indent + line)
    .join("\n")
  return `${html.slice(0, from + start.length)}\n${block}\n${indent}${html.slice(to)}`
}

async function main() {
  const content = await loadContent()
  const indexPath = path.join(ROOT, "index.html")
  let html = readFileSync(indexPath, "utf8")
  html = replaceBetween(html, HEAD_MARKERS, buildHead(content), "    ")
  html = replaceBetween(html, BODY_MARKERS, buildBody(content), "      ")
  writeFileSync(indexPath, html)
  writeFileSync(path.join(ROOT, "public/sitemap.xml"), buildSitemap())
  writeFileSync(path.join(ROOT, "public/llms.txt"), buildLlmsTxt(content))
  console.log("index.html, sitemap.xml, and llms.txt regenerated")
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
