import { useState } from "react";
import { useAuth } from "../../lib/auth";
import PostManager from "./PostManager";
import ProjectManager from "./ProjectManager";
import TimelineManager from "./TimelineManager";
import Inbox from "./Inbox";

type Tab = "posts" | "projects" | "timeline" | "inbox";

const tabs: { id: Tab; label: string }[] = [
  { id: "posts", label: "글" },
  { id: "projects", label: "프로젝트" },
  { id: "timeline", label: "경력" },
  { id: "inbox", label: "문의" },
];

const Admin = () => {
  const { user, login, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("posts");

  if (!user) {
    return (
      <section className="px-4 py-20 md:px-8 md:py-24">
        <div className="mx-auto max-w-md rounded-lg border border-border bg-canvas p-8 text-center shadow-card">
          <h1 className="text-2xl font-semibold tracking-tight text-navy">관리자</h1>
          <p className="mt-3 text-sm text-ink-muted">
            글을 쓰거나 관리하려면 GitHub 로그인이 필요합니다.
          </p>
          <button
            type="button"
            onClick={() => login("/admin")}
            className="mt-6 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-white transition-colors duration-[120ms] hover:bg-primary-hover active:bg-primary-pressed"
          >
            GitHub으로 로그인
          </button>
        </div>
      </section>
    );
  }

  if (!user.isAdmin) {
    return (
      <section className="px-4 py-20 md:px-8 md:py-24">
        <div className="mx-auto max-w-md rounded-lg border border-border bg-canvas p-8 text-center shadow-card">
          <h1 className="text-2xl font-semibold tracking-tight text-navy">관리자</h1>
          <p className="mt-3 text-sm text-ink-muted">
            관리자 권한이 없습니다. ({user.username})
          </p>
          <button
            type="button"
            onClick={logout}
            className="mt-6 rounded-md border border-border px-6 py-2.5 text-sm font-medium text-ink transition-colors duration-[240ms] hover:bg-surface-1"
          >
            로그아웃
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="px-4 py-16 md:px-8 md:py-20">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-navy">관리자 대시보드</h1>
          <button
            type="button"
            onClick={logout}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink-muted transition-colors duration-[240ms] hover:bg-surface-1 hover:text-ink"
          >
            로그아웃
          </button>
        </div>

        <div className="mt-6 flex gap-1 border-b border-border">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`-mb-px rounded-t-md border-b-2 px-4 py-2.5 text-sm font-medium transition-colors duration-[120ms] ${
                tab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-8">
          {tab === "posts" && <PostManager />}
          {tab === "projects" && <ProjectManager />}
          {tab === "timeline" && <TimelineManager />}
          {tab === "inbox" && <Inbox />}
        </div>
      </div>
    </section>
  );
};

export default Admin;