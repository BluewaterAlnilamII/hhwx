import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const PAGE_MAX_WIDTH_CLASS = "max-w-5xl";
export const ACCOUNT_PAGE_MAX_WIDTH_CLASS = "max-w-full sm:max-w-5xl";
export const PAGE_SPACING_CLASS = "space-y-4 lg:space-y-8";

type PageShellProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  spaced?: boolean;
};

export function PageContent({
  children,
  className,
  spaced = true,
}: Omit<PageShellProps, "contentClassName">) {
  return (
    <div className={cn("relative z-10 mx-auto w-full", PAGE_MAX_WIDTH_CLASS, spaced && PAGE_SPACING_CLASS, className)}>
      {children}
    </div>
  );
}

export default function PageShell({
  children,
  className,
  contentClassName,
  spaced = true,
}: PageShellProps) {
  return (
    <div className={cn("relative z-10 min-h-full font-sans text-[var(--theme-color-text-default)]", className)}>
      <PageContent className={contentClassName} spaced={spaced}>
        {children}
      </PageContent>
    </div>
  );
}
