export const PASSWORD_POLICY_MESSAGE = "密码至少需要 8 位，并同时包含字母和数字。";

export function isPasswordStrongEnough(password: string): boolean {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}