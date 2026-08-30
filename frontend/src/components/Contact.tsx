import { useState, type FormEvent } from "react";

const links = [
  { label: "GitHub", href: "https://github.com/Helloworld0822" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/%EC%9E%AC%EB%AF%BC-%EC%A0%84-ab333a418/" },
  { label: "이메일", href: "mailto:a100822@naver.com" },
];

const inputClass =
  "w-full rounded-md border border-white/20 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/40 outline-none transition-colors duration-[120ms] focus:border-white/50";

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

  return (
    <section id="contact" className="px-4 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-lg bg-navy px-8 py-16 text-center md:px-16">
          <h2 className="text-3xl font-semibold tracking-tight text-white">연락하기</h2>
          <p className="mx-auto mt-4 max-w-md text-ink-on-navy-muted">
            새로운 기회, 협업, 흥미로운 문제에 항상 열려 있습니다.
            언제든 편하게 연락해 주세요.
          </p>

          <form
            onSubmit={handleSubmit}
            className="mx-auto mt-10 max-w-md space-y-4 text-left"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="contact-name" className="mb-1.5 block text-sm text-ink-on-navy-muted">
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
                <label htmlFor="contact-email" className="mb-1.5 block text-sm text-ink-on-navy-muted">
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
              <label htmlFor="contact-message" className="mb-1.5 block text-sm text-ink-on-navy-muted">
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
            {status === "error" && <p className="text-sm text-[#ff8f8f]">{errorMessage}</p>}

            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full rounded-md border border-white/30 px-6 py-3 text-sm font-medium text-white transition-colors duration-[240ms] hover:border-white/60 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === "sending" ? "전송 중..." : "메시지 보내기"}
            </button>
          </form>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            {links.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target={link.href.startsWith("mailto") ? undefined : "_blank"}
                rel="noopener noreferrer"
                className="rounded-md border border-white/30 px-6 py-3 text-sm font-medium text-white transition-colors duration-[240ms] hover:border-white/60 hover:bg-white/5"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Contact;
