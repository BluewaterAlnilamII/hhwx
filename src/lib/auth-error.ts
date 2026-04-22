import { PASSWORD_POLICY_MESSAGE } from "@/lib/password-policy";

export type AuthErrorContext =
  | "login"
  | "register"
  | "forgot-password"
  | "password-reset"
  | "email-update"
  | "email-verify";

export function formatAuthErrorMessage(error: unknown, fallbackMessage: string, context?: AuthErrorContext): string {
  if (error instanceof Error && error.message) {
    const normalizedMessage = error.message.toLowerCase();

    if (normalizedMessage.includes("captcha verification process failed")) {
      return context === "login"
        ? "当前登录仍受服务端验证码配置限制。前端已取消登录验证码，如需彻底取消，还需要在 Supabase 后台关闭登录验证码。"
        : "安全验证未通过，请重新完成后再试。";
    }

    if (normalizedMessage.includes("invalid login credentials")) {
      return "邮箱或密码不正确。";
    }

    if (normalizedMessage.includes("email not confirmed")) {
      return "请先完成邮箱验证。";
    }

    if (normalizedMessage.includes("user already registered")) {
      return "该邮箱已被注册。";
    }

    if ((normalizedMessage.includes("email") && normalizedMessage.includes("already")) || normalizedMessage.includes("email address has already been taken")) {
      return "该邮箱已被注册。";
    }

    if (normalizedMessage.includes("new email") && normalizedMessage.includes("different")) {
      return "新邮箱需要与当前邮箱不同。";
    }

    if (normalizedMessage.includes("unable to validate email address") || (normalizedMessage.includes("email") && normalizedMessage.includes("invalid"))) {
      return "请输入有效的邮箱地址。";
    }

    if (normalizedMessage.includes("password should be at least") || normalizedMessage.includes("password is too weak")) {
      return PASSWORD_POLICY_MESSAGE;
    }

    if (normalizedMessage.includes("same as the old password")) {
      return "新密码需要与当前密码不同。";
    }

    if (normalizedMessage.includes("too many requests") || normalizedMessage.includes("for security purposes")) {
      return "请求过于频繁，请稍后再试。";
    }

    return error.message;
  }

  return fallbackMessage;
}