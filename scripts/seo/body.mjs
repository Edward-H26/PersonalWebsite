import { cardIds, getSections } from "./sections.mjs"
import { JOB_TITLE, SISTER_SITE_URL } from "./site.mjs"
import { absoluteUrl, bulletText, escapeHtml, slug } from "./text.mjs"

function renderCard(card, id) {
  const meta = [card.subtitle, card.date, card.location].filter(Boolean).join(", ")
  const links = card.links?.length
    ? `<p>Links: ${card.links.map((link) => `<a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a>`).join(", ")}</p>`
    : ""
  return [
    `<article id="${id}">`,
    `<h3>${escapeHtml(card.title)}</h3>`,
    card.image
      ? `<img src="${escapeHtml(absoluteUrl(card.image.src))}" alt="${escapeHtml(card.image.alt)}" width="400" height="280" loading="lazy" />`
      : "",
    meta ? `<p class="meta">${escapeHtml(meta)}</p>` : "",
    `<ul>${card.bullets.map((bullet) => `<li>${escapeHtml(bulletText(bullet)).replace(/\n/g, "<br />")}</li>`).join("")}</ul>`,
    links,
    `</article>`
  ]
    .filter(Boolean)
    .join("\n")
}

/** The readable profile inside the body markers: header, overview, and every section with its cards. */
export function buildBody(content) {
  const { PROFILE_OVERVIEW } = content
  const sections = getSections(content)
  return [
    `<div class="static-profile">`,
    `<header>`,
    `<h1>${escapeHtml(PROFILE_OVERVIEW.name)}</h1>`,
    `<p class="meta">${escapeHtml(`${JOB_TITLE}, ${PROFILE_OVERVIEW.institutions.map((institution) => institution.name).join(" and ")}`)}</p>`,
    `<nav aria-label="Sections"><ul><li><a href="#about">Overview</a></li>${sections.map((section) => `<li><a href="#${slug(section.label)}">${escapeHtml(section.label)}</a></li>`).join("")}</ul></nav>`,
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
