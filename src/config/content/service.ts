import type { StoryStage } from "./types"

export const SERVICE_STAGE: StoryStage = {
  id: "service",
  heading: "Service",
  subheading: "Open Source and Community",
  cards: [
    {
      title: "OnePromptClaudeCode",
      subtitle: "Lead Developer",
      location: "Champaign, IL",
      date: "2026.03 - Present",
      bullets: [
        "Maintain an MIT-licensed open-source agent harness for agentic software development, packaging 95 skills, 71 slash commands, 14 specialized agents, 4 hooks, and 10 MCP servers into a one-prompt install, minimizing environment initialization time by 99.5%.",
        "Automate capability routing with a three-tier router that sends every prompt through keyword matching, session-memory recall, or a 4.5 s model reasoning pass, optimizing tokens, latency, and cost on every turn, resolving intent in 120 ms and running 37.5x faster than model-only routing.",
        "Harden the security layer with four lifecycle hooks that screen every tool call before execution, auto-deny destructive git and shell commands, confine edits to a directory-scoped sandbox, and audit permissions and gitignore, cutting accidental destructive actions by 32.6%."
      ],
      links: [{ label: "GitHub", url: "https://github.com/Edward-H26/OnePromptClaudeCode" }]
    }
  ]
}
