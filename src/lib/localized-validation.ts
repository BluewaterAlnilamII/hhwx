import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  validateUsernameValueIssue,
} from "@/lib/username-policy";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  validatePasswordValueIssue,
} from "@/lib/password-policy";

type TranslateValidation = (key: string, values?: Record<string, string | number>) => string;

const usernameBounds = {
  min: USERNAME_MIN_LENGTH,
  max: USERNAME_MAX_LENGTH,
};

const passwordBounds = {
  min: PASSWORD_MIN_LENGTH,
  max: PASSWORD_MAX_LENGTH,
};

export function getLocalizedUsernameValidationMessage(value: string, t: TranslateValidation): string | null {
  const issue = validateUsernameValueIssue(value);
  if (issue === "length") {
    return t("validation.usernameLength", usernameBounds);
  }

  if (issue === "rule") {
    return t("validation.usernameRule", usernameBounds);
  }

  return null;
}

export function getLocalizedPasswordValidationMessage(value: string, t: TranslateValidation): string | null {
  const issue = validatePasswordValueIssue(value);
  if (issue === "length") {
    return t("validation.passwordLength", passwordBounds);
  }

  if (issue === "edgeSpace") {
    return t("validation.passwordEdgeSpace");
  }

  if (issue === "character") {
    return t("validation.passwordCharacter");
  }

  if (issue === "letterAndDigit") {
    return t("validation.passwordLetterAndDigit");
  }

  if (issue === "letter") {
    return t("validation.passwordLetter");
  }

  if (issue === "digit") {
    return t("validation.passwordDigit");
  }

  return null;
}

export function getLocalizedUsernameHint(t: TranslateValidation): string {
  return t("validation.usernameHint", usernameBounds);
}

export function getLocalizedPasswordPolicyMessage(t: TranslateValidation): string {
  return t("validation.passwordPolicy", passwordBounds);
}
