import { forwardRef, type ReactNode, useMemo } from "react"
import type { ScrollDeckPage } from "@/config/scrollDeckPages"
import { DeckPageContent } from "@/components/ui/scroll-deck/DeckPageContent"

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
    ? "fixed inset-0 overflow-y-hidden overscroll-none scroll-snap-type-y-mandatory z-[170] pointer-events-none touch-none"
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
              className="relative w-full h-[100svh] scroll-snap-align-start scroll-snap-stop-always [content-visibility:auto] [contain-intrinsic-size:100svh]"
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
            className="relative w-full h-[100svh] scroll-snap-align-start scroll-snap-stop-always [content-visibility:auto] [contain-intrinsic-size:100svh]"
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
