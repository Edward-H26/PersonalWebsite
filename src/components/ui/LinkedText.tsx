const AUTO_LINK_PATTERN = /(https?:\/\/[^\s)]+)|([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi
const AUTO_LINK_TEST_PATTERN = /^(https?:\/\/[^\s)]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})$/i
const LINK_CLASS = "text-cyber-cyan underline decoration-white/35 underline-offset-4 transition-colors hover:text-white"
const OWNER_NAME = "Qiran Hu"

function getAutoLinkUrl(text: string) {
  if (text.includes("@")) return `mailto:${text}`
  return text
}

/** Bolds the site owner's name wherever it appears, so it stands out in author lists and bios. */
function renderOwnerName(text: string, baseKey: string) {
  if (!text.includes(OWNER_NAME)) return text

  return text.split(OWNER_NAME).map((segment, index) => (
    <span key={`${baseKey}-owner-${index}`}>
      {index > 0 ? <strong>{OWNER_NAME}</strong> : null}
      {segment}
    </span>
  ))
}

/** Plain text with bare URLs and email addresses turned into links and the owner's name bolded. */
export function LinkedText({ text }: { text: string }) {
  const parts = text.split(AUTO_LINK_PATTERN).filter(Boolean)

  return (
    <>
      {parts.map((part, index) => {
        if (!AUTO_LINK_TEST_PATTERN.test(part)) {
          return <span key={`auto-text-${index}`}>{renderOwnerName(part, `auto-text-${index}`)}</span>
        }

        return (
          <a
            key={`auto-link-${index}`}
            href={getAutoLinkUrl(part)}
            target={part.includes("@") ? undefined : "_blank"}
            rel={part.includes("@") ? undefined : "noreferrer"}
            className={LINK_CLASS}
          >
            {part}
          </a>
        )
      })}
    </>
  )
}
