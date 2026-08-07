type EventRelativeCountdownProps = {
  prefix: "距开始" | "距结束";
  remainingMs: number;
  completedLabel: string;
};

export default function EventRelativeCountdown({
  prefix,
  remainingMs,
  completedLabel,
}: EventRelativeCountdownProps) {
  if (remainingMs <= 0) {
    return <span>{completedLabel}</span>;
  }

  const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000).toString().padStart(2, "0");

  return (
    <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap">
      <span>{prefix}</span>
      <span className="inline-flex items-baseline gap-0.5">
        <span className="text-[var(--theme-color-semantic-info-foreground)]">{days}</span>
        <span>天</span>
        <span className="text-[var(--theme-color-semantic-info-foreground)]">{hours}</span>
        <span>小时</span>
        <span className="text-[var(--theme-color-semantic-info-foreground)]">{minutes}</span>
        <span>分</span>
        <span className="inline-flex min-w-[2ch] justify-end text-[var(--theme-color-semantic-info-foreground)] tabular-nums">{seconds}</span>
        <span>秒</span>
      </span>
    </span>
  );
}
