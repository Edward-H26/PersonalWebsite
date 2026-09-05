import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { LinkIcon } from "./LinkIcon"
import { STORY_STAGES } from "@/config/storyContent"

function render(label: string) {
  return renderToStaticMarkup(<LinkIcon label={label} />)
}

describe("LinkIcon", () => {
  it("renders a stroked lucide icon for paper, project, and video links", () => {
    for (const label of ["PDF", "Project Page", "Video", "BibTeX"]) {
      const markup = render(label)
      expect(markup).toContain("<svg")
      expect(markup).toContain('stroke="currentColor"')
      expect(markup).toContain('viewBox="0 0 24 24"')
    }
  })

  it("matches labels case-insensitively", () => {
    expect(render("ARXIV")).toBe(render("arxiv"))
    expect(render("GitHub")).toContain("<svg")
  })

  it("renders brand marks as filled shapes with their own viewBox", () => {
    const x = render("X")
    expect(x).toContain('fill="currentColor"')
    expect(x).toContain('viewBox="0 0 300 271"')
    const scholar = render("Google Scholar")
    expect(scholar).toContain('fill="currentColor"')
  })

  it("renders nothing for unknown labels", () => {
    expect(render("Something Else")).toBe("")
    expect(render("")).toBe("")
  })

  it("honours the size prop", () => {
    expect(render("Video")).toContain('width="12"')
    expect(renderToStaticMarkup(<LinkIcon label="Video" size={20} />)).toContain('width="20"')
  })

  it("covers every link label used in the story content", () => {
    const labels = new Set<string>()
    for (const stage of Object.values(STORY_STAGES)) {
      for (const card of stage.cards) for (const link of card.links ?? []) labels.add(link.label)
    }
    expect(labels.size).toBeGreaterThan(5)
    for (const label of labels) expect(render(label), `missing icon for "${label}"`).toContain("<svg")
  })
})
