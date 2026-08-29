import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
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
  return (
    <BrowserRouter>
      <AuthProvider>
        <Header />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/blog" element={<BlogList />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
        </Routes>
        <Footer />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
