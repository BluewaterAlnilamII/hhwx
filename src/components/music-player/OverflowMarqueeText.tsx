"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { calculateMusicPlayerMarqueeDurationSeconds } from "@/lib/music-player-marquee";

interface OverflowMarqueeTextProps {
  text: string;
  className?: string;
}

type MarqueeStyle = CSSProperties & {
  "--music-player-marquee-distance": string;
  "--music-player-marquee-duration": string;
};

export default function OverflowMarqueeText({ text, className = "" }: OverflowMarqueeTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);
  const [overflowDistance, setOverflowDistance] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) {
      return;
    }

    const measureOverflow = () => {
      const nextDistance = Math.max(0, Math.ceil(content.scrollWidth - container.clientWidth));
      setOverflowDistance((currentDistance) => (
        currentDistance === nextDistance ? currentDistance : nextDistance
      ));
    };

    measureOverflow();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measureOverflow);
      return () => window.removeEventListener("resize", measureOverflow);
    }

    const observer = new ResizeObserver(measureOverflow);
    observer.observe(container);
    observer.observe(content);
    return () => observer.disconnect();
  }, [text]);

  const isOverflowing = overflowDistance > 1;
  const marqueeStyle: MarqueeStyle | undefined = isOverflowing
    ? {
        "--music-player-marquee-distance": `${overflowDistance}px`,
        "--music-player-marquee-duration": `${calculateMusicPlayerMarqueeDurationSeconds(overflowDistance)}s`,
      }
    : undefined;

  return (
    <div ref={containerRef} className={`min-w-0 overflow-hidden ${className}`} title={text}>
      <span
        ref={contentRef}
        className={`inline-block whitespace-nowrap ${isOverflowing ? "music-player-overflow-marquee" : ""}`}
        style={marqueeStyle}
      >
        {text}
      </span>
    </div>
  );
}
