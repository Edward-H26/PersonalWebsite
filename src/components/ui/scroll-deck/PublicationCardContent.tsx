import type { DisplayCard } from "@/config/scrollDeckPages"
import { LinkIcon } from "@/components/ui/LinkIcon"
import { PROFILE_OVERVIEW } from "@/config/profile"

function AuthorList({ authors }: { authors: string[] }) {
  return (
    <>
      {authors.map((author, index) => (
        <span key={author}>
          {index > 0 ? ", " : ""}
          {author === PROFILE_OVERVIEW.name ? <strong className="font-semibold text-white">{author}</strong> : author}
        </span>
      ))}
    </>
  )
}

// The venue acronym in parentheses is bold, as on the reference homepages.
function renderVenue(venue: string) {
  const match = venue.match(/\(([A-Za-z]+)\)/)
  if (!match || match.index === undefined) return venue
  const start = match.index + 1
  return (
    <>
      {venue.slice(0, start)}
      <strong className="font-semibold text-white/90">{match[1]}</strong>
      {venue.slice(start + match[1].length)}
    </>
  )
}

export function PublicationCardContent({ card }: { card: DisplayCard }) {
  const links = card.links ?? []
  const primary = links.find((link) => /pdf|arxiv/i.test(link.label)) ?? links.find((link) => /project/i.test(link.label))
  const figure = card.image ? (
    <>
      <img src={card.image.src} alt={card.image.alt} loading="lazy" decoding="async" />
      {card.badge ? <span className={card.badge === "Under Review" ? "paper-badge paper-badge-muted" : "paper-badge"}>{card.badge}</span> : null}
    </>
  ) : null

  return (
    <div className="flex min-h-0 flex-1 gap-3 md:gap-5">
      {figure ? (
        <div className="w-[112px] shrink-0 md:w-[200px]">
          {primary ? (
            <a href={primary.url} target="_blank" rel="noreferrer" className="paper-thumb pointer-events-auto" aria-label={`Open ${card.title}`}>
              {figure}
            </a>
          ) : (
            <div className="paper-thumb">{figure}</div>
          )}
        </div>
      ) : null}

      <div className="liquid-card-scroll pointer-events-auto flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto pr-2" data-story-scroll="true">
        <h3 className="font-orbitron text-[14px] font-semibold leading-snug text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.6)] md:text-[17px]">
          {primary ? (
            <a href={primary.url} target="_blank" rel="noreferrer" className="transition-colors hover:text-cyber-cyan">
              {card.title}
            </a>
          ) : (
            card.title
          )}
        </h3>
        <p className="mt-2 text-[12px] leading-snug text-white/85 md:text-[13px]">
          <AuthorList authors={card.authors ?? []} />
        </p>
        {card.venue ? <p className="mt-1 text-[12px] italic text-white/70 md:text-[13px]">{renderVenue(card.venue)}</p> : null}

        {links.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {links.map((link) => (
              <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" className="paper-link pointer-events-auto">
                <LinkIcon label={link.label} />
                {link.label}
              </a>
            ))}
          </div>
        ) : null}

        {card.note ? <p className="mt-2 text-[12px] italic text-[#ff7a4d] md:text-[13px]">{card.note}</p> : null}
      </div>
    </div>
  )
}
