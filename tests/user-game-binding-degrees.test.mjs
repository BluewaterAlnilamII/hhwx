import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { registerHooks } from "node:module";

const serverBoundary = registerHooks({
  resolve(specifier, context, next) {
    return next(specifier === "server-only" ? "next/dist/compiled/server-only/empty" : specifier, context);
  },
});
const { extractSnapshotDegreeIds, extractSnapshotDegreeEffectIds } = await import("../src/lib/user-game-profiles-server.ts");
serverBoundary.deregister();

const migrationSource = fs.readFileSync(
  new URL("../supabase/migrations/20260815171306_add_game_binding_owned_degrees.sql", import.meta.url),
  "utf8",
);
const effectMigrationSource = fs.readFileSync(
  new URL("../supabase/migrations/20260816024443_add_game_binding_degree_effects.sql", import.meta.url),
  "utf8",
);
const displayEffectMigrationSource = fs.readFileSync(
  new URL("../supabase/migrations/20260816092425_add_profile_display_degree_effect.sql", import.meta.url),
  "utf8",
);

test("extracts a canonical non-empty Degree ID set from suite/user", () => {
  assert.deepEqual(
    extractSnapshotDegreeIds({
      snapshot: {
        suite_user: {
          degrees: [
            { degree_id: 202, user_id: 1001 },
            { degree_id: "101", user_id: 1001 },
            { degree_id: 202, user_id: 1001 },
            { degree_id: 0, user_id: 1001 },
            { degree_id: 101.5, user_id: 1001 },
            { degree_id: true, user_id: 1001 },
            { degree_id: "invalid", user_id: 1001 },
          ],
        },
      },
    }),
    [101, 202],
  );
});

test("treats missing or empty suite/user Degree data as no observation", () => {
  assert.deepEqual(extractSnapshotDegreeIds({ snapshot: { suite_user: {} } }), []);
  assert.deepEqual(
    extractSnapshotDegreeIds({ snapshot: { suite_user: { degrees: [] } } }),
    [],
  );
});

test("extracts all positive biliDegreeEffectId observations from suite/user", () => {
  assert.deepEqual(
    extractSnapshotDegreeEffectIds({
      snapshot: {
        suite_user: {
          degree_effects: [
            { bili_degree_effect_id: 902, degree_id: 202 },
            { bili_degree_effect_id: "901", degree_id: 201 },
            { bili_degree_effect_id: 902, degree_id: 203 },
            { bili_degree_effect_id: 0 },
            { bili_degree_effect_id: "invalid" },
          ],
        },
      },
    }),
    [901, 902],
  );
});

test("Degree effects use an independent monotonic private binding column", () => {
  assert.match(
    effectMigrationSource,
    /owned_degree_effect_ids integer\[\] not null default '\{\}'::integer\[\]/u,
  );
  assert.match(effectMigrationSource, /select distinct degree_effect_id/u);
  assert.match(
    effectMigrationSource,
    /grant execute on function public\.merge_game_uid_binding_degree_effects\(uuid, text, integer\[\]\)[\s\S]*to service_role/u,
  );
  assert.doesNotMatch(effectMigrationSource, /display_degree_effect_id/u);
  assert.doesNotMatch(effectMigrationSource, /set_profile_display_degree/u);
  assert.doesNotMatch(effectMigrationSource, /complete_game_uid_binding/u);
  assert.doesNotMatch(effectMigrationSource, /unbind_game_uid/u);
});

test("public display effect selection is isolated in its own compatible migration", () => {
  assert.match(displayEffectMigrationSource, /display_degree_effect_id integer/u);
  assert.match(
    displayEffectMigrationSource,
    /p_degree_effect_id = any\(bindings\.owned_degree_effect_ids\)/u,
  );
  assert.match(
    displayEffectMigrationSource,
    /set_profile_display_degree\(uuid, integer, integer, integer\)[\s\S]*to service_role/u,
  );
  assert.match(
    displayEffectMigrationSource,
    /set_profile_display_degree\(uuid, integer, integer\)[\s\S]*to service_role/u,
  );
  assert.match(
    displayEffectMigrationSource,
    /profile\.display_degree_effect_id = any\(remaining_binding\.owned_degree_effect_ids\)/u,
  );
});

test("migration stores private Degree IDs and merges them atomically", () => {
  assert.match(
    migrationSource,
    /owned_degree_ids integer\[\] not null default '\{\}'::integer\[\]/u,
  );
  assert.match(migrationSource, /security invoker/u);
  assert.match(migrationSource, /select distinct degree_id/u);
  assert.match(migrationSource, /array_agg\(normalized\.degree_id order by normalized\.degree_id\)/u);
  assert.match(
    migrationSource,
    /revoke all on function public\.merge_game_uid_binding_degrees\(uuid, text, integer\[\]\)[\s\S]*from public, anon, authenticated/u,
  );
  assert.match(
    migrationSource,
    /grant execute on function public\.merge_game_uid_binding_degrees\(uuid, text, integer\[\]\)[\s\S]*to service_role/u,
  );
});
