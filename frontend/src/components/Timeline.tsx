const events = [
  {
    period: "2026.02",
    title: "Grizzly Hacks 2 우승",
    org: "Grizzly Hacks",
    description: "해커톤에서 우승을 수상했습니다.",
  },
  {
    period: "2026.07",
    title: "선린톤 은상",
    org: "선린톤",
    description: "Crackseal 프로젝트로 은상을 수상했습니다.",
  },
  {
    period: "2026.03 — 현재",
    title: "TAPIE 4기 개발자",
    org: "TAPIE",
    description:
      "동아리 웹·앱 프로젝트 개발에 참여하며, 여러 팀 프로젝트를 진행하고 있습니다.",
  },
  {
    period: "2026.03 — 현재",
    title: "소프트웨어과 121기",
    org: "선린인터넷고등학교",
    description:
      "풀스택 개발, 알고리즘 문제 풀이를 통해 Rust·Elixir 기반 개인 프로젝트를 꾸준히 진행하고 있습니다.",
  },
];

const Timeline = () => {
  return (
    <section id="timeline" className="bg-canvas px-4 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-3xl font-semibold tracking-tight text-navy">경력</h2>
        <p className="mt-2 text-ink-muted">활동 경험과 주요 이정표.</p>

        <div className="mt-10 space-y-0">
          {events.map((event, index) => (
            <div
              key={event.title}
              className={`flex gap-6 border-l-2 border-border py-8 pl-8 ${
                index === 0 ? "border-l-primary" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-primary">{event.period}</p>
                <h3 className="mt-1 text-xl font-semibold text-ink">{event.title}</h3>
                <p className="mt-1 text-ink-muted">{event.org}</p>
                <p className="mt-3 text-ink-muted">{event.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Timeline;
