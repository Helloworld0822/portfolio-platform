import { useEffect, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useReveal } from "../lib/useReveal";
import ProjectModal, { type Project } from "./ProjectModal";

const PROJECTS_PER_PAGE = 6;

interface ApiProject {
  id: string;
  title: string;
  description: string;
  details: string[];
  tags: string[];
  status: string;
  period: string | null;
  role: string | null;
  url: string | null;
  demo_url: string | null;
  repo_languages: Record<string, number>;
  repo_private: boolean;
  attachments: { name: string; url: string; kind: string }[];
  created_at: string;
}

function toProject(api: ApiProject): Project {
  return {
    id: api.id,
    title: api.title,
    description: api.description,
    details: api.details,
    tags: api.tags,
    status: api.status,
    period: api.period ?? undefined,
    role: api.role ?? undefined,
    url: api.url ?? undefined,
    demo_url: api.demo_url ?? undefined,
    repo_languages: api.repo_languages ?? {},
    repo_private: api.repo_private ?? false,
    attachments: api.attachments ?? [],
  };
}

const Projects = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => {
        if (!res.ok) {
          throw new Error("failed to load projects");
        }
        return res.json() as Promise<ApiProject[]>;
      })
      .then((data) => {
        const sorted = [...data].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        setProjects(sorted.map(toProject));
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const pageCount = Math.ceil(projects.length / PROJECTS_PER_PAGE);

  const visibleProjects = projects.slice(
    page * PROJECTS_PER_PAGE,
    page * PROJECTS_PER_PAGE + PROJECTS_PER_PAGE,
  );

  const { ref, className } = useReveal<HTMLDivElement>();

  return (
    <section id="projects" aria-labelledby="projects-heading">
      <div ref={ref} className={className}>
        <h2 id="projects-heading" className="section-heading">프로젝트</h2>

        {loading && (
          <p className="mt-10 text-sm text-ink-muted">불러오는 중...</p>
        )}
        {!loading && error && (
          <p className="mt-10 text-sm text-ink-muted">
            프로젝트를 불러오지 못했습니다.
          </p>
        )}
        {!loading && !error && projects.length === 0 && (
          <p className="mt-10 text-sm text-ink-muted">등록된 프로젝트가 없습니다.</p>
        )}

        {!loading && !error && projects.length > 0 && (
          <ul key={page} className="work-list">
            {visibleProjects.map(project => {
              const photo = project.attachments?.find(a => a.kind === "image");
              const icon = project.attachments?.find(a => a.kind === "icon");
              return (
                <li key={project.id} className="surface-card">
                  <button className="work-link" type="button" onClick={() => setSelected(project)}>
                    <span className="work-title">
                      {icon && <img src={icon.url} alt="" width={24} height={24} loading="lazy" />}
                      <strong>{project.title}</strong>
                      <ArrowUpRight className="work-arrow" size={17} aria-hidden />
                    </span>
                    {photo && <img className="work-photo" loading="lazy" decoding="async" src={photo.url} alt={photo.name} />}
                    <span className="work-description">{project.description}</span>
                    <span className="work-meta">{[project.status, ...project.tags].filter(Boolean).join(" · ")}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {pageCount > 1 && (
          <div className="mt-5 flex items-center justify-end gap-4">
            <button
              type="button"
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 0}
              aria-label="이전 페이지"
              className="flex size-9 items-center justify-center rounded-md border border-border bg-canvas text-ink-muted shadow-card transition-colors duration-[120ms] hover:bg-surface-1 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="size-5" />
            </button>

            <div className="flex items-center gap-2">
              {Array.from({ length: pageCount }).map((_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setPage(index)}
                  aria-label={`${index + 1}페이지`}
                  aria-current={page === index ? "true" : undefined}
                  className="grid size-8 place-items-center rounded hover:bg-surface-2"
                >
                  <span aria-hidden="true" className={`size-2 rounded-full ${page === index ? "bg-primary" : "bg-ink-muted"}`} />
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={page === pageCount - 1}
              aria-label="다음 페이지"
              className="flex size-9 items-center justify-center rounded-md border border-border bg-canvas text-ink-muted shadow-card transition-colors duration-[120ms] hover:bg-surface-1 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
        )}
      </div>

      <ProjectModal project={selected} onClose={() => setSelected(null)} />
    </section>
  );
};

export default Projects;
