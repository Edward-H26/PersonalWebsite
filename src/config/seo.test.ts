// @vitest-environment node
import { describe, expect, it } from "vitest"
import indexHtml from "../../index.html?raw"
import sitemapXml from "../../public/sitemap.xml?raw"
import llmsTxt from "../../public/llms.txt?raw"
import * as storyContent from "@/config/storyContent"
import * as profile from "@/config/profile"
import * as scrollDeckPages from "@/config/scrollDeckPages"
import {
  BODY_MARKERS,
  HEAD_MARKERS,
  PHOTO_URL,
  SISTER_SITE_URL,
  SITE_DESCRIPTION,
  SITE_URL,
  buildBody,
  buildHead,
  buildJsonLd,
  buildLlmsTxt,
  buildSitemap,
  cardIds,
  escapeHtml,
  extractBetween,
  getContact,
  getSections,
  parseCitation,
  replaceBetween
} from "../../scripts/seo.mjs"

const content = { ...storyContent, ...profile, ...scrollDeckPages }
const normalize = (text: string) => text.replace(/\s+/g, " ").trim()
const bulletText = (bullet: storyContent.StoryBullet) => (typeof bullet === "string" ? bullet : bullet.text)
const jsonLdOf = (head: string) => JSON.parse(head.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1])

describe("parseCitation", () => {
  it("keeps initials with periods inside author names and reads the venue", () => {
    expect(
      parseCitation(
        "[1] Eric Ji, Qiran Hu, Minh N. Do, and Yaoyao Liu. AC3S: Adaptive Conditioning. European Conference on Computer Vision (ECCV) 2026.",
        "AC3S: Adaptive Conditioning"
      )
    ).toEqual({
      authors: ["Eric Ji", "Qiran Hu", "Minh N. Do", "Yaoyao Liu"],
      title: "AC3S: Adaptive Conditioning",
      venue: "European Conference on Computer Vision (ECCV) 2026"
    })
  })

  it("expands the short card titles used by the deck to the full titles", () => {
    for (const card of storyContent.STORY_STAGES.fire_island.cards) {
      const parsed = parseCitation(bulletText(card.bullets[0]), card.title)
      expect(parsed.title.startsWith(card.title)).toBe(true)
      expect(parsed.authors).toContain(profile.PROFILE_OVERVIEW.name)
      expect(parsed.venue.length).toBeGreaterThan(0)
    }
  })

  it("keeps question marks in titles and survives abbreviations inside titles", () => {
    expect(parseCitation("[5] Ann Lee, Qiran Hu. Is Scale All You Need? Under Review.", "Is Scale All You Need?")).toEqual({
      authors: ["Ann Lee", "Qiran Hu"],
      title: "Is Scale All You Need?",
      venue: "Under Review"
    })
    expect(parseCitation("[6] Ann Lee. U.S. Policy vs. Practice. NeurIPS 2026.", "U.S. Policy vs. Practice")).toEqual({
      authors: ["Ann Lee"],
      title: "U.S. Policy vs. Practice",
      venue: "NeurIPS 2026"
    })
  })

  it("falls back to the card title when the citation does not contain it", () => {
    expect(parseCitation("[9] Someone. Other work. Venue.", "Missing")).toEqual({ authors: [], title: "Missing", venue: "" })
    expect(parseCitation("", "Missing")).toEqual({ authors: [], title: "Missing", venue: "" })
  })
})

describe("content helpers", () => {
  it("orders sections like the deck navigation", () => {
    expect(getSections(content).map((section) => section.label)).toEqual(["Publications", "Research", "Projects", "Experience", "Info"])
  })

  it("reads contact details from the Contact card", () => {
    const contact = getContact(content)
    expect(contact.email).toBe("qiranhu8@gmail.com")
    expect(contact.phone).toMatch(/^\+1/)
    expect(contact.links.map((link) => link.label)).toContain("GitHub")
  })

  it("returns empty contact details when the card is missing", () => {
    const contact = getContact({ ...content, STORY_STAGES: { earth_island: { cards: [] } } })
    expect(contact).toEqual({ email: "", phone: "", links: [] })
    const person = buildJsonLd({ ...content, STORY_STAGES: { earth_island: { id: "earth_island", heading: "Research", cards: [] } }, STAGE_ORDER: [] })["@graph"].find(
      (node) => node["@type"] === "Person"
    )!
    expect(person).not.toHaveProperty("sameAs")
    expect(person).not.toHaveProperty("email")
  })

  it("drops an et al. marker from author lists", () => {
    expect(parseCitation("[7] Qiran Hu et al. Short Paper. Workshop 2026.", "Short Paper").authors).toEqual(["Qiran Hu"])
    expect(parseCitation("[8] Ann Lee, Qiran Hu, et al. Short Paper. Workshop 2026.", "Short Paper").authors).toEqual(["Ann Lee", "Qiran Hu"])
    expect(parseCitation("[9] Ann Lee & Qiran Hu. Short Paper. Workshop 2026.", "Short Paper").authors).toEqual(["Ann Lee", "Qiran Hu"])
  })
})

