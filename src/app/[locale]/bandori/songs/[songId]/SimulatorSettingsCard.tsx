import type { ReactNode } from "react";

type SimulatorSettingsCardProps = {
  children: ReactNode;
  title: string;
};

export default function SimulatorSettingsCard({
  children,
  title,
}: SimulatorSettingsCardProps) {
  return (
    <section
      aria-label={title}
      className="rounded-2xl border border-[var(--theme-color-panel-border)] bg-[var(--theme-color-panel-background)] p-3 dark:shadow-sm sm:p-5"
    >
      <h3 className="text-[15px] font-black text-[var(--theme-color-heading-section-foreground)] sm:text-base">
        {title}
      </h3>
      <div className="mt-2 divide-y divide-[var(--theme-color-border-subtle)] sm:mt-3">
        {children}
      </div>
    </section>
  );
}
