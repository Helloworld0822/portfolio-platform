import { useEffect, useRef, useState } from "react";

const HIDDEN = "opacity-0 translate-y-12 scale-95";
const SHOWN = "opacity-100 translate-y-0 scale-100";
const BASE = "transition-[opacity,transform] duration-700 ease-out";

/**
 * Fades an element in and slides it up once it enters the viewport.
 * Fires immediately for elements already in view on mount (e.g. Hero).
 * `prefers-reduced-motion` is handled globally in index.css.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(node);
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, className: `${BASE} ${visible ? SHOWN : HIDDEN}` };
}
