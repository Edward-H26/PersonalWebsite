import type { CSSProperties } from "react"
import { STORY_STAGES, type StoryStageId } from "@/config/content"

// Headings of ten letters or more, like "Publications", are wider than a 390 px phone's card at the 48 px
// step, so they take 40 px there and reach the full size at md.
const LONG_HEADING_LENGTH = 10

export function StageTitlePage({ stageId }: { stageId: StoryStageId }) {
  const stage = STORY_STAGES[stageId]
  const isProfessionalExperience = stageId === "professional_experience"
  const phoneSize = stage.heading.length >= LONG_HEADING_LENGTH ? "min-[390px]:text-[2.5rem]" : "min-[390px]:text-5xl"
  const titleGlassStyle: CSSProperties = {
    ["--glass-bg-alpha" as string]: 0.18,
    ["--glass-before-opacity" as string]: 0.3,
    ["--glass-after-opacity" as string]: 0.28
  }

  const headingClassName = isProfessionalExperience
    ? "text-white text-3xl min-[390px]:text-4xl md:text-6xl font-orbitron font-semibold tracking-[0.08em] drop-shadow-[0_2px_18px_rgba(0,0,0,0.7)] text-shadow-glow-cyan animate-fade-up"
    : `text-white text-4xl ${phoneSize} md:text-7xl font-orbitron font-bold tracking-[0.08em] drop-shadow-[0_2px_18px_rgba(0,0,0,0.7)] text-shadow-glow-cyan animate-fade-up`

  return (
    <div className="absolute inset-x-0 top-[calc(var(--phone-content-top)+3rem)] px-4 md:inset-x-auto md:left-8 md:top-24 md:px-0">
      <div className="liquid-glass-panel glass-card glass-card-hover-glow w-full md:w-[600px] md:max-w-[86vw]" style={titleGlassStyle}>
        <div className="p-4 sm:p-5">
          <div className={headingClassName} style={{ animationDelay: "0.1s", animationFillMode: "both" }}>
            {stage.heading}
          </div>
          {stage.subheading ? (
            <div
              className="mt-3 text-xs sm:text-sm text-white/82 tracking-wide drop-shadow-[0_2px_14px_rgba(0,0,0,0.5)] animate-fade-up"
              style={{ animationDelay: "0.25s", animationFillMode: "both" }}
            >
              {stage.subheading}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
