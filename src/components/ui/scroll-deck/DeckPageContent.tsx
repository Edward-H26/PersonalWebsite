import type { ScrollDeckPage } from "@/config/scrollDeckPages"
import { OverviewPage } from "./OverviewPage"
import { StageTitlePage } from "./StageTitlePage"
import { StoryCardPanel } from "./StoryCardPanel"

export function DeckPageContent({ page }: { page: ScrollDeckPage }) {
  if (page.kind === "overview") return <OverviewPage />
  if (page.kind === "stage_title") return <StageTitlePage stageId={page.stageId} />
  if (page.kind === "story_card") {
    return (
      <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+1rem)] px-4 md:inset-x-auto md:left-8 md:top-24 md:px-0">
        <StoryCardPanel card={page.card} />
      </div>
    )
  }
  return null
}
