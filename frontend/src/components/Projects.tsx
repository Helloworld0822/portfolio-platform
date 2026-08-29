import { useState } from "react";
import ProjectModal, { type Project } from "./ProjectModal";

const PROJECTS_PER_PAGE = 6;

const projects: Project[] = [
  {
    title: "AutoForge",
    description:
      "PDF 계획서를 업로드하면 AI 파이프라인이 요약·기획·디자인·구현까지 자동 실행하는 외주 자동화 프로그램.",
    details: [
      "Haiku → Sonnet → Stitch → Codex 5.3 순서의 AI 파이프라인을 구성했습니다.",
      "Rust(Actix-web) 백엔드와 React + Vite 프론트엔드로 구현했습니다.",
      "Docker / Nginx 기반으로 배포 환경을 구성했습니다.",
    ],
    tags: ["Rust", "React", "TypeScript", "Docker"],
    status: "진행 중",
    period: "2026",
    role: "개인 프로젝트",
    url: "https://github.com/Helloworld0822/AutoForge",
  },
  {
    title: "Rental Web",
    description:
      "Rust + Elixir 스택으로 구축한 단일 테넌트 렌탈 마켓플레이스. 라즈베리파이부터 클라우드까지 확장 가능.",
    details: [
      "Raspberry Pi 5 및 Kubernetes 환경에서 동작하도록 설계했습니다.",
      "Rust와 Elixir를 조합한 풀스택 아키텍처를 적용했습니다.",
      "Oracle Cloud 무료 티어까지 코드 변경 없이 스케일업이 가능합니다.",
    ],
    tags: ["Rust", "Elixir", "Kubernetes"],
    status: "진행 중",
    period: "2025 — 2026",
    role: "개인 프로젝트",
    url: "https://github.com/Helloworld0822/rental_web",
  },
  {
    title: "Taskloops",
    description:
      "할 일 관리 플랫폼. Elixir 백엔드, React 프론트엔드, E2E 테스트, Docker/K8s 배포 환경으로 구성.",
    details: [
      "Elixir 백엔드 API와 React(Vite) 프론트엔드를 개발했습니다.",
      "Playwright 기반 E2E 테스트 스위트를 구축했습니다.",
      "Docker Compose, nginx gateway, Kubernetes 매니페스트를 포함한 플랫폼 레포를 운영합니다.",
    ],
    tags: ["Elixir", "React", "TypeScript", "Docker"],
    status: "진행 중",
    period: "2026",
    role: "Taskloops",
    url: "https://github.com/Taskloops",
  },
  {
    title: "Forge",
    description:
      "Forge 프로그래밍 언어 생태계 — 컴파일러·런타임, LSP, VS Code/Cursor 확장.",
    details: [
      "C로 컴파일러, 런타임, 표준 라이브러리를 구현했습니다.",
      "TypeScript 기반 Language Server Protocol을 제공합니다.",
      "VS Code 및 Cursor용 확장 프로그램을 개발했습니다.",
    ],
    tags: ["C", "TypeScript", "LSP"],
    status: "진행 중",
    period: "2026",
    role: "forge-language",
    url: "https://github.com/forge-language",
  },
  {
    title: "2026 Mini Project",
    description:
      "2026 미니 프로젝트. Elixir 백엔드와 TypeScript 프론트엔드 풀스택 구성.",
    details: [
      "Elixir 기반 백엔드 API를 개발했습니다.",
      "TypeScript 프론트엔드와 연동했습니다.",
    ],
    tags: ["Elixir", "TypeScript"],
    status: "완료",
    period: "2026",
    role: "2026-mini-project",
    url: "https://github.com/2026-mini-project",
  },
  {
    title: "Web IDE",
    description: "브라우저에서 동작하는 웹 기반 IDE 프로젝트.",
    details: [
      "TypeScript 기반으로 웹 IDE 환경을 구현했습니다.",
      "코드 편집 및 개발 워크플로우를 브라우저에서 제공합니다.",
    ],
    tags: ["TypeScript", "React"],
    status: "완료",
    period: "2026",
    role: "개인 프로젝트",
    url: "https://github.com/Helloworld0822/web_ide",
  },
  {
    title: "DayFlow",
    description: "일정과 업무 흐름을 관리하는 웹 애플리케이션.",
    details: [
      "TypeScript와 React로 프론트엔드를 구축했습니다.",
      "사용자 일정 관리 기능을 중심으로 설계했습니다.",
    ],
    tags: ["TypeScript", "React"],
    status: "완료",
    period: "2025 — 2026",
    role: "개인 프로젝트",
    url: "https://github.com/Helloworld0822/DayFlow",
  },
  {
    title: "ChatGend",
    description: "AI 기반 채팅 생성 및 관리 웹 서비스.",
    details: [
      "TypeScript 기반 풀스택 웹 애플리케이션입니다.",
      "채팅 생성 및 관리 기능을 제공합니다.",
    ],
    tags: ["TypeScript", "React"],
    status: "완료",
    period: "2025 — 2026",
    role: "개인 프로젝트",
    url: "https://github.com/Helloworld0822/ChatGend",
  },
  {
    title: "Crackseal",
    description:
      "선린톤 해커톤 프로젝트. Crackseal 서비스 개발.",
    details: [
      "선린톤 해커톤용 Starter Kit을 제작했습니다.",
      "TypeScript 기반 Crackseal 프로젝트를 개발했습니다.",
    ],
    tags: ["TypeScript", "React"],
    status: "완료",
    period: "2026",
    role: "sunrinthon-jaemin40",
    url: "https://github.com/sunrinthon-jaemin40",
  },
  {
    title: "Invest Web",
    description:
      "존 네프의 투자 방식을 한국 시장에 맞게 변형한 투자 분석 웹사이트.",
    details: [
      "Rust로 백엔드 API와 투자 로직을 구현했습니다.",
      "유명 투자자 John Neff의 투자 전략을 한국 맥락에 맞게 적용했습니다.",
    ],
    tags: ["Rust", "Web"],
    status: "완료",
    period: "2025",
    role: "개인 프로젝트",
    url: "https://github.com/Helloworld0822/invest_web",
  },
];

