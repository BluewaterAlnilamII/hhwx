import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type HeadingVisualRole = "page" | "section" | "subsection";
export type HeadingAccentSlot = "a" | "b" | "c";

type HeadingBaseProps = HTMLAttributes<HTMLHeadingElement> & {
  as: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
};

export type HeadingProps = HeadingBaseProps & (
  | {
      visualRole: "section";
      accentSlot?: HeadingAccentSlot;
      icon?: ReactNode;
    }
  | {
      visualRole: Exclude<HeadingVisualRole, "section">;
      accentSlot?: never;
      icon?: never;
    }
);

const headingVisualRoleClassNames: Record<HeadingVisualRole, string> = {
  page: "text-2xl font-bold text-[var(--theme-color-heading-page-foreground)] sm:text-3xl",
  section: "text-xl font-black text-[var(--theme-color-heading-section-foreground)]",
  subsection: "text-lg font-bold text-[var(--theme-color-heading-subsection-foreground)]",
};

const headingAccentSlotClassNames: Record<HeadingAccentSlot, string> = {
  a: "bg-[var(--theme-color-heading-section-accent-a-background)] text-[var(--theme-color-heading-section-accent-a-foreground)]",
  b: "bg-[var(--theme-color-heading-section-accent-b-background)] text-[var(--theme-color-heading-section-accent-b-foreground)]",
  c: "bg-[var(--theme-color-heading-section-accent-c-background)] text-[var(--theme-color-heading-section-accent-c-foreground)]",
};

export default function Heading({
  as: HeadingElement,
  visualRole,
  accentSlot,
  icon,
  className,
  children,
  ...props
}: HeadingProps) {
  return (
    <HeadingElement
      className={cn(
        headingVisualRoleClassNames[visualRole],
        icon && "flex items-center gap-2",
        className,
      )}
      {...props}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex shrink-0 items-center justify-center",
            visualRole === "section" ? "h-8 w-8 rounded-xl" : "h-7 w-7 rounded-lg",
            accentSlot ? headingAccentSlotClassNames[accentSlot] : "text-current",
          )}
        >
          {icon}
        </span>
      ) : null}
      {children}
    </HeadingElement>
  );
}
