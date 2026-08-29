import { useEffect } from "react";

export type Project = {
  title: string;
  description: string;
  details: string[];
  tags: string[];
  status: string;
  period?: string;
  role?: string;
  url?: string;
};

type ProjectModalProps = {
  project: Project | null;
  onClose: () => void;
};

const statusStyles: Record<string, string> = {
  "진행 중": "bg-primary/10 text-primary",
  완료: "bg-success/10 text-success",
};

const ProjectModal = ({ project, onClose }: ProjectModalProps) => {
  useEffect(() => {
    if (!project) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [project, onClose]);

  if (!project) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-[2px]" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-modal-title"
        className="relative w-full max-w-lg overflow-hidden rounded-lg border border-border bg-canvas shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border bg-surface-1 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="size-3 rounded-full bg-[#ff5f57]" />
            <span className="size-3 rounded-full bg-[#febc2e]" />
            <span className="size-3 rounded-full bg-[#28c840]" />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-md px-2 py-1 text-sm text-ink-muted transition-colors duration-[120ms] hover:bg-surface-2 hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-3">
            <h3
              id="project-modal-title"
              className="text-2xl font-semibold tracking-tight text-navy"
            >
              {project.title}
            </h3>
            <span
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[project.status]}`}
            >
              {project.status}
            </span>
          </div>

          {(project.period || project.role) && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
              {project.period && <span>{project.period}</span>}
              {project.role && <span>{project.role}</span>}
            </div>
          )}

          <p className="mt-5 leading-relaxed text-ink">{project.description}</p>

          <ul className="mt-5 space-y-2">
            {project.details.map((detail) => (
              <li
                key={detail}
                className="flex gap-2 text-sm leading-relaxed text-ink-muted"
              >
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                {detail}
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-5">
            {project.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border bg-surface-1 px-3 py-1 text-sm text-ink"
              >
                {tag}
              </span>
            ))}
          </div>

          {project.url && (
            <a
              href={project.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-block rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-white transition-colors duration-[120ms] hover:bg-primary-hover"
            >
              GitHub 보기
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectModal;
