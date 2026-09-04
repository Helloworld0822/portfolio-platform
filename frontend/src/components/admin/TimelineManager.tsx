import { useCallback, useEffect, useState } from "react";
import { authFetch } from "../../lib/api";
import TimelineEditor, { type EntryDraft } from "./TimelineEditor";

interface TimelineEntry {
  id: string;
  period: string;
  title: string;
  org: string;
  description: string;
  sort_order: number;
}

const emptyDraft: EntryDraft = {
  period: "",
  title: "",
  org: "",
  description: "",
};

const TimelineManager = () => {
  const [entries, setEntries] = useState<TimelineEntry[] | null>(null);
  const [editing, setEditing] = useState<EntryDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadEntries = useCallback(() => {
    setEntries(null);
    setLoadError(false);
    authFetch("/api/admin/timeline")
      .then((res) => {
        if (!res.ok) {
          throw new Error("failed to load timeline");
        }
        return res.json() as Promise<TimelineEntry[]>;
      })
      .then(setEntries)
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const startCreate = () => {
    setEditingId(null);
    setSaveError(null);
    setEditing(emptyDraft);
  };

  const startEdit = (entry: TimelineEntry) => {
    setEditingId(entry.id);
    setSaveError(null);
    setEditing({
      period: entry.period,
      title: entry.title,
      org: entry.org,
      description: entry.description,
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    loadEntries();
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

    try {
      const res = editingId
        ? await authFetch(`/api/admin/timeline/${editingId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(editing),
          })
        : await authFetch("/api/admin/timeline", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(editing),
          });

      if (!res.ok) {
        throw new Error("save failed");
      }

      setEditing(null);
      loadEntries();
    } catch {
      setSaveError("저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entry: TimelineEntry) => {
    if (!window.confirm(`"${entry.title}" 항목을 삭제할까요?`)) {
      return;
    }

    try {
      const res = await authFetch(`/api/admin/timeline/${entry.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("delete failed");
      }
      loadEntries();
    } catch {
      setLoadError(true);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    if (!entries) {
      return;
    }
    const target = index + direction;
    if (target < 0 || target >= entries.length) {
      return;
    }

    const reordered = [...entries];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

    try {
      const res = await authFetch("/api/admin/timeline/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: reordered.map((e) => e.id) }),
      });
      if (!res.ok) {
        throw new Error("reorder failed");
      }
      loadEntries();
    } catch {
      setLoadError(true);
    }
  };

  if (editing) {
    return (
      <TimelineEditor
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
        <h2 className="text-lg font-semibold text-navy">경력 목록</h2>
        <button
          type="button"
          onClick={startCreate}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors duration-[120ms] hover:bg-primary-hover active:bg-primary-pressed"
        >
          새 경력
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {entries === null && !loadError && (
          <p className="text-sm text-ink-muted">불러오는 중...</p>
        )}
        {loadError && (
          <p className="text-sm text-ink-muted">경력 목록을 불러오지 못했습니다.</p>
        )}
        {entries?.length === 0 && (
          <p className="text-sm text-ink-muted">아직 등록된 경력이 없습니다.</p>
        )}
        {entries?.map((entry, index) => (
          <div
            key={entry.id}
            className="flex items-center justify-between gap-4 rounded-lg border border-border bg-canvas p-4 shadow-card"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-subdued">{index + 1}</span>
                <span className="truncate font-medium text-ink">{entry.title}</span>
              </div>
              <div className="mt-0.5 truncate text-xs text-ink-subdued">
                {entry.period}
                {entry.org && ` · ${entry.org}`}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label="위로"
                className="rounded-md border border-border px-2 py-1.5 text-xs font-medium text-ink transition-colors duration-[240ms] hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === entries.length - 1}
                aria-label="아래로"
                className="rounded-md border border-border px-2 py-1.5 text-xs font-medium text-ink transition-colors duration-[240ms] hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => startEdit(entry)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink transition-colors duration-[240ms] hover:bg-surface-1"
              >
                수정
              </button>
              <button
                type="button"
                onClick={() => handleDelete(entry)}
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

export default TimelineManager;