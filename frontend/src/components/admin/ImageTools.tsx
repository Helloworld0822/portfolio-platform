import { useId, useState } from "react";
import { authFetch } from "../../lib/api";
import { keyboardIllustration, uploadAttachment } from "../../lib/attachments";
import type { ProjectAttachment } from "./ProjectEditor";

interface Props {
  onInsert: (file: ProjectAttachment) => void;
  onBusy: (busy: boolean) => void;
  uploadKeyboard?: boolean;
}

const buttonClass = "rounded-md border border-border px-3 py-1.5 text-sm text-ink hover:bg-surface-1 disabled:opacity-50";

export default function ImageTools({ onInsert, onBusy, uploadKeyboard }: Props) {
  const promptId = useId();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function insertKeyboard() {
    setError("");
    if (!uploadKeyboard) {
      onInsert(keyboardIllustration);
      return;
    }
    onBusy(true);
    try {
      const image = await fetch(keyboardIllustration.url);
      if (!image.ok) throw new Error("Illustration unavailable");
      const file = new File([await image.blob()], "keyboard-still-life.webp", { type: "image/webp" });
      const url = await uploadAttachment(file);
      onInsert({ ...keyboardIllustration, url });
    } catch {
      setError("키보드 삽화를 삽입하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      onBusy(false);
    }
  }

  async function generate() {
    if (busy || !prompt.trim()) return;
    setError("");
    setBusy(true);
    onBusy(true);
    try {
      const response = await authFetch("/api/admin/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      if (!response.ok) {
        if (response.status === 503) {
          setError("이미지 생성 서비스를 사용할 수 없습니다. 서버의 API 키 설정을 확인해주세요.");
          return;
        }
        throw new Error("media request failed");
      }
      const { url } = await response.json() as { url: string };
      onInsert({ name: "AI 생성 이미지", kind: "image", url });
      setPrompt("");
    } catch {
      setError("이미지를 생성하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={buttonClass} onClick={insertKeyboard}>AI 키보드 삽화 삽입</button>
      </div>
      <label htmlFor={promptId} className="block text-sm font-medium text-ink">AI 이미지 설명</label>
      <div className="flex flex-wrap gap-2">
        <input id={promptId} value={prompt} onChange={event => setPrompt(event.target.value)}
          maxLength={1000} placeholder="예: 민트색 회로 기판의 접사"
          className="min-w-0 grow rounded-md border border-border bg-canvas px-3 py-2 text-sm" />
        <button type="button" className={buttonClass} disabled={busy || !prompt.trim()} onClick={generate}>
          생성해서 삽입
        </button>
      </div>
      {busy && <p role="status" className="text-sm text-ink-muted">이미지 생성 중…</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
