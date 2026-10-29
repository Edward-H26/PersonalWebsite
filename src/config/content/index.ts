/**
 * Everything the cards say, one module per stop of the walk. Edit the module that owns the
 * stop; the deck, the SEO generator and the tests all read STORY_STAGES from here.
 */
import { EXPERIENCE_STAGE } from "./experience"
import { INFO_STAGE } from "./info"
import { PROJECTS_STAGE } from "./projects"
import { PUBLICATIONS_STAGE } from "./publications"
import { RESEARCH_STAGE } from "./research"
import { SERVICE_STAGE } from "./service"
import type { StoryStage, StoryStageId } from "./types"

export type { StoryBullet, StoryCard, StoryImage, StoryLink, StoryStage, StoryStageId } from "./types"

/** The stops in deck order, keyed by the island or road stretch they play on. */
export const STORY_STAGES: Record<StoryStageId, StoryStage> = {
  earth_island: RESEARCH_STAGE,
  fire_island: PUBLICATIONS_STAGE,
  professional_experience: EXPERIENCE_STAGE,
  service: SERVICE_STAGE,
  air_island: PROJECTS_STAGE,
  water_island: INFO_STAGE
}
