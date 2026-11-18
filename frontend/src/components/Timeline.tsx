import { useEffect, useState } from "react";
import type { ProjectAttachment } from "./ProjectModal";
import { useReveal } from "../lib/useReveal";

interface TimelineEntry {
  id: string;
  period: string;
  title: string;
  org: string;
  description: string;
  sort_order: number;
  attachments?: ProjectAttachment[];
}

const Timeline = () => {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/timeline")
      .then((res) => {
        if (!res.ok) {
          throw new Error("failed to load timeline");
        }
        return res.json() as Promise<TimelineEntry[]>;
      })
      .then((data) => setEntries(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const { ref, className } = useReveal<HTMLDivElement>();

  return (
    <section id="timeline" className="experience" aria-labelledby="experience-heading">
      <div ref={ref} className={className}>
        <h2 id="experience-heading" className="section-heading">경력과 활동</h2>

        {loading && (
          <p className="mt-10 text-sm text-ink-muted">불러오는 중...</p>
        )}
        {!loading && error && (
          <p className="mt-10 text-sm text-ink-muted">경력을 불러오지 못했습니다.</p>
        )}
        {!loading && !error && entries.length === 0 && (
          <p className="mt-10 text-sm text-ink-muted">등록된 경력이 없습니다.</p>
        )}

        {!loading && !error && entries.length > 0 && (
          <ol className="experience-list">
            {entries.map(entry => {
              const images = entry.attachments?.filter(a => a.kind === "image");
              const icon = entry.attachments?.find(a => a.kind === "icon");
              return (
                <li key={entry.id}>
                  <span className="experience-date">{entry.period}</span>
                  <div>
                    <h3>{icon && <img src={icon.url} alt="" width={26} height={26} loading="lazy" />}{entry.title}</h3>
                    {entry.org && <p className="experience-org">{entry.org}</p>}
                    {entry.description && <p className="experience-description">{entry.description}</p>}
                    {!!images?.length && <div className="experience-gallery">{images.map(a =>
                      <a key={a.url} href={a.url} target="_blank" rel="noreferrer">
                        <img src={a.url} alt={a.name} loading="lazy" decoding="async" />
                      </a>)}</div>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
};

export default Timeline;