import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { authFetch } from "../../lib/api";

interface PostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  created_at: string;
}

interface Post extends PostSummary {
  content_markdown: string;
  published: boolean;
}

const editorLabelClass = "mb-1.5 block text-sm font-medium text-ink";
const editorInputClass =
  "w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm text-ink outline-none transition-colors duration-[120ms] focus-visible:border-primary";

const markdownPreviewClass =
  "mt-2 text-ink [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-surface-1 [&_code]:px-1 [&_code]:py-0.5 [&_h1]:mt-4 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_p]:mt-2 [&_p]:leading-relaxed [&_pre]:mt-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-navy [&_pre]:p-4 [&_pre]:text-white [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-6";

const PostManager = () => {
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [editing, setEditing] = useState<Post | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadPosts = useCallback(() => {
    setPosts(null);
    setLoadError(false);
    authFetch("/api/admin/posts")
      .then((res) => {
        if (!res.ok) {
          throw new Error("failed to load posts");
        }
        return res.json() as Promise<PostSummary[]>;
      })
      .then(setPosts)
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const startCreate = () => {
    setIsNew(true);
    setPreview(false);
    setSaveError(null);
    setEditing({
      id: "",
      slug: "",
      title: "",
      excerpt: "",
      content_markdown: "",
      published: false,
      created_at: "",
    });
  };

  const startEdit = (post: PostSummary) => {
    setIsNew(false);
    setPreview(false);
    setSaveError(null);
    setEditing({
      ...post,
      content_markdown: "",
      published: false,
    });
    authFetch(`/api/admin/posts/${post.id}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error("failed to load post");
        }
        return res.json() as Promise<Post>;
      })
      .then(setEditing)
      .catch(() => setSaveError("글을 불러오지 못했습니다."));
  };

  const cancelEdit = () => {
    setEditing(null);
    loadPosts();
  };

  const handleSave = async () => {
    if (!editing) {
      return;
    }
    if (!editing.title.trim()) {
      setSaveError("제목을 입력해주세요.");
      return;
    }

    setSaving(true);
    setSaveError(null);

    const body: Record<string, unknown> = {
      title: editing.title,
      excerpt: editing.excerpt,
      content_markdown: editing.content_markdown,
      published: editing.published,
    };

    try {
      const res = isNew
        ? await authFetch("/api/admin/posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await authFetch(`/api/admin/posts/${editing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

      if (!res.ok) {
        throw new Error("save failed");
      }

      setEditing(null);
      loadPosts();
    } catch {
      setSaveError("저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (post: PostSummary) => {
    if (!window.confirm(`"${post.title}" 글을 삭제할까요?`)) {
      return;
    }

    try {
      const res = await authFetch(`/api/admin/posts/${post.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("delete failed");
      }
      loadPosts();
    } catch {
      setLoadError(true);
    }
  };

  if (editing) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-navy">
          {isNew ? "새 글 작성" : "글 수정"}
        </h2>

        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="post-title" className={editorLabelClass}>
              제목
            </label>
            <input
              id="post-title"
              type="text"
              value={editing.title}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              className={editorInputClass}
            />
          </div>

          <div>
            <label htmlFor="post-excerpt" className={editorLabelClass}>
              요약
            </label>
            <textarea
              id="post-excerpt"
              value={editing.excerpt}
              onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })}
              rows={2}
              className={editorInputClass}
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="post-content" className={editorLabelClass}>
                본문 (Markdown)
              </label>
              <button
                type="button"
                onClick={() => setPreview((v) => !v)}
                className="rounded-md border border-border px-3 py-1 text-xs font-medium text-ink-muted transition-colors duration-[120ms] hover:bg-surface-1 hover:text-ink"
              >
                미리보기
              </button>
            </div>
            {preview ? (
              <div className={`rounded-md border border-border bg-canvas p-4 ${markdownPreviewClass}`}>
                <ReactMarkdown>{editing.content_markdown || "*본문이 비어 있습니다.*"}</ReactMarkdown>
              </div>
            ) : (
              <textarea
                id="post-content"
                value={editing.content_markdown}
                onChange={(e) => setEditing({ ...editing, content_markdown: e.target.value })}
                rows={16}
                className={`${editorInputClass} font-mono`}
              />
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={editing.published}
              onChange={(e) => setEditing({ ...editing, published: e.target.checked })}
              className="size-4 accent-primary"
            />
            발행
          </label>

          {saveError && <p className="text-sm text-red-600">{saveError}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-white transition-colors duration-[120ms] hover:bg-primary-hover active:bg-primary-pressed disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-md border border-border px-5 py-2 text-sm font-medium text-ink transition-colors duration-[240ms] hover:bg-surface-1"
            >
              취소
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-navy">글 목록</h2>
        <button
          type="button"
          onClick={startCreate}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors duration-[120ms] hover:bg-primary-hover active:bg-primary-pressed"
        >
          새 글 작성
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {posts === null && !loadError && (
          <p className="text-sm text-ink-muted">불러오는 중...</p>
        )}
        {loadError && (
          <p className="text-sm text-ink-muted">글 목록을 불러오지 못했습니다.</p>
        )}
        {posts?.length === 0 && (
          <p className="text-sm text-ink-muted">아직 작성된 글이 없습니다.</p>
        )}
        {posts?.map((post) => (
          <div
            key={post.id}
            className="flex items-center justify-between gap-4 rounded-lg border border-border bg-canvas p-4 shadow-card"
          >
            <div className="min-w-0">
              <div className="truncate font-medium text-ink">{post.title}</div>
              <div className="mt-0.5 truncate text-xs text-ink-subdued">
                /{post.slug} · {new Date(post.created_at).toLocaleDateString("ko-KR")}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => startEdit(post)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink transition-colors duration-[240ms] hover:bg-surface-1"
              >
                수정
              </button>
              <button
                type="button"
                onClick={() => handleDelete(post)}
                className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors duration-[240ms] hover:bg-red-50"
              >
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PostManager;