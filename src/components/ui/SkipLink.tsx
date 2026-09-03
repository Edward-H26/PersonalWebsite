import { memo } from "react"

export const SkipLink = memo(function SkipLink() {
  return (
    <a href="#main-content" className="skip-link">
      Skip to main content
    </a>
  )
})
