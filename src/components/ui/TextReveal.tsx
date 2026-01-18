import { memo, useMemo } from "react"
import { useReducedMotion } from "@/hooks/useReducedMotion"

interface TextRevealProps {
  text: string
  className?: string
  as?: "h1" | "h2" | "h3" | "h4" | "p" | "span" | "div"
  delay?: number
  staggerDelay?: number
  animation?: "fade-up" | "fade-in" | "slide-left" | "slide-right" | "blur"
}

export const TextReveal = memo(function TextReveal({
  text,
  className = "",
  as: Component = "div",
  delay = 0,
  staggerDelay = 0.03,
  animation = "fade-up",
}: TextRevealProps) {
  const prefersReducedMotion = useReducedMotion()

  const words = useMemo(() => text.split(" "), [text])

  if (prefersReducedMotion) {
    return <Component className={className}>{text}</Component>
  }

  const getAnimationStyle = (index: number) => {
    const totalDelay = delay + index * staggerDelay

    const baseStyle = {
      animationDelay: `${totalDelay}s`,
      animationFillMode: "both" as const,
      animationDuration: "0.6s",
      animationTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
    }

    switch (animation) {
      case "fade-up":
        return {
          ...baseStyle,
          animationName: "textRevealFadeUp",
        }
      case "fade-in":
        return {
          ...baseStyle,
          animationName: "textRevealFadeIn",
        }
      case "slide-left":
        return {
          ...baseStyle,
          animationName: "textRevealSlideLeft",
        }
      case "slide-right":
        return {
          ...baseStyle,
          animationName: "textRevealSlideRight",
        }
      case "blur":
        return {
          ...baseStyle,
          animationName: "textRevealBlur",
        }
      default:
        return baseStyle
    }
  }

  return (
    <Component className={className}>
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          className="inline-block opacity-0"
          style={getAnimationStyle(index)}
        >
          {word}
          {index < words.length - 1 ? "\u00A0" : ""}
        </span>
      ))}
    </Component>
  )
})

interface CharacterRevealProps {
  text: string
  className?: string
  as?: "h1" | "h2" | "h3" | "h4" | "p" | "span" | "div"
  delay?: number
  staggerDelay?: number
}

export const CharacterReveal = memo(function CharacterReveal({
  text,
  className = "",
  as: Component = "div",
  delay = 0,
  staggerDelay = 0.02,
}: CharacterRevealProps) {
  const prefersReducedMotion = useReducedMotion()

  const characters = useMemo(() => text.split(""), [text])

  if (prefersReducedMotion) {
    return <Component className={className}>{text}</Component>
  }

  return (
    <Component className={className} aria-label={text}>
      {characters.map((char, index) => (
        <span
          key={`${char}-${index}`}
          className="inline-block opacity-0"
          style={{
            animationName: "textRevealFadeUp",
            animationDelay: `${delay + index * staggerDelay}s`,
            animationFillMode: "both",
            animationDuration: "0.5s",
            animationTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          aria-hidden="true"
        >
          {char === " " ? "\u00A0" : char}
        </span>
      ))}
    </Component>
  )
})
