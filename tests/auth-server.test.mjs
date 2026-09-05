import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { ApiRouteError } from "../src/lib/api-contracts.ts";

test("public comment identity remains optional while write authorization stays strict", async () => {
  let clientCount = 0;
  let isVerified = true;
  const dependencies = {
    "@/lib/api-contracts": { ApiRouteError },
    "@/lib/account-status-server": { readAccountEmailVerified: async () => isVerified },
    "@/lib/supabase-server": {
      createServerSupabaseClient() {
        clientCount += 1;
        return { auth: { getUser: async (token) => {
          if (token === "unavailable") throw new Error("Auth service unavailable");
          return token === "valid"
            ? { data: { user: { id: "viewer", email: "viewer@example.com", user_metadata: {} } }, error: null }
            : { data: { user: null }, error: new Error("Expired token") };
        } } };
      },
    },
  };
  const source = readFileSync(new URL("../src/lib/auth-server.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  runInNewContext(outputText, { exports, require: (id) => {
    assert.ok(Object.hasOwn(dependencies, id), `Unexpected dependency: ${id}`);
    return dependencies[id];
  } });
  const request = (authorization) => new Request("http://localhost/comments", {
    headers: authorization ? { authorization } : {},
  });

  assert.equal(await exports.readViewerUserId(request()), null);
  assert.equal(clientCount, 0);
  for (const token of ["Basic invalid", "Bearer", "Bearer expired", "Bearer unavailable"]) {
    assert.equal(await exports.readViewerUserId(request(token)), null);
  }
  assert.equal(await exports.readViewerUserId(request("Bearer valid")), "viewer");
  await assert.rejects(exports.requireVerifiedAccount(request()), { status: 401 });
  await assert.rejects(exports.requireVerifiedAccount(request("Bearer expired")), { status: 401 });
  isVerified = false;
  assert.equal(await exports.readViewerUserId(request("Bearer valid")), "viewer");
  await assert.rejects(exports.requireVerifiedAccount(request("Bearer valid")), { status: 403 });
  isVerified = true;
  assert.equal((await exports.requireVerifiedAccount(request("Bearer valid"))).id, "viewer");
});
