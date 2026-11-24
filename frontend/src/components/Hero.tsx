import type { Profile } from "../lib/profile";
import { useReveal } from "../lib/useReveal";

export default function Hero({ profile }: { profile: Profile }) {
  const { ref, className } = useReveal<HTMLElement>();
  return (
    <section ref={ref} className={`relative w-full pt-space-md ${className}`} id="hero">
      <div className="relative overflow-hidden rounded-xl bg-primary-container text-on-primary shadow-xl p-space-lg md:p-space-xl lg:p-space-2xl" id="story">
        <div className="absolute -right-20 -top-24 w-96 h-96 rounded-full bg-secondary/20 blur-3xl pointer-events-none">
        </div>
        <div className="absolute -left-20 -bottom-20 w-80 h-80 rounded-full bg-tier-platinum/10 blur-2xl pointer-events-none">
        </div>
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-center">
          <div className="lg:col-span-7 flex flex-col space-y-space-md">
            <div className="inline-flex items-center gap-2 w-fit px-3 py-1 rounded-full bg-surface-container-lowest/10 backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-tier-platinum">
              </span>
              <span className="font-code-sm text-code-sm tracking-wider uppercase text-primary-fixed">
                {profile.affiliation}
              </span>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-space-md gap-y-1">
              <h1 className="font-display text-display text-on-primary tracking-tight font-bold">
                {profile.name}
              </h1>
              <span className="font-body-lg text-body-lg text-primary-fixed-dim italic">
                {profile.englishName}
              </span>
            </div>
            <p className="font-headline-md text-headline-md text-primary-fixed font-medium leading-snug">
              {profile.statement}
            </p>
            <p className="font-body-md text-body-md text-surface-container-high max-w-xl leading-relaxed">
              {profile.bio}
            </p>
            <div className="pt-space-sm flex flex-wrap items-center gap-space-sm">
              <a className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-surface-container-lowest text-primary font-body-sm text-body-sm font-semibold shadow-sm hover:bg-surface-container-low transition-colors" href="#projects">
                <span>
                  프로젝트 보기
                </span>
                <span className="material-symbols-outlined text-[16px]">
                  arrow_downward
                </span>
              </a>
              <a className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface-container-lowest/15 hover:bg-surface-container-lowest/25 text-on-primary font-body-sm text-body-sm font-medium transition-colors" href={`https://github.com/${profile.github}`} rel="noreferrer" target="_blank">
                <span>
                  GitHub 바로가기
                </span>
                <span className="material-symbols-outlined text-[16px]">
                  open_in_new
                </span>
              </a>
              <a className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface-container-lowest/15 hover:bg-surface-container-lowest/25 text-on-primary font-body-sm text-body-sm font-medium transition-colors" href="#stats">
                <span>
                  Solved.ac 지표
                </span>
                <span className="material-symbols-outlined text-[16px]">
                  terminal
                </span>
              </a>
              <a className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-primary-fixed-dim hover:text-on-primary font-body-sm text-body-sm transition-colors" href="#contact">
                <span>
                  연락하기
                </span>
                <span className="material-symbols-outlined text-[16px]">
                  mail
                </span>
              </a>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-space-md font-code-sm text-code-sm text-primary-fixed-dim">
              {profile.skills.find(group => group.category === "Backend")?.items.map(skill => <a key={skill.name} href="#skills" className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-secondary-fixed" />{skill.name}</a>)}
            </div>
          </div>
          <div className="lg:col-span-5 relative flex justify-center items-center">
            <div className="relative w-full max-w-[360px] aspect-[4/3] sm:aspect-square rounded-xl overflow-hidden shadow-2xl bg-primary">
              <img alt="프로필 사진" className="w-full h-full object-cover object-center filter saturate-90 brightness-95" src={profile.photo || "/images/jaemin.jpg"}/>
              <div className="absolute inset-0 bg-gradient-to-t from-primary-container via-transparent to-transparent opacity-80">
              </div>
              <a className="absolute bottom-4 left-4 right-4 p-3 rounded-lg bg-surface/90 backdrop-blur-md text-on-surface shadow-md flex items-center justify-between" href={`https://github.com/${profile.github}`}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-secondary-fixed flex items-center justify-center text-primary font-bold text-xs">
                    JM
                  </div>
                  <div className="flex flex-col">
                    <span className="font-code-sm text-code-sm font-semibold text-text-primary">
                      {profile.github}
                    </span>
                    <span className="font-body-sm text-[11px] text-text-secondary">
                      GitHub Profile
                    </span>
                  </div>
                </div>
                ↗
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
