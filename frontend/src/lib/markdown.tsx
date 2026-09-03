import type { Components } from "react-markdown";

/**
 * Link renderer shared by the blog post view and the admin editor preview:
 * links pointing at uploaded PDFs are embedded inline (browser PDF viewer)
 * instead of navigating away, while every other link renders normally.
 */
export const markdownComponents: Components = {
  a: ({ href, children, title }) => {
    if (href?.toLowerCase().endsWith(".pdf")) {
      return (
        <div className="my-4 overflow-hidden rounded-md border border-border">
          <div className="flex items-center justify-between bg-surface-1 px-3 py-2">
            <span className="truncate text-sm text-ink">{children}</span>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-sm text-primary hover:underline"
            >
              새 탭에서 열기
            </a>
          </div>
          <iframe src={href} title={typeof children === "string" ? children : "PDF"} className="h-96 w-full bg-surface-1" />
        </div>
      );
    }
    return (
      <a href={href} title={title}>
        {children}
      </a>
    );
  },
};