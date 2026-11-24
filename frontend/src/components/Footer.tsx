const Footer = () => {
  return (
    <footer className="border-t border-border bg-surface py-8">
      <div className="stitch-layout flex flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="text-sm text-ink-muted">
          &copy; {new Date().getFullYear()} Helloworld0822. All rights reserved.
        </p>
        <a href="#top" className="text-sm text-primary-hover hover:underline">맨 위로 ↑</a>
      </div>
    </footer>
  );
};

export default Footer;
