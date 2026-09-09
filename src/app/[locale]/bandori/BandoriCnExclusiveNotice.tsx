import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

type BandoriCnExclusiveNoticeProps = {
  label: string;
  description: string;
  className?: string;
};

export default function BandoriCnExclusiveNotice({
  label,
  description,
  className,
}: BandoriCnExclusiveNoticeProps) {
  return (
    <aside
      className={cn(
        "flex items-start gap-3 rounded-2xl border border-[var(--theme-color-semantic-info-border)] bg-[var(--theme-color-semantic-info-background)] px-4 py-3 text-[var(--theme-color-text-default)] shadow-[var(--theme-shadow-surface-raised)]",
        className,
      )}
      role="note"
    >
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--theme-color-control-background)] text-[var(--theme-color-semantic-info-foreground)]">
        <Info className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-black text-[var(--theme-color-semantic-info-foreground)]">{label}</span>
        <span className="mt-1 block text-sm font-medium leading-6">{description}</span>
      </span>
    </aside>
  );
}
