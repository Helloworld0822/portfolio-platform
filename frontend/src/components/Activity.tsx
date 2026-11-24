import { ArrowUpRight } from "lucide-react";
import { SiSolveddotac } from "react-icons/si";

import { usePublicData } from "../lib/usePublicData";
import { useReveal } from "../lib/useReveal";
import GithubActivity from "./GithubActivity";

type Profile = { handle: string; tier: number; rating: number; solvedCount: number };

const tierGroups = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Ruby"];
const tierColors = ["bg-tier-bronze", "bg-tier-silver", "bg-tier-gold", "bg-tier-platinum", "bg-tier-diamond", "bg-tier-ruby"];
const ranks = ["V", "IV", "III", "II", "I"];
const thresholds = [
  0, 30, 60, 90, 120, 150, 200, 300, 400, 500, 650, 800, 950, 1100, 1250, 1400,
  1600, 1750, 1900, 2000, 2100, 2200, 2300, 2400, 2500, 2600, 2700, 2800, 2850, 2900, 2950, 3000,
];

function tierName(tier: number) {
  if (tier === 0) return "Unrated";
  if (tier === 31) return "Master";
  return `${tierGroups[Math.floor((tier - 1) / 5)]} ${ranks[(tier - 1) % 5]}`;
}

function SolvedActivity() {
  const { data: profile, status } = usePublicData<Profile>("/api/activity/solved");
  const handle = profile?.handle || "a100822";
  const tier = profile?.tier ?? 0;
  const next = thresholds[tier + 1];
  const color = tierColors[Math.floor((tier - 1) / 5)] ?? "bg-primary";
  return (
    <article className="stitch-card flex min-w-0 flex-col justify-between gap-5 p-4 sm:p-6">
      <header className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary-container text-white"><SiSolveddotac aria-hidden size={25} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-headline-sm font-bold text-text-primary">solved.ac</h3>
            {profile && <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-subtle px-2 py-0.5 font-code-sm text-code-sm font-semibold text-primary">
              <span aria-hidden className={`size-2 rounded-full ${color}`} />{tierName(tier)}
            </span>}
          </div>
          <p className="font-code-sm text-code-sm text-ink-muted">@{handle}</p>
        </div>
        <a href={`https://solved.ac/ko/u/${encodeURIComponent(handle)}`} aria-label={`${handle}의 solved.ac 프로필`}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-subtle text-secondary hover:bg-surface-container">
          <ArrowUpRight size={16} aria-hidden />
        </a>
      </header>
      {profile ? <>
        {next !== undefined && <div>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-1 text-body-sm">
            <span className="text-ink-muted">다음 티어 <strong className="text-text-primary">{tierName(tier + 1)}</strong></span>
            <span className="font-code-sm text-code-sm tabular-nums text-ink-muted">{profile.rating.toLocaleString("ko-KR")} / {next.toLocaleString("ko-KR")}</span>
          </div>
          <div role="meter" aria-label={`${tierName(tier + 1)} 달성 레이팅`} aria-valuenow={Math.min(profile.rating, next)} aria-valuemin={0} aria-valuemax={next}
            className="h-2 overflow-hidden rounded-full bg-surface-container">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, profile.rating / next * 100)}%` }} />
          </div>
        </div>}
        <dl className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg bg-surface-subtle p-2"><dt className="text-code-sm text-ink-muted">해결한 문제</dt><dd className="text-headline-sm font-bold tabular-nums text-primary">{profile.solvedCount.toLocaleString("ko-KR")}개</dd></div>
          <div className="rounded-lg bg-surface-subtle p-2"><dt className="text-code-sm text-ink-muted">AC 레이팅</dt><dd className="text-headline-sm font-bold tabular-nums text-primary">{profile.rating.toLocaleString("ko-KR")}</dd></div>
        </dl>
      </> : <p role="status" className="py-4 text-body-sm text-ink-muted">{status ? "지표를 불러오지 못했습니다. solved.ac 프로필에서 확인할 수 있습니다." : "지표를 불러오는 중…"}</p>}
    </article>
  );
}

export default function Activity({ github }: { github: string }) {
  const { ref, className } = useReveal<HTMLElement>();
  return (
    <section ref={ref} id="stats" className={`w-full ${className}`}>
      <h2 className="section-heading before:bg-tier-platinum!">개발자 활동 및 지표</h2>
      <div className="reveal-list mt-4 grid gap-gutter lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-gutter-lg">
        <GithubActivity github={github} />
        <SolvedActivity />
      </div>
    </section>
  );
}
