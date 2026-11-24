import { useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import type { Project } from "../lib/project";

export default function ProjectSlides({ project, compact = false }: { project: Project; compact?: boolean }) {
  const images = project.attachments?.filter(item => item.kind === "image") ?? [];
  const slides = [...images.map(item => ({ title: item.name, image: item.url })), ...project.details.map(title => ({ title, image: "" }))];
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  if (!slide) return null;

  return <section aria-label="프로젝트 자료" className={compact ? "min-w-0 bg-[#0c1816] p-4 md:p-6" : "mb-12 rounded-xl bg-surface-container-highest p-2 shadow-xl md:p-3"}>
    <div className="overflow-hidden rounded-lg bg-[#0e1312] text-white">
      <div className="flex items-center gap-3 border-b border-white/10 bg-[#141b19] px-4 py-3 font-code-sm text-code-sm">
        <span className="size-2.5 rounded-sm bg-tier-platinum" aria-hidden="true" />
        <span className="truncate">{project.title} <span className="text-white/60">:: 프로젝트 자료</span></span>
        <span className="ml-auto whitespace-nowrap text-white/65">{slide.image ? "첨부 이미지" : "구현 내역"}</span>
      </div>
      <div className="flex aspect-[16/9] min-h-52 items-center justify-center border-y border-white/5 bg-[radial-gradient(#294039_1px,transparent_1px)] bg-size-[16px_16px] p-5 md:p-8" aria-live="polite">
        {slide.image ? <a href={slide.image} target="_blank" rel="noreferrer" className="relative flex h-full w-full justify-center">
          <img src={slide.image} alt={slide.title} className="max-h-full max-w-full object-contain" />
          <span className="absolute right-1 top-1 flex gap-1 rounded bg-black/75 p-2 text-xs"><ExternalLink size={14} />원본 보기</span>
        </a> : <div className="max-w-xl rounded-lg border border-secondary bg-[#142420] p-5 md:p-7">
          <p className="mb-3 font-code-sm text-code-sm text-secondary-fixed">{project.title}</p>
          <p className="text-pretty font-semibold leading-relaxed md:text-lg">{slide.title}</p>
        </div>}
      </div>
      <div className="flex items-center justify-between gap-4 bg-[#141b19] px-4 py-2 font-code-sm text-code-sm text-white/80">
        <span>{String(index + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}</span>
        {slides.length > 1 && <div className="flex gap-1">
          <button type="button" aria-label="이전 자료" disabled={index === 0} onClick={() => setIndex(index - 1)} className="rounded p-2 hover:bg-white/10 disabled:opacity-30"><ArrowLeft size={15} /></button>
          <button type="button" aria-label="다음 자료" disabled={index === slides.length - 1} onClick={() => setIndex(index + 1)} className="rounded p-2 hover:bg-white/10 disabled:opacity-30"><ArrowRight size={15} /></button>
        </div>}
      </div>
    </div>
  </section>;
}
