import { getApiErrorCode, getApiErrorMessage } from "@/lib/api-contracts";

const LOCALIZED_API_ERROR_CODES = new Set([
  "UNAUTHENTICATED",
  "INVALID_AUTHORIZATION_HEADER",
  "AUTHENTICATION_FAILED",
  "EMAIL_VERIFICATION_REQUIRED",
  "INVALID_JSON",
  "INVALID_REQUEST",
  "INVALID_USERNAME",
  "INVALID_PASSWORD",
  "USERNAME_TAKEN",
  "USERNAME_CHECK_FAILED",
  "EMAIL_TAKEN",
  "EMAIL_UNCHANGED",
  "EMAIL_REQUIRED",
  "SIGN_UP_FAILED",
  "PASSWORD_RESET_FAILED",
  "EMAIL_UPDATE_FAILED",
  "TURNSTILE_SERVER_NOT_CONFIGURED",
  "TURNSTILE_REQUIRED",
  "TURNSTILE_VERIFY_FAILED",
  "TURNSTILE_INVALID",
  "PROFILE_READ_FAILED",
  "PROFILE_CREATE_FAILED",
  "ACCOUNT_PROFILE_UPDATE_FAILED",
  "INVALID_AVATAR_CARD_ID",
  "INVALID_AVATAR_CARD_TRAIN_TYPE",
  "AVATAR_CARD_NOT_FOUND",
  "INVALID_COMMENT_CONTENT",
  "EMPTY_COMMENT",
  "COMMENT_TOO_LONG",
  "COMMENT_CREATE_FAILED",
]);

type TranslateApiError = (key: string, values?: Record<string, string | number>) => string;

export function getLocalizedApiErrorMessage(
  payload: unknown,
  translateApiError: TranslateApiError,
): string | null {
  const code = getApiErrorCode(payload);
  if (code && LOCALIZED_API_ERROR_CODES.has(code)) {
    return translateApiError(`api.${code}`);
  }

  return getApiErrorMessage(payload);
}
