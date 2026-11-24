import { useState } from "react";
import { Link } from "react-router-dom";
import { Grid2X2, List, Search } from "lucide-react";
import ProjectIcon from "./ProjectIcon";
import ProjectSlides from "./ProjectSlides";
import type { Project } from "../lib/project";
import { usePublicData } from "../lib/usePublicData";

function Cover({ project }: { project: Project }) {
  const cover = project.attachments?.find(item => item.kind === "image");
  const slug = project.title.toLowerCase().replaceAll(" ", "-");
  const artwork = ["waynudge", "search-ui", "openrouter", "portfolio", "dayflow", "chatgend"].includes(slug) ? "/stitch/" + slug + ".jpg" : undefined;
  const src = cover?.url || artwork;
  return src ? <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" /> :
    <div aria-hidden="true" className="project-cover"><span>{project.title}</span></div>;
}

export default function Projects({ archive = false }: { archive?: boolean }) {
  const { data: projects, status } = usePublicData<Project[]>("/api/projects");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [listView, setListView] = useState(false);
  const term = query.trim().toLowerCase();
  const matches = projects?.filter(p => (!statusFilter || p.status === statusFilter) && [p.title, p.description, ...p.tags].join(" ").toLowerCase().includes(term)) ?? [];
  const featured = archive && !term && !statusFilter ? matches[0] : undefined;
  const cards = featured ? matches.slice(1) : matches;
  const pages = Math.ceil(cards.length / 6);
  return <section id="projects" className={archive ? "stitch-layout py-10" : ""}>
    {archive ? <>
      <nav className="mb-4 font-code-sm text-code-sm text-text-secondary" aria-label="페이지 경로"><Link to="/">home</Link> / projects</nav>
      <header className="archive-head"><div>
        <p className="archive-label">Engineering archives &amp; production systems</p>
        <h1 className="text-headline-lg text-primary">Projects / 주요 프로젝트</h1>
        <p className="mt-2 text-body-lg text-text-secondary">GitHub에서 진행한 주요 프로젝트.</p>
      </div></header>
      <div className="mb-8 flex flex-wrap items-center gap-2 rounded-xl border border-border-subtle bg-white p-3 shadow-sm">
        <label className="flex flex-1 items-center gap-2 rounded-md bg-surface-subtle px-3 py-2"><Search size={16} aria-hidden="true" /><input aria-label="프로젝트 검색" className="w-full min-w-32 bg-transparent text-sm" placeholder="프로젝트명, 기술 스택 검색…" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /></label>
        <select aria-label="프로젝트 상태" className="rounded-md border border-border-subtle px-2 py-2 text-sm" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }}>
          <option value="">전체 상태</option>
          {Array.from(new Set(projects?.map(p => p.status))).filter(Boolean).map(value => <option key={value}>{value}</option>)}
        </select>
        <div className="flex rounded-md bg-surface-subtle p-1">
          <button aria-label="카드로 보기" aria-pressed={!listView} className="rounded p-1.5 aria-pressed:bg-white" onClick={() => setListView(false)}><Grid2X2 size={16} /></button>
          <button aria-label="목록으로 보기" aria-pressed={listView} className="rounded p-1.5 aria-pressed:bg-white" onClick={() => setListView(true)}><List size={16} /></button>
        </div>
      </div>
    </> : <header className="flex items-center justify-between gap-3"><div><h2 className="section-heading">프로젝트</h2><p className="section-description">GitHub에서 진행한 주요 프로젝트.</p></div><Link className="text-sm text-secondary" to="/projects">전체 프로젝트 보기 ↗</Link></header>}
    {!projects && <p role="status">{status ? "프로젝트를 불러오지 못했습니다." : "불러오는 중…"}</p>}
    {projects && !matches.length && <p>{query ? "검색 결과가 없습니다." : "등록된 프로젝트가 없습니다."}</p>}
    {featured && <section className="mb-14 grid overflow-hidden rounded-2xl border border-primary-container bg-primary text-on-primary shadow-xl lg:grid-cols-[5fr_7fr]">
      <div className="flex flex-col items-start gap-5 border-white/10 p-6 md:p-10 lg:border-r">
        <div className="flex flex-wrap gap-2 font-code-sm text-code-sm"><span className="rounded bg-white/10 px-2 py-1">FEATURED PROJECT</span><span className="rounded bg-tier-platinum/15 px-2 py-1 text-tier-platinum">{featured.status}</span></div>
        <div><h2 className="text-headline-lg"><ProjectIcon project={featured} />{featured.title}</h2><p className="mt-2 text-body-lg text-primary-fixed">{featured.description}</p></div>
        <dl className="grid w-full grid-cols-2 gap-2">
          {[["진행 기간", featured.period], ["담당 역할", featured.role], ["기술 스택", featured.tags.join(" · ")]].filter(([,value]) => value).map(([label,value]) => <div key={label} className={`rounded-lg border border-white/10 bg-white/5 p-2.5 ${label === "기술 스택" ? "col-span-2" : ""}`}><dt className="font-code-sm text-code-sm text-white/65">{label}</dt><dd className="text-sm font-semibold">{value}</dd></div>)}
        </dl>
        <div className="mt-auto flex flex-wrap items-center gap-3 text-body-sm"><Link to={`/projects/${featured.id}`} className="rounded-lg bg-tier-platinum px-4 py-2 font-semibold text-primary">프로젝트 상세 보기 →</Link>
        {featured.url && !featured.repo_private && <a href={featured.url} rel="noreferrer" target="_blank">GitHub ↗</a>}</div>
      </div>
      {featured.details.length || featured.attachments?.some(item => item.kind === "image") ? <ProjectSlides key={featured.id} project={featured} compact /> : <div className="min-h-52"><Cover project={featured} /></div>}
    </section>}
    {archive && cards.length > 0 && <div className="mb-4"><p className="archive-label">Project catalogue</p><h2 className="text-headline-md">전체 프로젝트 아카이브 <small className="text-code-sm text-secondary">{cards.length}</small></h2></div>}
    <div className={listView ? "grid gap-3" : "grid gap-6 sm:grid-cols-2 lg:grid-cols-3"}>{cards.slice(page * 6, page * 6 + 6).map(project => <Link key={project.id} to={`/projects/${project.id}`} className="stitch-card group flex min-w-0 flex-col overflow-hidden border border-border-subtle">
      {!archive && <div className="relative h-44"><Cover project={project} /><span className="absolute right-3 top-3 rounded-full bg-white/95 px-2 py-1 text-code-sm text-primary">{project.status}</span></div>}
      <div className={archive ? "flex flex-1 flex-col gap-3 p-6" : "flex flex-1 flex-col gap-3 p-4"}>{archive && <span className="tech-tag w-fit">{project.status}</span>}<h3 className="flex justify-between text-headline-sm text-text-primary"><span><ProjectIcon project={project} />{project.title}</span><span aria-hidden="true" className="text-secondary">↗</span></h3>
      <p className="flex-1 text-body-md text-text-secondary">{project.description}</p>
      {archive && project.role && <p className="rounded-lg bg-surface-subtle p-2 text-code-sm">{project.role}</p>}
      <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-3">{project.tags.map(tag => <span className="tech-tag" key={tag}>{tag}</span>)}</div></div>
    </Link>)}</div>
    {pages > 1 && <nav aria-label="프로젝트 페이지" className="mt-6 flex justify-center gap-2">{Array.from({length: pages}, (_, i) => <button key={i} aria-current={page === i ? "page" : undefined} className="size-10 rounded-lg bg-white aria-[current=page]:bg-primary aria-[current=page]:text-white" onClick={() => setPage(i)}>{i + 1}</button>)}</nav>}
  </section>;
}
