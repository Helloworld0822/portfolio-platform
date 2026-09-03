import { useEffect, useState } from "react";

interface TimelineEntry {
  id: string;
  period: string;
  title: string;
  org: string;
  description: string;
  sort_order: number;
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

  return (
    <section id="timeline" className="bg-canvas px-4 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-3xl font-semibold tracking-tight text-navy">경력</h2>
        <p className="mt-2 text-ink-muted">활동 경험과 주요 이정표.</p>

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
          <div className="mt-10 space-y-0">
            {entries.map((entry, index) => (
              <div
                key={entry.id}
                className={`flex gap-6 border-l-2 border-border py-8 pl-8 ${
                  index === 0 ? "border-l-primary" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-primary">{entry.period}</p>
                  <h3 className="mt-1 text-xl font-semibold text-ink">{entry.title}</h3>
                  {entry.org && <p className="mt-1 text-ink-muted">{entry.org}</p>}
                  {entry.description && (
                    <p className="mt-3 text-ink-muted">{entry.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default Timeline;