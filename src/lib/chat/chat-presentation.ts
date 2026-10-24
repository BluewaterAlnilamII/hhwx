import type { ChatMessage } from "./chat-contract";

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function getChatMessageLayout(messages: readonly ChatMessage[]) {
  return messages.map((message, index) => {
    const previous = messages[index - 1];
    const date = new Date(message.createdAt);
    const previousDate = previous ? new Date(previous.createdAt) : null;
    const showTime = !previousDate || !sameDay(date, previousDate) || date.getTime() - previousDate.getTime() >= 5 * 60_000;
    return { message, showTime, showAuthor: showTime || previous?.author.userId !== message.author.userId };
  });
}

export function formatChatTime(value: string, locale: string, yesterdayLabel: string, now = new Date()) {
  const date = new Date(value);
  const time = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
  if (sameDay(date, now)) return time;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(date, yesterday)) return `${yesterdayLabel} ${time}`;
  const day = date.toLocaleDateString(locale, {
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" as const } : {}), month: "short", day: "numeric",
  });
  return `${day} ${time}`;
}
