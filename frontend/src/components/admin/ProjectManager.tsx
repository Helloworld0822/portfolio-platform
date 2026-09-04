import { useCallback, useEffect, useState } from "react";
import { authFetch } from "../../lib/api";
import GithubImportModal, { type GithubRepo } from "./GithubImportModal";
import ProjectEditor, {
  emptyProjectDraft,
  toProjectDraft,
  type ProjectAttachment,
  type ProjectDraft,
} from "./ProjectEditor";

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

const ProjectManager = () => {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [editing, setEditing] = useState<ProjectDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

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
    setEditing(emptyProjectDraft);
  };

  const addedUrls = new Set(
    (projects ?? [])
      .map((p) => p.url?.replace(/\/+$/, ""))
      .filter((url): url is string => Boolean(url)),
  );

  const importRepo = (repo: GithubRepo) => {
    setEditingId(null);
    setSaveError(null);
    setEditing({
      title: repo.name,
      description: repo.description ?? "",
      details: "",
      tags: repo.language ?? "",
      status: "진행 중",
      period: "",
      role: "",
      url: repo.html_url,
      demo_url: "",
      attachments: [],
      published: true,
    });
    setImportOpen(false);
  };

  const startEdit = (project: Project) => {
    setEditingId(project.id);
    setSaveError(null);
    setEditing(toProjectDraft(project));
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

    const details = editing.details.split("\n").map((l) => l.trim()).filter(Boolean);
    const tags = editing.tags.split(",").map((t) => t.trim()).filter(Boolean);

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

  if (editing) {
    return (
      <ProjectEditor
        editingId={editingId}
        draft={editing}
        saving={saving}
        error={saveError}
        onChange={setEditing}
        onSave={handleSave}
        onCancel={cancelEdit}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-navy">프로젝트 목록</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink transition-colors duration-[120ms] hover:bg-surface-1"
          >
            GitHub에서 가져오기
          </button>
          <button
            type="button"
            onClick={startCreate}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors duration-[120ms] hover:bg-primary-hover active:bg-primary-pressed"
          >
            새 프로젝트
          </button>
        </div>
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

      {importOpen && (
        <GithubImportModal
          addedUrls={addedUrls}
          onImport={importRepo}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
};

export default ProjectManager;