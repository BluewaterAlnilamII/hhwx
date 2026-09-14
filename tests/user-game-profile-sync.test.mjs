import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { ApiRouteError } from "../src/lib/api-contracts.ts";
import { GAME_PROFILE_SYNC_ENABLED } from "../src/lib/user-game-profile-sync.ts";

test("paused sync rejects authenticated requests before parsing or requesting game data", async () => {
  let authorized = true;
  const dependencies = {
    "@/lib/api-contracts": { ApiRouteError },
    "@/lib/api-response": {
      jsonError: (status, code) => ({ status, code }),
      jsonRouteError: (error) => ({ status: error.status, code: error.code }),
      jsonSuccess: () => assert.fail("Paused sync must not succeed"),
    },
    "@/lib/auth-server": { requireVerifiedAccount: async () => {
      if (!authorized) throw new ApiRouteError(401, "UNAUTHORIZED", "Sign in required");
      return { id: "viewer" };
    } },
    "@/lib/game-account-binding": { normalizeGameUid: () => assert.fail("Paused sync must not parse the UID") },
    "@/lib/user-game-profiles-server": { syncAutoGameProfile: () => assert.fail("Paused sync must not run the workflow") },
    "@/lib/user-game-profile-sync": { GAME_PROFILE_SYNC_ENABLED },
  };
  const source = readFileSync(new URL("../src/app/api/account/game-profiles/sync/route.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  runInNewContext(outputText, { exports, console: { error() {} }, require: (id) => {
    assert.ok(Object.hasOwn(dependencies, id), `Unexpected dependency: ${id}`);
    return dependencies[id];
  } });
  const request = { json: () => assert.fail("Paused sync must not read the body") };
  assert.equal(GAME_PROFILE_SYNC_ENABLED, false);
  assert.deepEqual(await exports.POST(request), { status: 503, code: "USER_SNAPSHOT_UNAVAILABLE" });
  authorized = false;
  assert.deepEqual(await exports.POST(request), { status: 401, code: "UNAUTHORIZED" });
});
