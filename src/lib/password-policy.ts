export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;
const PASSWORD_INNER_MIN_LENGTH = PASSWORD_MIN_LENGTH - 2;
const PASSWORD_INNER_MAX_LENGTH = PASSWORD_MAX_LENGTH - 2;

export const PASSWORD_INPUT_PATTERN = `(?=.*[A-Za-z])(?=.*\\d)[!-~](?:[ -~]{${PASSWORD_INNER_MIN_LENGTH},${PASSWORD_INNER_MAX_LENGTH}}[!-~])`;
export const PASSWORD_POLICY_MESSAGE = "密码需为 8-64 位，包含字母和数字，可用 ASCII 符号和空格，且首尾不能有空格。";
export const PASSWORD_LENGTH_MESSAGE = "密码需为 8-64 位。";
export const PASSWORD_EDGE_SPACE_MESSAGE = "密码首尾不能有空格。";
export const PASSWORD_CHARACTER_MESSAGE = "密码仅支持半角字母、数字、符号和空格。";
export const PASSWORD_LETTER_AND_DIGIT_MESSAGE = "密码需同时包含字母和数字。";
export const PASSWORD_LETTER_MESSAGE = "密码需包含字母。";
export const PASSWORD_DIGIT_MESSAGE = "密码需包含数字。";

const PASSWORD_ALLOWED_CHARACTER_PATTERN = /^[ -~]+$/;

export type PasswordValidationIssue =
  | "length"
  | "edgeSpace"
  | "character"
  | "letterAndDigit"
  | "letter"
  | "digit";

export function validatePasswordValueIssue(password: string): PasswordValidationIssue | null {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return "length";
  }

  if (password.startsWith(" ") || password.endsWith(" ")) {
    return "edgeSpace";
  }

  if (!PASSWORD_ALLOWED_CHARACTER_PATTERN.test(password)) {
    return "character";
  }

  const hasLetter = /[A-Za-z]/.test(password);
  const hasDigit = /\d/.test(password);

  if (!hasLetter && !hasDigit) {
    return "letterAndDigit";
  }

  if (!hasLetter) {
    return "letter";
  }

  if (!hasDigit) {
    return "digit";
  }

  return null;
}

export function validatePasswordValue(password: string): string | null {
  const issue = validatePasswordValueIssue(password);
  if (issue === "length") {
    return PASSWORD_LENGTH_MESSAGE;
  }

  if (issue === "edgeSpace") {
    return PASSWORD_EDGE_SPACE_MESSAGE;
  }

  if (issue === "character") {
    return PASSWORD_CHARACTER_MESSAGE;
  }

  if (issue === "letterAndDigit") {
    return PASSWORD_LETTER_AND_DIGIT_MESSAGE;
  }

  if (issue === "letter") {
    return PASSWORD_LETTER_MESSAGE;
  }

  if (issue === "digit") {
    return PASSWORD_DIGIT_MESSAGE;
  }

  return null;
}

export function isPasswordStrongEnough(password: string): boolean {
  return validatePasswordValue(password) === null;
}
