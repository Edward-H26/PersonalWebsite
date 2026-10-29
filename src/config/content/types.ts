/** The six stops of the walk, in deck order. Four are islands; two are stretches of road. */
export type StoryStageId = "earth_island" | "fire_island" | "professional_experience" | "service" | "air_island" | "water_island"

export type StoryLink = {
  label: string
  url: string
}

export type StoryImage = {
  src: string
  alt: string
}

/** A plain line of text, or a line with a logo (and optional link) such as an education entry. */
export type StoryBullet =
  | string
  | {
      text: string
      logo: { name: string; image: string }
      url?: string
    }

export type StoryCard = {
  title: string
  subtitle?: string
  location?: string
  date?: string
  bullets: StoryBullet[]
  links?: StoryLink[]
  // Publication cards: a figure with the venue badge, structured authors and venue for the paper
  // layout, and an optional highlight note.
  image?: StoryImage
  badge?: string
  authors?: string[]
  venue?: string
  note?: string
}

/** One stop of the walk: its heading on the title page and the cards shown along the road. */
export type StoryStage = {
  id: StoryStageId
  heading: string
  subheading?: string
  cards: StoryCard[]
}
