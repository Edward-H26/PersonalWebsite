import { parseCitation } from "./citation.mjs"
import { cardIds, getContact, getSections } from "./sections.mjs"
import { JOB_TITLE, PAGE_URL, PHOTO_URL, SITE_DESCRIPTION } from "./site.mjs"
import { absoluteUrl, bulletText } from "./text.mjs"

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
    ...(card.image ? { image: absoluteUrl(card.image.src) } : {}),
    ...(related.length ? { subjectOf: related } : {}),
    ...status
  }
}

/** The schema.org graph: the person, the site, the profile page, and one ScholarlyArticle per paper. */
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
