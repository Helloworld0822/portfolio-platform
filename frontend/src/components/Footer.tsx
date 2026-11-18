const Footer = () => {
  return (
    <footer className="border-t border-border bg-canvas px-4 py-8 md:px-8">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="text-sm text-ink-muted">
          &copy; {new Date().getFullYear()} Helloworld0822. All rights reserved.
        </p>
        <a href="#top" className="text-sm text-ink-muted hover:underline">맨 위로 ↑</a>
      </div>
    </footer>
  );
};

export default Footer;
