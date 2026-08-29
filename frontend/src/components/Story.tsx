const Story = () => {
  return (
    <section id="story" className="px-4 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-3xl font-semibold tracking-tight text-navy">소개</h2>
        <p className="mt-2 text-ink-muted">저는 어떤 사람이고, 무엇을 중요하게 생각하는지.</p>
      </div>

      <div className="mx-auto mt-10 max-w-5xl rounded-lg border border-border bg-canvas p-8 shadow-card md:p-10">
        <div className="flex flex-col items-center gap-6 md:flex-row md:items-center">
          <img
            src="https://avatars.githubusercontent.com/u/59504422?v=4"
            alt="전재민 프로필"
            className="size-32 shrink-0 rounded-full border border-border object-cover shadow-card md:size-36"
          />
          <div className="flex flex-1 flex-col justify-center">
            <p className="text-base leading-relaxed text-ink md:text-lg">
              저는 선린인터넷고등학교 소프트웨어과 121기로 재학중이고 TAPIE 4기 개발자로 활동중인 전재민입니다.
              <br />
              풀스택 개발자이고 최근에는 Rust와 Elixir에 관심을 가지게 되어 공부 하고 있습니다.
            </p>
            <p className="mt-6 leading-relaxed text-ink-muted">
              그리고 극한의 효율과 최적화를 추구 하는 개발자로써 꾸준히 성장하는 모습을 보여주고 싶습니다!
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Story;
