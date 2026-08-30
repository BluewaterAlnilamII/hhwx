export type MedleyFoundationInputErrorCode =
  | "UNSUPPORTED_SCHEMA"
  | "INVALID_PROFILE"
  | "INVALID_PERFECT_RATE"
  | "INVALID_TEAM"
  | "INVALID_CARD"
  | "INVALID_MASTER"
  | "INVALID_PARAMETER"
  | "INVALID_SKILL"
  | "INVALID_SONG"
  | "INVALID_CHART";

/** Stable fail-closed input error with a machine-readable field path. */
export class MedleyFoundationInputError extends Error {
  override readonly name = "MedleyFoundationInputError";

  constructor(
    readonly code: MedleyFoundationInputErrorCode,
    readonly path: string,
    message: string,
  ) {
    super(`${code} at ${path}: ${message}`);
  }
}

export function failInput(
  code: MedleyFoundationInputErrorCode,
  path: string,
  message: string,
): never {
  throw new MedleyFoundationInputError(code, path, message);
}

export function readRecord(
  value: unknown,
  path: string,
  code: MedleyFoundationInputErrorCode,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    failInput(code, path, "must be an object");
  }
  return value as Record<string, unknown>;
}

export function readArray(
  value: unknown,
  path: string,
  code: MedleyFoundationInputErrorCode,
): unknown[] {
  if (!Array.isArray(value)) {
    failInput(code, path, "must be an array");
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      failInput(code, `${path}[${index}]`, "array entries must be dense own properties");
    }
  }
  return value;
}

export function assertAllowedKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  path: string,
  code: MedleyFoundationInputErrorCode,
): void {
  const allowed = new Set(allowedKeys);
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  const missing = requiredKeys.filter((key) => !Object.hasOwn(value, key));
  if (unexpected.length > 0 || missing.length > 0) {
    const details = [
      unexpected.length > 0 ? `unexpected keys: ${unexpected.join(", ")}` : null,
      missing.length > 0 ? `missing keys: ${missing.join(", ")}` : null,
    ].filter((detail): detail is string => detail !== null);
    failInput(code, path, details.join("; "));
  }
}

export function readFiniteNumber(
  value: unknown,
  path: string,
  code: MedleyFoundationInputErrorCode,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    failInput(code, path, "must be a finite number");
  }
  return value;
}

export function readSafeInteger(
  value: unknown,
  path: string,
  code: MedleyFoundationInputErrorCode,
): number {
  const number = readFiniteNumber(value, path, code);
  if (!Number.isSafeInteger(number)) {
    failInput(code, path, "must be a safe integer");
  }
  return number;
}
