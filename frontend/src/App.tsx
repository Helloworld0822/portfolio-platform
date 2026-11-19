import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { BLOG_URL, canonicalSiteUrl, isBlogHost, isPortfolioHost } from "./lib/site";
import Header from "./components/Header";
import Hero from "./components/Hero";
import Timeline from "./components/Timeline";
import Skills from "./components/Skills";
import Projects from "./components/Projects";
import Contact from "./components/Contact";
import Footer from "./components/Footer";
const BlogList = lazy(() => import("./components/blog/BlogList"));
const BlogPost = lazy(() => import("./components/blog/BlogPost"));
const Admin = lazy(() => import("./components/admin/Admin"));

function Home() {
  return (
    <main className="portfolio-home">
      <div className="site-container portfolio-content">
        <Hero />
        <Timeline />
        <Skills />
        <Projects />
      </div>
      <Contact />
    </main>
  );
}

function App() {
  const canonicalUrl = canonicalSiteUrl();
  const blogHome = isBlogHost();
  // On the portfolio host, blog content lives on the blog host, so redirect
  // there instead of serving a duplicate blog section.
  const redirectToBlogHost = isPortfolioHost();

  useEffect(() => {
    if (canonicalUrl) window.location.replace(canonicalUrl);
  }, [canonicalUrl]);

  if (canonicalUrl) return null;

  return (
    <BrowserRouter>
      <AuthProvider>
        <Header />
        <Suspense fallback={<p role="status" className="mx-auto max-w-5xl p-8">불러오는 중…</p>}>
        <Routes>
          <Route
            path="/"
            element={blogHome ? <Navigate to="/blog" replace /> : <Home />}
          />
          <Route
            path="/blog"
            element={
              redirectToBlogHost ? <RedirectToBlogHost /> : <BlogList />
            }
          />
          <Route
            path="/blog/:id"
            element={
              redirectToBlogHost ? <RedirectToBlogHost /> : <BlogPost />
            }
          />
          <Route path="/admin" element={<Admin />} />
        </Routes>
        </Suspense>
        <Footer />
      </AuthProvider>
    </BrowserRouter>
  );
}

function RedirectToBlogHost() {
  const { pathname } = useLocation();

  useEffect(() => {
    const target = `${BLOG_URL}${pathname}`;
    if (window.location.href !== target) {
      // Absolute cross-origin URLs must be assigned directly; react-router
      // <Navigate> would treat them as a relative path and mangle the URL.
      window.location.assign(target);
    }
  }, [pathname]);

  return null;
}

export default App;
