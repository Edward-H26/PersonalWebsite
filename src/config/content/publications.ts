import { withBase } from "@/utils/assets"
import type { StoryCard, StoryImage, StoryStage } from "./types"

type Paper = Omit<StoryCard, "bullets" | "authors" | "venue" | "image"> & {
  authors: string[]
  venue: string
  image?: StoryImage
}

// The citation bullet ("[n] A, B, C. Title. Venue.") is what the SEO generator, llms.txt, and
// the tests read, so it is derived from the structured fields instead of being written twice.
function publication(index: number, paper: Paper): StoryCard {
  return { ...paper, bullets: [`[${index}] ${paper.authors.join(", ")}. ${paper.title}. ${paper.venue}.`] }
}

const paperFigure = (id: string, alt: string): StoryImage => ({ src: withBase(`/images/papers/${id}.webp`), alt })

// README order; the citation number comes from the position in this list.
const PUBLICATIONS: Paper[] = [
  {
    title: "AC3S: Adaptive Conditioning for 3D-Aware Synthetic Data Generation",
    authors: ["Eric Ji", "Qiran Hu", "Wufei Ma", "Sarthak Jain", "Yingying Li", "Minh N. Do", "Yaoyao Liu"],
    venue: "European Conference on Computer Vision (ECCV) 2026",
    badge: "ECCV",
    image: paperFigure("ac3s", "AC3S pipeline: visual prompt extractor, adaptive modulator, image generator, and multi-agent VLM"),
    links: [
      { label: "arXiv", url: "https://arxiv.org/abs/2606.31204" },
      { label: "Code", url: "https://ac3s.cvmlgroup.web.illinois.edu/" },
      { label: "Video", url: "https://youtu.be/3jOJaT2a8iQ" },
      { label: "BibTeX", url: "https://arxiv.org/bibtex/2606.31204" }
    ]
  },
  {
    title: "REVA: Reusable Evidence View Aggregation for Context-Efficient RAG Serving",
    authors: ["Tuan Nguyen", "Qiran Hu", "Banruo Liu", "Khoa D. Doan", "Kok-Seng Wong", "Fan Lai"],
    venue: "IEEE International Conference on Data Mining (ICDM) 2026",
    badge: "ICDM",
    image: paperFigure(
      "reva",
      "The REVA system: past requests leave reusable word scores in a word-score store, and a new request materializes per-document views from them"
    ),
    links: [
      { label: "arXiv", url: "https://arxiv.org/abs/2609.11209" },
      { label: "Code", url: "https://github.com/UIUC-MLSys/REVA" },
      { label: "BibTeX", url: "https://arxiv.org/bibtex/2609.11209" }
    ]
  },
  {
    title: "ACDN: Agent-Aware Content Delivery Network",
    authors: ["Tuan Nguyen", "Qiran Hu", "Dibyadeep Saha", "Banruo Liu", "Khoa D. Doan", "Kok-Seng Wong", "Fan Lai"],
    venue: "Under review",
    badge: "Under review",
    image: paperFigure("acdn", "No public figure yet; this paper is under review")
  },
  {
    title: "SV4D 3.0: Single-Step 3D-Aware Diffusion for Multi-View-Consistent 4D Scene Generation",
    authors: ["Qiran Hu", "Wei Cao", "Yaoyao Liu"],
    venue: "Under review",
    badge: "Under review",
    image: paperFigure("sv4d", "No public figure yet; this paper is under review")
  },
  {
    title: "AISim: Using LLM-Simulation as Epistemic Scaffolds for Early Stage Qualitative Research Design",
    authors: ["Hangyue Zhang", "Qiran Hu", "Ziyi Zhang", "Hyanghee Park", "Yun Huang"],
    venue: "Under review",
    badge: "Under review",
    image: paperFigure("aisim", "No public figure yet; this paper is under review")
  },
  {
    title: "AlphaWiSE: Adaptive Weight Interpolation for Continual Multimodal Representation Learning",
    authors: ["Sarthak Jain", "Qiran Hu", "Zhen Zhu", "Yaoyao Liu"],
    venue: "Under review",
    badge: "Under review",
    image: paperFigure("alphawise", "No public figure yet; this paper is under review")
  }
]

export const PUBLICATIONS_STAGE: StoryStage = {
  id: "fire_island",
  heading: "Publications",
  subheading: "Papers",
  cards: PUBLICATIONS.map((paper, index) => publication(index + 1, paper))
}
