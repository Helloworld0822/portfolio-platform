import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch } from "../../lib/api";

interface ProjectAttachment {
  name: string;
  url: string;
  kind: string;
}

interface Project {
  id: string;
  title: string;
  description: string;
  details: string[];
  tags: string[];
  status: string;
  period: string | null;
  role: string | null;
  url: string | null;
  demo_url: string | null;
  attachments: ProjectAttachment[];
  published: boolean;
}

type ProjectDraft = {
  title: string;
  description: string;
  details: string;
  tags: string;
  status: string;
  period: string;
  role: string;
  url: string;
  demo_url: string;
  attachments: ProjectAttachment[];
  published: boolean;
};

const emptyDraft: ProjectDraft = {
  title: "",
  description: "",
  details: "",
  tags: "",
  status: "진행 중",
  period: "",
  role: "",
  url: "",
  demo_url: "",
  attachments: [],
  published: true,
};

const toDraft = (project: Project): ProjectDraft => ({
  title: project.title,
  description: project.description,
  details: project.details.join("\n"),
  tags: project.tags.join(", "),
  status: project.status,
  period: project.period ?? "",
  role: project.role ?? "",
  url: project.url ?? "",
  demo_url: project.demo_url ?? "",
  attachments: project.attachments ?? [],
  published: project.published,
});

const editorLabelClass = "mb-1.5 block text-sm font-medium text-ink";
const editorInputClass =
  "w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm text-ink outline-none transition-colors duration-[120ms] focus-visible:border-primary";

const statusOptions = ["진행 중", "완료"];

