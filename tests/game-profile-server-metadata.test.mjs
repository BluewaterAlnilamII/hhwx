import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const serverSource = fs.readFileSync(
  new URL("../src/lib/user-game-profiles-server.ts", import.meta.url),
  "utf8",
);
const migrationSource = fs.readFileSync(
  new URL("../supabase/migrations/20260801185414_accept_manual_profile_server.sql", import.meta.url),
  "utf8",
);

test("every manual profile creation passes its payload server to the RPC", () => {
  const rpcCalls = [...serverSource.matchAll(
    /\.rpc\("create_manual_game_profile", \{([\s\S]*?)\n\s*\}\);/gu,
  )];

  assert.equal(rpcCalls.length, 4);
  rpcCalls.forEach(([, argumentsSource]) => {
    assert.match(argumentsSource, /p_server:/u);
  });
});

test("manual profile RPC validates and stores the requested gameplay server", () => {
  assert.match(migrationSource, /p_server integer default 3/u);
  assert.match(migrationSource, /p_server is null or p_server not between 0 and 3/u);
  assert.match(migrationSource, /p_profile_name,\s+p_server,\s+null,/u);
  assert.match(
    migrationSource,
    /revoke all on function public\.create_manual_game_profile\([^)]+jsonb, integer\) from public, anon, authenticated/u,
  );
  assert.match(
    migrationSource,
    /grant execute on function public\.create_manual_game_profile\([^)]+jsonb, integer\) to service_role/u,
  );
});
