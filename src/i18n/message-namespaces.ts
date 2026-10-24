export const MESSAGE_NAMESPACES = [
  "metadata",
  "common",
  "comments",
  "chat",
  "navigation",
  "serviceStatus",
  "testFeatures",
  "auth",
  "account",
  "bandori",
  "ournotes",
  "othello",
  "errors",
] as const;

export type MessageNamespace = typeof MESSAGE_NAMESPACES[number];
