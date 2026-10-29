import { getContact, getSections } from "./sections.mjs"
import { PAGE_URL, SISTER_SITE_URL, SITE_DESCRIPTION } from "./site.mjs"
import { bulletText } from "./text.mjs"

/** public/llms.txt: the whole profile as Markdown for AI crawlers. */
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
