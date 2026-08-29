const links = [
  { label: "GitHub", href: "https://github.com/Helloworld0822" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/%EC%9E%AC%EB%AF%BC-%EC%A0%84-ab333a418/" },
  { label: "이메일", href: "mailto:a100822@naver.com" },
];

const Contact = () => {
  return (
    <section id="contact" className="px-4 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-lg bg-navy px-8 py-16 text-center md:px-16">
          <h2 className="text-3xl font-semibold tracking-tight text-white">연락하기</h2>
          <p className="mx-auto mt-4 max-w-md text-ink-on-navy-muted">
            새로운 기회, 협업, 흥미로운 문제에 항상 열려 있습니다.
            언제든 편하게 연락해 주세요.
          </p>
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
