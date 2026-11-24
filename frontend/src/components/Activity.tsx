import { useState } from "react";
import { ArrowUpRight, Code2, Trophy } from "lucide-react";

import { usePublicData } from "../lib/usePublicData";

const solvedHandle = "a100822";
const solvedUrl = `https://solved.ac/ko/u/${solvedHandle}`;
const badgeUrl = `https://mazassumnida.wtf/api/generate_badge?boj=${solvedHandle}`;

type Profile = { tier: number; rating: number; solvedCount: number };

function tierName(tier: number) {
  if (tier === 0) return "Unrated";
  if (tier === 31) return "Master";
  const groups = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Ruby"];
  const ranks = ["V", "IV", "III", "II", "I"];
  return `${groups[Math.floor((tier - 1) / 5)]} ${ranks[(tier - 1) % 5]}`;
}

export default function Activity({ github }: { github: string }) {
  const {data: profile, status} = usePublicData<Profile>("/api/activity/solved");
  const [badgeFailed, setBadgeFailed] = useState(false);
  const [chartFailed, setChartFailed] = useState(false);

  return (
    <section id="stats" className="w-full">
      <h2 className="section-heading">개발자 활동 및 지표</h2>
      <div className="mt-6 grid gap-5 lg:grid-cols-[7fr_5fr]">
        <div className="min-w-0 stitch-card p-6">
          <h3 className="flex items-center gap-2 text-xl font-semibold text-navy"><Code2 size={21} />GitHub Contributions</h3>
          <a href={`https://github.com/${encodeURIComponent(github)}`} className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline">@{github} <ArrowUpRight size={14} /></a>
          {chartFailed ? <p className="mt-6 text-sm text-ink-muted">활동 기록은 GitHub에서 확인할 수 있습니다.</p> :
            <div className="mt-5 overflow-x-auto">
              <img src={`https://ghchart.rshah.org/39665f/${encodeURIComponent(github)}`} alt={`${github}의 최근 1년 GitHub 기여 달력`} width="663" height="104" loading="lazy" onError={() => setChartFailed(true)} className="w-full min-w-[480px]" />
            </div>}
        </div>
        <div className="stitch-card p-6">
          <h3 className="flex items-center gap-2 text-xl font-semibold text-navy"><Trophy size={21} />Solved.ac</h3>
          <a href={solvedUrl} className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline">@{solvedHandle} <ArrowUpRight size={14} /></a>
          {!badgeFailed && <a href={solvedUrl} className="mt-4 block w-fit max-w-full">
            <img src={badgeUrl} alt={solvedHandle + "의 solved.ac 티어 배지"} width="350" height="170" className="h-auto max-w-full" onError={() => setBadgeFailed(true)} />
          </a>}
          {profile ? <div className="mt-5 border-t border-border pt-4">
            <p className="text-2xl font-semibold text-primary">{tierName(profile.tier)}</p>
            <p className="mt-2 text-sm text-ink-muted">레이팅 {profile.rating.toLocaleString("ko-KR")} · 해결한 문제 {profile.solvedCount.toLocaleString("ko-KR")}개</p>
          </div> : badgeFailed && <p className="mt-6 text-sm text-ink-muted">{status ? "현재 지표를 불러올 수 없습니다. 프로필에서 확인해 주세요." : "지표를 불러오는 중…"}</p>}
        </div>
      </div>
    </section>
  );
}
