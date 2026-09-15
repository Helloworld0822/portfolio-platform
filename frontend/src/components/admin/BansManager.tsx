import { useCallback, useEffect, useState } from "react";
import { authFetch } from "../../lib/api";

interface IpBan {
  ip: string;
  reason: string | null;
  expires_at: string | null;
  created_at: string;
}

interface UserBlock {
  login: string;
  reason: string | null;
  created_at: string;
}

interface BanList {
  ips: IpBan[];
  users: UserBlock[];
}

const formatExpiry = (expiresAt: string | null) => {
  if (!expiresAt) {
    return "영구";
  }
  return `${new Date(expiresAt).toLocaleString("ko-KR")}까지`;
};

const BansManager = () => {
  const [bans, setBans] = useState<BanList | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ip, setIp] = useState("");
  const [ipReason, setIpReason] = useState("");
  const [ipHours, setIpHours] = useState("");
  const [login, setLogin] = useState("");
  const [loginReason, setLoginReason] = useState("");

  const loadBans = useCallback(() => {
    setBans(null);
    setLoadError(false);
    authFetch("/api/admin/bans")
      .then((res) => {
        if (!res.ok) {
          throw new Error("failed to load bans");
        }
        return res.json() as Promise<BanList>;
      })
      .then(setBans)
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    loadBans();
  }, [loadBans]);

  const errorMessage = async (res: Response, fallback: string) => {
    const payload = (await res.json().catch(() => null)) as { message?: string } | null;
    return payload?.message ?? fallback;
  };

  const addBan = async () => {
    if (!ip.trim()) {
      setError("차단할 IP 주소를 입력해주세요.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await authFetch("/api/admin/bans/ips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ip: ip.trim(),
          reason: ipReason.trim() || null,
          duration_hours: ipHours.trim() ? Number(ipHours) : null,
        }),
      });
      if (!res.ok) {
        throw new Error(await errorMessage(res, "IP를 차단하지 못했습니다."));
      }
      setIp("");
      setIpReason("");
      setIpHours("");
      loadBans();
    } catch (err) {
      setError(err instanceof Error ? err.message : "IP를 차단하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const unbanIp = async (target: string) => {
    if (!window.confirm(`${target} 차단을 해제할까요?`)) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await authFetch(`/api/admin/bans/ips/${encodeURIComponent(target)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("차단을 해제하지 못했습니다.");
      }
      loadBans();
    } catch (err) {
      setError(err instanceof Error ? err.message : "차단을 해제하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const blockUser = async () => {
    if (!login.trim()) {
      setError("차단할 GitHub 아이디를 입력해주세요.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await authFetch("/api/admin/bans/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: login.trim(), reason: loginReason.trim() || null }),
      });
      if (!res.ok) {
        throw new Error(await errorMessage(res, "사용자를 차단하지 못했습니다."));
      }
      setLogin("");
      setLoginReason("");
      loadBans();
    } catch (err) {
      setError(err instanceof Error ? err.message : "사용자를 차단하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const unblockUser = async (target: string) => {
    if (!window.confirm(`${target} 차단을 해제할까요?`)) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await authFetch(`/api/admin/bans/users/${encodeURIComponent(target)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("차단을 해제하지 못했습니다.");
      }
      loadBans();
    } catch (err) {
      setError(err instanceof Error ? err.message : "차단을 해제하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm text-ink outline-none focus-visible:border-primary";
  const buttonClass =
    "rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors duration-[120ms] hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="space-y-10">
      <p className="text-sm text-ink-muted">
        차단된 IP는 사이트의 모든 요청이 거부되고, 차단된 사용자는 로그인과 댓글 작성이 막힙니다.
        레이트 리밋을 반복해서 넘긴 IP는 1시간 동안 자동으로 차단됩니다.
      </p>

      {error && <p className="text-sm text-danger">{error}</p>}
      {loadError && <p className="text-sm text-danger">차단 목록을 불러오지 못했습니다.</p>}

      <section>
        <h2 className="text-lg font-semibold text-navy">IP 차단</h2>

        <div className="mt-4 grid gap-2 md:grid-cols-[1fr_1fr_auto_auto]">
          <input
            className={inputClass}
            value={ip}
            onChange={(event) => setIp(event.target.value)}
            placeholder="203.0.113.7"
            aria-label="차단할 IP 주소"
          />
          <input
            className={inputClass}
            value={ipReason}
            onChange={(event) => setIpReason(event.target.value)}
            placeholder="사유 (선택)"
            aria-label="IP 차단 사유"
          />
          <input
            className={inputClass}
            value={ipHours}
            onChange={(event) => setIpHours(event.target.value)}
            placeholder="시간 (비우면 영구)"
            aria-label="차단 기간(시간)"
            inputMode="numeric"
          />
          <button type="button" className={buttonClass} onClick={addBan} disabled={busy}>
            차단
          </button>
        </div>

        <ul className="mt-4 divide-y divide-border rounded-md border border-border bg-canvas">
          {bans?.ips.length === 0 && (
            <li className="px-4 py-3 text-sm text-ink-muted">차단된 IP가 없습니다.</li>
          )}
          {bans?.ips.map((ban) => (
            <li key={ban.ip} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-ink">{ban.ip}</p>
                <p className="text-xs text-ink-subdued">
                  {formatExpiry(ban.expires_at)}
                  {ban.reason ? ` · ${ban.reason}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => unbanIp(ban.ip)}
                disabled={busy}
                className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink transition-colors duration-[240ms] hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-50"
              >
                해제
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-navy">사용자 차단</h2>

        <div className="mt-4 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <input
            className={inputClass}
            value={login}
            onChange={(event) => setLogin(event.target.value)}
            placeholder="GitHub 아이디"
            aria-label="차단할 GitHub 아이디"
          />
          <input
            className={inputClass}
            value={loginReason}
            onChange={(event) => setLoginReason(event.target.value)}
            placeholder="사유 (선택)"
            aria-label="사용자 차단 사유"
          />
          <button type="button" className={buttonClass} onClick={blockUser} disabled={busy}>
            차단
          </button>
        </div>

        <ul className="mt-4 divide-y divide-border rounded-md border border-border bg-canvas">
          {bans?.users.length === 0 && (
            <li className="px-4 py-3 text-sm text-ink-muted">차단된 사용자가 없습니다.</li>
          )}
          {bans?.users.map((block) => (
            <li key={block.login} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-ink">{block.login}</p>
                <p className="text-xs text-ink-subdued">
                  {new Date(block.created_at).toLocaleDateString("ko-KR")}
                  {block.reason ? ` · ${block.reason}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => unblockUser(block.login)}
                disabled={busy}
                className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink transition-colors duration-[240ms] hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-50"
              >
                해제
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default BansManager;