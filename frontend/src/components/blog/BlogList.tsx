import { useState } from "react";
import { ArrowRight, ArrowUpRight, CalendarDays, Code2, MessageSquare, Search } from "lucide-react";
import { Link } from "react-router-dom";
import type { Profile } from "../../lib/profile";
import { BLOG_HOST, isBlogHost, PORTFOLIO_URL } from "../../lib/site";
import { usePublicData } from "../../lib/usePublicData";

interface PostSummary {
  id: number;
  title: string;
  excerpt: string;
  created_at: string;
  comment_count: number;
}

function Metadata({ post }: { post: PostSummary }) {
  return <div className="flex flex-wrap items-center gap-3 font-code-sm text-code-sm text-text-secondary">
    <time className="inline-flex items-center gap-1" dateTime={post.created_at}>
      <CalendarDays size={14} />{new Date(post.created_at).toLocaleDateString("ko-KR")}
    </time>
    <span className="inline-flex items-center gap-1"><MessageSquare size={14} />댓글 {post.comment_count}</span>
  </div>;
}

export function BlogAuthor({ author }: { author: Profile }) {
  return <section className="space-y-space-md rounded-xl border border-border-subtle bg-surface-card p-space-lg shadow-sm">
    <div className="flex items-center gap-3">
      <img src={author.photo} alt="" className="size-12 shrink-0 rounded-full object-cover" />
      <div className="min-w-0"><h2 className="font-headline-sm text-headline-sm text-text-primary">{author.name} <small>({author.englishName})</small></h2>
        <p className="font-code-sm text-code-sm text-secondary">@{author.github}</p></div>
    </div>
    <p className="font-body-sm text-body-sm leading-relaxed text-text-secondary">{author.bio}</p>
    <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-space-md">
      <a className="tech-tag inline-flex items-center gap-1" href={"https://github.com/" + author.github}><Code2 size={14} /> GitHub <ArrowUpRight size={12} /></a>
      <a className="tech-tag inline-flex items-center gap-1" href={isBlogHost() ? PORTFOLIO_URL : "/"}>포트폴리오 <ArrowUpRight size={12} /></a>
    </div>
  </section>;
}

export default function BlogList() {
  const { data: posts, status } = usePublicData<PostSummary[]>("/api/posts");
  const { data: author } = usePublicData<Profile>("/api/profile");
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();
  const matches = posts?.filter(post => (post.title + " " + post.excerpt).toLowerCase().includes(term)) ?? [];
  const featured = term ? undefined : matches[0];
  const articles = featured ? matches.slice(1) : matches;

  return <main className="stitch-layout min-h-[75vh] py-space-xl md:py-space-2xl">
    <nav aria-label="현재 위치" className="mb-space-sm flex items-center gap-2 font-code-sm text-code-sm text-text-secondary">
      <a className="hover:underline" href={isBlogHost() ? PORTFOLIO_URL : "/"}>home</a><span>/</span><span>{BLOG_HOST}</span>
    </nav>
    <header className="flex flex-wrap items-end justify-between gap-space-lg border-b border-border-subtle pb-space-xl">
      <div className="max-w-2xl space-y-space-sm">
        <h1 className="font-display text-display-mobile tracking-tight text-text-primary md:text-display">블로그 <span className="font-headline-lg text-headline-lg font-normal text-text-muted">/ Blog</span></h1>
        <p className="font-body-lg text-body-lg text-text-secondary">개발 기록과 생각을 남기는 공간입니다.</p>
      </div>
      {posts && <p className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-card px-3 py-1.5 font-code-sm text-code-sm text-secondary shadow-sm"><span className="size-2 rounded-full bg-primary" />총 {posts.length}편의 포스트</p>}
    </header>

    <label className="my-space-lg flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-card px-4 py-3 text-secondary focus-within:border-secondary">
      <Search size={18} /><input className="min-w-0 flex-1 bg-transparent text-body-md text-text-primary outline-none" type="search" aria-label="글 검색" placeholder="제목 또는 내용으로 아티클 검색…" value={query} onChange={e => setQuery(e.target.value)} />
    </label>

    {featured && <Link to={'/blog/' + featured.id} className="group my-space-md flex flex-col overflow-hidden rounded-2xl border border-border-accent bg-surface-card transition-shadow hover:shadow-xl lg:flex-row">
      <div className="flex min-h-52 flex-col justify-between gap-8 bg-primary-container p-space-lg md:p-space-xl lg:w-2/5">
        <div className="space-y-space-md">
          <span className="inline-block rounded bg-tier-platinum/20 px-2.5 py-1 font-label-caps text-label-caps tracking-wider text-tier-platinum">최근 게시한 글</span>
          <h2 className="font-headline-lg text-headline-lg font-bold tracking-tight text-white">{featured.title}</h2>
        </div>
        <span className="flex items-center justify-end gap-1 border-t border-white/10 pt-space-md font-code-sm text-code-sm text-primary-fixed">자세히 읽기 <ArrowRight size={16} /></span>
      </div>
      <div className="flex flex-col justify-between gap-space-lg p-space-lg md:p-space-xl lg:w-3/5">
        <p className="font-body-lg text-body-lg leading-relaxed text-text-secondary">{featured.excerpt}</p>
        <div className="border-t border-border-subtle pt-space-md"><Metadata post={featured} /></div>
      </div>
    </Link>}

    <div className="grid items-start gap-gutter-lg pt-space-lg lg:grid-cols-12">
      <section className="space-y-space-md lg:col-span-8">
        <h2 className="font-headline-md text-headline-md">{term ? "검색 결과" : "전체 글"}</h2>
        {!posts && <p role="status">{status ? "글 목록을 불러오지 못했습니다." : "불러오는 중…"}</p>}
        {posts && !articles.length && <p className="rounded-xl border border-border-subtle bg-surface-card p-space-lg text-text-secondary">{term ? "검색 결과가 없습니다." : featured ? "다른 글은 아직 없습니다." : "아직 작성된 글이 없습니다."}</p>}
        {articles.map(post => <Link key={post.id} to={'/blog/' + post.id} className="group block space-y-space-sm rounded-xl border border-border-subtle bg-surface-card p-space-lg transition hover:border-border-accent hover:shadow-md">
          <Metadata post={post} />
          <h3 className="flex items-start justify-between gap-3 font-headline-md text-headline-md text-text-primary group-hover:text-secondary">{post.title}<ArrowUpRight aria-hidden="true" className="mt-1 size-5 shrink-0" /></h3>
          <p className="line-clamp-3 font-body-md text-body-md text-text-secondary">{post.excerpt}</p>
        </Link>)}
      </section>
      {author && <aside className="lg:col-span-4"><BlogAuthor author={author} /></aside>}
    </div>
  </main>;
}
