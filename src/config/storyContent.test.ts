import { describe, expect, it } from "vitest"
import { STORY_STAGES } from "./storyContent"
import { INSTITUTION_LOGOS, PROFILE_OVERVIEW } from "./profile"
import { buildScrollDeckPages, NAV_SECTIONS, STAGE_ORDER } from "./scrollDeckPages"

describe("story content", () => {
  it("shows a school logo on every education entry", () => {
    const education = STORY_STAGES.water_island.cards.find((c) => c.title === "Education")!
    expect(education.bullets.length).toBe(2)
    for (const bullet of education.bullets) {
      expect(typeof bullet).toBe("object")
      if (typeof bullet === "string") continue
      expect(bullet.logo.image).toMatch(/\.(png|jpe?g)$/)
      expect(bullet.text.length).toBeGreaterThan(20)
    }
    const [columbia, illinois] = education.bullets
    if (typeof columbia !== "string") expect(columbia.logo).toBe(INSTITUTION_LOGOS.columbia)
    if (typeof illinois !== "string") expect(illinois.logo).toBe(INSTITUTION_LOGOS.illinois)
  })

  it("lists X alongside the other contact links", () => {
    const contact = STORY_STAGES.water_island.cards.find((c) => c.title === "Contact")!
    const labels = (contact.links ?? []).map((l) => l.label)
    expect(labels).toEqual(["GitHub", "LinkedIn", "X", "Website", "Google Scholar"])
    expect(contact.links?.find((l) => l.label === "X")?.url).toBe("https://x.com/QiranHu")
  })

  it("links the AC3S paper to arXiv, the project page, and the demo video", () => {
    const ac3s = STORY_STAGES.fire_island.cards[0]
    expect(ac3s.title).toMatch(/^AC3S/)
    expect(ac3s.bullets[0]).toContain("European Conference on Computer Vision (ECCV) 2026")
    expect(ac3s.links?.map((l) => l.label)).toEqual(["arXiv", "Project", "Video"])
    expect(ac3s.links?.find((l) => l.label === "Video")?.url).toBe("https://youtu.be/3jOJaT2a8iQ")
  })

  it("uses absolute https URLs for every link", () => {
    for (const stage of Object.values(STORY_STAGES)) {
      for (const card of stage.cards) for (const link of card.links ?? []) expect(link.url).toMatch(/^https:\/\//)
    }
  })

  it("keeps the overview institutions in sync with the education logos", () => {
    expect(PROFILE_OVERVIEW.institutions).toEqual([INSTITUTION_LOGOS.columbia, INSTITUTION_LOGOS.illinois])
  })
})

describe("scroll deck pages", () => {
  const pages = buildScrollDeckPages()

  it("orders sections as the navigation lists them", () => {
    const navSections = NAV_SECTIONS.map((n) => n.section)
    expect(navSections).toEqual([0, 1, 2, 3, 4, 5])
    expect(STAGE_ORDER.map((s) => s.section)).toEqual([1, 2, 3, 4, 5])
  })

  it("contains a title slide and one slide per card for every stage", () => {
    for (const stage of STAGE_ORDER) {
      const titles = pages.filter((p) => p.kind === "stage_title" && p.stageId === stage.stageId)
      const cards = pages.filter((p) => p.kind === "story_card" && p.stageId === stage.stageId)
      expect(titles).toHaveLength(1)
      expect(cards).toHaveLength(STORY_STAGES[stage.stageId].cards.length)
    }
  })

  it("wraps the deck with sentinels that mirror the far ends", () => {
    const first = pages[0]
    const last = pages[pages.length - 1]
    expect(first.kind === "sentinel" && first.renderAsKey).toBe(pages[pages.length - 2].key)
    expect(last.kind === "sentinel" && last.renderAsKey).toBe(pages[1].key)
  })
})
