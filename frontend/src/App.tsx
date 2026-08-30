import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { BLOG_URL, isBlogHost, isPortfolioHost } from "./lib/site";
import Header from "./components/Header";
import Hero from "./components/Hero";
import Story from "./components/Story";
import Timeline from "./components/Timeline";
import Skills from "./components/Skills";
import Projects from "./components/Projects";
import Contact from "./components/Contact";
import Footer from "./components/Footer";
import BlogList from "./components/blog/BlogList";
import BlogPost from "./components/blog/BlogPost";
import Admin from "./components/admin/Admin";

function Home() {
  return (
    <main>
      <Hero />
      <Story />
      <Timeline />
      <Skills />
      <Projects />
      <Contact />
    </main>
  );
}

function App() {
  const blogHome = isBlogHost();
  // On the portfolio host, blog content lives on the blog host, so redirect
  // there instead of serving a duplicate blog section.
  const redirectToBlogHost = isPortfolioHost();

  return (
    <BrowserRouter>
      <AuthProvider>
        <Header />
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
            path="/blog/:slug"
            element={
              redirectToBlogHost ? <RedirectToBlogHost /> : <BlogPost />
            }
          />
          <Route path="/admin" element={<Admin />} />
        </Routes>
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