describe("head", () => {
  const head = buildHead(content)

  it("emits title, canonical, Open Graph, Twitter, and robots tags", () => {
    expect(head.match(/<title>/g)).toHaveLength(1)
    expect(head).toContain("<title>Qiran Hu | Research Assistant</title>")
    expect(head).toContain(`<link rel="canonical" href="${SITE_URL}/" />`)
    expect(head).toContain(`<meta property="og:image" content="${SITE_URL}/images/og-card.png" />`)
    expect(head).toContain('<meta name="twitter:card" content="summary_large_image" />')
    expect(head).toContain('<meta name="twitter:site" content="@QiranHu" />')
    expect(head).toContain('<meta name="robots" content="index, follow')
    expect(SITE_DESCRIPTION.length).toBeLessThanOrEqual(160)
  })

  it("embeds json-ld that parses and cannot close the script tag early", () => {
    const raw = head.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]
    expect(raw).not.toContain("</")
    expect(jsonLdOf(head)["@context"]).toBe("https://schema.org")
  })

  it("escapes markup coming from the content", () => {
    const evil = buildHead({ ...content, PROFILE_OVERVIEW: { ...profile.PROFILE_OVERVIEW, name: 'Q "H" <b>' } })
    expect(evil).toContain("<title>Q &quot;H&quot; &lt;b&gt; | Research Assistant</title>")
  })
})

describe("json-ld", () => {
  const graph = buildJsonLd(content)["@graph"]

  it("describes the person with contact details, social profiles, and both institutions", () => {
    const person = graph.find((node) => node["@type"] === "Person")!
    expect(person.name).toBe(profile.PROFILE_OVERVIEW.name)
    expect(person.email).toBe("mailto:qiranhu8@gmail.com")
    expect(person.image).toBe(PHOTO_URL)
    expect(person.sameAs).toContain("https://github.com/Edward-H26")
    expect(person.sameAs).toContain(SISTER_SITE_URL)
    expect(person.affiliation.map((org: { name: string }) => org.name)).toEqual(
      profile.PROFILE_OVERVIEW.institutions.map((institution) => institution.name)
    )
  })

  it("lists one scholarly article per publication with authors and publication status", () => {
    const articles = graph.filter((node) => node["@type"] === "ScholarlyArticle")
    expect(articles).toHaveLength(storyContent.STORY_STAGES.fire_island.cards.length)
    for (const article of articles) {
      expect(article.author.length).toBeGreaterThanOrEqual(2)
      expect(article.author.some((author: { "@id"?: string }) => author["@id"] === `${SITE_URL}/#person`)).toBe(true)
      expect(article.publication?.["@type"] === "PublicationEvent" || article.creativeWorkStatus === "Under review").toBe(true)
    }
    const accepted = articles.find((article) => article.headline.startsWith("AC3S"))!
    expect(accepted.publication.name).toMatch(/ECCV/)
    expect(accepted.url).toBe("https://arxiv.org/abs/2606.31204")
    expect(accepted.subjectOf.map((page: { name: string }) => page.name)).toEqual(["Project", "Video"])
  })

  it("tolerates a publication card without a citation", () => {
    const stages = {
      ...storyContent.STORY_STAGES,
      fire_island: { id: "fire_island", heading: "Publications", cards: [{ title: "Draft", bullets: [] }] }
    }
    const article = buildJsonLd({ ...content, STORY_STAGES: stages })["@graph"].find((node) => node["@type"] === "ScholarlyArticle")!
    expect(article.headline).toBe("Draft")
    expect(article.author).toEqual([])
    expect(article.url).toBe(`${SITE_URL}/#fire_island-draft`)
  })

  it("only references node ids that exist in the graph", () => {
    const ids = new Set(graph.map((node) => node["@id"]))
    const references: string[] = []
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk)
      else if (value && typeof value === "object") {
        const record = value as Record<string, unknown>
        if (Object.keys(record).length === 1 && typeof record["@id"] === "string") references.push(record["@id"])
        Object.values(record).forEach(walk)
      }
    }
    walk(graph)
    expect(references.length).toBeGreaterThan(0)
    for (const reference of references) expect(ids.has(reference)).toBe(true)
  })
})

