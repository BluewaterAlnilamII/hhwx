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
        "flex items-start gap-3 rounded-2xl border border-sky-200/80 bg-sky-50/95 px-4 py-3 text-slate-700 shadow-[0_10px_28px_rgba(14,165,233,0.12)] ring-1 ring-white/70 dark:border-sky-500/35 dark:bg-slate-900/85 dark:text-slate-100",
        className,
      )}
      role="note"
    >
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-200">
        <Info className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-black text-sky-700 dark:text-sky-200">{label}</span>
        <span className="mt-1 block text-sm font-medium leading-6">{description}</span>
      </span>
    </aside>
  );
}
