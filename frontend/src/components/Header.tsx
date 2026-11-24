import { SiGithub } from "react-icons/si";
import { Mail, Send } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { BLOG_URL, PORTFOLIO_URL, isBlogHost, isPortfolioHost } from "../lib/site";

const navLinkClassName =
  "rounded-full px-2.5 py-2 text-sm text-ink-muted transition-colors duration-[240ms] hover:bg-surface-1 hover:text-primary";

const Header = () => {
  const { user, logout } = useAuth();

  const buildSectionHref = (id: string) => {
    // On the blog host, section anchors only exist on the portfolio site, so
    // link back to it. On the portfolio host, they're same-origin.
    const base = isBlogHost() ? PORTFOLIO_URL : "";
    return `${base}/#${id}`;
  };

  const blogHref = isPortfolioHost() ? `${BLOG_URL}/blog` : "/blog";
  const homeHref = isBlogHost() ? PORTFOLIO_URL : "/";

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-surface/90 backdrop-blur-md">
      <div className="stitch-layout flex min-h-16 flex-wrap items-center justify-between gap-2 py-2 lg:flex-nowrap">
        <Link
          to={homeHref}
          className="text-lg font-semibold tracking-tight text-navy transition-colors duration-[240ms] hover:text-primary"
        >
          Helloworld0822 <span className="hidden text-sm font-normal text-text-secondary xl:inline">/ 전재민</span>
        </Link>
        <nav aria-label="주요 메뉴" className="order-last flex w-full items-center overflow-x-auto whitespace-nowrap rounded-full bg-surface-subtle px-2 py-1 lg:order-none lg:w-auto">
          <a href={buildSectionHref("story")} className={navLinkClassName}>
            소개
          </a>
          <a href={buildSectionHref("timeline")} className={navLinkClassName}>
            경력
          </a>
          <a href={buildSectionHref("skills")} className={navLinkClassName}>
            기술
          </a>
          <a href={buildSectionHref("projects")} className={navLinkClassName}>
            프로젝트
          </a>
          <a href={buildSectionHref("stats")} className={navLinkClassName}>개발자 활동</a>
          <Link to={blogHref} className={navLinkClassName}>
            블로그
          </Link>
          <a href={buildSectionHref("contact")} className={navLinkClassName}>
            연락처
          </a>
          {user?.isAdmin && (
            <Link to="/admin" className={navLinkClassName}>
              관리자
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-3">
          <a href="https://github.com/Helloworld0822" aria-label="GitHub" className="hidden text-primary xl:block"><SiGithub aria-hidden size={17} /></a>
          <a href="mailto:a100822@naver.com" aria-label="이메일" className="hidden text-primary xl:block"><Mail size={17} /></a>
          {user && (
            <div className="flex items-center gap-2">
              {user.avatarUrl && (
                <img
                  src={user.avatarUrl}
                  alt={user.username}
                  className="hidden size-7 rounded-full sm:block"
                />
              )}
              <button
                type="button"
                onClick={logout}
                className="text-sm text-ink-muted transition-colors duration-[120ms] hover:text-primary"
              >
                로그아웃
              </button>
            </div>
          )}
          <a
            href={buildSectionHref("contact")}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-colors duration-[120ms] hover:bg-primary-hover active:bg-primary-pressed"
          >
            <Send size={14} /> 연락하기
          </a>
        </div>
      </div>
    </header>
  );
};

export default Header;
