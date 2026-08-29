const Hero = () => {
  return (
    <section className="bg-navy px-4 py-24 md:px-8 md:py-32">
      <div className="mx-auto max-w-5xl">
        <p className="mb-4 text-sm font-medium tracking-wide text-ink-on-navy-muted uppercase">
          Portfolio
        </p>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-white md:text-5xl md:leading-[1.15]">
          명확함과 정교함으로
          <br />
          안정적인 시스템을 만듭니다.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-ink-on-navy-muted">
          안녕하세요, 전재민입니다. 백엔드 엔지니어링, 성능 최적화,
          깔끔한 아키텍처에 관심을 가진 개발자입니다.
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <a
            href="#projects"
            className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-white transition-colors duration-[120ms] hover:bg-primary-hover active:bg-primary-pressed"
          >
            프로젝트 보기
          </a>
          <a
            href="#story"
            className="rounded-md border border-white/30 px-6 py-3 text-sm font-medium text-white transition-colors duration-[240ms] hover:border-white/60 hover:bg-white/5"
          >
            소개 읽기
          </a>
        </div>
      </div>
    </section>
  );
};

export default Hero;
