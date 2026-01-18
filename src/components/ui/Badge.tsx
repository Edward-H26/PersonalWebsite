import { memo, type ReactNode } from "react"

type BadgeCategory =
  | "research"
  | "publication"
  | "experience"
  | "project"
  | "skill"
  | "tech"
  | "status"
  | "default"

type BadgeStatus = "published" | "in-progress" | "completed" | "planned"

interface BadgeProps {
  children: ReactNode
  category?: BadgeCategory
  status?: BadgeStatus
  size?: "sm" | "md" | "lg"
  className?: string
  interactive?: boolean
  onClick?: () => void
}

export const Badge = memo(function Badge({
  children,
  category = "default",
  status,
  size = "md",
  className = "",
  interactive = false,
  onClick,
}: BadgeProps) {
  const categoryClass = getCategoryClass(category)
  const statusClass = status ? getStatusClass(status) : ""
  const sizeClass = getSizeClass(size)
  const interactiveClass = interactive ? "badge-interactive" : ""

  return (
    <span
      className={`badge ${categoryClass} ${statusClass} ${sizeClass} ${interactiveClass} ${className}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {status && <span className="badge-status-dot" />}
      {children}
    </span>
  )
})

function getCategoryClass(category: BadgeCategory): string {
  switch (category) {
    case "research":
      return "badge-research"
    case "publication":
      return "badge-publication"
    case "experience":
      return "badge-experience"
    case "project":
      return "badge-project"
    case "skill":
      return "badge-skill"
    case "tech":
      return "badge-tech"
    case "status":
      return "badge-status"
    default:
      return "badge-default"
  }
}

function getStatusClass(status: BadgeStatus): string {
  switch (status) {
    case "published":
      return "badge-status-published"
    case "in-progress":
      return "badge-status-in-progress"
    case "completed":
      return "badge-status-completed"
    case "planned":
      return "badge-status-planned"
    default:
      return ""
  }
}

function getSizeClass(size: string): string {
  switch (size) {
    case "sm":
      return "badge-sm"
    case "lg":
      return "badge-lg"
    default:
      return "badge-md"
  }
}

interface BadgeGroupProps {
  children: ReactNode
  className?: string
}

export const BadgeGroup = memo(function BadgeGroup({
  children,
  className = "",
}: BadgeGroupProps) {
  return <div className={`badge-group ${className}`}>{children}</div>
})
