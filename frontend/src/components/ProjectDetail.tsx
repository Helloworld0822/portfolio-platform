import { Link, useParams } from "react-router-dom";
import ProjectIcon from "./ProjectIcon";
import ProjectSlides from "./ProjectSlides";
import type { Project } from "../lib/project";
import { usePublicData } from "../lib/usePublicData";

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
    .sort(([, a], [, b]) => b - a);

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

export default function ProjectDetail() {
  const { id } = useParams();
  const { data: project, status } = usePublicData<Project>(`/api/projects/${id}`);
  const { data: catalogue } = usePublicData<Project[]>("/api/projects");
  if (!project) return <main className="stitch-layout py-14"><Link to="/projects">← 프로젝트 목록</Link>
    <p className="mt-5">{status === 404 ? "공개된 프로젝트를 찾을 수 없습니다." : status ? "프로젝트를 불러오지 못했습니다." : "불러오는 중…"}</p></main>;

  const pdfs = project.attachments?.filter(item => item.kind === "pdf") ?? [];
  const related = (catalogue ?? []).filter(item => item.id !== project.id && item.tags.some(tag => project.tags.includes(tag))).slice(0, 3);
  return <main>
    <nav aria-label="페이지 경로" className="bg-surface-container-low py-2"><div className="stitch-layout flex flex-wrap items-center gap-2 font-code-sm text-code-sm text-secondary">
      <Link to="/projects">← projects</Link><span>/</span><span>{project.title}</span><span className="ml-auto rounded bg-surface-card px-2 py-1">{project.status}</span>
    </div></nav>
    <div className="stitch-layout pb-12">
    <header className="flex flex-wrap items-end justify-between gap-4 py-10"><div className="max-w-3xl">
      <p className="mb-2 font-code-sm text-code-sm text-secondary"><span className="rounded bg-surface-container-high px-2 py-1 font-semibold">ENGINEERING CASE STUDY</span> {project.period && " · " + project.period}</p>
      <h1 className="text-display-mobile font-bold tracking-tight text-text-primary md:text-display"><ProjectIcon project={project} />{project.title}</h1>
      <p className="mt-2 text-body-lg text-text-secondary">{project.description}</p>
      <div className="mt-3 flex flex-wrap gap-2">{project.tags.map(tag => <span className="tech-tag" key={tag}>{tag}</span>)}</div>
    </div><div className="flex gap-2 font-code-sm text-code-sm">
      {project.url && !project.repo_private && <a className="rounded-lg bg-primary-container px-4 py-2.5 font-semibold text-white" href={project.url} target="_blank" rel="noreferrer">GitHub 저장소 ↗</a>}
      {project.demo_url && <a className="rounded-lg border border-border-subtle bg-surface-card px-4 py-2.5 text-primary" href={project.demo_url} target="_blank" rel="noreferrer">배포 사이트 ↗</a>}
    </div></header>
    <ProjectSlides key={project.id} project={project} />
    <div className="grid items-start gap-6 lg:grid-cols-[7fr_5fr]">
      <section className="space-y-5"><h2 className="text-headline-md">담당 역할 및 프로젝트 기여도</h2>
        {project.role && <p className="w-fit rounded bg-surface-subtle px-3 py-1 text-sm font-medium text-secondary">{project.role}</p>}
        {project.details.length > 0 && <><h3 className="font-semibold">주요 구현 내역</h3><ul className="space-y-3">{project.details.map((detail, index) => <li key={index} className="flex gap-3 rounded-lg border border-border-subtle bg-surface-card p-4 text-body-md"><span aria-hidden="true" className="font-code-sm text-secondary">{String(index + 1).padStart(2, "0")}</span>{detail}</li>)}</ul></>}
      </section>
      <aside className="space-y-4">
        {Object.keys(project.repo_languages).length > 0 && <section className="stitch-card space-y-4 p-6"><h2 className="text-headline-sm">코드베이스 언어 분포</h2><LanguageBar languages={project.repo_languages} /></section>}
      </aside>
    </div>
    {pdfs.map(pdf => <section className="stitch-card mt-6 p-4" key={pdf.url}><a href={pdf.url} target="_blank" rel="noreferrer">{pdf.name} ↗</a><iframe src={pdf.url} title={pdf.name} className="mt-2 h-80 w-full" /></section>)}
    </div>
    {related.length > 0 && <section className="bg-surface-container-low py-10"><div className="stitch-layout">
      <div className="mb-5 flex items-end justify-between gap-3"><div><p className="archive-label">Next explorations</p><h2 className="text-headline-md">관련 프로젝트</h2></div><Link to="/projects" className="text-sm text-secondary">전체 프로젝트 보기 →</Link></div>
      <div className="grid gap-4 sm:grid-cols-3">{related.map(item => <Link key={item.id} to={`/projects/${item.id}`} className="stitch-card border border-border-subtle p-5">
        <span className="font-code-sm text-code-sm text-secondary">{item.tags.filter(tag => project.tags.includes(tag)).join(" · ")}</span>
        <h3 className="my-2 text-headline-sm">{item.title} ↗</h3><p className="line-clamp-2 text-body-sm text-text-secondary">{item.description}</p>
      </Link>)}</div></div></section>}
  </main>;
}
