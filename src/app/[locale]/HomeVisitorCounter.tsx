"use client";

import { useEffect, useState } from "react";

// Like the reference homepage, this is a decorative random number, not analytics.
export function getDecorativeVisitorNumber(random = Math.random): string {
  return `00298${50 + Math.floor(random() * 50)}`;
}

export default function HomeVisitorCounter() {
  const [number, setNumber] = useState("0029897");

  useEffect(() => {
    const frame = requestAnimationFrame(() => setNumber(getDecorativeVisitorNumber()));
    return () => cancelAnimationFrame(frame);
  }, []);

  return <span>{number}</span>;
}
