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
      { label: "arXiv", url: "https://arxiv.org/abs/2606.31204" },
      { label: "Code", url: "https://ac3s.cvmlgroup.web.illinois.edu/" },
      { label: "Video", url: "https://youtu.be/3jOJaT2a8iQ" },
      { label: "BibTeX", url: "https://arxiv.org/bibtex/2606.31204" },
    ],
  },
  {
    title: "REVA: Reusable Evidence View Aggregation for Context-Efficient RAG Serving",
    authors: ["Tuan Nguyen", "Qiran Hu", "Banruo Liu", "Khoa D. Doan", "Kok-Seng Wong", "Fan Lai"],
    venue: "IEEE International Conference on Data Mining (ICDM), 2026",
    badge: "ICDM",
    image: paperFigure("reva", "Three charts from the paper: online overhead per query across five compressors, F1 change over global truncation on four QA datasets, and the share of queries that re-access a stored document"),
    links: [
      { label: "arXiv", url: "https://arxiv.org/abs/2609.11209" },
      { label: "Code", url: "https://github.com/UIUC-MLSys/REVA" },
      { label: "BibTeX", url: "https://arxiv.org/bibtex/2609.11209" },
    ],
  },
  {
    title: "ACDN: Agent-Aware Content Delivery Network",
    authors: ["Tuan Nguyen", "Qiran Hu", "Dibyadeep Saha", "Banruo Liu", "Khoa D. Doan", "Kok-Seng Wong", "Fan Lai"],
    venue: "Under Review",
    badge: "Under Review",
    image: paperFigure("acdn", "No public figure yet; this paper is under review"),
  },
  {
    title: "SV4D 3.0: Single-Step 3D-Aware Diffusion for Multi-View-Consistent 4D Scene Generation",
    authors: ["Qiran Hu", "Wei Cao", "Yaoyao Liu"],
    venue: "Under Review",
    badge: "Under Review",
    image: paperFigure("sv4d", "No public figure yet; this paper is under review"),
  },
  {
    title: "AISim: Using LLM-Simulation as Epistemic Scaffolds for Early Stage Qualitative Research Design",
    authors: ["Hangyue Zhang", "Qiran Hu", "Ziyi Zhang", "Hyanghee Park", "Yun Huang"],
    venue: "Under Review",
    badge: "Under Review",
    image: paperFigure("aisim", "No public figure yet; this paper is under review"),
  },
  {
    title: "AlphaWiSE: Adaptive Weight Interpolation for Continual Multimodal Representation Learning",
    authors: ["Sarthak Jain", "Qiran Hu", "Zhen Zhu", "Yaoyao Liu"],
    venue: "Under Review",
    badge: "Under Review",
    image: paperFigure("alphawise", "No public figure yet; this paper is under review"),
  },
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
        location: "Champaign, IL",
        date: "2025.05-Present",
        bullets: [
          "Develop adaptive conditioning methods for 3D-aware synthetic data generation to enhance world model understanding and embodied agent performance in interactive simulations with geometry-conditioned diffusion approaches, reducing FID by 32.8% on ImageNet and enhancing pose accuracy by 4.2x on PASCAL3D+.",
          "Conduct large-scale foundation model training across TB-level datasets on National Center for Supercomputing Applications (NCSA) HPC clusters to enforce multi-view consistency with 4-bit NF4 quantization and low-level custom kernels, improving pose accuracy by 11.3% on PASCAL3D+ and reducing generation latency by 78.7% at p95.",
          "Design camera-controlled novel view synthesis on video generation pipelines to advance real-time perception for SLAM, visual odometry, and 3D reconstruction, decreasing LPIPS by 21.0% on GSO and FV4D by 52.0% on OmniObject3D.",
        ],
        links: [
          { label: "Lab", url: "https://vision.ischool.illinois.edu/people/" },
        ],
      },
      {
        title: "Multimodal Continual Learning Project",
        subtitle: "Undergraduate Research Assistant",
        location: "Champaign, IL",
        date: "2026.02-Present",
        bullets: [
          "Selected for NVIDIA Academic Grant Program Award to streamline multimodal foundation models in class-incremental learning across audio, image, and text without catastrophic forgetting and cross-modal alignment drift, increasing R@1 by 27.6% on AudioSet.",
          "Implement post-hoc tensor-level weight-interpolation methods for multimodal retrieval on National Artificial Intelligence Research Resource (NAIRR) HPC clusters, minimizing trainable parameters from 182M to 499 sigmoid-parameterized coefficients and increasing R@1 by 33.5% on AudioSet.",
          "Optimize checkpoint fusion pipelines to compose frozen checkpoints into one deployable model with no additional inference time, boosting last-task accuracy by 40.9% on UrbanSound8K.",
        ],
        links: [
          { label: "NVIDIA Grant", url: "https://ischool.illinois.edu/news-events/news/2026/04/liu-receives-support-ai-project-through-nvidia-academic-grant-program" },
        ],
      },
      {
        title: "REVA: Reusable Evidence View Aggregation for Context-Efficient RAG Serving",
        subtitle: "Undergraduate Research Assistant, University of Illinois Urbana-Champaign",
        location: "Champaign, IL",
        date: "2026.02-2026.09",
        bullets: [
          "Proposed attention-based scoring for post-retrieval RAG context compression to reuse generator attention traces across queries and update the system offline, achieving a 91.6% cache hit rate on HotpotQA.",
          "Developed reusable evidence views to scale compression cost with unique documents rather than query volume, improving F1 by 13.2% on Natural Questions and decreasing online compression overhead by 6.1x at under 40 ms per request.",
          "Optimized online serving to keep context compression off the GPU critical path for high-volume production RAG traffic under strict per-request latency targets, minimizing compression latency by 99.3% compared to EXIT and 99.8% compared to FaviComp.",
        ],
      },
    ],
  },
  fire_island: {
    id: "fire_island",
    heading: "Publications",
    subheading: "Papers",
    cards: PUBLICATIONS.map((paper, index) => publication(index + 1, paper)),
  },
  professional_experience: {
    id: "professional_experience",
    heading: "Experience",
    subheading: "Professional, Teaching, and Service",
    cards: [
      {
        title: "Memoria",
        subtitle: "Founding Technical Lead",
        location: "Champaign, IL",
        date: "2026.01-Present",
        bullets: [
          "Lead end-to-end agentic workflow deployments across MCP servers, sub-agents, and agent skills, accelerating product delivery by 4.0x compared to traditional approaches.",
          "Maintain production systems for deployed workflows through log reviews and result evaluations, saving 90.5% in serving cost.",
          "Implement self-evolving memory and cost-aware model routing for enterprise workflows to keep persistent per-user context across sessions, saving 96.0% in token cost compared to GPT-4 Turbo.",
        ],
        links: [
          { label: "Website", url: "https://miramemoria.com/" },
        ],
      },
      {
        title: "Two by Two Learning",
        subtitle: "Full Stack Developer",
        location: "Champaign, IL",
        date: "2025.08-2026.08",
        bullets: [
          "Launched NOODEIA to help K-12 students falling behind grade level with multi-agent tutoring systems to plan, critique, and monitor each user with long-horizon memory, boosting user confidence by 2.4x in counterbalanced within-subjects studies.",
          "Implemented self-evolving long-term memory architectures to replace recency-biased FIFO memory architectures by retrieving contextually relevant prior interactions, accelerating memory queries by 3.6x compared to PostgreSQL.",
          "Deployed complexity-aware model selection across planner, retrieval, solver, and critic stages to score each request and reserve frontier-tier inference for priority calls, eliminating 89.9% of monthly serving cost compared to GPT-4o.",
        ],
        links: [
          { label: "Website", url: "https://noodiea.onrender.com/" },
        ],
      },
      {
        title: "WRC, University of Illinois Urbana-Champaign",
        subtitle: "Data Analyst",
        location: "Champaign, IL",
        date: "2024.08-2024.12",
        bullets: [
          "Built paired pre/post analytics pipelines over survey data from 9,935 incoming students to better allocate program resources in the upcoming years, increasing correct responses among the next cohort by 14.0% with 61.9% fewer ambiguous responses.",
          "Conducted A/B tests on two consent scenarios stratified across five gender-identity subgroups to locate where misconceptions persisted after each workshop, increasing accuracy on consent comprehension by 19.5%.",
          "Proposed scenario-based learning modules for underrepresented subgroups by coding open-ended bystander responses into five-theme taxonomies, minimizing spread in direct-intervention rates by 5.6x.",
        ],
      },
      {
        title: "CS 107 Data Science Discovery, University of Illinois Urbana-Champaign",
        subtitle: "Teaching Assistant",
        location: "Champaign, IL",
        date: "2023.08-2026.05",
        bullets: [
          "Led weekly lab sections and office hours for in-person and online sessions, mentoring 1,200 students every semester through data science foundations in Python, statistical inference, data wrangling, and machine learning.",
          "Authored DISCOVERY Guides on the course website to provide detailed explanations with applied Python and statistics walkthroughs.",
          "Designed problem sets, exam questions, test suites, and autograder scripts to deliver instant, consistent feedback to 1,200 students every semester on Mastery Platform.",
        ],
        links: [
          { label: "Guides", url: "https://discovery.cs.illinois.edu/guides/" },
          { label: "Mastery", url: "https://mastery.cs.illinois.edu/" },
        ],
      },
      {
        title: "OnePromptClaudeCode",
        subtitle: "Lead Developer",
        date: "2026.03-Present",
        bullets: [
          "Lead development of an MIT-licensed open-source agent harness for agentic software development, minimizing setup time by 99.5%.",
          "Design three-tier capability routers for the agent harness to optimize tokens, latency, and cost on every turn, with keyword matching and session-memory recall ahead of a 4.5 s model reasoning pass, resolving intent in 120 ms and running 37.5x faster than routing every prompt through the model.",
          "Implement secure agent execution runtime with four lifecycle hooks to gate every tool call before it runs, eliminating 92.7% of router latency.",
        ],
        links: [
          { label: "GitHub", url: "https://github.com/Edward-H26/OnePromptClaudeCode" },
        ],
      },
    ],
  },
  air_island: {
    id: "air_island",
    heading: "Projects",
    subheading: "Research Projects",
    cards: [
      {
        title: "Long-Form Video-Language and Audio-Visual Social Understanding",
        subtitle: "Undergraduate Research Assistant, University of Illinois Urbana-Champaign",
        location: "Champaign, IL",
        date: "2025.12-2026.05",
        bullets: [
          "Trained streaming video-language models with temporal transformer blocks for long-form video understanding beyond 30-minute sequences, boosting zero-shot accuracy by 17.4%.",
          "Designed context fluidity pipelines to fuse facial action units, body pose, and prosody through cross-modal attention and infer social intent and conversational role from raw recordings, achieving 89.1% accuracy on speaker-role classification.",
          "Built end-to-end annotation pipelines for full-length clinical sessions with automatic transcription and labeling, increasing speaker-role inversion accuracy to 90.0%.",
        ],
      },
      {
        title: "Multi-agent Research Synthesis Engine",
        subtitle: "Undergraduate Research Assistant",
        location: "Champaign, IL",
        date: "2025.11-2026.05",
        bullets: [
          "Orchestrated eight specialized agents across a 12-step workflow for automated literature synthesis to cover planning, retrieval, drafting, reflection, and safety review in a single loop with LLM-as-judge evaluation, achieving 95.5% accuracy on deep research pipelines.",
          "Developed concurrent multi-source retrieval across Semantic Scholar and Tavily with production-grade fallback handling for API failures, minimizing query latency by 40.2%.",
          "Built customized Model Context Protocol servers to centralize governed tool access behind unified interfaces over academic databases, code repositories, and document stores, minimizing serving latency by 87.5%.",
        ],
        links: [
          { label: "Project Page", url: "https://salt-lab-human-ai-assignment-3-buildi-srcuistreamlit-app-zweknl.streamlit.app/" },
        ],
      },
      {
        title: "Realistic Neural Style Transfer Architecture",
        subtitle: "Undergraduate Research Assistant",
        date: "2025.01-2025.08",
        bullets: [
          "Proposed style transfer frameworks to maintain photorealistic results under highly abstract styles with VGG perceptual losses and edge-preserving constraints, improving SSIM by 77.0% and MS-SSIM by 49.0% compared to TensorFlow's NST.",
          "Proposed multi-layer Gram matrix losses with adaptive layer weighting to suppress texture and chromatic artifacts, boosting SSIM by 4.4x and MS-SSIM by 6.4x compared to ChatGPT-4o.",
        ],
        links: [
          { label: "GitHub", url: "https://github.com/Edward-H26/Realistic-Neural-Style-Transfer-Architecture" },
        ],
      },
      {
        title: "Anime Statistics and Analysis Platform, ASAP",
        subtitle: "Undergraduate Research Assistant",
        date: "2025.02-2025.06",
        bullets: [
          "Deployed interactive R Shiny analytics platforms to surface anime popularity trends and market opportunities with live Jikan REST API data and predictive analysis on shinyapps.io.",
        ],
        links: [
          { label: "GitHub", url: "https://github.com/Edward-H26/Anime-Statistics-and-Analysis-Platform-ASAP" },
        ],
      },
    ],
  },
  water_island: {
    id: "water_island",
    heading: "Info",
    subheading: "Education, Skills, and Contact",
    cards: [
      {
        title: "Technical Skills",
        bullets: [
          "Programming Languages and AI/ML Frameworks: Python, C++, C, Rust, Go, Java, Swift, Kotlin, Ruby, R, PyTorch, CUDA, JAX, TensorFlow, Triton, TensorRT, vLLM, SGLang, NeMo, Megatron-LM, LangGraph, NCCL, GPU/TPU/CPU Architecture.",
          "Foundation Model Training: Pre-training, Post-training, Test-time Training, Reinforcement Learning, Continual Learning, SFT, RLHF, RLAIF, RLVF, PPO, DPO, GRPO, Reward Modeling, Model Alignment, Synthetic Data Generation, Knowledge Distillation, Quantization, Context Compression, Token Pruning, Kernel Optimization, LoRA, QLoRA, Distributed Training, FSDP.",
          "Computer Vision and Agentic AI: World Models, Diffusion Models, Autoregressive Models, Flow Matching, 3D/4D Generation, Multi-View Geometry, 3D Reconstruction, Novel View Synthesis, Spatial Intelligence, Visual-Inertial Odometry, Depth Estimation, NeRFs, 3D Gaussian Splatting, OpenCV, SLAM, Multi-Agent Orchestration, Sub-Agent Parallelization, Computer-Use Agents, Agent Harness, Policy Guardrails, Context Engineering, Prompt Caching, MCP, A2A, Tool Calling, Autonomous Workflows, Long-Horizon Memory, RAG.",
          "Full-stack, Databases, Infrastructure, and Design: React, Vue, Angular, JavaScript, TypeScript, HTML5, Tailwind CSS, FastAPI, PostgreSQL, Neo4j, MongoDB, Kafka, Docker, Kubernetes, CI/CD, AWS, GCP, Azure, Figma, Canva, Adobe Creative Suite, Microsoft Office Suite, Unity.",
          "Languages: Chinese (Native), English (Native), Spanish (Elementary).",
        ],
      },
      {
        title: "Certifications and Honors",
        bullets: [
          "Neo4j Certified Professional",
          "Neo4j Graph Data Science Certification",
        ],
        links: [
          { label: "Neo4j Professional", url: "https://graphacademy.neo4j.com/c/2e386da7-2b30-4575-9fd0-b0b0918a6fe0/" },
          { label: "Neo4j GDS", url: "https://graphacademy.neo4j.com/c/6559f827-9dca-4199-bc9d-8be10fd74891/" },
        ],
      },
      {
        title: "Education",
        bullets: [
          {
            text: "Columbia University, New York City, NY\nM.S. in Data Science\nFu Foundation School of Engineering and Applied Science\nCourses: High Performance Machine Learning, Algorithms\n2026.08 - 2028.05",
            logo: INSTITUTION_LOGOS.columbia,
            url: "https://www.engineering.columbia.edu/",
          },
          {
            text: "University of Illinois Urbana-Champaign, Champaign, IL\nB.S. in Data Science and Information Science\nMinors: Computer Science and Statistics\nSiebel School of Computing and Data Science\nHonors: Dean's List and James Scholar\nCourses: Applied Machine Learning, Generative AI for Human-AI Collaboration, Advanced AI Web-App Development, Graph Databases, Data Visualization, Computational Photography, Linear Algebra with Computational Applications\n2022.08 - 2026.05",
            logo: INSTITUTION_LOGOS.illinois,
            url: "https://siebelschool.illinois.edu/",
          },
        ],
      },
      {
        title: "Contact",
        bullets: [
          "Email: qh2332@columbia.edu",
          "Phone: +1 (347)-957-9176",
        ],
        links: [
          { label: "GitHub", url: "https://github.com/Edward-H26" },
          { label: "LinkedIn", url: "https://www.linkedin.com/in/qiranhu/" },
          { label: "X", url: "https://x.com/QiranHu" },
          { label: "Website", url: "https://edward-h26.github.io/" },
          { label: "Google Scholar", url: "https://scholar.google.com/citations?user=4jv03f4AAAAJ&hl=en" },
        ],
      },
    ],
  },
}
