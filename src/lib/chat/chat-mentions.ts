import { CHAT_RETENTION_MS, type ChatMention, type ChatMentionUser, type ChatRecentMentionUser } from "./chat-contract";

/** Search the whole directory before applying the eight-row presentation limit. */
export function searchChatUsers(users: readonly ChatMentionUser[], query: string): ChatMentionUser[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const rank = (user: ChatMentionUser) => String(user.publicUid) === q || user.username.toLowerCase() === q ? 0
    : user.username.toLowerCase().startsWith(q) ? 1 : 2;
  return users.filter(user => user.username.toLowerCase().includes(q) || String(user.publicUid) === q)
    .sort((a, b) => rank(a) - rank(b) || a.publicUid - b.publicUid).slice(0, 8);
}

export function recentChatUsers(users: readonly ChatRecentMentionUser[]): ChatRecentMentionUser[] {
  const recent = new Map<string, ChatRecentMentionUser>();
  for (const user of users) {
    if (Date.parse(user.lastMessageAt) <= Date.now() - CHAT_RETENTION_MS) continue;
    const previous = recent.get(user.userId);
    if (!previous || user.lastMessageAt > previous.lastMessageAt) recent.set(user.userId, user);
  }
  return [...recent.values()].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt) || a.publicUid - b.publicUid).slice(0, 8);
}

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
