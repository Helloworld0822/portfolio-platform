import { useEffect, useState } from "react";
import { authFetch } from "../../lib/api";

export interface GithubRepo {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  is_private: boolean;
  owner: string;
}

interface GithubImportModalProps {
  addedUrls: Set<string>;
  onImport: (repo: GithubRepo) => void;
  onClose: () => void;
}

function renderRepoGroups(
  repos: GithubRepo[],
  addedUrls: Set<string>,
  onImport: (repo: GithubRepo) => void,
) {
  const groups = new Map<string, GithubRepo[]>();
  for (const repo of repos) {
    const group = groups.get(repo.owner) ?? [];
    group.push(repo);
    groups.set(repo.owner, group);
  }

  return (
    <div className="space-y-6">
      {[...groups.entries()].map(([owner, ownerRepos]) => (
        <div key={owner}>
          <h4 className="flex items-center gap-2 text-sm font-semibold text-navy">
            {owner}
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-subdued">
              {ownerRepos.length}
            </span>
          </h4>
          <ul className="mt-2 divide-y divide-border rounded-md border border-border">
            {ownerRepos.map((repo) => {
              const added = addedUrls.has(repo.html_url.replace(/\/+$/, ""));
              return (
                <li
                  key={repo.full_name}
                  className="flex items-center justify-between gap-3 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink">
                        {repo.name}
                      </span>
                      {repo.is_private && (
                        <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-subdued">
                          private
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-ink-subdued">
                      {repo.language ?? "—"}
                      {repo.description ? ` · ${repo.description}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onImport(repo)}
                    disabled={added}
                    className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink transition-colors duration-[120ms] hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {added ? "추가됨" : "추가"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

const GithubImportModal = ({ addedUrls, onImport, onClose }: GithubImportModalProps) => {
  const [repos, setRepos] = useState<GithubRepo[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    authFetch("/api/admin/github/repos")
      .then((res) => {
        if (!res.ok) {
          throw new Error("failed to load GitHub repos");
        }
        return res.json() as Promise<GithubRepo[]>;
      })
      .then(setRepos)
      .catch(() => setError(true));
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-[2px]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="GitHub 저장소 가져오기"
        className="relative max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-canvas shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border bg-surface-1 px-4 py-3">
          <h3 className="text-sm font-semibold text-ink">GitHub 저장소에서 가져오기</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-md px-2 py-1 text-sm text-ink-muted transition-colors duration-[120ms] hover:bg-surface-2 hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4">
          {repos === null && !error && (
            <p className="py-8 text-center text-sm text-ink-muted">불러오는 중...</p>
          )}
          {error && (
            <p className="py-8 text-center text-sm text-ink-muted">
              저장소를 불러오지 못했습니다. 서버의 GITHUB_TOKEN 설정을 확인해주세요.
            </p>
          )}
          {repos && renderRepoGroups(repos, addedUrls, onImport)}
        </div>
      </div>
    </div>
  );
};

export default GithubImportModal;