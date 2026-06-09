export const USERNAME_MIN_LENGTH = 2;
export const USERNAME_MAX_LENGTH = 24;
export const PUBLIC_USERNAME_LABEL = "公开用户名";
export const USERNAME_REQUIRED_MESSAGE = "请输入用户名";
export const USERNAME_LENGTH_MESSAGE = `用户名需在 ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} 个字符内`;
export const USERNAME_RULE_MESSAGE = `用户名需在 ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} 个字符内，支持字母、数字、空格、符号和 emoji`;
export const USERNAME_TAKEN_MESSAGE = "这个用户名已被使用";
export const USERNAME_CHECK_FAILED_MESSAGE = "暂时无法检查用户名，请稍后再试";
export const PUBLIC_USERNAME_HINT = USERNAME_RULE_MESSAGE;
export const PUBLIC_USERNAME_PLACEHOLDER = "输入公开用户名";
export const PUBLIC_USERNAME_DESCRIPTION = "会显示在账号页、评论区等位置。";

const USERNAME_ALLOWED_CHARACTER_PATTERN = /^(?:\P{C}|[\u200C\u200D])+$/u;

export type UsernameValidationIssue = "length" | "rule";

type SegmenterConstructor = new (
  locales?: string | string[],
  options?: { granularity: "grapheme" },
) => {
  segment(input: string): Iterable<{ segment: string }>;
};

export function normalizeUsernameValue(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

export function countUsernameCharacters(value: string): number {
  return Array.from(value).length;
}

export function validateUsernameValueIssue(value: string): UsernameValidationIssue | null {
  if (!value) {
    return null;
  }

  const normalizedValue = normalizeUsernameValue(value);
  const characterCount = countUsernameCharacters(normalizedValue);
  if (characterCount < USERNAME_MIN_LENGTH || characterCount > USERNAME_MAX_LENGTH) {
    return "length";
  }

  if (!USERNAME_ALLOWED_CHARACTER_PATTERN.test(normalizedValue)) {
    return "rule";
  }

  return null;
}

export function validateUsernameValue(value: string): string | null {
  const issue = validateUsernameValueIssue(value);
  if (issue === "length") {
    return USERNAME_LENGTH_MESSAGE;
  }

  if (issue === "rule") {
    return USERNAME_RULE_MESSAGE;
  }

  return null;
}

function readFirstUsernameGrapheme(value: string): string | null {
  const segmenterConstructor = (Intl as typeof Intl & { Segmenter?: SegmenterConstructor }).Segmenter;
  if (segmenterConstructor) {
    const segmenter = new segmenterConstructor(undefined, { granularity: "grapheme" });
    const iterator = segmenter.segment(value)[Symbol.iterator]();
    return iterator.next().value?.segment ?? null;
  }

  return Array.from(value)[0] ?? null;
}

export function getUsernameAvatarLabel(username: string | null | undefined, fallback = "U"): string {
  const normalizedValue = normalizeUsernameValue(username ?? "");
  if (!normalizedValue) {
    return fallback;
  }

  const firstGrapheme = readFirstUsernameGrapheme(normalizedValue) ?? fallback;
  return /\p{L}/u.test(firstGrapheme) ? firstGrapheme.toLocaleUpperCase() : firstGrapheme;
}
