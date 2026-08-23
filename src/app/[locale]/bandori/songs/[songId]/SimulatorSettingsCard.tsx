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
      className="rounded-2xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] p-4 shadow-sm sm:p-5"
    >
      <h3 className="text-base font-black text-[var(--theme-color-heading-section-foreground)]">
        {title}
      </h3>
      <div className="mt-3 divide-y divide-[var(--theme-color-border-subtle)]">
        {children}
      </div>
    </section>
  );
}
