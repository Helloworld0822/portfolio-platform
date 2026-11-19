import { useState, type FormEvent } from "react";
import { useReveal } from "../lib/useReveal";

const links = [
  { label: "GitHub", href: "https://github.com/Helloworld0822" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/%EC%9E%AC%EB%AF%BC-%EC%A0%84-ab333a418/" },
  { label: "이메일", href: "mailto:a100822@naver.com" },
];

const inputClass =
  "w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm text-ink focus-visible:outline-primary";

const Contact = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    setStatus("sending");
    setErrorMessage("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });

      if (res.status === 201) {
        setName("");
        setEmail("");
        setMessage("");
        setStatus("success");
        return;
      }

      let detail = "전송에 실패했습니다. 잠시 후 다시 시도해주세요.";
      if (res.status === 400) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        detail = body?.message ?? detail;
      }
      setErrorMessage(detail);
      setStatus("error");
    } catch {
      setErrorMessage("전송에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setStatus("error");
    }
  };

  const { ref, className } = useReveal<HTMLDivElement>();

  return (
    <section id="contact" className="border-t border-border bg-canvas">
      <div ref={ref} className={`site-container portfolio-content ${className}`}>
        <div className="contact-layout">
          <div><h2 className="section-heading">연락하기</h2>
          <p className="max-w-sm text-ink-muted">
            프로젝트 협업이나 개발 관련 질문을 보내 주세요.
          </p>

          <div className="mt-5 flex flex-wrap gap-4">
            {links.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target={link.href.startsWith("mailto") ? undefined : "_blank"}
                rel="noopener noreferrer"
                className="text-sm text-primary-pressed underline underline-offset-4"
              >
                {link.label}
              </a>
            ))}
          </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="contact-name" className="mb-1.5 block text-sm text-ink-muted">
                  이름
                </label>
                <input
                  id="contact-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="이름"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="contact-email" className="mb-1.5 block text-sm text-ink-muted">
                  이메일
                </label>
                <input
                  id="contact-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label htmlFor="contact-message" className="mb-1.5 block text-sm text-ink-muted">
                메시지
              </label>
              <textarea
                id="contact-message"
                required
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="보내고 싶은 내용을 적어주세요."
                className={inputClass}
              />
            </div>

            {status === "success" && (
              <p className="text-sm text-success">메시지가 전송되었습니다. 빠른 시일 내에 답변드리겠습니다.</p>
            )}
            {status === "error" && <p className="text-sm text-danger">{errorMessage}</p>}

            <button
              type="submit"
              disabled={status === "sending"}
              className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
            >
              {status === "sending" ? "전송 중..." : "메시지 보내기"}
            </button>
          </form>


        </div>
      </div>
    </section>
  );
};

export default Contact;
