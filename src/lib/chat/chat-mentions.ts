import type { ChatMention } from "./chat-contract";

// Mention offsets count Unicode code points, matching PostgreSQL text positions.
export function editChatMentions(before: string, after: string, mentions: readonly ChatMention[]): ChatMention[] {
  const a = [...before], b = [...after];
  let start = 0, aEnd = a.length, bEnd = b.length;
  while (start < aEnd && start < bEnd && a[start] === b[start]) start++;
  while (aEnd > start && bEnd > start && a[aEnd - 1] === b[bEnd - 1]) { aEnd--; bEnd--; }
  const delta = bEnd - aEnd;
  return mentions.flatMap(m => m.end <= start ? [m] : m.start >= aEnd
    ? [{ ...m, start: m.start + delta, end: m.end + delta }] : []);
}

export function chatMentionQuery(content: string, cursor: number, mentions: readonly ChatMention[]) {
  const before = content.slice(0, cursor), position = [...before].length;
  const match = /(?:^|[\s([{，。！？、：])@([^@\n]{0,96})$/u.exec(before);
  if (!match) return null;
  const start = position - [...match[1]].length - 1;
  if (mentions.some(m => m.start < position && m.end > start)) return null;
  return { query: match[1], start: cursor - match[1].length - 1, end: cursor };
}

export function insertChatMention(content: string, range: { start: number; end: number }, user: { userId: string; username: string }, mentions: readonly ChatMention[]) {
  const label = `@${user.username}`, text = content.slice(0, range.start) + label + " " + content.slice(range.end);
  const start = [...content.slice(0, range.start)].length;
  return { text, cursor: range.start + label.length + 1,
    mentions: [...editChatMentions(content, text, mentions), { userId: user.userId, start, end: start + [...label].length }].sort((a, b) => a.start - b.start) };
}
