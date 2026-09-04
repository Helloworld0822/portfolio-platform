import ProjectAttachmentsEditor from "./ProjectAttachmentsEditor";

export interface ProjectAttachment {
  name: string;
  url: string;
  kind: string;
}

export interface ProjectDraft {
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
}

export const emptyProjectDraft: ProjectDraft = {
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

export const toProjectDraft = (project: {
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
}): ProjectDraft => ({
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

interface ProjectEditorProps {
  editingId: string | null;
  draft: ProjectDraft;
  saving: boolean;
  error: string | null;
  onChange: (draft: ProjectDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}

const editorLabelClass = "mb-1.5 block text-sm font-medium text-ink";
const editorInputClass =
  "w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm text-ink outline-none transition-colors duration-[120ms] focus-visible:border-primary";

const statusOptions = ["진행 중", "완료"];

const ProjectEditor = ({
  editingId,
  draft,
  saving,
  error,
  onChange,
  onSave,
  onCancel,
}: ProjectEditorProps) => {
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
              value={draft.title}
              onChange={(e) => onChange({ ...draft, title: e.target.value })}
              className={editorInputClass}
            />
          </div>
          <div>
            <label htmlFor="project-status" className={editorLabelClass}>
              상태
            </label>
            <select
              id="project-status"
              value={draft.status}
              onChange={(e) => onChange({ ...draft, status: e.target.value })}
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
            value={draft.description}
            onChange={(e) => onChange({ ...draft, description: e.target.value })}
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
            value={draft.details}
            onChange={(e) => onChange({ ...draft, details: e.target.value })}
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
            value={draft.tags}
            onChange={(e) => onChange({ ...draft, tags: e.target.value })}
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
              value={draft.period}
              onChange={(e) => onChange({ ...draft, period: e.target.value })}
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
              value={draft.role}
              onChange={(e) => onChange({ ...draft, role: e.target.value })}
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
              value={draft.url}
              onChange={(e) => onChange({ ...draft, url: e.target.value })}
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
              value={draft.demo_url}
              onChange={(e) => onChange({ ...draft, demo_url: e.target.value })}
              placeholder="https://... (선택)"
              className={editorInputClass}
            />
          </div>
        </div>

        <ProjectAttachmentsEditor
          attachments={draft.attachments}
          onChange={(attachments) => onChange({ ...draft, attachments })}
        />

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={draft.published}
            onChange={(e) => onChange({ ...draft, published: e.target.checked })}
            className="size-4 accent-primary"
          />
          발행
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-white transition-colors duration-[120ms] hover:bg-primary-hover active:bg-primary-pressed disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-5 py-2 text-sm font-medium text-ink transition-colors duration-[240ms] hover:bg-surface-1"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectEditor;