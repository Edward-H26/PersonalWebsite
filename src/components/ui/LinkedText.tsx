type TextLink = {
  label: string
  url: string
}

type LinkedTextProps = {
  text: string
  links?: readonly TextLink[]
}

const AUTO_LINK_PATTERN = /(https?:\/\/[^\s)]+)|([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi
const AUTO_LINK_TEST_PATTERN = /^(https?:\/\/[^\s)]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})$/i

function getAutoLinkUrl(text: string) {
  if (text.includes("@")) return `mailto:${text}`
  return text
}

const OWNER_NAME = "Qiran Hu"

function renderOwnerName(text: string, baseKey: string) {
  if (!text.includes(OWNER_NAME)) return text

  return text.split(OWNER_NAME).map((segment, index) => (
    <span key={`${baseKey}-owner-${index}`}>
      {index > 0 ? <strong>{OWNER_NAME}</strong> : null}
      {segment}
    </span>
  ))
}

function renderPlainText(text: string, baseKey: string) {
  const parts = text.split(AUTO_LINK_PATTERN).filter(Boolean)

  return parts.map((part, index) => {
    if (!AUTO_LINK_TEST_PATTERN.test(part)) {
      return <span key={`${baseKey}-text-${index}`}>{renderOwnerName(part, `${baseKey}-text-${index}`)}</span>
    }

    return (
      <a
        key={`${baseKey}-link-${index}`}
        href={getAutoLinkUrl(part)}
        target={part.includes("@") ? undefined : "_blank"}
        rel={part.includes("@") ? undefined : "noreferrer"}
        className="text-cyber-cyan underline decoration-white/35 underline-offset-4 transition-colors hover:text-white"
      >
        {part}
      </a>
    )
  })
}

export function LinkedText({ text, links = [] }: LinkedTextProps) {
  if (links.length === 0) return <>{renderPlainText(text, "auto")}</>

  const escapedLabels = links
    .map((link) => link.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")
  const linkPattern = new RegExp(`(${escapedLabels})`, "g")
  const parts = text.split(linkPattern).filter(Boolean)

  return (
    <>
      {parts.map((part, index) => {
        const link = links.find((item) => item.label === part)
        if (!link) return renderPlainText(part, `part-${index}`)

        return (
          <a
            key={`${link.url}-${index}`}
            href={link.url}
            target={link.url.startsWith("mailto:") ? undefined : "_blank"}
            rel={link.url.startsWith("mailto:") ? undefined : "noreferrer"}
            className="text-cyber-cyan underline decoration-white/35 underline-offset-4 transition-colors hover:text-white"
          >
            {part}
          </a>
        )
      })}
    </>
  )
}
