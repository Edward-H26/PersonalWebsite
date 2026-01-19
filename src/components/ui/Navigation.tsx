import { useEffect, useState } from "react"
import { useReducedMotion } from "@/hooks/useReducedMotion"

const navItems = [
  { label: "OVERVIEW", section: 0 },
  { label: "RESEARCH", section: 1 },
  { label: "PUBLICATIONS", section: 2 },
  { label: "EXPERIENCE", section: 3 },
  { label: "PROJECT", section: 4 },
  { label: "INFO", section: 5 },
]

interface NavigationProps {
  scrollToSection: (sectionNum: number, options?: { behavior?: ScrollBehavior }) => void
  activeSection?: number
}

export function Navigation({ scrollToSection, activeSection = 0 }: NavigationProps) {
  const [isScrolled, setIsScrolled] = useState(false)
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const navClass = `
    fixed top-6 left-1/2 -translate-x-1/2 z-[320] pointer-events-auto
    nav-glass w-[88vw] sm:w-auto px-3 sm:px-6 py-2 sm:py-3 max-w-[88vw] sm:max-w-none overflow-x-auto overflow-y-hidden
    ${isScrolled && !prefersReducedMotion ? "nav-glass-shrink" : ""}
  `

  return (
    <nav
      className={navClass}
      role="navigation"
      aria-label="Main navigation"
    >
      <ul className="flex flex-nowrap justify-start sm:justify-center gap-1.5 sm:gap-8 md:gap-12 list-none m-0 p-0 whitespace-nowrap">
        {navItems.map((item) => {
          const isActive = activeSection === item.section

          return (
            <li key={item.label}>
              <button
                type="button"
                className={`
                  group font-orbitron text-[8px] sm:text-[10px] md:text-xs font-semibold tracking-[1.5px] sm:tracking-[3px] md:tracking-[4px] uppercase
                  relative py-2 transition-all duration-400 pointer-events-auto
                  ${isActive ? "text-white" : "text-white/85 hover:text-white"}
                `}
                onClick={() => scrollToSection(item.section, { behavior: "smooth" })}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="relative z-10 transition-colors duration-300">
                  {item.label}
                </span>

                <span
                  className={`
                    absolute bottom-0 left-1/2 -translate-x-1/2 h-px
                    bg-gradient-to-r from-transparent via-cyber-cyan to-transparent
                    transition-all duration-400
                    ${isActive ? "w-full opacity-100" : "w-0 opacity-0 group-hover:w-full group-hover:opacity-60"}
                  `}
                />

                {!prefersReducedMotion && (
                  <span
                    className={`
                      absolute top-2 left-0 text-cyber-cyan
                      transition-all duration-400 text-shadow-glow
                      ${isActive ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 group-hover:opacity-60 group-hover:translate-y-0"}
                    `}
                    aria-hidden="true"
                  >
                    {item.label}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
