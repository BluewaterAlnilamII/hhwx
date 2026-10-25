import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server.js";
import nextConfig from "../next.config.mjs";
import { POST } from "../src/app/api/security/csp-report/route.ts";

const reportOnlyHeader = "content-security-policy-report-only";

test("report-only covers page and Worker responses without relying on Accept", async () => {
  let expectedPolicy;
  for (const pathname of ["/", "/auth", "/en/bandori/songs/825", "/_next/static/chunks/worker.js", "/res/bandori/chart-simulator/signalsmith-stretch-1.3.2.mjs"]) {
    for (const headers of [{}, { accept: "*/*" }, { accept: "text/html" }]) {
      const response = await unstable_getResponseFromNextConfig({
        url: `https://example.test${pathname}`, nextConfig, headers,
      });
      const policy = response.headers.get(reportOnlyHeader);
      assert.ok(policy, pathname);
      expectedPolicy ??= policy;
      assert.equal(policy, expectedPolicy);
      assert.equal(response.headers.get("content-security-policy"), null);
    }
  }
  const api = await unstable_getResponseFromNextConfig({
    url: "https://example.test/api/security/csp-report", nextConfig,
  });
  assert.equal(api.headers.get(reportOnlyHeader), null);
});

test("local image reads and Turnstile feedback are allowed without expanding script permissions", async () => {
  const response = await unstable_getResponseFromNextConfig({url:"https://example.test/", nextConfig});
  const policy = response.headers.get(reportOnlyHeader);
  const directives = new Map(policy.split(";").map(value => {
    const [name, ...sources] = value.trim().split(/\s+/);
    return [name, sources];
  }));
  for (const source of ["'self'", "data:", "blob:", "https://challenges.cloudflare.com"]) {
    assert.ok(directives.get("connect-src").includes(source), source);
  }
  assert.deepEqual(directives.get("script-src"), ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", "https://static.cloudflareinsights.com", "https://challenges.cloudflare.com"]);
  assert.deepEqual(directives.get("worker-src"), ["'self'", "blob:"]);
  assert.deepEqual(directives.get("frame-src"), ["https://challenges.cloudflare.com"]);
  assert.doesNotMatch(policy, /quark\.cn|alicdn\.com|res\.qq\.com|aegis\.qq\.com|rumt-zh\.com|hihonorcdn\.com/);
  assert.deepEqual(directives.get("report-uri"), ["/api/security/csp-report"]);
});

function request(payload, contentType = "application/csp-report") {
  return new Request("https://example.test/api/security/csp-report", {
    method: "POST", headers: { "content-type": contentType, "user-agent": "CSP fixture browser" },
    body: JSON.stringify(payload),
  });
}

test("legacy reports retain provenance and strip secrets from URLs and script samples", async t => {
  const warn = t.mock.method(console, "warn", () => {});
  const policy = "default-src 'self'; report-uri /api/security/csp-report";
  const before = Date.now();
  const response = await POST(request({"csp-report": {
    "original-policy": policy,
    "document-uri": "https://example.test/auth/confirm?token=private#access_token=private",
    "blocked-uri": "https://name:password@outside.test/script.js?signed=private#private",
    "source-file": "https://example.test/_next/static/chunks/app.js?private=value",
    "effective-directive": "script-src-elem", "violated-directive": "script-src-elem",
    disposition: "report", "line-number": 12, "column-number": 4, "status-code": 200,
    "script-sample": "private user data", receivedAt: "1900-01-01", originalPolicyHash: "fake",
  }}));
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal(warn.mock.calls.length, 1);
  const [prefix, log] = warn.mock.calls[0].arguments;
  assert.equal(prefix, "CSP report received:");
  const [report] = JSON.parse(log);
  assert.ok(Date.parse(report.receivedAt) >= before && Date.parse(report.receivedAt) <= Date.now());
  assert.equal(report.originalPolicyHash, createHash("sha256").update(policy).digest("hex"));
  assert.equal(report.documentUri, "https://example.test/auth/confirm");
  assert.equal(report.blockedUri, "https://outside.test/script.js");
  assert.equal(report.sourceFile, "https://example.test/_next/static/chunks/app.js");
  assert.equal(report.source, "legacy");
  assert.equal(report.lineNumber, 12);
  assert.equal(report.userAgent, "CSP fixture browser");
  assert.equal(report.sample, null);
  assert.doesNotMatch(log, /private|password|access_token/);
});

test("Reporting API batches distinguish old policies and preserve unknown policy provenance", async t => {
  const warn = t.mock.method(console, "warn", () => {});
  const policies = ["default-src 'self'", "default-src 'self'; connect-src 'self' data:", undefined];
  await POST(request(policies.map((originalPolicy, index) => ({
    type:"csp-violation", url:"https://example.test/account?token=private", user_agent:"Reporting fixture browser",
    body:{originalPolicy, blockedURL:["data:image/png;base64,private", "blob:https://example.test/private", "eval"][index], sourceFile:"chrome-extension://private/background.js", sample:"private", effectiveDirective:"connect-src"},
  })), "application/reports+json"));
  const reports = JSON.parse(warn.mock.calls[0].arguments[1]);
  assert.equal(reports.length, 3);
  assert.notEqual(reports[0].originalPolicyHash, reports[1].originalPolicyHash);
  assert.equal(reports[2].originalPolicyHash, null);
  assert.deepEqual(reports.map(r=>r.blockedUri), ["data", "blob", "eval"]);
  for (const report of reports) {
    assert.equal(report.source, "reporting-api");
    assert.equal(report.sourceFile, "chrome-extension");
    assert.equal(report.documentUri, "https://example.test/account");
    assert.equal(report.userAgent, "Reporting fixture browser");
    assert.equal(report.sample, null);
    assert.ok(Number.isFinite(Date.parse(report.receivedAt)));
  }
});

test("missing policy is never mislabeled as the deployed policy, malformed payloads still return 204", async t => {
  const warn = t.mock.method(console, "warn", () => {});
  await POST(request({"csp-report":{"blocked-uri":"wasm-eval"}}));
  assert.equal(JSON.parse(warn.mock.calls[0].arguments[1])[0].originalPolicyHash, null);
  for (const [body, contentType] of [["{broken-private", "application/json"], ["private raw text", "text/plain"]]) {
    const response = await POST(new Request("https://example.test/api/security/csp-report", {method:"POST", headers:{"content-type":contentType}, body}));
    assert.equal(response.status, 204);
    const [prefix, log] = warn.mock.calls.at(-1).arguments;
    assert.equal(prefix, "CSP report received with unsupported payload:");
    assert.ok(Number.isFinite(Date.parse(JSON.parse(log).receivedAt)));
    assert.doesNotMatch(log, /private/);
  }
});
