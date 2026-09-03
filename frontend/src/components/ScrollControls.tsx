import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

const SECTION_IDS = ["hero", "story", "timeline", "skills", "projects", "contact"];

const buttonClass =
  "flex size-9 items-center justify-center rounded-md border border-border bg-canvas text-ink-muted shadow-card transition-colors duration-[120ms] hover:bg-surface-1 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40";

/**
 * Fixed up/down controls that move through the portfolio's sections one at a
 * time. Enabled/disabled states track the currently visible section so the
 * buttons never scroll past the first or last one.
 */
const ScrollControls = () => {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const compute = () => {
      // The section whose top is nearest the middle of the viewport wins.
      let index = 0;
      let best = Infinity;
      SECTION_IDS.forEach((id, i) => {
        const el = document.getElementById(id);
        if (!el) return;
        const dist = Math.abs(el.getBoundingClientRect().top - window.innerHeight * 0.35);
        if (dist < best) {
          best = dist;
          index = i;
        }
      });
      setCurrent(index);
    };

    compute();
    window.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
    };
  }, []);

  const go = (index: number) => {
    const el = document.getElementById(SECTION_IDS[index]);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="fixed right-4 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-2 md:right-6">
      <button
        type="button"
        onClick={() => go(current - 1)}
        disabled={current === 0}
        aria-label="이전 섹션"
        className={buttonClass}
      >
        <ChevronUp className="size-5" />
      </button>
      <button
        type="button"
        onClick={() => go(current + 1)}
        disabled={current === SECTION_IDS.length - 1}
        aria-label="다음 섹션"
        className={buttonClass}
      >
        <ChevronDown className="size-5" />
      </button>
    </div>
  );
};

export default ScrollControls;
