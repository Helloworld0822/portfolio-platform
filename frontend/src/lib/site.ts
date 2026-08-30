export const PORTFOLIO_HOST = "portfolio.helloworld0822.site";
export const BLOG_HOST = "blog.helloworld0822.site";

export const PORTFOLIO_URL = `https://${PORTFOLIO_HOST}`;
export const BLOG_URL = `https://${BLOG_HOST}`;

export function isBlogHost(): boolean {
  return window.location.hostname === BLOG_HOST;
}

export function isPortfolioHost(): boolean {
  return window.location.hostname === PORTFOLIO_HOST;
}