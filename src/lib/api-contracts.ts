type ApiErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
};

export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
};

export type ApiErrorResponse = {
  success: false;
  error: ApiErrorPayload;
};

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export class ApiRouteError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiRouteError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseApiSuccessData<T>(payload: unknown): T | null {
  if (!isRecord(payload) || payload.success !== true || !("data" in payload)) {
    return null;
  }

  return payload.data as T;
}

export function getApiErrorMessage(payload: unknown): string | null {
  if (isRecord(payload) && payload.success === false && isRecord(payload.error)) {
    const message = typeof payload.error.message === "string" ? payload.error.message : null;
    const details = typeof payload.error.details === "string" ? payload.error.details : null;
    const parts = [message, details].filter((value): value is string => Boolean(value));
    return parts.length > 0 ? parts.join("：") : null;
  }

  if (isRecord(payload)) {
    const legacyError = typeof payload.error === "string" ? payload.error : null;
    const legacyDetails = typeof payload.details === "string" ? payload.details : null;
    const parts = [legacyError, legacyDetails].filter((value): value is string => Boolean(value));
    return parts.length > 0 ? parts.join("：") : null;
  }

  return null;
}