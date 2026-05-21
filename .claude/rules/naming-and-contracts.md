# Naming and Data Contract Rules

## Code Naming

- Variables, functions, ordinary object keys, hook names, and internal DTO fields use camelCase.
- React component names, type names, interface names, and enum names use PascalCase.
- Constants should be semantically named. Prefer UPPER_SNAKE_CASE for module-level immutable constants.
- Boolean variables should use readable prefixes such as `is`, `has`, `should`, or `can`. Avoid unclear abbreviations.
- Avoid hard-to-understand abbreviations. Prefer full words except for widely accepted terms such as DTO, API, URL, and ID.

## File and Directory Naming

- React component files use `PascalCase.tsx`.
- Hook files use `useCamelCase.ts` or `useCamelCase.tsx`.
- Shared utilities, service modules, cache modules, and adapter modules use `kebab-case.ts`.
- Next.js route handlers use `route.ts` and follow App Router directory semantics.

## API JSON Keys

- By default, JSON keys returned by project-owned APIs use camelCase, except for registered historical compatibility public contracts.
- `snake_case` fields returned from the database and fields from third-party APIs must normally be mapped at the service boundary before they are returned to the frontend. Registered historical compatibility public contracts may keep original key names only at the compatibility boundary.
- Non-camelCase keys are allowed only for explicitly pass-through third-party protocols or registered historical compatibility public APIs. In those cases, document the compatibility reason in the route or adapter.
- The full definition of new JSON API response envelopes and historical compatibility exceptions lives in `.claude/rules/api-routes.md`. Do not duplicate concrete structures here to avoid rule drift.
- Do not mix two response structures in the same route by default. If a registered historical compatibility boundary must keep the old success body while using the unified failure body, document the reason in the route or shared handler.

## Database Naming

- New database tables, views, materialized views, and join tables use plural `snake_case` noun phrases.
- Do not add new singular table names. Existing singular table names are legacy debt; do not opportunistically refactor them or propose database renames in unrelated tasks.
- Database column names, SQL result field names, and Row type fields use `snake_case` to stay aligned with database entities.
- Domain models, service return values, and frontend-consumed objects in code are converted to camelCase to avoid leaking database naming into UI or public JSON protocols.
- Names for the same entity should be traceable across layers. Example: database table `bandori_events` -> Row type `EventRow` -> DTO `BandoriEventRecord`; all three keep the `event` core term and differ by layer suffix.
