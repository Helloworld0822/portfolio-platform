import { SiGithub } from "react-icons/si";
import { FaLinkedin } from "react-icons/fa6";
import { ArrowUpRight, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useReveal } from "../lib/useReveal";

const links = [
  { label: "GitHub", Icon: SiGithub, href: "https://github.com/Helloworld0822" },
  { label: "LinkedIn", Icon: FaLinkedin, href: "https://www.linkedin.com/in/%EC%9E%AC%EB%AF%BC-%EC%A0%84-ab333a418/" },
  { label: "이메일", Icon: Mail, href: "mailto:a100822@naver.com" },
];

const inputClass =
  "w-full rounded-md border border-border bg-surface-1 px-4 py-2.5 text-sm text-ink placeholder-ink-subdued outline-none transition-colors duration-[120ms] focus:border-primary";

const Contact = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const normalizedMessage = message.trim();
    if (Array.from(normalizedMessage).length > 1000) {
      setErrorMessage("문의 본문은 1,000자까지 입력할 수 있습니다.");
      setStatus("error");
      return;
    }

    setStatus("sending");
    setErrorMessage("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message: normalizedMessage }),
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
    <section id="contact" className="w-full">
      <div ref={ref} className={`w-full ${className}`}>
        <div className="grid gap-5 rounded-2xl bg-surface-subtle p-5 md:grid-cols-[5fr_7fr] md:p-10">
          <div><h2 className="section-heading">연락하기</h2>
          <p className="mt-4 max-w-md text-ink-muted">
            새로운 기회, 협업, 흥미로운 문제에 항상 열려 있습니다.
            언제든 편하게 연락해 주세요.
          </p>

          </div>
          <form
            onSubmit={handleSubmit}
            className="stitch-card p-5 md:p-7 space-y-4 text-left md:col-start-2 md:row-span-2 md:row-start-1 md:mt-0"
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
            {status === "error" && <p role="alert" className="text-sm text-danger">{errorMessage}</p>}

            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full rounded-md bg-primary px-6 py-3 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === "sending" ? "전송 중..." : "메시지 보내기"}
            </button>
          </form>

          <div className="flex flex-col items-start gap-2">
            {links.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target={link.href.startsWith("mailto") ? undefined : "_blank"}
                rel="noopener noreferrer"
                className="flex w-full items-center gap-3 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-primary hover:underline"
              >
                <link.Icon aria-hidden size={16} /> {link.label}<ArrowUpRight size={14} className="ml-auto" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Contact;
