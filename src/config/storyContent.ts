export type StoryStageId =
  | "earth_island"
  | "fire_island"
  | "professional_experience"
  | "air_island"
  | "water_island"

import { INSTITUTION_LOGOS } from "@/config/profile"
import { withBase } from "@/utils/assets"

type StoryLink = {
  label: string
  url: string
}

export type StoryImage = {
  src: string
  alt: string
}

export type StoryBullet =
  | string
  | {
      text: string
      logo: { name: string; image: string }
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

type Paper = Omit<StoryCard, "bullets" | "authors" | "venue" | "image"> & {
  authors: string[]
  venue: string
  image?: StoryImage
}

// The citation bullet ("[n] A, B, and C. Title. Venue.") is what the SEO generator, llms.txt, and
// the tests read, so it is derived from the structured fields instead of being written twice.
function publication(index: number, paper: Paper): StoryCard {
  const names = paper.authors.length > 1 ? `${paper.authors.slice(0, -1).join(", ")}, and ${paper.authors[paper.authors.length - 1]}` : paper.authors[0]
  return { ...paper, bullets: [`[${index}] ${names}. ${paper.title}. ${paper.venue}.`] }
}

const paperFigure = (id: string, alt: string): StoryImage => ({ src: withBase(`/images/papers/${id}.webp`), alt })

type StoryStage = {
  id: StoryStageId
  heading: string
  subheading?: string
  cards: StoryCard[]
}

// README order; the citation number comes from the position in this list.
const PUBLICATIONS: Paper[] = [
  {
    title: "AC3S: Adaptive Conditioning for 3D-Aware Synthetic Data Generation",
    authors: ["Eric Ji", "Qiran Hu", "Wufei Ma", "Sarthak Jain", "Yingying Li", "Minh N. Do", "Yaoyao Liu"],
    venue: "European Conference on Computer Vision (ECCV), 2026",
    badge: "ECCV",
    image: paperFigure("ac3s", "AC3S pipeline: visual prompt extractor, adaptive modulator, image generator, and multi-agent VLM"),
    links: [
      { label: "PDF", url: "https://arxiv.org/pdf/2606.31204" },
      { label: "Project Page", url: "https://ac3s.cvmlgroup.web.illinois.edu/" },
      { label: "Video", url: "https://youtu.be/3jOJaT2a8iQ" },
      { label: "BibTeX", url: "https://arxiv.org/bibtex/2606.31204" }
    ]
  },
  {
    title: "Crowdsourced Open-Source Research: A Research Paradigm Probe",
    authors: ["Hangyue Zhang", "Qiran Hu", "Ziyi Zhang", "Yun Huang"],
    venue: "Under Review",
    badge: "Under Review",
    image: paperFigure("crowdsourced", "Contributors feeding a shared open research record")
  },
  {
    title: "Context Under Budget: A Controlled Benchmark for Post-Retrieval Compression in Retrieval-Augmented Generation",
    authors: ["Tuan Minh Nguyen", "Qiran Hu", "Banruo Liu", "Khoa D Doan", "Kok-Seng Wong", "Fan Lai"],
    venue: "Under Review",
    badge: "Under Review",
    image: paperFigure("context-under-budget", "Retrieved documents compressed into a compact context for a model")
  },
  {
    title: "AlphaWiseFT: Adaptive Weight Interpolation for Continual Multimodal Representation Learning",
    authors: ["Sarthak Jain", "Qiran Hu", "Zhen Zhu", "Yaoyao Liu"],
    venue: "Under Review",
    badge: "Under Review",
    image: paperFigure("alphawiseft", "Two model checkpoints blended into one fused model")
  }
]

export const STORY_STAGES: Record<StoryStageId, StoryStage> = {
  earth_island: {
    id: "earth_island",
    heading: "Research",
    subheading: "Labs and Experience",
    cards: [
      {
        title: "UIUC Computer Vision and Machine Learning Group",
        subtitle: "Undergraduate Research Assistant - Advised by Professor Yaoyao Liu",
        bullets: [
          "Develop 3D-consistent generative models for world understanding and embodied AI, and implement diffusion-based approaches for spatially coherent scene synthesis with applications in interactive simulation.",
          "Investigate real-time 3D reconstruction methods for interactive experiences and integrate neural rendering with depth estimation for embodied agent perception systems.",
          "Train large-scale vision transformers on TB-level image datasets using a high-performance computing cluster through distributed training at the National Center for Supercomputing Applications (NCSA), optimizing spatial tokenization and enforcing multi-view consistency for 3D-aware diffusion-based scene generation."
        ],
        links: [
          { label: "Lab", url: "https://vision.ischool.illinois.edu/people/" }
        ]
      },
      {
        title: "UIUC Social Computing System Lab",
        subtitle: "Undergraduate Research Assistant - Advised by Professor Yun Huang",
        bullets: [
          "Architect streaming video-language models combining temporal transformer blocks with a Llama-class backbone for long-form video understanding beyond 30-minute sequences with competitive zero-shot accuracy.",
          "Build joint audio-visual perception pipelines for human-centric social understanding, fusing facial action units, body pose dynamics, and acoustic prosody through cross-modal attention to predict social intent and conversational role in clinical sessions.",
          "Design a context fluidity framework for personalized AI adaptation, advancing from static prompt engineering toward dynamic context engineering that models individual communication preferences and emotional states across conversation sessions."
        ],
        links: [
          { label: "Lab", url: "https://socialcomputing.web.illinois.edu/" }
        ]
      }
    ]
  },
  fire_island: {
    id: "fire_island",
    heading: "Publications",
    subheading: "Papers",
    cards: PUBLICATIONS.map((paper, index) => publication(index + 1, paper))
  },
  professional_experience: {
    id: "professional_experience",
    heading: "Experience",
    subheading: "Professional and Leadership Experience",
    cards: [
      {
        title: "Computer Vision and Machine Learning Group",
        subtitle: "Undergraduate Research Assistant",
        location: "Champaign, IL",
        date: "2025.05-Present",
        bullets: [
          "Designed a consistency-trajectory distillation framework that compresses multi-step 3D-aware diffusion teachers into single-step student samplers conditioned on 3D pose and depth.",
          "Built a parameter-efficient continual-learning pipeline for billion-parameter large multimodal models, extending the partial-retraining methodology with Fisher-aware adapter routing.",
          "Generalized weight-space interpolation from Euclidean linear combinations to Fisher-Rao geodesic interpolation across continual checkpoints.",
          "Conducted experiments on real-time 3D reconstruction and visual-inertial odometry for embodied agent perception systems by evaluating spatial intelligence metrics for world model applications."
        ]
      },
      {
        title: "UIUC Student Affairs, WRC Department",
        subtitle: "Data Analyst",
        location: "Champaign, IL",
        date: "2024.08-2024.12",
        bullets: [
          "Conducted rigorous statistical analysis of student performance metrics and survey responses among 19800 students and implemented a comprehensive data analysis framework for the program.",
          "Leveraged complex institutional datasets to generate actionable insights by enhancing strategic planning processes and contributing to a 6.5% improvement in resource allocation for student success programs.",
          "Designed and implemented comprehensive program evaluation frameworks for key educational initiatives by utilizing mixed-methods research to analyze effectiveness."
        ]
      },
      {
        title: "CS 107 Data Science Discovery, University of Illinois Urbana-Champaign",
        subtitle: "Teaching Assistant",
        location: "Champaign, IL",
        date: "2023.08-Present",
        bullets: [
          "Facilitated weekly in-person/online office hours and lab sections to provide technical assistance for over 2000 students.",
          "Authored instructional content for DISCOVERY's Guides explaining data science concepts through applied Python examples.",
          "Designed advanced problem sets, exam questions, test suites, and autograder scripts for DISCOVERY's Mastery Platform."
        ],
        links: [
          { label: "Guides", url: "https://discovery.cs.illinois.edu/guides/" },
          { label: "Mastery", url: "https://mastery.cs.illinois.edu/" }
        ]
      },
      {
        title: "Student Government, University of Illinois Urbana-Champaign",
        subtitle: "iSchool Student Representative",
        location: "Champaign, IL",
        date: "2022.09-2023.09",
        bullets: [
          "Supervised iSchool community forums to handle student concerns with adherence to predetermined guidelines.",
          "Assisted the university with campus tours for prospective students and parents, answering questions and providing insight.",
          "Secured approval for changes to existing and new activities based on student feedback."
        ]
      }
    ]
  },
  air_island: {
    id: "air_island",
    heading: "Projects",
    subheading: "Research Experience and Projects",
    cards: [
      {
        title: "Multi-modal Generative Models for Large-scale Continual Learning",
        subtitle: "Undergraduate Research Assistant",
        date: "2026.02-Present",
        bullets: [
          "Selected for the NVIDIA Academic Grant Program Award with 32000 A100 GPU-hours allocated on the Brev cloud platform to advance multimodal generative models that continuously incorporate new knowledge across text, image, and 3D data without catastrophic forgetting of previously learned cross-modal alignment.",
          "Scaled multimodal continual-learning experiments across audio, image, and text modalities through distributed training on the National Artificial Intelligence Research Resource (NAIRR), profiling throughput and memory trade-offs to enable post-hoc weight-space fusion at AudioCLIP backbone scale.",
          "Optimized a parameter-efficient post-hoc fusion framework that learns to compose frozen checkpoints from different continual-learning strategies."
        ],
        links: [
          { label: "NVIDIA Grant", url: "https://ischool.illinois.edu/news-events/news/2026/04/liu-receives-support-ai-project-through-nvidia-academic-grant-program" }
        ]
      },
      {
        title: "Multi-agent HCI Research Synthesis Engine",
        subtitle: "Systems Architect",
        date: "2025.11-Present",
        bullets: [
          "Architected an 8-agent orchestration system for HCI literature synthesis, implementing specialized agents of Planner, Researcher, Writer, Critic, SafetyGuardian, ReflexionEngine, LLMJudge, and Evaluation across a 12-step reasoning workflow, achieving 0.955 overall evaluation score, 0.925 on relevance, safety, and clarity.",
          "Designed Model Context Protocol integration for standardized tool interfaces, enabling seamless connection between LLM agents and external data sources, including academic databases, code repositories, and document management systems.",
          "Constructed parallel tool-calling infrastructure integrating Semantic Scholar API and Tavily web search with ThreadPoolExecutor, reducing query latency 40% from 8.2s to 4.9s and adding production-grade fallback handling for API failures."
        ]
      },
      {
        title: "Node Optimized Orchestration Design for Educational Intelligence Architecture",
        subtitle: "Full Stack Developer",
        date: "2025.08-Present",
        bullets: [
          "Built a K-12 intelligent tutoring platform integrating multi-agent orchestration with memory-enhanced GraphRAG and designed an adaptive learning system that personalizes responses beyond static Q&A.",
          "Implemented a self-evolving long-term memory module that retrieves contextually relevant prior interactions, addressing the recency bias of FIFO memory structures used in standard RAG systems.",
          "Deployed to 2 partner institutions and iterated through 6 development cycles incorporating user feedback to refine interface design and response quality based on student engagement data."
        ],
        links: [
          { label: "GitHub", url: "https://github.com/SALT-Lab-Human-AI/project-check-point-1-NOODEIA" }
        ]
      },
      {
        title: "Realistic Neural Style Transfer Architecture",
        subtitle: "Independent Researcher",
        date: "2025.01-2025.08",
        bullets: [
          "Proposed a multi-scale neural style transfer architecture for transferring abstract art styles onto photographic content, combining VGG-based perceptual losses with edge-preserving structural constraints to retain global content geometry.",
          "Reduced texture and chromatic distortion artifacts common in patch-based and single-layer loss formulations through a multi-layer Gram matrix loss with adaptive layer weighting."
        ],
        links: [
          { label: "GitHub", url: "https://github.com/Edward-H26/Realistic-Neural-Style-Transfer-Architecture" }
        ]
      },
      {
        title: "Anime Statistics and Analysis Platform",
        subtitle: "Project Lead",
        date: "2025.02-2025.06",
        bullets: [
          "Built interactive analytics platform using anime data API for popularity trend visualization and predictive analysis of market opportunities."
        ],
        links: [
          { label: "GitHub", url: "https://github.com/Edward-H26/Anime-Statistics-and-Analysis-Platform-ASAP" }
        ]
      }
    ]
  },
  water_island: {
    id: "water_island",
    heading: "Info",
    subheading: "Education, Skills, and Contact",
    cards: [
      {
        title: "Technical Skills",
        bullets: [
          "Technical Stacks: Python, C++, PostgreSQL, Neo4j, MongoDB, React.js, TypeScript, Next.js, Angular.js, Vue.js, JavaScript, HTML5, Tailwind CSS, Ruby, Java, R, Kotlin, PHP, Cloud DevOps, Unity, SAS, Figma, Canva, Microsoft Office Suite, Adobe Creative Suite, and Arduino UNO.",
          "Languages: Chinese (Native), English (Native), Spanish (Elementary)."
        ]
      },
      {
        title: "Certifications and Honors",
        bullets: [
          "Neo4j Certified Professional",
          "Neo4j Graph Data Science Certification",
          "UIUC Dean's List - 2023 Spring, 2024 Fall",
          "UIUC James Scholar"
        ],
        links: [
          { label: "Neo4j Professional", url: "https://graphacademy.neo4j.com/c/2e386da7-2b30-4575-9fd0-b0b0918a6fe0/" },
          { label: "Neo4j GDS", url: "https://graphacademy.neo4j.com/c/6559f827-9dca-4199-bc9d-8be10fd74891/" }
        ]
      },
      {
        title: "Education",
        bullets: [
          {
            text: "Columbia University, New York City, NY\nM.S. in Data Science\nFu Foundation School of Engineering and Applied Science\n2026.08 - 2028.05",
            logo: INSTITUTION_LOGOS.columbia
          },
          {
            text: "University of Illinois Urbana-Champaign, Champaign, IL\nB.S. in Data Science and Information Science\nMinors: Computer Science and Statistics\nSiebel School of Computing and Data Science\n2022.08 - 2026.05",
            logo: INSTITUTION_LOGOS.illinois
          }
        ]
      },
      {
        title: "Contact",
        bullets: [
          "Email: qiranhu8@gmail.com",
          "Phone: +1 (347)-957-9176"
        ],
        links: [
          { label: "GitHub", url: "https://github.com/Edward-H26" },
          { label: "LinkedIn", url: "https://www.linkedin.com/in/qiranhu/" },
          { label: "X", url: "https://x.com/QiranHu" },
          { label: "Website", url: "https://edward-h26.github.io/" },
          { label: "Google Scholar", url: "https://scholar.google.com/citations?user=4jv03f4AAAAJ&hl=en" }
        ]
      }
    ]
  }
}
