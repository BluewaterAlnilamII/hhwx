import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatAuthErrorMessage } from "../src/lib/auth-error.ts";
import { getLocalizedAuthErrorMessages } from "../src/lib/localized-auth-errors.ts";

for (const locale of ["zh-CN", "en"]) {
  const catalog = JSON.parse(readFileSync(new URL(`../messages/${locale}/auth.json`, import.meta.url), "utf8"));
  const messages = getLocalizedAuthErrorMessages((key) => key.split(".").reduce((value, part) => value[part], catalog));
  const format = (error) => formatAuthErrorMessage(error, catalog.otp.failed, undefined, messages);

  test(`${locale}: stable Auth codes take precedence over provider wording`, () => {
    for (const [code, key] of [
      ["otp_expired", "invalidCode"], ["same_password", "samePassword"],
      ["over_email_send_rate_limit", "tooManyRequests"], ["over_request_rate_limit", "tooManyRequests"],
      ["captcha_failed", "captchaFailed"], ["invalid_credentials", "invalidCredentials"],
      ["email_not_confirmed", "emailNotConfirmed"], ["email_exists", "emailTaken"],
      ["user_already_exists", "emailTaken"], ["email_address_invalid", "invalidEmail"],
      ["weak_password", "weakPassword"], ["request_timeout", "serviceUnavailable"],
    ]) {
      assert.equal(format(Object.assign(new Error("Provider wording changed"), { code })), messages[key]);
      assert.equal(format({ code }), messages[key]);
    }
    assert.equal(format({ code: "over_email_send_rate_limit", message: "email rate limit exceeded" }), messages.tooManyRequests);
    assert.equal(format({ code: "over_request_rate_limit", message: "Request rate limit reached" }), messages.tooManyRequests);
    assert.equal(format({ status: 429, message: "Upstream throttled" }), messages.tooManyRequests);
  });

  test(`${locale}: unknown failures never expose raw provider text`, () => {
    for (const error of [
      { code: "unexpected_failure", message: "Error sending recovery email" },
      { status: 502, message: "SMTP upstream unavailable" },
      { code: "future_code", message: "user already registered" },
      new Error("Internal provider detail"), new Error("非受控的原始错误"),
      "Raw string failure", null, undefined,
    ]) assert.equal(format(error), catalog.otp.failed);
    assert.equal(format(new TypeError("Failed to fetch")), messages.serviceUnavailable);
    assert.equal(format(new Error("New password should be different from the old password.")), messages.samePassword);
  });
}
