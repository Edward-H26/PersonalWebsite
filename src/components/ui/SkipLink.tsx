import { memo } from "react"

interface SkipLinkProps {
  href?: string
  className?: string
}

export const SkipLink = memo(function SkipLink({
  href = "#main-content",
  className = "",
}: SkipLinkProps) {
  return (
    <a
      href={href}
      className={`skip-link ${className}`}
    >
      Skip to main content
    </a>
  )
})
