import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import CommentSection from "./CommentSection";
import { markdownComponents } from "../../lib/markdown";

interface Post {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content_markdown: string;
  created_at: string;
}

const BlogPost = () => {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) {
      return;
    }

    setPost(null);
    setNotFound(false);

    fetch(`/api/posts/${slug}`)
      .then((res) => {
        if (res.status === 404) {
          setNotFound(true);
          return null;
        }
        if (!res.ok) {
          throw new Error("failed to load post");
        }
        return res.json() as Promise<Post>;
      })
      .then((data) => {
        if (data) {
          setPost(data);
        }
      })
      .catch(() => setNotFound(true));
  }, [slug]);

  if (notFound) {
    return (
      <section className="px-4 py-20 md:px-8 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-ink-muted">글을 찾을 수 없습니다.</p>
          <Link to="/blog" className="mt-4 inline-block text-primary hover:underline">
            블로그 목록으로 돌아가기
          </Link>
        </div>
      </section>
    );
  }

  if (!post) {
    return (
      <section className="px-4 py-20 md:px-8 md:py-24">
        <div className="mx-auto max-w-3xl text-center text-sm text-ink-muted">
          불러오는 중...
        </div>
      </section>
    );
  }

  return (
    <section className="px-4 py-20 md:px-8 md:py-24">
      <article className="mx-auto max-w-3xl">
        <Link to="/blog" className="text-sm text-ink-muted hover:text-primary">
          ← 블로그 목록
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-navy">
          {post.title}
        </h1>
        <p className="mt-2 text-xs text-ink-subdued">
          {new Date(post.created_at).toLocaleDateString("ko-KR")}
        </p>

        <div
          className="mt-10 text-ink [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-surface-1 [&_code]:px-1 [&_code]:py-0.5
          [&_h1]:mt-8 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold
          [&_p]:mt-4 [&_p]:leading-relaxed [&_pre]:mt-4 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-navy [&_pre]:p-4 [&_pre]:text-white
          [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:pl-6"
        >
          <ReactMarkdown components={markdownComponents}>{post.content_markdown}</ReactMarkdown>
        </div>

        <div className="mt-16 border-t border-border pt-10">
          <CommentSection postSlug={post.slug} />
        </div>
      </article>
    </section>
  );
};

export default BlogPost;
