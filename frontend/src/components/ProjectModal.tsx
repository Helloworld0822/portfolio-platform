import { useEffect } from "react";

export type ProjectAttachment = {
  name: string;
  url: string;
  kind: string;
};

export type Project = {
  title: string;
  description: string;
  details: string[];
  tags: string[];
  status: string;
  period?: string;
  role?: string;
  url?: string;
  demo_url?: string;
  repo_languages: Record<string, number>;
  repo_private: boolean;
  attachments?: ProjectAttachment[];
};

type ProjectModalProps = {
  project: Project | null;
  onClose: () => void;
};

const statusStyles: Record<string, string> = {
  "진행 중": "bg-primary/10 text-primary",
  완료: "bg-success/10 text-success",
};

const LANGUAGE_COLORS: Record<string, string> = {
  Rust: "#dea584",
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572a5",
  Elixir: "#6b4cdb",
  HTML: "#e34c26",
  CSS: "#563d7c",
  C: "#555555",
  "C++": "#f34b7d",
  Shell: "#89e051",
  Dockerfile: "#384d54",
};

interface LanguageBarProps {
  languages: Record<string, number>;
}

const LanguageBar = ({ languages }: LanguageBarProps) => {
  const total = Object.values(languages).reduce((sum, bytes) => sum + bytes, 0);
  if (total === 0) return null;

  const entries = Object.entries(languages)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);

  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-2">
        {entries.map(([lang, bytes]) => (
          <div
            key={lang}
            style={{
              width: `${(bytes / total) * 100}%`,
              backgroundColor: LANGUAGE_COLORS[lang] ?? "#86888c",
            }}
            title={`${lang} ${Math.round((bytes / total) * 100)}%`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {entries.map(([lang, bytes]) => (
          <span key={lang} className="flex items-center gap-1.5 text-xs text-ink-muted">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: LANGUAGE_COLORS[lang] ?? "#86888c" }}
            />
            {lang} {Math.round((bytes / total) * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
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

  const images = project.attachments?.filter((a) => a.kind === "image");
  const pdfs = project.attachments?.filter((a) => a.kind === "pdf");

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
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-canvas shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface-1 px-4 py-3">
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

          {Object.keys(project.repo_languages).length > 0 && (
            <div className="mt-5">
              <LanguageBar languages={project.repo_languages} />
            </div>
          )}

          {images && images.length > 0 && (
            <div className="mt-5">
              <h4 className="text-sm font-semibold text-ink">이미지</h4>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {images.map((img) => (
                  <img
                    key={img.url}
                    src={img.url}
                    alt={img.name}
                    loading="lazy"
                    className="aspect-video w-full rounded-md border border-border object-cover"
                  />
                ))}
              </div>
            </div>
          )}

          {pdfs && pdfs.length > 0 && (
            <div className="mt-5">
              <h4 className="text-sm font-semibold text-ink">자료</h4>
              <div className="mt-2 space-y-2">
                {pdfs.map((pdf) => (
                  <div
                    key={pdf.url}
                    className="overflow-hidden rounded-md border border-border"
                  >
                    <div className="flex items-center justify-between bg-surface-1 px-3 py-2">
                      <span className="truncate text-sm text-ink">{pdf.name}</span>
                      <a
                        href={pdf.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-sm text-primary hover:underline"
                      >
                        새 탭에서 열기
                      </a>
                    </div>
                    <iframe
                      src={pdf.url}
                      title={pdf.name}
                      className="h-72 w-full bg-surface-1"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

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

          <div className="mt-6 flex flex-wrap gap-2">
            {project.url && !project.repo_private && (
              <a
                href={project.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-white transition-colors duration-[120ms] hover:bg-primary-hover"
              >
                GitHub 보기
              </a>
            )}

            {project.demo_url && (
              <a
                href={project.demo_url}
                target="_blank"
                rel="noopener noreferrer"
                className={
                  project.url && !project.repo_private
                    ? "inline-block rounded-md border border-primary px-6 py-2.5 text-sm font-medium text-primary transition-colors duration-[120ms] hover:bg-primary/5"
                    : "inline-block rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-white transition-colors duration-[120ms] hover:bg-primary-hover"
                }
              >
                배포 사이트 보기
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectModal;