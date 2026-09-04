import { useRef, useState } from "react";
import { authFetch } from "../../lib/api";
import type { ProjectAttachment } from "./ProjectEditor";

interface ProjectAttachmentsEditorProps {
  attachments: ProjectAttachment[];
  onChange: (attachments: ProjectAttachment[]) => void;
}

const editorLabelClass = "mb-1.5 block text-sm font-medium text-ink";

const ProjectAttachmentsEditor = ({ attachments, onChange }: ProjectAttachmentsEditorProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) {
      return;
    }

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const formData = new FormData();
    formData.append("file", file);

    setUploading(true);
    setError(null);
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
      onChange([...attachments, { name: file.name, url: data.url, kind }]);
    } catch {
      setError("파일 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <span className={editorLabelClass}>첨부 파일 (이미지 / PDF)</span>
      <div className="flex flex-col gap-2">
        {attachments.map((attachment) => (
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
              onClick={() => onChange(attachments.filter((a) => a.url !== attachment.url))}
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
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
};

export default ProjectAttachmentsEditor;