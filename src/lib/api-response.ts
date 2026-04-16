import { NextResponse } from "next/server";
import { ApiRouteError, type ApiErrorResponse, type ApiSuccessResponse } from "@/lib/api-contracts";

export function jsonSuccess<T>(
  data: T,
  init?: ResponseInit & { meta?: Record<string, unknown> },
): NextResponse<ApiSuccessResponse<T>> {
  const body = init?.meta !== undefined
    ? { success: true as const, data, meta: init.meta }
    : { success: true as const, data };

  return NextResponse.json(body, {
    status: init?.status,
    headers: init?.headers,
  });
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  init?: ResponseInit & { details?: unknown },
): NextResponse<ApiErrorResponse> {
  const error = init?.details !== undefined
    ? { code, message, details: init.details }
    : { code, message };

  return NextResponse.json(
    { success: false as const, error },
    {
      status,
      headers: init?.headers,
    },
  );
}

export function jsonRouteError(
  error: unknown,
  fallback: { status: number; code: string; message: string },
  init?: ResponseInit,
): NextResponse<ApiErrorResponse> {
  if (error instanceof ApiRouteError) {
    return jsonError(error.status, error.code, error.message, {
      headers: init?.headers,
      details: error.details,
    });
  }

  return jsonError(fallback.status, fallback.code, fallback.message, {
    headers: init?.headers,
  });
}