const statusStyles: Record<string, string> = {
  "진행 중": "bg-primary/10 text-primary",
  완료: "bg-success/10 text-success",
};

const pageCount = Math.ceil(projects.length / PROJECTS_PER_PAGE);

const Projects = () => {
  const [selected, setSelected] = useState<Project | null>(null);
  const [page, setPage] = useState(0);

  const visibleProjects = projects.slice(
    page * PROJECTS_PER_PAGE,
    page * PROJECTS_PER_PAGE + PROJECTS_PER_PAGE,
  );

  return (
    <section id="projects" className="bg-canvas px-4 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-3xl font-semibold tracking-tight text-navy">프로젝트</h2>
        <p className="mt-2 text-ink-muted">GitHub에서 진행한 주요 프로젝트.</p>

        <div className="mt-10 overflow-hidden">
          <div
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:grid-rows-2"
            key={page}
          >
            {visibleProjects.map((project) => (
              <button
                key={project.title}
                type="button"
                onClick={() => setSelected(project)}
                className="group flex cursor-pointer flex-col rounded-lg border border-border bg-canvas p-6 text-left shadow-card transition-shadow duration-[240ms] hover:shadow-elevated"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold text-ink transition-colors duration-[240ms] group-hover:text-primary">
                    {project.title}
                  </h3>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[project.status]}`}
                  >
                    {project.status}
                  </span>
                </div>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-muted">
                  {project.description}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {project.tags.map((tag) => (
                    <span key={tag} className="text-xs text-ink-subdued">
                      {tag}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>

        {pageCount > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            {Array.from({ length: pageCount }).map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setPage(index)}
                aria-label={`${index + 1}페이지`}
                aria-current={page === index ? "true" : undefined}
                className={`size-2.5 rounded-full transition-colors duration-[240ms] ${
                  page === index ? "bg-primary" : "bg-border hover:bg-ink-subdued"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      <ProjectModal project={selected} onClose={() => setSelected(null)} />
    </section>
  );
};

export default Projects;
