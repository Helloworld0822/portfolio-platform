import { authFetch } from "./api";

export const attachmentAccept = ".png,.jpg,.jpeg,.gif,.webp,.svg,.pdf,.ppt,.pptx";

export const keyboardIllustration = {
  name: "AI 삽화 · 남색 키보드",
  url: "/images/keyboard-still-life.webp",
  kind: "image",
};

export function attachmentKind(filename: string) {
  if (/\.pptx?$/i.test(filename)) return "presentation";
  if (/\.pdf$/i.test(filename)) return "pdf";
  return "image";
}

export async function uploadAttachment(file: File): Promise<string> {
  const data = new FormData();
  data.append("file", file);
  const response = await authFetch("/api/admin/uploads", { method: "POST", body: data });
  if (!response.ok) throw new Error("Upload failed");
  const { url } = await response.json() as { url: string };
  return url;
}
