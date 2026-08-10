export const MESSAGE_NAMESPACES = [
  "metadata",
  "common",
  "comments",
  "navigation",
  "auth",
  "account",
  "bandori",
  "othello",
  "errors",
] as const;

export type MessageNamespace = typeof MESSAGE_NAMESPACES[number];
