import { memo } from "react"
import type { CSSProperties } from "react"
import type { DisplayCard } from "@/config/scrollDeckPages"
import type { StoryBullet } from "@/config/storyContent"
import { LinkedText } from "@/components/ui/LinkedText"
import { LinkIcon } from "@/components/ui/LinkIcon"

function BulletText({ text }: { text: string }) {
  if (!text.includes("\n")) return <LinkedText text={text} />

  return text.split("\n").map((line, index) => (
    <span key={`${line}-${index}`}>
      {index > 0 && <br />}
      <LinkedText text={line} />
    </span>
  ))
}

function Bullet({ bullet }: { bullet: StoryBullet }) {
  if (typeof bullet === "string") {
    return (
      <li>
        <BulletText text={bullet} />
      </li>
    )
  }

  return (
    <li className="-ml-5 flex list-none items-start gap-3 md:-ml-6 md:gap-4">
      <img
        src={bullet.logo.image}
        alt={bullet.logo.name}
        className="mt-0.5 h-9 w-9 shrink-0 rounded-full object-cover shadow-[0_4px_14px_rgba(0,0,0,0.4)] md:h-11 md:w-11"
      />
      <span className="min-w-0">
        <BulletText text={bullet.text} />
      </span>
    </li>
  )
}

const CardContent = memo(function CardContent({ card }: { card: DisplayCard }) {
  return (
    <>
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-6">
        <div className="min-w-0">
          <div className="text-white font-orbitron font-semibold text-[18px] md:text-[24px] leading-tight tracking-wide drop-shadow-[0_2px_18px_rgba(0,0,0,0.6)] liquid-glass-text">
            {card.title}
          </div>

          {card.location ? (
            <div className="mt-1 text-[13px] md:text-[14px] font-medium text-white/80 drop-shadow-[0_2px_14px_rgba(0,0,0,0.5)]">
              {card.location}
            </div>
          ) : null}

          {card.subtitle || card.date ? (
            <div className="mt-1 flex w-full flex-col gap-1 text-[13px] font-medium text-white/92 drop-shadow-[0_2px_14px_rgba(0,0,0,0.5)] md:flex-row md:items-center md:justify-between md:gap-4 md:text-[15px]">
              <span className="min-w-0">{card.subtitle ?? ""}</span>
              {card.date ? <span className="text-white/75 md:text-right">{card.date}</span> : <span />}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col items-start gap-2 pt-0 md:items-end md:pt-1">
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
            <ul className="space-y-2 text-[14px] md:text-[18px] font-medium leading-[1.5] md:leading-[1.55] text-white/95 list-disc pl-5 md:pl-6 drop-shadow-[0_2px_16px_rgba(0,0,0,0.55)]">
              {card.bullets.map((bullet) => (
                <Bullet key={typeof bullet === "string" ? bullet : bullet.text} bullet={bullet} />
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
              <LinkIcon label={link.label} />
              {link.label}
            </a>
          ))}
        </div>
      ) : null}
    </>
  )
})

export function StoryCardPanel({ card }: { card: DisplayCard }) {
  const glassStyle: CSSProperties = {
    ["--glass-bg-alpha" as string]: 0.12,
    ["--glass-before-opacity" as string]: 0.24,
    ["--glass-after-opacity" as string]: 0.24
  }

  return (
    <div
      className="liquid-glass-panel glass-card glass-card-hover-lift flex flex-col w-full h-[52svh] min-h-[240px] max-h-[380px] pointer-events-auto min-[390px]:h-[58svh] min-[390px]:max-h-[480px] md:w-[600px] md:max-w-[86vw] md:h-[360px] md:min-h-[200px] md:max-h-none"
      style={glassStyle}
    >
      <div className="relative flex flex-col px-5 py-4 md:px-7 md:py-3.5 h-full">
        <CardContent card={card} />
      </div>
    </div>
  )
}
