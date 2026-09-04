interface EntryDraft {
  period: string;
  title: string;
  org: string;
  description: string;
}

interface TimelineEditorProps {
  editingId: string | null;
  draft: EntryDraft;
  saving: boolean;
  error: string | null;
  onChange: (draft: EntryDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}

const editorLabelClass = "mb-1.5 block text-sm font-medium text-ink";
const editorInputClass =
  "w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm text-ink outline-none transition-colors duration-[120ms] focus-visible:border-primary";

const TimelineEditor = ({
  editingId,
  draft,
  saving,
  error,
  onChange,
  onSave,
  onCancel,
}: TimelineEditorProps) => {
  return (
    <div>
      <h2 className="text-lg font-semibold text-navy">
        {editingId ? "경력 수정" : "새 경력"}
      </h2>

      <div className="mt-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="timeline-period" className={editorLabelClass}>
              기간
            </label>
            <input
              id="timeline-period"
              type="text"
              value={draft.period}
              onChange={(e) => onChange({ ...draft, period: e.target.value })}
              placeholder="2026.02"
              className={editorInputClass}
            />
          </div>
          <div>
            <label htmlFor="timeline-org" className={editorLabelClass}>
              소속/기관
            </label>
            <input
              id="timeline-org"
              type="text"
              value={draft.org}
              onChange={(e) => onChange({ ...draft, org: e.target.value })}
              placeholder="Grizzly Hacks"
              className={editorInputClass}
            />
          </div>
        </div>

        <div>
          <label htmlFor="timeline-title" className={editorLabelClass}>
            제목
          </label>
          <input
            id="timeline-title"
            type="text"
            value={draft.title}
            onChange={(e) => onChange({ ...draft, title: e.target.value })}
            className={editorInputClass}
          />
        </div>

        <div>
          <label htmlFor="timeline-description" className={editorLabelClass}>
            설명
          </label>
          <textarea
            id="timeline-description"
            value={draft.description}
            onChange={(e) => onChange({ ...draft, description: e.target.value })}
            rows={3}
            className={editorInputClass}
          />
        </div>

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

export default TimelineEditor;
export type { EntryDraft };