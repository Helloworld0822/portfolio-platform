import { ArrowUpRight } from "lucide-react";
import { SiGithub } from "react-icons/si";
import { usePublicData } from "../lib/usePublicData";

type Day = { date: string; count: number; level: number };

const levels = [
  "var(--color-surface-container-high)", "var(--color-primary-fixed-dim)",
  "var(--color-surface-tint)", "var(--color-primary-container)", "var(--color-primary)",
];

function Calendar({ days }: { days: Day[] }) {
  const offset = new Date(days[0].date).getUTCDay();
  const columns = Math.ceil((days.length + offset) / 7);
  return (
    <div className="overflow-x-auto" role="region" aria-label="월별 GitHub 기여 달력" tabIndex={0}>
      <svg role="img" aria-label="최근 1년의 일별 기여 횟수. 진한 색일수록 기여가 많습니다."
        viewBox={`0 0 ${columns * 12} 105`} className="block w-full min-w-[480px]">
        {days.map(({ date, count, level }, index) => {
          const column = Math.floor((index + offset) / 7);
          return (
            <g key={date}>
              {date.endsWith("-01") && column < columns - 1 &&
                <text x={column * 12} y="12" className="fill-ink-muted font-code-sm text-[11px]">{Number(date.slice(5, 7))}월</text>}
              <rect x={column * 12} y={22 + ((index + offset) % 7) * 12} width="9.5" height="9.5" rx="2" fill={levels[level]}>
                <title>{date} · 기여 {count}회</title>
              </rect>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function GithubActivity({ github }: { github: string }) {
  const handle = encodeURIComponent(github);
  const { data, status } = usePublicData<{ contributions: Day[] }>(
    `https://github-contributions-api.jogruber.de/v4/${handle}?y=last`,
  );
  const days = data?.contributions;
  const ready = Array.isArray(days) && days.length > 0 && days.every(day =>
    day && /^\d{4}-\d{2}-\d{2}$/.test(day.date) && Number.isInteger(day.count) && day.count >= 0 &&
    Number.isInteger(day.level) && day.level >= 0 && day.level < levels.length);
  let total = 0, streak = 0, longest = 0;
  if (ready) {
    for (const day of days) {
      total += day.count;
      streak = day.count ? streak + 1 : 0;
      longest = Math.max(longest, streak);
    }
  }
  return (
    <article className="stitch-card flex min-w-0 flex-col justify-between gap-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-container text-white"><SiGithub aria-hidden size={21} /></span>
          <div>
            <h3 className="text-headline-sm font-bold text-text-primary">GitHub Contributions</h3>
            <a className="inline-flex items-center gap-1 font-code-sm text-code-sm text-secondary hover:underline" href={`https://github.com/${handle}`}>
              @{github}<ArrowUpRight aria-hidden size={13} />
            </a>
          </div>
        </div>
        {ready && <p className="text-body-sm text-ink-muted">최장 연속 <b className="rounded bg-surface-subtle px-1.5 py-1 text-primary">{longest}일</b></p>}
      </header>
      {ready ? <>
        <Calendar days={days} />
        <footer className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-body-sm text-ink-muted">최근 1년 기여 <strong className="text-text-primary">{total.toLocaleString("ko-KR")}회</strong></p>
          <div aria-hidden className="flex items-center gap-1 font-code-sm text-code-sm text-ink-muted">
            적음 {levels.map(color => <span key={color} className="size-2.5 rounded-[2px]" style={{ backgroundColor: color }} />)} 많음
          </div>
        </footer>
      </> : <p role="status" className="py-4 text-body-sm text-ink-muted">{status ? "잔디를 불러오지 못했습니다. GitHub 프로필에서 확인할 수 있습니다." : "기여 기록을 불러오는 중…"}</p>}
    </article>
  );
}
