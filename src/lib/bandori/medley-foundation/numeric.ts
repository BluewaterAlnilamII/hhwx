import type { ExactProbabilityV1 } from "./contracts";
import { failInput } from "./errors";

const U32_MAX = 0xffff_ffff;
const ASCII_WHITESPACE = /^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/gu;

export function trimAsciiWhitespace(value: string): string {
  return value.replace(ASCII_WHITESPACE, "");
}

export function parseSongIdText(value: unknown, path = "songIdText"): number {
  if (typeof value !== "string") failInput("INVALID_SONG", path, "must be a string");
  const source = trimAsciiWhitespace(value);
  if (!/^[1-9][0-9]*$/u.test(source) || source.length > 10) {
    failInput("INVALID_SONG", path, "must be a canonical positive decimal integer");
  }
  const parsed = Number(source);
  if (!Number.isSafeInteger(parsed) || parsed > U32_MAX) {
    failInput("INVALID_SONG", path, "must fit in an unsigned 32-bit integer");
  }
  return parsed;
}

export function parsePerfectRatePercent(
  value: unknown,
  path = "perfectRatePercentText",
): ExactProbabilityV1 {
  if (typeof value !== "string") {
    failInput("INVALID_PERFECT_RATE", path, "must be a string");
  }
  const source = trimAsciiWhitespace(value);
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/u.exec(source);
  if (!match) {
    failInput(
      "INVALID_PERFECT_RATE",
      path,
      "must be a plain decimal percentage without a sign or exponent",
    );
  }
  const whole = match[1];
  const fraction = match[2] ?? "";
  if (
    whole.length > 3
    || (whole.length === 3 && whole !== "100")
    || (whole === "100" && /[1-9]/u.test(fraction))
  ) {
    failInput("INVALID_PERFECT_RATE", path, "must be between 0 and 100 inclusive");
  }

  const significantFraction = fraction.replace(/0+$/u, "");
  let decimalScale = significantFraction.length + 2;
  if (decimalScale > 9) {
    failInput("INVALID_PERFECT_RATE", path, "must reduce to at most nine decimal places");
  }
  let numerator = Number(`${whole}${significantFraction}`);
  if (numerator === 0) {
    decimalScale = 0;
  } else {
    while (decimalScale > 0 && numerator % 10 === 0) {
      numerator /= 10;
      decimalScale -= 1;
    }
  }
  return { numerator, decimalScale };
}
