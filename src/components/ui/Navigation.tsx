const navItems = [
  { label: "OVERVIEW", section: 0 },
  { label: "RESEARCH", section: 1 },
  { label: "PUBLICATIONS", section: 2 },
  { label: "EXPERIENCE", section: 3 },
  { label: "PROJECT", section: 4 },
  { label: "INFO", section: 5 },
]

export function Navigation({
  scrollToSection
}: {
  scrollToSection: (sectionNum: number, options?: { behavior?: ScrollBehavior }) => void
}) {
  return (
    <nav className="fixed top-10 left-1/2 -translate-x-1/2 flex gap-[60px] z-[320] pointer-events-auto">
      {navItems.map((item) => (
        <button
          key={item.label}
          type="button"
          className="group font-orbitron text-xs font-medium tracking-[4px] uppercase text-white/60 relative py-2.5 transition-all duration-400 pointer-events-auto"
          onClick={() => scrollToSection(item.section, { behavior: "smooth" })}
        >
          <span className="relative z-10 group-hover:text-cyber-cyan transition-colors">
            {item.label}
          </span>
          <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-px bg-gradient-to-r from-transparent via-cyber-cyan to-transparent group-hover:w-full transition-all duration-400" />
          <span className="absolute top-2.5 left-0 text-cyber-cyan opacity-0 -translate-y-2.5 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-400 text-shadow-glow">
            {item.label}
          </span>
        </button>
      ))}
    </nav>
  )
}
