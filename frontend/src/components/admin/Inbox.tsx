import { useCallback, useEffect, useState } from "react";
import { authFetch } from "../../lib/api";

interface ContactMessage {
  id: string;
  name: string;
  email: string;
  message: string;
  created_at: string;
}

const Inbox = () => {
  const [messages, setMessages] = useState<ContactMessage[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const loadMessages = useCallback(() => {
    setMessages(null);
    setLoadError(false);
    authFetch("/api/admin/contact")
      .then((res) => {
        if (!res.ok) {
          throw new Error("failed to load messages");
        }
        return res.json() as Promise<ContactMessage[]>;
      })
      .then(setMessages)
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  return (
    <div>
      <h2 className="text-lg font-semibold text-navy">문의함</h2>

      <div className="mt-4 space-y-3">
        {messages === null && !loadError && (
          <p className="text-sm text-ink-muted">불러오는 중...</p>
        )}
        {loadError && (
          <p className="text-sm text-ink-muted">문의 목록을 불러오지 못했습니다.</p>
        )}
        {messages?.length === 0 && (
          <p className="text-sm text-ink-muted">받은 문의가 없습니다.</p>
        )}
        {messages?.map((message) => (
          <div
            key={message.id}
            className="rounded-lg border border-border bg-canvas p-5 shadow-card"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-medium text-ink">{message.name}</span>
              <a href={`mailto:${message.email}`} className="text-sm text-primary hover:underline">
                {message.email}
              </a>
              <span className="text-xs text-ink-subdued">
                {new Date(message.created_at).toLocaleString("ko-KR")}
              </span>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
              {message.message}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Inbox;