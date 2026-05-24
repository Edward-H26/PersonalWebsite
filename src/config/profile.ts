import { withBase } from "@/utils/assets"

export const PROFILE_OVERVIEW = {
  greeting: "Hi! I'm",
  name: "Qiran Hu",
  bio: "I am an applied AI researcher and full-stack software engineer creating new ways for people to interact with AI. I push the frontier of agentic experiences through rapid internal experiments. My research spans self-evolving multi-agent orchestration, dynamic context engineering for long-term memory, 3D-aware generative modeling, multimodal reasoning, and the next generation of human-AI interfaces.",
  institutions: [
    {
      name: "Columbia Engineering",
      image: withBase("/images/columbia-engineering-crown.png")
    },
    {
      name: "University of Illinois Urbana-Champaign",
      image: withBase("/images/uiuc-block-i.svg")
    }
  ]
} as const
