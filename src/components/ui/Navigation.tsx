import { useEffect, useState } from "react"
import { useReducedMotion } from "@/hooks/useReducedMotion"
import { NAV_SECTIONS } from "@/config/scrollDeckPages"

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
    fixed left-3 right-3 bottom-[calc(env(safe-area-inset-bottom,0px)+12px)] translate-x-0 z-[320] pointer-events-auto
    nav-glass max-w-none rounded-2xl px-2 py-2 overflow-hidden
    md:top-6 md:bottom-auto md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-[72vw] md:max-w-[72vw] md:rounded-full md:px-6
    lg:w-[68vw] lg:max-w-[68vw]
    ${isScrolled && !prefersReducedMotion ? "nav-glass-shrink" : ""}
  `

  return (
    <nav
      className={navClass}
      role="navigation"
      aria-label="Main navigation"
    >
      <ul className="flex items-center gap-1 overflow-x-auto list-none m-0 p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:justify-center md:gap-8 md:overflow-visible lg:gap-10">
        {NAV_SECTIONS.map((item) => {
          const isActive = activeSection === item.section

          return (
            <li key={item.label}>
              <button
                type="button"
                className={`
                  group font-orbitron text-[10px] md:text-xs font-semibold tracking-[1px] md:tracking-[4px] uppercase
                  relative shrink-0 rounded-full px-3 py-2 transition-all duration-400 pointer-events-auto whitespace-nowrap
                  md:rounded-none md:px-0
                  ${isActive ? "bg-white/14 text-white md:bg-transparent" : "text-white/82 hover:bg-white/10 hover:text-white md:hover:bg-transparent"}
                `}
                onClick={() => scrollToSection(item.section, { behavior: "smooth" })}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="relative z-10 transition-colors duration-300">
                  {item.label}
                </span>

                <span
                  className={`
                    absolute bottom-1 left-1/2 -translate-x-1/2 h-px
                    bg-gradient-to-r from-transparent via-cyber-cyan to-transparent
                    transition-all duration-400
                    ${isActive ? "w-full opacity-100" : "w-0 opacity-0 group-hover:w-full group-hover:opacity-60"}
                  `}
                />

                {!prefersReducedMotion && (
                  <span
                    className={`
                      absolute top-2 left-0 hidden text-cyber-cyan md:block
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
