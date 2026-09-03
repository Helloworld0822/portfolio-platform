import { useEffect, useState } from "react";
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

const statusStyles: Record<string, string> = {
  "진행 중": "bg-primary/10 text-primary",
  완료: "bg-success/10 text-success",
};

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

  return (
    <section id="projects" className="bg-canvas px-4 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-3xl font-semibold tracking-tight text-navy">프로젝트</h2>
        <p className="mt-2 text-ink-muted">GitHub에서 진행한 주요 프로젝트.</p>

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
        )}

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
