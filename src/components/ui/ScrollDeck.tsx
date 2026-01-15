import { forwardRef, memo, type ReactNode, useMemo } from "react"
import type { CSSProperties } from "react"
import { STORY_STAGES, type StoryCard, type StoryStageId } from "@/config/storyContent"

type DeckSection = 0 | 1 | 2 | 3 | 4 | 5

const STAGE_ORDER: Array<{ section: Exclude<DeckSection, 0>; stageId: StoryStageId }> = [
  { section: 1, stageId: "earth_island" },
  { section: 2, stageId: "fire_island" },
  { section: 3, stageId: "professional_experience" },
  { section: 4, stageId: "air_island" },
  { section: 5, stageId: "water_island" }
]

const MAX_BULLETS_PER_PAGE = 99

type DisplayCard = StoryCard & {
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

  const lastCore = corePages[corePages.length - 1]
  const firstCore = corePages[0]

  return [
    { key: "sentinel-top", kind: "sentinel", section: lastCore.section, renderAsKey: lastCore.key },
    ...corePages,
    { key: "sentinel-bottom", kind: "sentinel", section: firstCore.section, renderAsKey: firstCore.key }
  ]
}

const CardContent = memo(function CardContent({ card }: { card: DisplayCard }) {
  return (
    <>
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="text-white font-orbitron font-semibold text-[24px] leading-tight tracking-wide drop-shadow-[0_2px_18px_rgba(0,0,0,0.6)] liquid-glass-text">
            {card.title}
          </div>

          {card.location || card.date ? (
            <div className="mt-1 flex items-center justify-between gap-4 text-[14px] font-medium text-white/80 drop-shadow-[0_2px_14px_rgba(0,0,0,0.5)]">
              <span>{card.location}</span>
              <span className="text-white/75">{card.date}</span>
            </div>
          ) : null}

          {card.subtitle ? (
            <div className="mt-1 text-[15px] font-medium text-white/92 drop-shadow-[0_2px_14px_rgba(0,0,0,0.5)]">
              {card.subtitle}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-2 pt-1">
          {card.pageCount > 1 ? (
            <div className="text-[12px] text-white/75 tracking-[0.26em] uppercase">
              {card.pageIndex + 1}/{card.pageCount}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex-1 min-h-0">
        {card.bullets.length > 0 ? (
          <div className="liquid-card-scroll h-full overflow-y-auto pr-3 pointer-events-auto" data-story-scroll="true">
            <ul className="space-y-2 text-[18px] font-medium leading-[1.55] text-white/95 list-disc pl-6 drop-shadow-[0_2px_16px_rgba(0,0,0,0.55)]">
              {card.bullets.map((b) => (
                <li key={b}>
                  {b}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {card.links && card.links.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {card.links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="pointer-events-auto liquid-link-chip"
            >
              {link.label}
            </a>
          ))}
        </div>
      ) : null}
    </>
  )
})

function StoryCardPanel({ card }: { card: DisplayCard }) {
  const glassStyle: CSSProperties = {
    ["--glass-bg-alpha" as string]: 0.12,
    ["--glass-before-opacity" as string]: 0.24,
    ["--glass-after-opacity" as string]: 0.24
  }

  return (
    <div className="liquid-glass-panel flex flex-col w-[600px] max-w-[86vw] h-[360px] pointer-events-auto" style={glassStyle}>
      <div className="relative flex flex-col px-7 py-3.5 h-full">
        <CardContent card={card} />
      </div>
    </div>
  )
}

function OverviewPage() {
  const glassStyle = {
    "--glass-bg-alpha": 0.18,
    "--glass-before-opacity": 0.3,
    "--glass-after-opacity": 0.28
  } as CSSProperties

  return (
    <div className="absolute top-24 left-4 sm:left-8">
      <div className="liquid-glass-panel w-[560px] max-w-[86vw]" style={glassStyle}>
        <div className="p-6">
          <div className="text-white text-5xl sm:text-6xl font-orbitron font-bold tracking-[0.08em] drop-shadow-[0_2px_18px_rgba(0,0,0,0.65)]">
            <div>Hi! I’m</div>
            <div>Qiran Hu</div>
          </div>
          <div className="mt-4 text-[16px] sm:text-[17px] leading-[1.6] text-white/85 drop-shadow-[0_2px_14px_rgba(0,0,0,0.5)] max-w-[62ch]">
            I am an applied AI researcher and full-stack software engineer creating new ways for people to interact with AI. I push the frontier of agentic experiences
            through rapid internal experiments. My focus areas include self-evolving multi-agent architectures, context-aware memory systems, multimodal AI reasoning
            abilities, and novel human-AI interfaces.
          </div>
        </div>
      </div>
    </div>
  )
}

function StageTitlePage({ stageId }: { stageId: StoryStageId }) {
  const stage = STORY_STAGES[stageId]
  const isProfessionalExperience = stageId === "professional_experience"
  const titleGlassStyle: CSSProperties = {
    ["--glass-bg-alpha" as string]: 0.18,
    ["--glass-before-opacity" as string]: 0.3,
    ["--glass-after-opacity" as string]: 0.28
  }

  const headingClassName = isProfessionalExperience
    ? "text-white text-5xl sm:text-6xl font-orbitron font-semibold tracking-[0.08em] drop-shadow-[0_2px_18px_rgba(0,0,0,0.7)] text-shadow-glow-cyan"
    : "text-white text-6xl sm:text-7xl font-orbitron font-bold tracking-[0.08em] drop-shadow-[0_2px_18px_rgba(0,0,0,0.7)] text-shadow-glow-cyan"

  return (
    <div className="absolute top-24 left-4 sm:left-8">
      <div className="liquid-glass-panel w-[600px] max-w-[86vw]" style={titleGlassStyle}>
        <div className="p-5">
          <div className={headingClassName}>
            {stage.heading}
          </div>
          {stage.subheading ? (
            <div className="mt-3 text-sm text-white/82 tracking-wide drop-shadow-[0_2px_14px_rgba(0,0,0,0.5)]">
              {stage.subheading}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function DeckPageContent({ page }: { page: ScrollDeckPage }) {
  if (page.kind === "overview") return <OverviewPage />
  if (page.kind === "stage_title") return <StageTitlePage stageId={page.stageId} />
  if (page.kind === "story_card") return <div className="absolute top-24 left-4 sm:left-8"><StoryCardPanel card={page.card} /></div>
  return null
}

export const ScrollDeck = forwardRef<HTMLDivElement, { pages: ScrollDeckPage[]; children?: ReactNode; scrollLocked?: boolean }>(function ScrollDeck(
  { pages, children, scrollLocked = false },
  ref
) {
  const pageByKey = useMemo(() => {
    const map = new Map<string, ScrollDeckPage>()
    for (const page of pages) {
      if (page.kind === "sentinel") continue
      map.set(page.key, page)
    }
    return map
  }, [pages])

  const deckClassName = scrollLocked
    ? "fixed inset-0 overflow-y-hidden overscroll-contain scroll-snap-type-y-mandatory z-[170] pointer-events-none"
    : "fixed inset-0 overflow-y-auto overscroll-contain scroll-snap-type-y-mandatory z-[170]"

  return (
    <div
      ref={ref}
      className={deckClassName}
    >
      {pages.map((page) => {
        const isSentinel = page.kind === "sentinel"
        if (isSentinel) {
          const renderPage = pageByKey.get(page.renderAsKey)
          return (
            <section
              key={page.key}
              className="relative w-full h-[100svh] scroll-snap-align-start scroll-snap-stop-always"
              data-deck-index={page.key}
              data-deck-sentinel="true"
              data-deck-render-key={page.renderAsKey}
              aria-hidden="true"
            >
              {renderPage ? <DeckPageContent page={renderPage} /> : null}
            </section>
          )
        }

        return (
          <section
            key={page.key}
            className="relative w-full h-[100svh] scroll-snap-align-start scroll-snap-stop-always"
            data-deck-index={page.key}
            data-deck-sentinel="false"
            data-deck-render-key={page.key}
          >
            <DeckPageContent page={page} />
          </section>
        )
      })}

      {children}
    </div>
  )
})


