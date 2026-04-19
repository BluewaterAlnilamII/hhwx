import { LIVE_API_CACHE_CONTROL, withCacheControl } from "@/lib/api-cache";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

type NormalizedCspReport = {
  source: "legacy" | "reporting-api";
  documentUri: string | null;
  blockedUri: string | null;
  effectiveDirective: string | null;
  violatedDirective: string | null;
  disposition: string | null;
  sourceFile: string | null;
  lineNumber: number | null;
  columnNumber: number | null;
  statusCode: number | null;
  sample: string | null;
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

function normalizeLegacyCspReport(value: unknown, userAgent: string | null): NormalizedCspReport | null {
  if (!isJsonRecord(value)) {
    return null;
  }

  return {
    source: "legacy",
    documentUri: asString(value["document-uri"]),
    blockedUri: asString(value["blocked-uri"]),
    effectiveDirective: asString(value["effective-directive"]),
    violatedDirective: asString(value["violated-directive"]),
    disposition: asString(value.disposition),
    sourceFile: asString(value["source-file"]),
    lineNumber: asNumber(value["line-number"]),
    columnNumber: asNumber(value["column-number"]),
    statusCode: asNumber(value["status-code"]),
    sample: asString(value["script-sample"]),
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
    documentUri: asString(body.documentURL) ?? asString(value.url),
    blockedUri: asString(body.blockedURL),
    effectiveDirective: asString(body.effectiveDirective),
    violatedDirective: asString(body.violatedDirective),
    disposition: asString(body.disposition),
    sourceFile: asString(body.sourceFile),
    lineNumber: asNumber(body.lineNumber),
    columnNumber: asNumber(body.columnNumber),
    statusCode: asNumber(body.statusCode),
    sample: asString(body.sample),
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
  return withCacheControl(LIVE_API_CACHE_CONTROL);
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? null;
  const userAgent = request.headers.get("user-agent");
  const payload = await readCspPayload(request);
  const reports = normalizeCspReports(payload, userAgent);

  if (reports.length > 0) {
    console.warn("CSP report received:", JSON.stringify(reports));
  } else {
    console.warn("CSP report received with unsupported payload:", JSON.stringify({
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