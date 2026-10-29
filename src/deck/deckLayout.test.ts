import { describe, expect, it } from "vitest"
import { buildScrollDeckPages, type ScrollDeckPage } from "@/config/scrollDeckPages"
import { getDeckLayout } from "./deckLayout"

describe("getDeckLayout", () => {
  const pages = buildScrollDeckPages()
  const layout = getDeckLayout(pages)

  it("recognises the sentinels and the real slides between them", () => {
    expect(layout.hasSentinels).toBe(true)
    expect(layout.sentinelTopIndex).toBe(0)
    expect(layout.sentinelBottomIndex).toBe(pages.length - 1)
    expect(layout.firstRealIndex).toBe(1)
    expect(layout.lastRealIndex).toBe(pages.length - 2)
  })

  it("finds the overview, the first stage title and every stage title", () => {
    expect(layout.overviewIndex).toBe(1)
    expect(layout.overviewTargetIndex).toBe(1)
    expect(pages[layout.researchTitleIndex]).toMatchObject({ kind: "stage_title", section: 1 })
    expect(layout.stageTitleIndices).toHaveLength(6)
    for (const index of layout.stageTitleIndices) expect(pages[index].kind).toBe("stage_title")
  })

  it("treats a deck without sentinels as all real slides and wraps to the first one", () => {
    const bare: ScrollDeckPage[] = [
      { key: "a", kind: "stage_title", section: 1, stageId: "fire_island" },
      { key: "b", kind: "stage_title", section: 2, stageId: "earth_island" }
    ]
    const bareLayout = getDeckLayout(bare)
    expect(bareLayout.hasSentinels).toBe(false)
    expect(bareLayout.firstRealIndex).toBe(0)
    expect(bareLayout.lastRealIndex).toBe(1)
    expect(bareLayout.overviewIndex).toBe(-1)
    expect(bareLayout.overviewTargetIndex).toBe(0)
    expect(bareLayout.stageTitleIndices).toEqual([0, 1])
  })
})
