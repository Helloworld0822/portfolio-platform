import { ArrowDown, ArrowUpRight } from "lucide-react";

export default function Hero() {
  return (
    <section id="hero" className="profile-hero">
      <div className="profile-intro" id="story">
        <h1>전재민<span lang="en">Jaemin Jeon</span></h1>
        <p className="profile-lead">백엔드와 개발 도구를 만드는 풀스택 개발자입니다.</p>
        <p className="profile-bio">선린인터넷고등학교 소프트웨어과 121기, TAPIE 4기 개발자로 활동하고 있습니다. Rust와 Elixir로 더 효율적인 시스템을 만드는 방법을 공부합니다.</p>
        <div className="profile-links">
          <a href="#projects">프로젝트 보기 <ArrowDown size={16} aria-hidden /></a>
          <a href="https://github.com/Helloworld0822" rel="me">GitHub <ArrowUpRight size={16} aria-hidden /></a>
        </div>
      </div>
      <figure className="profile-portrait">
        <img src="/images/jaemin.jpg" alt="해질 무렵 도시를 바라보는 전재민" width={460} height={460} fetchPriority="high" />
      </figure>
    </section>
  );
}
