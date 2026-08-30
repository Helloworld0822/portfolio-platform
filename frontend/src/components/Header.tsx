import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { BLOG_URL, PORTFOLIO_URL, isBlogHost } from "../lib/site";

const navLinkClassName =
  "rounded-md px-3 py-2 text-sm text-ink-muted transition-colors duration-[240ms] hover:bg-surface-1 hover:text-primary";

const Header = () => {
  const { user, logout } = useAuth();

  const buildSectionHref = (id: string) => {
    // On the blog host, section anchors only exist on the portfolio site, so
    // link back to it. On the portfolio host, they're same-origin.
    const base = isBlogHost() ? PORTFOLIO_URL : "";
    return `${base}/#${id}`;
  };

  const blogHref = isBlogHost() ? "/blog" : `${BLOG_URL}/blog`;
  const homeHref = isBlogHost() ? PORTFOLIO_URL : "/";

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-canvas/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 md:px-8">
        <Link
          to={homeHref}
          className="text-lg font-semibold tracking-tight text-navy transition-colors duration-[240ms] hover:text-primary"
        >
          Helloworld0822
        </Link>
        <nav className="hidden items-center gap-1 sm:flex">
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
          {user && (
            <div className="hidden items-center gap-2 sm:flex">
              {user.avatarUrl && (
                <img
                  src={user.avatarUrl}
                  alt={user.username}
                  className="size-7 rounded-full"
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
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors duration-[120ms] hover:bg-primary-hover active:bg-primary-pressed"
          >
            연락하기
          </a>
        </div>
      </div>
    </header>
  );
};

export default Header;