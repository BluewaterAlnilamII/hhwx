import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as registration from "../src/lib/account-registration.ts";
import * as passwords from "../src/lib/password-policy.ts";
import * as usernames from "../src/lib/username-policy.ts";
import * as validation from "../src/lib/localized-validation.ts";
import { parseApiSuccessData } from "../src/lib/api-contracts.ts";
import { formatAuthErrorMessage } from "../src/lib/auth-error.ts";
import { getLocalizedAuthErrorMessages } from "../src/lib/localized-auth-errors.ts";

const source = readFileSync(new URL("../src/components/EmailOtpFlow.tsx", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
});

// Exercise the component's real form handlers; Auth and HTTP are isolated doubles.
function flow({ kind = "register", complete = false, verifyError, sendError, signupError = false, captchaEnabled = false } = {}) {
  const states = [], refs = [], calls = [];
  let stateIndex = 0, refIndex = 0;
  const session = { access_token: "otp-session", user: { id: "test-user", app_metadata: complete ? { hhwx_registration: { id: "complete" } } : {} } };
  const auth = {
    signInWithOtp: async (input) => { calls.push({ type: "otp", input }); return { error: sendError }; },
    resetPasswordForEmail: async (email, options) => { calls.push({ type: "recovery", email, options }); return { error: sendError }; },
    verifyOtp: async (input) => { calls.push({ type: "verify", input }); return { data: { session }, error: verifyError }; },
    updateUser: async (input) => { calls.push({ type: "password", input }); return {}; },
    getSession: async () => ({ data: { session } }),
  };
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    react: {
      useState(initial) {
        const index = stateIndex++;
        if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
        return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
      },
      useRef: (current) => refs[refIndex++] ??= { current },
      useEffect() {}, useId: () => "password-hint",
    },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "next-intl": { useTranslations: () => (key) => key },
    "@/components/LoadingIndicator": { LoadingSpinner: "spinner" },
    "@/components/AccountForm": { AccountField: "field", AccountFormHeading: "heading", AccountFormResult: "result", AccountFormError: "error", EmailCodeField: "code", accountFormStyles: {} },
    "@/components/TurnstileChallenge": { default: "captcha" },
    "@/hooks/useTurnstileAvailability": { useTurnstileAvailability: () => ({ isTurnstileEnabled: captchaEnabled, isTurnstileLoading: false }) },
    "@/lib/supabase": {
      createEmailFlowClient: () => ({ auth }), clearAuthProfileSummaryCache() {},
      readAuthProfileSummary: async () => ({ userId: "test-user", username: "Test", email: "test@example.test", emailVerified: true }),
      supabase: { auth: { setSession: async () => { calls.push({ type: "establish-session" }); return {}; } } },
    },
    "@/lib/account-registration": registration,
    "@/lib/api-contracts": { parseApiSuccessData },
    "@/lib/localized-api-errors": { getLocalizedApiErrorMessage: () => "request-error" },
    "@/lib/auth-error": { formatAuthErrorMessage },
    "@/lib/localized-auth-errors": { getLocalizedAuthErrorMessages },
    "@/lib/localized-validation": validation,
    "@/lib/native-validation": { createNativeValidationProps: () => ({}) },
    "@/lib/password-policy": passwords,
    "@/lib/username-policy": usernames,
    "@/store/useGameStore": { useGameStore: { getState: () => ({ setAuth() {} }) } },
  };
  const exports = {};
  runInNewContext(outputText, {
    exports, require: (id) => { assert.ok(Object.hasOwn(dependencies, id), id); return dependencies[id]; },
    fetch: async (url, options) => {
      calls.push({ type: "http", url, options });
      if (signupError && url === "/api/auth/signup") return Response.json({ success: false }, { status: 403 });
      return Response.json({ success: true, data: url === "/api/account/profile" ? { username: "" } : { registered: true } });
    },
  });
  function nodes() {
    stateIndex = 0; refIndex = 0;
    const result = [];
    function visit(node, hidden = false) {
      if (Array.isArray(node)) { node.forEach((child) => visit(child, hidden)); return; }
      if (!node || typeof node !== "object") return;
      const isHidden = hidden || Boolean(node.props.hidden);
      result.push({ ...node, hidden: isHidden }); visit(node.props.children, isHidden);
    }
    visit(exports.default({ kind }));
    return result;
  }
  return {
    calls, nodes,
    inputs: () => nodes().filter((node) => node.type === "field" && !node.hidden),
    change: (node, value) => node.props.onChange({ target: { value } }),
    async submit() {
      await nodes().find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
      await new Promise(setImmediate);
    },
  };
}

function enterRegistration(flow, password = "LocalTest123") {
  const inputs = flow.inputs();
  assert.equal(inputs.length, 2);
  flow.change(inputs[0], "test@example.test");
  flow.change(inputs[1], password);
}

test("registration rejects invalid passwords before sending email without a confirmation field", async () => {
  for (const password of ["short", "OnlyLetters", " LocalTest123"]) {
    const current = flow(); enterRegistration(current, password);
    await current.submit();
    assert.equal(current.calls.length, 0);
    assert.ok(current.inputs().find((node) => node.props.type === "password").props.error);
  }
});

