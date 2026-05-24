import { STORY_STAGES, type StoryCard, type StoryStageId } from "@/config/storyContent"

export type DeckSection = 0 | 1 | 2 | 3 | 4 | 5

export const STAGE_ORDER: Array<{ section: Exclude<DeckSection, 0>; stageId: StoryStageId }> = [
  { section: 1, stageId: "fire_island" },
  { section: 2, stageId: "earth_island" },
  { section: 3, stageId: "air_island" },
  { section: 4, stageId: "professional_experience" },
  { section: 5, stageId: "water_island" }
]

export const NAV_SECTIONS: Array<{ label: string; section: DeckSection }> = [
  { label: "Overview", section: 0 },
  { label: "Publications", section: 1 },
  { label: "Research", section: 2 },
  { label: "Project", section: 3 },
  { label: "Experience", section: 4 },
  { label: "Info", section: 5 }
]

export const SIDE_NAV_SECTIONS = NAV_SECTIONS.filter((item) => item.section !== 0)

const MAX_BULLETS_PER_PAGE = 99

export type DisplayCard = StoryCard & {
  pageIndex: number
  pageCount: number
}

function splitCard(card: StoryCard): DisplayCard[] {
  if (card.bullets.length <= MAX_BULLETS_PER_PAGE) {
    return [{ ...card, pageIndex: 0, pageCount: 1 }]
  }

  const pages: DisplayCard[] = []
  const pageCount = Math.ceil(card.bullets.length / MAX_BULLETS_PER_PAGE)
  for (let i = 0; i < pageCount; i += 1) {
    const start = i * MAX_BULLETS_PER_PAGE
    const end = start + MAX_BULLETS_PER_PAGE
    pages.push({
      ...card,
      bullets: card.bullets.slice(start, end),
      links: i === pageCount - 1 ? card.links : undefined,
      pageIndex: i,
      pageCount
    })
  }
  return pages
}

function getDisplayCards(stageCards: StoryCard[]): DisplayCard[] {
  return stageCards.flatMap(splitCard)
}

export type ScrollDeckPage =
  | { key: string; kind: "overview"; section: 0 }
  | { key: string; kind: "stage_title"; section: Exclude<DeckSection, 0>; stageId: StoryStageId }
  | {
      key: string
      kind: "story_card"
      section: Exclude<DeckSection, 0>
      stageId: StoryStageId
      card: DisplayCard
    }
  | { key: string; kind: "sentinel"; section: DeckSection; renderAsKey: string }

export function buildScrollDeckPages(): ScrollDeckPage[] {
  const corePages: ScrollDeckPage[] = [{ key: "overview", kind: "overview", section: 0 }]

  for (const stageRef of STAGE_ORDER) {
    corePages.push({
      key: `${stageRef.stageId}-title`,
      kind: "stage_title",
      section: stageRef.section,
      stageId: stageRef.stageId
    })

    const stage = STORY_STAGES[stageRef.stageId]
    const displayCards = getDisplayCards(stage.cards)
    for (let i = 0; i < displayCards.length; i += 1) {
      corePages.push({
        key: `${stageRef.stageId}-card-${i}`,
        kind: "story_card",
        section: stageRef.section,
        stageId: stageRef.stageId,
        card: displayCards[i]
      })
    }
  }

  const lastPage = corePages[corePages.length - 1]
  const firstPage = corePages[0]

  return [
    { key: "sentinel-top", kind: "sentinel", section: lastPage.section, renderAsKey: lastPage.key },
    ...corePages,
    { key: "sentinel-bottom", kind: "sentinel", section: firstPage.section, renderAsKey: firstPage.key }
  ]
}