const ProjectManager = () => {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [editing, setEditing] = useState<ProjectDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadProjects = useCallback(() => {
    setProjects(null);
    setLoadError(false);
    authFetch("/api/admin/projects")
      .then((res) => {
        if (!res.ok) {
          throw new Error("failed to load projects");
        }
        return res.json() as Promise<Project[]>;
      })
      .then(setProjects)
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const startCreate = () => {
    setEditingId(null);
    setSaveError(null);
    setEditing(emptyDraft);
  };

  const startEdit = (project: Project) => {
    setEditingId(project.id);
    setSaveError(null);
    setEditing(toDraft(project));
  };

  const cancelEdit = () => {
    setEditing(null);
    loadProjects();
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

    const details = editing.details
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const tags = editing.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    const body: Record<string, unknown> = {
      title: editing.title,
      description: editing.description,
      details,
      tags,
      status: editing.status,
      period: editing.period || null,
      role: editing.role || null,
      url: editing.url || null,
      demo_url: editing.demo_url || null,
      attachments: editing.attachments,
      published: editing.published,
    };

    try {
      const res = editingId
        ? await authFetch(`/api/admin/projects/${editingId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await authFetch("/api/admin/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

      if (!res.ok) {
        throw new Error("save failed");
      }

      setEditing(null);
      loadProjects();
    } catch {
      setSaveError("저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (project: Project) => {
    if (!window.confirm(`"${project.title}" 프로젝트를 삭제할까요?`)) {
      return;
    }

    try {
      const res = await authFetch(`/api/admin/projects/${project.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("delete failed");
      }
      loadProjects();
    } catch {
      setLoadError(true);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editing) return;

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const formData = new FormData();
    formData.append("file", file);

    setUploading(true);
    setSaveError(null);
    try {
      const res = await authFetch("/api/admin/uploads", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        throw new Error("upload failed");
      }
      const data = (await res.json()) as { url: string };
      const kind = isPdf ? "pdf" : "image";
      setEditing({
        ...editing,
        attachments: [...editing.attachments, { name: file.name, url: data.url, kind }],
      });
    } catch {
      setSaveError("파일 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (url: string) => {
    if (!editing) return;
    setEditing({
      ...editing,
      attachments: editing.attachments.filter((a) => a.url !== url),
    });
  };

  if (editing) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-navy">
          {editingId ? "프로젝트 수정" : "새 프로젝트"}
        </h2>

        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="project-title" className={editorLabelClass}>
                제목
              </label>
              <input
                id="project-title"
                type="text"
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                className={editorInputClass}
              />
            </div>
            <div>
              <label htmlFor="project-status" className={editorLabelClass}>
                상태
              </label>
              <select
                id="project-status"
                value={editing.status}
                onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                className={editorInputClass}
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="project-description" className={editorLabelClass}>
              설명
            </label>
            <textarea
              id="project-description"
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              rows={2}
              className={editorInputClass}
            />
          </div>

          <div>
            <label htmlFor="project-details" className={editorLabelClass}>
              상세 내용 (줄마다 하나씩)
            </label>
            <textarea
              id="project-details"
              value={editing.details}
              onChange={(e) => setEditing({ ...editing, details: e.target.value })}
              rows={4}
              className={editorInputClass}
            />
          </div>

          <div>
            <label htmlFor="project-tags" className={editorLabelClass}>
              태그 (콤마 구분)
            </label>
            <input
              id="project-tags"
              type="text"
              value={editing.tags}
              onChange={(e) => setEditing({ ...editing, tags: e.target.value })}
              placeholder="Rust, React, TypeScript"
              className={editorInputClass}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="project-period" className={editorLabelClass}>
                기간
              </label>
              <input
                id="project-period"
                type="text"
                value={editing.period}
                onChange={(e) => setEditing({ ...editing, period: e.target.value })}
                placeholder="2026"
                className={editorInputClass}
              />
            </div>
            <div>
              <label htmlFor="project-role" className={editorLabelClass}>
                역할
              </label>
              <input
                id="project-role"
                type="text"
                value={editing.role}
                onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                placeholder="개인 프로젝트"
                className={editorInputClass}
              />
            </div>
            <div>
              <label htmlFor="project-url" className={editorLabelClass}>
                GitHub 레포 URL
              </label>
              <input
                id="project-url"
                type="text"
                value={editing.url}
                onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                placeholder="https://github.com/..."
                className={editorInputClass}
              />
            </div>
            <div>
              <label htmlFor="project-demo-url" className={editorLabelClass}>
                배포/데모 URL
              </label>
              <input
                id="project-demo-url"
                type="text"
                value={editing.demo_url}
                onChange={(e) => setEditing({ ...editing, demo_url: e.target.value })}
                placeholder="https://... (선택)"
                className={editorInputClass}
              />
            </div>
          </div>

          <div>
            <span className={editorLabelClass}>첨부 파일 (이미지 / PDF)</span>
            <div className="flex flex-col gap-2">
              {editing.attachments.map((attachment) => (
                <div
                  key={attachment.url}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-1 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium uppercase text-ink-subdued">
                      {attachment.kind}
                    </span>
                    <span className="truncate text-sm text-ink">{attachment.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAttachment(attachment.url)}
                    aria-label={`${attachment.name} 삭제`}
                    className="shrink-0 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 transition-colors duration-[240ms] hover:bg-red-50"
                  >
                    삭제
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,application/pdf,.pdf"
                  onChange={handleUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink transition-colors duration-[120ms] hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploading ? "업로드 중..." : "파일 추가"}
                </button>
                <p className="text-xs text-ink-subdued">png/jpg/gif/webp/svg/pdf, 최대 20MB</p>
              </div>
            </div>
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
        <h2 className="text-lg font-semibold text-navy">프로젝트 목록</h2>
        <button
          type="button"
          onClick={startCreate}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors duration-[120ms] hover:bg-primary-hover active:bg-primary-pressed"
        >
          새 프로젝트
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {projects === null && !loadError && (
          <p className="text-sm text-ink-muted">불러오는 중...</p>
        )}
        {loadError && (
          <p className="text-sm text-ink-muted">프로젝트 목록을 불러오지 못했습니다.</p>
        )}
        {projects?.length === 0 && (
          <p className="text-sm text-ink-muted">아직 등록된 프로젝트가 없습니다.</p>
        )}
        {projects?.map((project) => (
          <div
            key={project.id}
            className="flex items-center justify-between gap-4 rounded-lg border border-border bg-canvas p-4 shadow-card"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium text-ink">{project.title}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    project.published
                      ? "bg-success/10 text-success"
                      : "bg-surface-2 text-ink-subdued"
                  }`}
                >
                  {project.published ? "발행됨" : "비공개"}
                </span>
              </div>
              <div className="mt-0.5 truncate text-xs text-ink-subdued">
                {project.status}
                {project.tags.length > 0 && ` · ${project.tags.join(", ")}`}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => startEdit(project)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink transition-colors duration-[240ms] hover:bg-surface-1"
              >
                수정
              </button>
              <button
                type="button"
                onClick={() => handleDelete(project)}
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

export default ProjectManager;