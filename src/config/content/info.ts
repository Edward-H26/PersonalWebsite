import { INSTITUTION_LOGOS } from "@/config/profile"
import type { StoryStage } from "./types"

export const INFO_STAGE: StoryStage = {
  id: "water_island",
  heading: "Info",
  subheading: "Education, Skills, and Contact",
  cards: [
    {
      title: "Technical Skills",
      bullets: [
        "Programming Languages and AI/ML Frameworks: Python, C++, C, Rust, Go, Java, Swift, Kotlin, Ruby, R, PyTorch, CUDA, JAX, TensorFlow, Triton, TensorRT, vLLM, SGLang, NeMo, Megatron-LM, LangGraph, NCCL, GPU/TPU/CPU architecture.",
        "Foundation Model Training: continual learning, synthetic data generation, distributed training, quantization, context compression, knowledge distillation, pre-training, post-training, reinforcement learning, RLHF, reward modeling, supervised fine-tuning (SFT), direct preference optimization (DPO), PPO, GRPO, RLAIF, RLVF, model alignment and instruction following, test-time training, token pruning, kernel optimization, LoRA, QLoRA, FSDP.",
        "Computer Vision and Agentic AI: diffusion models, 3D/4D image and video generation, novel view synthesis, multi-view geometry consistency, 3D reconstruction, world models, depth estimation, visual-inertial odometry, SLAM, spatial intelligence, autoregressive models, flow matching, NeRFs, 3D Gaussian Splatting, OpenCV, multi-agent orchestration, tool calling, agent harness, long-horizon agent memory, context engineering, RAG, MCP, policy guardrails, sub-agent parallelization, prompt caching, computer-use agents, A2A.",
        "Full-stack, Databases, Infrastructure, and Design: TypeScript, JavaScript, React, Tailwind CSS, FastAPI, HTML5, Vue, Angular, PostgreSQL, Neo4j, MongoDB, Kafka, Docker, Kubernetes, CI/CD, cloud platforms (AWS, GCP, Azure), Figma, Canva, Adobe Creative Suite, Microsoft Office Suite, Unity.",
        "Languages: Chinese (native), English (native), Spanish (limited working proficiency)."
      ]
    },
    {
      title: "Certifications and Honors",
      bullets: ["Neo4j Certified Professional", "Neo4j Graph Data Science Certification"],
      links: [
        { label: "Neo4j Professional", url: "https://graphacademy.neo4j.com/c/2e386da7-2b30-4575-9fd0-b0b0918a6fe0/" },
        { label: "Neo4j GDS", url: "https://graphacademy.neo4j.com/c/6559f827-9dca-4199-bc9d-8be10fd74891/" }
      ]
    },
    {
      title: "Education",
      bullets: [
        {
          text: "Columbia University, New York, NY\nM.S. in Data Science\nFu Foundation School of Engineering and Applied Science\nCourses: High Performance Machine Learning, Algorithms, Continual Learning and Memory Models, Computer Systems\n2026.09 - Expected 2028.05",
          logo: INSTITUTION_LOGOS.columbia,
          url: "https://www.engineering.columbia.edu/"
        },
        {
          text: "University of Illinois Urbana-Champaign, Champaign, IL\nB.S. in Data Science and Information Science\nMinors: Computer Science and Statistics\nSiebel School of Computing and Data Science\nHonors: Dean's List and James Scholar\nCourses: Applied Machine Learning, Generative AI for Human-AI Collaboration, Advanced AI Web-App Development, Graph Databases, Data Visualization, Computational Photography, Linear Algebra with Computational Applications\n2022.08 - 2026.05",
          logo: INSTITUTION_LOGOS.illinois,
          url: "https://www.illinois.edu/"
        }
      ]
    },
    {
      title: "Contact",
      bullets: ["Email: qh2332@columbia.edu", "Phone: +1 (347) 957-9176"],
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
