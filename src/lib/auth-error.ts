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
  invalidCode: string;
}

function getDefaultAuthErrorMessages(): LocalizedAuthErrorMessages {
  return {
    loginCaptchaServer: "安全验证未通过，请重新完成后再试",
    captchaFailed: "安全验证未通过，请重新完成后再试",
    serviceUnavailable: "暂时无法连接，请稍后重试",
    invalidCredentials: "邮箱或密码不正确",
    emailNotConfirmed: "请先完成邮箱验证",
    emailTaken: "该邮箱已被注册",
    emailUnchanged: "新邮箱需要与当前邮箱不同",
    invalidEmail: "请输入有效的邮箱地址",
    weakPassword: PASSWORD_POLICY_MESSAGE,
    samePassword: "新密码需要与当前密码不同",
    tooManyRequests: "请求过于频繁，请稍后再试",
    invalidCode: "验证码错误",
  };
}

export function formatAuthErrorMessage(
  error: unknown,
  fallbackMessage: string,
  context?: AuthErrorContext,
  localizedMessages: LocalizedAuthErrorMessages = getDefaultAuthErrorMessages(),
): string {
  if (!error || typeof error !== "object") return fallbackMessage;
  const { code, status, message } = error as { code?: unknown; status?: unknown; message?: unknown };
  switch (code) {
    case "otp_expired": return localizedMessages.invalidCode;
    case "same_password": return localizedMessages.samePassword;
    case "over_email_send_rate_limit":
    case "over_request_rate_limit": return localizedMessages.tooManyRequests;
    case "captcha_failed": return context === "login" ? localizedMessages.loginCaptchaServer : localizedMessages.captchaFailed;
    case "invalid_credentials": return localizedMessages.invalidCredentials;
    case "email_not_confirmed": return localizedMessages.emailNotConfirmed;
    case "email_exists":
    case "user_already_exists": return localizedMessages.emailTaken;
    case "email_address_invalid": return localizedMessages.invalidEmail;
    case "weak_password": return localizedMessages.weakPassword;
    case "request_timeout": return localizedMessages.serviceUnavailable;
  }
  if (status === 429) return localizedMessages.tooManyRequests;
  if (code || (typeof status === "number" && status >= 500)) return fallbackMessage;

  // Older Auth responses and browser network failures may not include a code.
  if (typeof message === "string" && message) {
    const normalizedMessage = message.toLowerCase();

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

    if (normalizedMessage.includes("same as the old password") || normalizedMessage.includes("different from the old password")) {
      return localizedMessages.samePassword;
    }

    if (normalizedMessage.includes("too many requests") || normalizedMessage.includes("for security purposes")) {
      return localizedMessages.tooManyRequests;
    }
  }

  return fallbackMessage;
}
