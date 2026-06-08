import { PASSWORD_POLICY_MESSAGE } from "@/lib/password-policy";

export type AuthErrorContext =
  | "login"
  | "register"
  | "forgot-password"
  | "password-reset"
  | "email-update"
  | "email-verify";

export interface LocalizedAuthErrorMessages {
  loginCaptchaServer: string;
  captchaFailed: string;
  serviceUnavailable: string;
  invalidCredentials: string;
  emailNotConfirmed: string;
  emailTaken: string;
  emailUnchanged: string;
  invalidEmail: string;
  weakPassword: string;
  samePassword: string;
  tooManyRequests: string;
}

function getDefaultAuthErrorMessages(): LocalizedAuthErrorMessages {
  return {
    loginCaptchaServer: "当前登录仍受服务端验证码配置限制。前端已取消登录验证码，如需彻底取消，还需要在 Supabase 后台关闭登录验证码。",
    captchaFailed: "安全验证未通过，请重新完成后再试。",
    serviceUnavailable: "认证服务连接失败，请检查 Supabase 环境变量和本地网络后再试。",
    invalidCredentials: "邮箱或密码不正确。",
    emailNotConfirmed: "请先完成邮箱验证。",
    emailTaken: "该邮箱已被注册。",
    emailUnchanged: "新邮箱需要与当前邮箱不同。",
    invalidEmail: "请输入有效的邮箱地址。",
    weakPassword: PASSWORD_POLICY_MESSAGE,
    samePassword: "新密码需要与当前密码不同。",
    tooManyRequests: "请求过于频繁，请稍后再试。",
  };
}

export function formatAuthErrorMessage(
  error: unknown,
  fallbackMessage: string,
  context?: AuthErrorContext,
  localizedMessages: LocalizedAuthErrorMessages = getDefaultAuthErrorMessages(),
): string {
  if (error instanceof Error && error.message) {
    const normalizedMessage = error.message.toLowerCase();

    if (normalizedMessage.includes("captcha verification process failed")) {
      return context === "login"
        ? localizedMessages.loginCaptchaServer
        : localizedMessages.captchaFailed;
    }

    if (
      normalizedMessage.includes("failed to fetch")
      || normalizedMessage.includes("networkerror")
      || normalizedMessage.includes("network request failed")
    ) {
      return localizedMessages.serviceUnavailable;
    }

    if (normalizedMessage.includes("invalid login credentials")) {
      return localizedMessages.invalidCredentials;
    }

    if (normalizedMessage.includes("email not confirmed")) {
      return localizedMessages.emailNotConfirmed;
    }

    if (normalizedMessage.includes("user already registered")) {
      return localizedMessages.emailTaken;
    }

    if ((normalizedMessage.includes("email") && normalizedMessage.includes("already")) || normalizedMessage.includes("email address has already been taken")) {
      return localizedMessages.emailTaken;
    }

    if (normalizedMessage.includes("new email") && normalizedMessage.includes("different")) {
      return localizedMessages.emailUnchanged;
    }

    if (normalizedMessage.includes("unable to validate email address") || (normalizedMessage.includes("email") && normalizedMessage.includes("invalid"))) {
      return localizedMessages.invalidEmail;
    }

    if (normalizedMessage.includes("password should be at least") || normalizedMessage.includes("password is too weak")) {
      return localizedMessages.weakPassword;
    }

    if (normalizedMessage.includes("same as the old password")) {
      return localizedMessages.samePassword;
    }

    if (normalizedMessage.includes("too many requests") || normalizedMessage.includes("for security purposes")) {
      return localizedMessages.tooManyRequests;
    }

    return error.message;
  }

  return fallbackMessage;
}
