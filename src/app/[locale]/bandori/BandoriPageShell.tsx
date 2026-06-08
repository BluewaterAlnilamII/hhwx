import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const BANDORI_PAGE_MAX_WIDTH_CLASS = "max-w-5xl";
export const BANDORI_ACCOUNT_PAGE_MAX_WIDTH_CLASS = "max-w-full sm:max-w-5xl";
export const BANDORI_PAGE_SPACING_CLASS = "space-y-4 lg:space-y-8";

type BandoriPageShellProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  spaced?: boolean;
};

export function BandoriPageContent({
  children,
  className,
  spaced = true,
}: Omit<BandoriPageShellProps, "contentClassName">) {
  return (
    <div className={cn("relative z-10 mx-auto w-full", BANDORI_PAGE_MAX_WIDTH_CLASS, spaced && BANDORI_PAGE_SPACING_CLASS, className)}>
      {children}
    </div>
  );
}

export default function BandoriPageShell({
  children,
  className,
  contentClassName,
  spaced = true,
}: BandoriPageShellProps) {
  return (
    <div className={cn("relative z-10 min-h-full font-sans text-gray-800 dark:text-gray-100", className)}>
      <BandoriPageContent className={contentClassName} spaced={spaced}>
        {children}
      </BandoriPageContent>
    </div>
  );
}
