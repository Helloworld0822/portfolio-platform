import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

interface PostSummary {
  id: number;
  title: string;
  excerpt: string;
  created_at: string;
  comment_count: number;
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
    <main className="site-container py-10 md:py-14">
      <h1 className="section-heading">블로그</h1>

      {error && (
        <p className="mt-10 text-sm text-ink-muted">글 목록을 불러오지 못했습니다.</p>
      )}

      {!error && posts === null && (
        <p className="mt-10 text-sm text-ink-muted">불러오는 중...</p>
      )}

      {posts !== null && posts.length === 0 && (
        <p className="surface-card p-6 text-sm text-ink-muted">아직 작성된 글이 없습니다.</p>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {posts?.map((post) => (
          <Link
            key={post.id}
            to={`/blog/${post.id}`}
            className="surface-card group flex min-w-0 flex-col wrap-anywhere p-6 text-left shadow-card transition-shadow duration-[240ms] hover:shadow-elevated"
          >
            <h2 className="text-lg font-semibold text-ink transition-colors duration-[240ms] group-hover:text-primary">
              {post.title}
            </h2>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-muted">
              {post.excerpt}
            </p>
            <span className="mt-5 flex items-center gap-3 text-xs text-ink-subdued">
              <span>{new Date(post.created_at).toLocaleDateString("ko-KR")}</span>
              <span>댓글 {post.comment_count}</span>
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
};

export default BlogList;
