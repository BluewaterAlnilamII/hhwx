import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export default function CardCatalogRow({ href, prefetch, preview, title, id, subtitle, metadata, description, mobileDescriptionBelow = false }: {
  href: string;
  prefetch?: boolean;
  preview: ReactNode;
  title: ReactNode;
  id: string | number;
  subtitle: ReactNode;
  metadata: ReactNode;
  description: ReactNode;
  mobileDescriptionBelow?: boolean;
}) {
  return (
    <Link href={href} prefetch={prefetch} className="hhwx-panel hhwx-catalog-row group block border p-3 transition sm:p-4">
      <article className={cn("grid min-h-24 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 sm:gap-5", mobileDescriptionBelow && "max-sm:items-start max-sm:gap-y-0")}>
        <div className={cn("flex items-center gap-1.5 sm:gap-2", mobileDescriptionBelow && "max-sm:col-start-1 max-sm:row-start-1 max-sm:row-span-3")}>{preview}</div>
        <div className={cn("min-w-0 self-stretch py-0.5", mobileDescriptionBelow && "max-sm:contents")}>
          <div className={cn("flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1", mobileDescriptionBelow && "max-sm:col-start-2 max-sm:row-start-1")}>
            <h2 className="min-w-0 truncate text-base font-black text-[var(--theme-color-text-default)] sm:text-lg">{title}</h2>
            <span className="text-xs font-bold tabular-nums text-[var(--theme-color-text-muted)]">#{id}</span>
          </div>
          <div className={cn("mt-0.5 truncate text-sm font-bold text-[var(--theme-color-text-muted)]", mobileDescriptionBelow && "max-sm:col-start-2 max-sm:row-start-2")}>{subtitle}</div>
          <div className={cn("mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-[var(--theme-color-text-muted)]", mobileDescriptionBelow && "max-sm:col-start-2 max-sm:row-start-3")}>{metadata}</div>
          {(Array.isArray(description) ? description : [description]).map((line, index) => (
            <p key={index} className={cn("mt-1.5 line-clamp-2 text-xs font-medium leading-5 text-[var(--theme-color-text-default)] sm:text-sm", mobileDescriptionBelow && "max-sm:col-span-full")}>{line}</p>
          ))}
        </div>
        <ChevronRight className={cn("h-5 w-5 shrink-0 text-[var(--theme-color-text-muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--theme-color-action-secondary-foreground)]", mobileDescriptionBelow && "max-sm:col-start-3 max-sm:row-start-1 max-sm:row-span-3 max-sm:self-center")} aria-hidden="true" />
      </article>
    </Link>
  );
}
