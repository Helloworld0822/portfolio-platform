import { useId, useState } from "react";
import { authFetch } from "../../lib/api";
import type { ProjectAttachment } from "./ProjectEditor";

interface Props {
  attachments: ProjectAttachment[];
  onChange: (items: ProjectAttachment[]) => void;
  onUploading: (busy: boolean) => void;
  allowPdf?: boolean;
}

const types = [
  { value: "image", label: "사진" },
  { value: "icon", label: "아이콘" },
  { value: "pdf", label: "PDF" },
];

export default function MediaEditor({ attachments, onChange, onUploading, allowPdf }: Props) {
  const id = useId();
  const [kind, setKind] = useState("image");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setError("20MB 이하의 파일을 선택해 주세요.");
      return;
    }
    const supported = kind === "pdf" ? /\.pdf$/i : /\.(png|jpe?g|gif|webp|svg)$/i;
    if (!supported.test(file.name)) {
      setError("선택한 용도에 맞는 파일을 선택해 주세요.");
      return;
    }
    const data = new FormData();
    data.append("file", file);
    setError("");
    onUploading(true);
    setBusy(true);
    try {
      const res = await authFetch("/api/admin/uploads", { method: "POST", body: data });
      if (!res.ok) throw new Error("upload");
      const { url } = await res.json() as { url: string };
      const remaining = kind === "icon" ? attachments.filter(item => item.kind !== "icon") : attachments;
      onChange([...remaining, { name: file.name, kind, url }]);
    } catch {
      setError("업로드하지 못했습니다. 파일 형식과 연결을 확인해 주세요.");
    } finally {
      setBusy(false);
      onUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">사진 · 아이콘{allowPdf && " · 자료"}</p>
      {attachments.map((item, index) => (
        <div key={item.url} className="flex items-center gap-3 rounded border border-border p-2">
          {item.kind !== "pdf" && <img src={item.url} alt="" width="40" height="40" className="size-10 object-contain" />}
          <label className="min-w-0 flex-1 text-xs text-ink-muted">
            {types.find(type => type.value === item.kind)?.label ?? "파일"} 설명
            <input value={item.name} onChange={e => onChange(attachments.map((a, i) => i === index ? { ...a, name: e.target.value } : a))}
              className="block w-full rounded border border-border bg-canvas px-2 py-1 text-sm text-ink" />
          </label>
          <button type="button" aria-label={item.name + " 삭제"} onClick={() => onChange(attachments.filter((_, i) => i !== index))} className="px-2 text-sm text-danger">삭제</button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label htmlFor={id}>파일 용도</label>
        <select id={id} value={kind} onChange={e => setKind(e.target.value)} className="rounded border border-border p-1">
          {types.filter(type => allowPdf || type.value !== "pdf").map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select>
        <label className="relative cursor-pointer rounded border border-border px-3 py-1.5 focus-within:outline-2">
          {busy ? "업로드 중…" : "파일 선택"}
          <input type="file" className="sr-only" disabled={busy}
            accept={kind === "pdf" ? "application/pdf,.pdf" : "image/png,image/jpeg,image/gif,image/webp,image/svg+xml"}
            onChange={e => void upload(e.currentTarget)} />
        </label>
      </div>
      <p className="text-xs text-ink-muted">사진은 여러 장, 아이콘은 한 개까지 등록할 수 있습니다. 파일당 최대 20MB.</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