describe("static body", () => {
  const body = buildBody(content)

  it("contains every section, card, bullet, and link of the deck", () => {
    for (const stage of Object.values(storyContent.STORY_STAGES)) {
      expect(body).toContain(`<h2>${stage.heading}</h2>`)
      for (const card of stage.cards) {
        expect(body).toContain(`<h3>${card.title}</h3>`)
        for (const bullet of card.bullets) {
          expect(body).toContain(escapeHtml(bulletText(bullet).split("\n")[0]))
        }
        for (const link of card.links ?? []) expect(body).toContain(`href="${link.url.replace(/&/g, "&amp;")}"`)
      }
    }
    expect(body).toContain(SISTER_SITE_URL)
    expect(body).not.toContain("undefined")
  })

  it("uses unique element ids even when two cards share a title", () => {
    const ids = [...body.matchAll(/ id="([^"]+)"/g)].map((match) => match[1])
    expect(new Set(ids).size).toBe(ids.length)
    expect(cardIds({ id: "x", cards: [{ title: "Same" }, { title: "Same" }] })).toEqual(["x-same", "x-same-2"])
  })

  it("keeps education entries readable by turning line breaks into <br />", () => {
    expect(body).toContain("Columbia University, New York City, NY<br />M.S. in Data Science")
  })

  it("escapes markup coming from the content and tolerates cards without optional fields", () => {
    const evil = buildBody({
      ...content,
      STORY_STAGES: {
        ...storyContent.STORY_STAGES,
        air_island: { id: "air_island", heading: "Projects", cards: [{ title: "Bad <b>title</b>", bullets: ["a & b"] }] }
      }
    })
    expect(evil).toContain("<h3>Bad &lt;b&gt;title&lt;/b&gt;</h3>")
    expect(evil).toContain("<li>a &amp; b</li>")
  })
})

describe("crawler files", () => {
  it("lists the single page in the sitemap", () => {
    const sitemap = buildSitemap()
    expect(sitemap.match(/<url>/g)).toHaveLength(1)
    expect(sitemap).toContain(`<loc>${SITE_URL}/</loc>`)
  })

  it("writes llms.txt with the name heading, a summary quote, and every card", () => {
    const llms = buildLlmsTxt(content)
    expect(llms.startsWith(`# ${profile.PROFILE_OVERVIEW.name}\n\n> `)).toBe(true)
    for (const stage of Object.values(storyContent.STORY_STAGES)) {
      for (const card of stage.cards) expect(llms).toContain(`### ${card.title}`)
    }
    expect(llms).not.toContain("undefined")
  })
})

describe("index.html", () => {
  it("is in sync with the generator (run: node scripts/seo.mjs)", () => {
    expect(normalize(extractBetween(indexHtml, HEAD_MARKERS))).toBe(normalize(buildHead(content)))
    expect(normalize(extractBetween(indexHtml, BODY_MARKERS))).toBe(normalize(buildBody(content)))
    expect(sitemapXml).toBe(buildSitemap())
    expect(llmsTxt).toBe(buildLlmsTxt(content))
  })

  it("replaces only the block between markers and keeps them for the next run", () => {
    const html = "<head>\n  <!-- seo:head -->\n  old\n  <!-- /seo:head -->\n</head>"
    expect(replaceBetween(html, HEAD_MARKERS, "a\nb", "  ")).toBe("<head>\n  <!-- seo:head -->\n  a\n  b\n  <!-- /seo:head -->\n</head>")
    expect(() => replaceBetween("<head></head>", HEAD_MARKERS, "x", "")).toThrow(/Markers/)
  })
})
