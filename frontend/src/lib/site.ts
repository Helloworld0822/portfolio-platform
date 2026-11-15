export const PORTFOLIO_HOST = "portfolio.helloworld0822.xyz";
export const BLOG_HOST = "blog.helloworld0822.xyz";

export const PORTFOLIO_URL = `https://${PORTFOLIO_HOST}`;
export const BLOG_URL = `https://${BLOG_HOST}`;

export function isBlogHost(): boolean {
  return window.location.hostname === BLOG_HOST;
}

export function isPortfolioHost(): boolean {
  return (
    window.location.hostname === PORTFOLIO_HOST ||
    window.location.hostname === "helloworld0822.xyz"
  );
}

export function canonicalSiteUrl(): string | null {
  const hostname = window.location.hostname;
  const targetHost =
    hostname === "blog.helloworld0822.site"
      ? BLOG_HOST
      : hostname === "portfolio.helloworld0822.site" ||
          hostname === "helloworld0822.site"
        ? PORTFOLIO_HOST
        : hostname === "helloworld0822.xyz"
          ? PORTFOLIO_HOST
          : null;

  if (!targetHost) return null;

  return `https://${targetHost}${window.location.pathname}${window.location.search}${window.location.hash}`;
}
