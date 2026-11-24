import { BriefcaseBusiness } from "lucide-react";
import { usePublicData } from "../lib/usePublicData";
import { useReveal } from "../lib/useReveal";

import type { ProjectAttachment } from "../lib/project";

interface TimelineEntry {
  attachments?: ProjectAttachment[];
  id: string;
  period: string;
  title: string;
  org: string;
  description: string;
  sort_order: number;
  icon_url: string;
}

const Timeline = () => {
  const { data: entries, status } = usePublicData<TimelineEntry[]>("/api/timeline");
  const loading = !status;
  const error = status >= 400;

  const { ref, className } = useReveal<HTMLDivElement>();

  return (
    <section id="timeline" className="min-w-0">
      <div ref={ref} className={className}>
        <h2 className="section-heading">경력과 활동 {entries && entries.length > 0 && <span className="ml-auto font-code-sm text-code-sm font-normal text-text-muted">{entries.length} Milestones</span>}</h2>
        <p className="section-description">활동 경험과 주요 이정표.</p>

        {loading && (
          <p className="mt-10 text-sm text-ink-muted">불러오는 중...</p>
        )}
        {!loading && error && (
          <p className="mt-10 text-sm text-ink-muted">경력을 불러오지 못했습니다.</p>
        )}
        {!loading && !error && entries?.length === 0 && (
          <p className="mt-10 text-sm text-ink-muted">등록된 경력이 없습니다.</p>
        )}

        {!loading && !error && entries && entries.length > 0 && (
          <div className="reveal-list ml-2 space-y-4 border-l border-border pl-5">
            {entries.map((entry) => {
              const icon = entry.attachments?.find(item => item.kind === "icon")?.url || entry.icon_url;
              return (
                <div
                  key={entry.id}
                  className="timeline-entry stitch-card relative space-y-1.5 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-primary-fixed px-2 py-0.5 font-code-sm text-code-sm font-semibold text-primary">{entry.period}</span>
                    {icon ? <img src={icon} alt="" loading="lazy" className="size-5 object-contain" /> :
                      <BriefcaseBusiness aria-hidden="true" className="size-3.5 text-text-muted" />}
                    <span className="font-code-sm text-code-sm text-text-secondary">{entry.org}</span>
                  </div>
                  <h3 className="text-headline-sm font-bold text-text-primary">{entry.title}</h3>
                  {entry.description && <p className="whitespace-pre-line text-body-md text-text-secondary">{entry.description}</p>}
                  {entry.attachments?.some(item => item.kind === "image") && <div className="flex flex-wrap gap-2 pt-2">
                    {entry.attachments.filter(item => item.kind === "image").map(image => <a href={image.url} key={image.url} target="_blank" rel="noreferrer">
                      <img src={image.url} alt={image.name} loading="lazy" decoding="async" className="aspect-[4/3] w-32 rounded-lg object-cover" />
                    </a>)}
                  </div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default Timeline;
