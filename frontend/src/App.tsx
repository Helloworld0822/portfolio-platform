import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { BLOG_URL, canonicalSiteUrl, isBlogHost, isPortfolioHost } from "./lib/site";
import type { Profile } from "./lib/profile";
import { usePublicData } from "./lib/usePublicData";
import Header from "./components/Header";
import Hero from "./components/Hero";
import Timeline from "./components/Timeline";
import Skills from "./components/Skills";
import Projects from "./components/Projects";
import Contact from "./components/Contact";
import Activity from "./components/Activity";
import Footer from "./components/Footer";
import ScrollControls from "./components/ScrollControls";

const Admin = lazy(() => import("./components/admin/Admin"));
const BlogList = lazy(() => import("./components/blog/BlogList"));
const BlogPost = lazy(() => import("./components/blog/BlogPost"));
const ProjectDetail = lazy(() => import("./components/ProjectDetail"));

function Home() {
  const { data: profile, status } = usePublicData<Profile>("/api/profile");
  if (!profile && !status) return <main className="stitch-layout min-h-screen py-8" role="status">소개를 불러오는 중…</main>;
  return (
    <main className="stitch-layout portfolio-home">
      {profile ? <Hero profile={profile} /> : <p role="status">{status ? "소개를 불러오지 못했습니다." : "소개를 불러오는 중…"}</p>}
      <div className="w-full">
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
          <Timeline />
          {profile && <Skills groups={profile.skills} />}
        </div>
      </div>
      {profile && <Activity github={profile.github} />}
      <Projects />
      <Contact />
      <ScrollControls />
    </main>
  );
}

function App() {
  const canonicalUrl = canonicalSiteUrl();
  useEffect(() => {
    if (canonicalUrl) window.location.replace(canonicalUrl);
  }, [canonicalUrl]);

  if (canonicalUrl) return null;
  const blogHome = isBlogHost();
  // On the portfolio host, blog content lives on the blog host, so redirect
  // there instead of serving a duplicate blog section.
  const redirectToBlogHost = isPortfolioHost();

  return (
    <BrowserRouter>
      <AuthProvider>
        <Header />
        <Suspense fallback={<main role="status" className="stitch-layout py-8">불러오는 중…</main>}>
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
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/projects" element={<main><Projects archive /></main>} />
          </Routes>
        </Suspense>
        <Footer />
      </AuthProvider>
    </BrowserRouter>
  );
}

function RedirectToBlogHost() {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    const target = `${BLOG_URL}${pathname}${search}${hash}`;
    if (window.location.href !== target) {
      // Absolute cross-origin URLs must be assigned directly; react-router
      // <Navigate> would treat them as a relative path and mangle the URL.
      window.location.assign(target);
    }
  }, [pathname, search, hash]);

  return null;
}

export default App;
