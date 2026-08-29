import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

interface PostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  created_at: string;
}

const BlogList = () => {
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/posts")
      .then((res) => {
        if (!res.ok) {
          throw new Error("failed to load posts");
        }
        return res.json() as Promise<PostSummary[]>;
      })
      .then(setPosts)
      .catch(() => setError(true));
  }, []);

  return (
    <section className="px-4 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-semibold tracking-tight text-navy">블로그</h1>
        <p className="mt-2 text-ink-muted">개발 기록과 생각을 남기는 공간입니다.</p>

        {error && (
          <p className="mt-10 text-sm text-ink-muted">글 목록을 불러오지 못했습니다.</p>
        )}

        {!error && posts === null && (
          <p className="mt-10 text-sm text-ink-muted">불러오는 중...</p>
        )}

        {posts !== null && posts.length === 0 && (
          <p className="mt-10 text-sm text-ink-muted">아직 작성된 글이 없습니다.</p>
        )}

        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {posts?.map((post) => (
            <Link
              key={post.slug}
              to={`/blog/${post.slug}`}
              className="group flex flex-col rounded-lg border border-border bg-canvas p-6 text-left shadow-card transition-shadow duration-[240ms] hover:shadow-elevated"
            >
              <h2 className="text-lg font-semibold text-ink transition-colors duration-[240ms] group-hover:text-primary">
                {post.title}
              </h2>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-muted">
                {post.excerpt}
              </p>
              <span className="mt-5 text-xs text-ink-subdued">
                {new Date(post.created_at).toLocaleDateString("ko-KR")}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default BlogList;
