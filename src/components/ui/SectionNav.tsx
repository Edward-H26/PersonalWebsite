const sections: { title: string; section: number }[] = [
  { title: "Research", section: 1 },
  { title: "Publications", section: 2 },
  { title: "Experience", section: 3 },
  { title: "Project", section: 4 },
  { title: "Info", section: 5 }
]

export function SectionNav({
  section,
  scrollToSection
}: {
  section: number
  scrollToSection: (sectionNum: number, options?: { behavior?: ScrollBehavior }) => void
}) {
  const handleClick = (sectionNum: number) => {
    scrollToSection(sectionNum, { behavior: "smooth" })
  }

  return (
    <div className="fixed right-[30px] top-1/2 -translate-y-1/2 flex flex-col gap-4 z-[200]">
      {sections.map((item, index) => (
        <button
          key={index}
          className={`w-3 h-3 rounded-full border-2 transition-all duration-300 ${
            section === item.section
              ? "bg-cyber-cyan border-cyber-cyan shadow-[0_0_15px_rgba(6,182,212,0.6)]"
              : "bg-transparent border-white/30 hover:border-cyber-violet"
          }`}
          onClick={() => handleClick(item.section)}
          title={item.title}
        />
      ))}
    </div>
  )
}
