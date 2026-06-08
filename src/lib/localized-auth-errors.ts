import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";
import { type LocalizedAuthErrorMessages } from "@/lib/auth-error";

type TranslateAuthError = (key: string, values?: Record<string, string | number>) => string;

export function getLocalizedAuthErrorMessages(t: TranslateAuthError): LocalizedAuthErrorMessages {
  const passwordBounds = {
    min: PASSWORD_MIN_LENGTH,
    max: PASSWORD_MAX_LENGTH,
  };

  return {
    loginCaptchaServer: t("errors.loginCaptchaServer"),
    captchaFailed: t("errors.captchaFailed"),
    serviceUnavailable: t("errors.serviceUnavailable"),
    invalidCredentials: t("errors.invalidCredentials"),
    emailNotConfirmed: t("errors.emailNotConfirmed"),
    emailTaken: t("errors.emailTaken"),
    emailUnchanged: t("errors.emailUnchanged"),
    invalidEmail: t("errors.invalidEmail"),
    weakPassword: t("errors.weakPassword", passwordBounds),
    samePassword: t("errors.samePassword"),
    tooManyRequests: t("errors.tooManyRequests"),
  };
}