test("registration keeps the password local until verified email and final username submission", async () => {
  const current = flow(); enterRegistration(current);
  const formId = current.nodes().find((node) => node.type === "form").props.id;
  await current.submit();
  assert.equal(current.calls[0].type, "otp");
  assert.equal(JSON.stringify(current.calls).includes("LocalTest123"), false);
  const retainedPassword = current.nodes().find((node) => node.type === "field" && node.props.type === "password");
  assert.equal(retainedPassword.hidden, true);
  assert.equal(retainedPassword.props.value, "LocalTest123");
  assert.equal(retainedPassword.props.readOnly, true);
  assert.equal(current.nodes().find((node) => node.type === "form").props.id, formId);
  current.nodes().find((node) => node.type === "code").props.onChange("12345678");
  await current.submit();
  const inputs = current.inputs();
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].props.autoComplete, "nickname");
  assert.equal(JSON.stringify(current.calls).includes("LocalTest123"), false);
  current.change(inputs[0], "Shared username");
  await current.submit();
  const request = current.calls.find((call) => call.url === "/api/auth/signup");
  assert.deepEqual(JSON.parse(request.options.body), { username: "Shared username", password: "LocalTest123" });
  assert.equal(request.options.headers.Authorization, "Bearer otp-session");
  assert.equal(current.nodes()[0].props.title, "otp.registeredTitle");
});

test("an already registered email cannot apply the draft registration password", async () => {
  const current = flow({ complete: true }); enterRegistration(current);
  await current.submit(); await current.submit();
  assert.equal(current.nodes()[0].props.title, "otp.existingTitle");
  assert.equal(current.calls.some((call) => call.url === "/api/auth/signup"), false);
  assert.equal(JSON.stringify(current.calls).includes("LocalTest123"), false);
});

test("recovery still requests email proof before displaying new-password fields", async () => {
  for (const complete of [true, false]) {
    const current = flow({ kind: "recovery", complete });
    assert.equal(current.inputs().length, 1);
    current.change(current.inputs()[0], "test@example.test");
    await current.submit(); await current.submit();
    assert.equal(current.calls[0].type, "recovery");
    assert.equal(current.calls.find((call) => call.type === "verify").input.type, "recovery");
    assert.equal(current.inputs().filter((node) => node.props.type === "password").length, 1);
    assert.equal(current.inputs().length, complete ? 1 : 2);
    const account = current.nodes().find((node) => node.type === "field" && node.props.autoComplete === "username");
    assert.equal(account.props.value, "test@example.test");
    assert.equal(account.hidden, true);
  }
});

test("editing a rejected code clears its field error, while connection errors stay on the form", async () => {
  for (const [verifyError, message] of [[{ code: "otp_expired" }, "otp.invalidCode"], [new Error("Failed to fetch"), "errors.serviceUnavailable"]]) {
    const current = flow({ verifyError }); enterRegistration(current);
    await current.submit();
    current.nodes().find((node) => node.type === "code").props.onChange("12345678");
    await current.submit();
    const code = current.nodes().find((node) => node.type === "code");
    const formError = current.nodes().find((node) => node.type === "error");
    assert.equal(code.props.error, message === "otp.invalidCode" ? message : "");
    assert.equal(formError.props.message, message === "otp.invalidCode" ? "" : message);
    code.props.onChange("87654321");
    assert.equal(current.nodes().find((node) => node.type === "code").props.error, "");
  }
});

test("send failures use localized messages and leave the form ready to retry", async () => {
  for (const kind of ["register", "recovery"]) {
    for (const [code, message] of [["over_email_send_rate_limit", "errors.tooManyRequests"], ["unexpected_failure", "otp.failed"]]) {
      const current = flow({ kind, sendError: { code, message: "Raw SMTP failure" } });
      if (kind === "register") enterRegistration(current);
      else current.change(current.inputs()[0], "test@example.test");
      await current.submit();
      assert.equal(current.nodes().find((node) => node.type === "error").props.message, message);
      assert.equal(current.nodes().find((node) => node.type === "form").props["aria-busy"], false);
      assert.equal(current.calls.length, 1);
    }
  }
});

test("app-owned CAPTCHA and registration errors retain their localized guidance", async () => {
  const captcha = flow({ captchaEnabled: true }); enterRegistration(captcha);
  await captcha.submit();
  assert.equal(captcha.calls.length, 0);
  assert.equal(captcha.nodes().find((node) => node.type === "error").props.message, "messages.captchaRequired");
  const signup = flow({ signupError: true }); enterRegistration(signup);
  await signup.submit(); await signup.submit();
  signup.change(signup.inputs()[0], "Test user"); await signup.submit();
  assert.equal(signup.nodes().find((node) => node.type === "error").props.message, "request-error");
  assert.equal(signup.nodes().some((node) => node.type === "result"), false);
});

test("recovery completes with one new password, including retained unfinished accounts", async () => {
  for (const complete of [true, false]) {
    const current = flow({ kind: "recovery", complete });
    current.change(current.inputs()[0], "test@example.test");
    await current.submit(); await current.submit();
    const password = current.inputs().find((node) => node.props.type === "password");
    current.change(password, "Recovered123");
    if (!complete) current.change(current.inputs().find((node) => node.props.autoComplete === "nickname"), "Test user");
    await current.submit();
    if (complete) {
      assert.equal(current.calls.find((call) => call.type === "password").input.password, "Recovered123");
      assert.ok(current.calls.find((call) => call.type === "establish-session"));
      assert.equal(current.nodes()[0].props.title, "otp.passwordSavedTitle");
    } else {
      const request = current.calls.find((call) => call.url === "/api/auth/signup");
      assert.deepEqual(JSON.parse(request.options.body), { username: "Test user", password: "Recovered123" });
      assert.equal(current.nodes()[0].props.title, "otp.registeredTitle");
    }
    assert.equal(current.nodes().some((node) => node.type === "form"), false);
  }
});
