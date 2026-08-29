import { Link } from "react-router-dom";

type NavItem = { label: string; href: string } | { label: string; to: string };

const navItems: NavItem[] = [
  { label: "소개", href: "#story" },
  { label: "경력", href: "#timeline" },
  { label: "기술", href: "#skills" },
  { label: "프로젝트", href: "#projects" },
  { label: "블로그", to: "/blog" },
  { label: "연락처", href: "#contact" },
];

const navLinkClassName =
  "rounded-md px-3 py-2 text-sm text-ink-muted transition-colors duration-[240ms] hover:bg-surface-1 hover:text-primary";

const Header = () => {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-canvas/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 md:px-8">
        <Link
          to="/"
          className="text-lg font-semibold tracking-tight text-navy transition-colors duration-[240ms] hover:text-primary"
        >
          Helloworld0822
        </Link>
        <nav className="hidden items-center gap-1 sm:flex">
          {navItems.map((item) =>
            "to" in item ? (
              <Link key={item.to} to={item.to} className={navLinkClassName}>
                {item.label}
              </Link>
            ) : (
              <a key={item.href} href={item.href} className={navLinkClassName}>
                {item.label}
              </a>
            ),
          )}
        </nav>
        <a
          href="#contact"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors duration-[120ms] hover:bg-primary-hover active:bg-primary-pressed"
        >
          연락하기
        </a>
      </div>
    </header>
  );
};

export default Header;
