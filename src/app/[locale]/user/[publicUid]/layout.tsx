import type { ReactNode } from "react";
import { PageContent } from "@/components/PageShell";

export default function PublicProfileLayout({ children }: { children: ReactNode }) {
  return <PageContent spaced={false}>{children}</PageContent>;
}
