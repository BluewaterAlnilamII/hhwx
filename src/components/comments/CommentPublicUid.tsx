import { IdCard } from "lucide-react";
import { cn } from "@/lib/utils";

export function CommentPublicUid({ publicUid, className }: {
  publicUid: number | null;
  className?: string;
}) {
  if (publicUid == null) return null;

  return (
    <span className={cn("inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-xs font-normal text-[var(--theme-color-text-muted)] dark:text-[var(--theme-color-text-muted-on-dark)]", className)}>
      <IdCard size={14} aria-hidden="true" />
      <span className="sr-only">UID </span>
      <span className="tabular-nums">{publicUid}</span>
    </span>
  );
}
