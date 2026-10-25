import { createHash } from "node:crypto";
import { NO_STORE_HTTP_CACHE_POLICY, withHttpCachePolicy } from "@/lib/api-cache";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

type NormalizedCspReport = {
  source: "legacy" | "reporting-api";
  originalPolicyHash: string | null;
  documentUri: string | null;
  blockedUri: string | null;
  effectiveDirective: string | null;
  violatedDirective: string | null;
  disposition: string | null;
  sourceFile: string | null;
  lineNumber: number | null;
  columnNumber: number | null;
  statusCode: number | null;
  sample: null;
  userAgent: string | null;
};

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hashOriginalPolicy(value: unknown): string | null {
  const policy = asString(value);
  return policy ? createHash("sha256").update(policy).digest("hex") : null;
}

function sanitizeReportUri(value: unknown): string | null {
  const uri = asString(value);
  if (!uri) return null;
  try {
    const url = new URL(uri);
    // Inline data, local file paths and extension identifiers are not log data.
    if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol)) {
      return url.protocol.slice(0, -1);
    }
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    // Browsers also report tokens such as inline, eval, wasm-eval and null.
    return /^[a-z][a-z0-9+-]*$/i.test(uri) ? uri : null;
  }
}

function normalizeLegacyCspReport(value: unknown, userAgent: string | null): NormalizedCspReport | null {
  if (!isJsonRecord(value)) {
    return null;
  }

  return {
    source: "legacy",
    originalPolicyHash: hashOriginalPolicy(value["original-policy"]),
    documentUri: sanitizeReportUri(value["document-uri"]),
    blockedUri: sanitizeReportUri(value["blocked-uri"]),
    effectiveDirective: asString(value["effective-directive"]),
    violatedDirective: asString(value["violated-directive"]),
    disposition: asString(value.disposition),
    sourceFile: sanitizeReportUri(value["source-file"]),
    lineNumber: asNumber(value["line-number"]),
    columnNumber: asNumber(value["column-number"]),
    statusCode: asNumber(value["status-code"]),
    // Script samples can contain user data; retain the log shape without the text.
    sample: null,
    userAgent,
  };
}

function normalizeReportingApiReport(value: unknown, fallbackUserAgent: string | null): NormalizedCspReport[] {
  if (!isJsonRecord(value) || value.type !== "csp-violation") {
    return [];
  }

  const body = isJsonRecord(value.body) ? value.body : null;
  if (!body) {
    return [];
  }

  return [{
    source: "reporting-api",
    originalPolicyHash: hashOriginalPolicy(body.originalPolicy),
    documentUri: sanitizeReportUri(body.documentURL) ?? sanitizeReportUri(value.url),
    blockedUri: sanitizeReportUri(body.blockedURL),
    effectiveDirective: asString(body.effectiveDirective),
    violatedDirective: asString(body.violatedDirective),
    disposition: asString(body.disposition),
    sourceFile: sanitizeReportUri(body.sourceFile),
    lineNumber: asNumber(body.lineNumber),
    columnNumber: asNumber(body.columnNumber),
    statusCode: asNumber(body.statusCode),
    sample: null,
    userAgent: asString(value.user_agent) ?? fallbackUserAgent,
  }];
}

function normalizeCspReports(payload: unknown, userAgent: string | null): NormalizedCspReport[] {
  if (Array.isArray(payload)) {
    return payload.flatMap((entry) => normalizeReportingApiReport(entry, userAgent));
  }

  if (!isJsonRecord(payload)) {
    return [];
  }

  const legacyReport = normalizeLegacyCspReport(payload["csp-report"], userAgent);
  if (legacyReport) {
    return [legacyReport];
  }

  return normalizeReportingApiReport(payload, userAgent);
}

async function readCspPayload(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (
    contentType.includes("application/csp-report")
    || contentType.includes("application/reports+json")
    || contentType.includes("application/json")
  ) {
    try {
      return await request.json();
    } catch {
      return null;
    }
  }

  try {
    const rawText = await request.text();
    return rawText.trim() ? { rawText } : null;
  } catch {
    return null;
  }
}

function buildResponseHeaders() {
  return withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY);
}

export async function POST(request: Request) {
  const receivedAt = new Date().toISOString();
  const contentType = request.headers.get("content-type") ?? null;
  const userAgent = request.headers.get("user-agent");
  const payload = await readCspPayload(request);
  const reports = normalizeCspReports(payload, userAgent);

  if (reports.length > 0) {
    console.warn("CSP report received:", JSON.stringify(reports.map((report) => ({ receivedAt, ...report }))));
  } else {
    console.warn("CSP report received with unsupported payload:", JSON.stringify({
      receivedAt,
      contentType,
      hasPayload: payload !== null,
      userAgent,
    }));
  }

  return new Response(null, {
    status: 204,
    headers: buildResponseHeaders(),
  });
}
