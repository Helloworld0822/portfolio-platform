import { useEffect, useState, type FormEvent } from "react";
import { authFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth";

interface Comment {
  id: string;
  author_login: string;
  author_avatar_url: string | null;
  body: string;
  created_at: string;
}

interface CommentSectionProps {
  postSlug: string;
}

const CommentSection = ({ postSlug }: CommentSectionProps) => {
  const { user, login } = useAuth();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadComments = () => {
    fetch(`/api/posts/${postSlug}/comments`)
      .then((res) => {
        if (!res.ok) {
          throw new Error("failed to load comments");
        }
        return res.json() as Promise<Comment[]>;
      })
      .then(setComments)
      .catch(() => setComments([]));
  };

  useEffect(() => {
    loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postSlug]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await authFetch(`/api/posts/${postSlug}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft.trim() }),
      });

      if (!res.ok) {
        throw new Error("댓글을 등록하지 못했습니다.");
      }

      setDraft("");
      loadComments();
    } catch {
      setError("댓글을 등록하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-navy">댓글</h2>

      <div className="mt-6 space-y-6">
        {comments === null && (
          <p className="text-sm text-ink-muted">불러오는 중...</p>
        )}
        {comments !== null && comments.length === 0 && (
          <p className="text-sm text-ink-muted">첫 댓글을 남겨보세요.</p>
        )}
        {comments?.map((comment) => (
          <div key={comment.id} className="flex gap-3">
            {comment.author_avatar_url ? (
              <img
                src={comment.author_avatar_url}
                alt={comment.author_login}
                className="size-9 shrink-0 rounded-full"
              />
            ) : (
              <div className="size-9 shrink-0 rounded-full bg-surface-2" />
            )}
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-ink">
                  {comment.author_login}
                </span>
                <span className="text-xs text-ink-subdued">
                  {new Date(comment.created_at).toLocaleDateString("ko-KR")}
                </span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                {comment.body}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8">
        {user ? (
          <form onSubmit={handleSubmit}>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="댓글을 남겨보세요"
              rows={3}
              maxLength={2000}
              className="w-full rounded-md border border-border bg-canvas p-3 text-sm text-ink outline-none focus-visible:border-primary"
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={submitting || !draft.trim()}
              className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors duration-[120ms] hover:bg-primary-hover active:bg-primary-pressed disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "등록 중..." : "댓글 등록"}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => login(`/blog/${postSlug}`)}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink transition-colors duration-[240ms] hover:bg-surface-1"
          >
            GitHub으로 로그인하고 댓글 남기기
          </button>
        )}
      </div>
    </div>
  );
};

export default CommentSection;
