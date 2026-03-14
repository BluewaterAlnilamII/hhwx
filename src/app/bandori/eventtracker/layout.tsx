import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Event Tracker - HHWX",
};

export default function EventTrackerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
