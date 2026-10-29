import { bulletText, slug } from "./text.mjs"

/** Sections in the order the deck shows them, labelled like the navigation. */
export function getSections(content) {
  const { STAGE_ORDER, NAV_SECTIONS, STORY_STAGES } = content
  return STAGE_ORDER.map((ref) => ({
    label: NAV_SECTIONS.find((item) => item.section === ref.section)?.label ?? STORY_STAGES[ref.stageId].heading,
    stage: STORY_STAGES[ref.stageId]
  }))
}

/** Document-wide unique ids for the cards of a stage (two cards with the same title must not share one). */
export function cardIds(stage) {
  const used = new Set()
  return stage.cards.map((card) => {
    const base = `${stage.id}-${slug(card.title)}`
    let id = base
    for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`
    used.add(id)
    return id
  })
}

/** Email, phone and profile links, read from the Contact card so they are written only once. */
export function getContact(content) {
  const cards = Object.values(content.STORY_STAGES).flatMap((stage) => stage.cards)
  const card = cards.find((entry) => entry.title === "Contact")
  const field = (name) =>
    card?.bullets
      .map(bulletText)
      .find((bullet) => bullet.startsWith(`${name}: `))
      ?.slice(name.length + 2) ?? ""
  return { email: field("Email"), phone: field("Phone"), links: card?.links ?? [] }
}
