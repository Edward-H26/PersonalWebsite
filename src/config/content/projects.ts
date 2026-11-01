import type { StoryStage } from "./types"

export const PROJECTS_STAGE: StoryStage = {
  id: "air_island",
  heading: "Projects",
  subheading: "Research Projects",
  cards: [
    {
      title: "Long-Form Video-Language and Audio-Visual Social Understanding",
      subtitle: "Undergraduate Research Assistant, University of Illinois Urbana-Champaign",
      location: "Champaign, IL",
      date: "2025.12 - 2026.05",
      bullets: [
        "Trained streaming video-language models with temporal transformer blocks for long-form video understanding beyond 30-minute sequences, boosting zero-shot accuracy by 17.4% and cutting peak memory by 58.2% compared to full-sequence attention.",
        "Proposed multimodal fusion pipelines to combine facial action units, body pose, and prosody through cross-modal attention and infer social intent and conversational role from raw recordings, achieving 89.1% accuracy on speaker-role classification over a 2,108-turn bootstrap.",
        "Scaled end-to-end annotation pipelines for full-length clinical sessions with automatic transcription and labeling, processing recordings 1.4x to 1.7x faster than real time and increasing speaker-role inversion accuracy to 90.0%."
      ]
    },
    {
      title: "Multi-agent Research Synthesis Engine",
      subtitle: "Undergraduate Research Assistant",
      location: "Champaign, IL",
      date: "2025.11 - 2026.05",
      bullets: [
        "Orchestrated eight specialized agents across a 12-step workflow for literature synthesis to cover planning, retrieval, drafting, reflection, and safety review in a single loop with LLM-as-judge evaluation, scoring 0.955 overall and 0.925 on relevance, safety, and clarity.",
        "Developed concurrent multi-source retrieval across Semantic Scholar and Tavily with production-grade fallback handling for API failures, cutting query latency from 8.2 s to 4.9 s, a 40.2% reduction.",
        "Designed customized Model Context Protocol servers to centralize governed tool access behind unified interfaces over academic databases, code repositories, and document stores, cutting serving latency by 87.5%."
      ],
      links: [{ label: "Project Page", url: "https://salt-lab-human-ai-assignment-3-buildi-srcuistreamlit-app-zweknl.streamlit.app/" }]
    },
    {
      title: "Realistic Neural Style Transfer Architecture",
      subtitle: "Undergraduate Research Assistant",
      location: "Champaign, IL",
      date: "2025.01 - 2025.08",
      bullets: [
        "Proposed style transfer frameworks to maintain photorealistic results under highly abstract styles with VGG perceptual losses and edge-preserving constraints, improving SSIM by 77.0% and MS-SSIM by 49.0% compared to TensorFlow's NST.",
        "Optimized multi-layer Gram matrix losses with adaptive layer weighting to suppress texture and chromatic artifacts, boosting SSIM by 4.4x and MS-SSIM by 6.4x compared to ChatGPT-4o."
      ],
      links: [{ label: "GitHub", url: "https://github.com/Edward-H26/Realistic-Neural-Style-Transfer-Architecture" }]
    },
    {
      title: "Anime Statistics and Analysis Platform, ASAP",
      subtitle: "Undergraduate Research Assistant",
      location: "Champaign, IL",
      date: "2025.02 - 2025.06",
      bullets: [
        "Deployed interactive R Shiny analytics platforms to surface anime popularity trends and market opportunities with live Jikan REST API data and predictive analysis on shinyapps.io."
      ],
      links: [{ label: "GitHub", url: "https://github.com/Edward-H26/Anime-Statistics-and-Analysis-Platform-ASAP" }]
    }
  ]
}
