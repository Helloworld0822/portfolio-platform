import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, List } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { markdownComponents } from "../../lib/markdown";
import type { Profile } from "../../lib/profile";
import { usePublicData } from "../../lib/usePublicData";
import { BlogAuthor } from "./BlogList";
import CommentSection from "./CommentSection";

interface Post {
  id: number;
  title: string;
  excerpt: string;
  content_markdown: string;
  created_at: string;
}

interface Heading {
  id: string;
  label: string;
  nested: boolean;
}

export default function BlogPost() {
  const { id } = useParams();
  const { data: post, status } = usePublicData<Post>("/api/posts/" + encodeURIComponent(id ?? ""));
  const { data: author } = usePublicData<Profile>("/api/profile");
  const body = useRef<HTMLDivElement>(null);
  const [headings, setHeadings] = useState<Heading[]>([]);

  useEffect(() => {
    const nodes = body.current?.querySelectorAll("h1,h2,h3") ?? [];
    setHeadings(Array.from(nodes, (heading, index) => {
      heading.id = "article-heading-" + index;
      return { id: heading.id, label: heading.textContent ?? "", nested: heading.tagName === "H3" };
    }));
    if (window.location.hash) {
      const target = document.getElementById(window.location.hash.slice(1));
      target?.scrollIntoView();
    }
  }, [post]);

  if (!post) return <main className="stitch-layout py-space-2xl text-center">
    <p role="status" className="text-text-secondary">{status === 404 ? "글을 찾을 수 없습니다." : status ? "글을 불러오지 못했습니다." : "불러오는 중…"}</p>
    {status > 0 && <Link to="/blog" className="mt-4 inline-block text-primary hover:underline">블로그 목록으로 돌아가기</Link>}
  </main>;

  return <main className="stitch-layout py-space-xl">
    <div className="reading-progress" aria-hidden="true" />
    <header className="mb-space-2xl flex flex-col gap-space-md">
      <div className="border-b border-border-subtle pb-space-sm">
        <Link to="/blog" className="inline-flex items-center gap-space-xs font-code-sm text-code-sm text-secondary hover:text-primary"><ArrowLeft size={16} /> 블로그 목록으로 돌아가기</Link>
      </div>
      <div className="flex max-w-4xl flex-col gap-space-sm">
        <h1 className="break-words pt-space-xs font-headline-lg text-headline-lg leading-tight font-bold tracking-tight text-text-primary md:font-display md:text-display">{post.title}</h1>
        {post.excerpt && <p className="font-body-lg text-body-lg text-text-secondary">{post.excerpt}</p>}
        <div className="mt-space-md flex flex-wrap items-center gap-3 font-code-sm text-code-sm text-text-secondary">
          {author && <div className="flex items-center gap-2"><img alt="" src={author.photo} className="size-8 rounded-full object-cover" /><strong className="font-body-md text-body-md text-text-primary">{author.name}</strong></div>}
          <time dateTime={post.created_at}>{new Date(post.created_at).toLocaleDateString("ko-KR")}</time>
        </div>
      </div>
    </header>

    <div className="grid items-start gap-space-xl lg:grid-cols-12">
      <article className="min-w-0 lg:col-span-8">
        <div ref={body} className="break-words font-body-lg text-body-lg leading-relaxed text-text-primary
          [&_a]:text-secondary [&_a]:underline [&_blockquote]:my-6 [&_blockquote]:border-l-4 [&_blockquote]:border-border-accent [&_blockquote]:bg-surface-subtle [&_blockquote]:p-4
          [&_code]:rounded [&_code]:bg-surface-subtle [&_code]:px-1 [&_code]:font-code-md [&_code]:text-code-md
          [&_h1]:mt-space-xl [&_h1]:text-headline-lg [&_h1]:font-bold [&_h2]:mt-space-xl [&_h2]:border-b [&_h2]:border-border-subtle [&_h2]:pb-2 [&_h2]:text-headline-md [&_h2]:font-bold [&_h3]:mt-space-lg [&_h3]:text-headline-sm [&_h3]:font-semibold
          [&_img]:my-5 [&_img]:rounded-lg [&_p]:mt-4 [&_pre]:my-5 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-primary-container [&_pre]:p-space-lg [&_pre]:text-white [&_pre_code]:bg-transparent [&_pre_code]:p-0
          [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:pl-6 [&>:first-child]:mt-0">
          <ReactMarkdown components={markdownComponents}>{post.content_markdown}</ReactMarkdown>
        </div>
        <section id="comments" className="mt-space-2xl border-t border-border-subtle pt-space-xl"><CommentSection postId={post.id} /></section>
      </article>

      <aside className="flex min-w-0 flex-col gap-space-lg lg:sticky lg:top-24 lg:col-span-4">
        {headings.length > 0 && <nav aria-label="글 목차" className="flex flex-col gap-space-sm rounded-xl border border-border-subtle bg-surface-card p-space-lg shadow-sm">
          <h2 className="mb-2 flex items-center gap-2 font-label-caps text-label-caps tracking-wide text-primary"><List size={18} />목차 (TABLE OF CONTENTS)</h2>
          {headings.map(heading => <a key={heading.id} href={"#" + heading.id} className={'border-l-2 border-border-subtle py-1 pr-1 text-body-sm text-text-secondary hover:border-secondary hover:text-primary ' + (heading.nested ? 'pl-6' : 'pl-3')}>{heading.label}</a>)}
        </nav>}
        {author && <BlogAuthor author={author} />}
        <a href="#comments" className="flex items-center justify-between rounded-xl border border-border-subtle bg-surface-card p-space-md font-body-sm text-body-sm text-secondary">토론 참여하기 <ArrowDown size={16} /></a>
      </aside>
    </div>
  </main>;
}
