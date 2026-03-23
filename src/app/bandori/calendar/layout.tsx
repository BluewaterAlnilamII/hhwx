import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "活动日历 - HHWX",
};

export default function CalendarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
