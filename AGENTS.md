# hhwx Agent Project Rules

This is the shared rule entry point for `hhwx`. Codex reads it directly; Claude Code imports it through `.claude/CLAUDE.md`. Load topic rules from the map below only when relevant.

## Scope and Authorization

- Follow the user's request and established authorization while preserving security, privacy, license, and data-integrity boundaries. Discussion, review, or planning requests authorize investigation and requested reports, not implementation. Interpret approval in context; once implementation is authorized, finish that scope without repeated confirmation.
- Explain material trade-offs before a decision that remains with the user. Clarify unresolved choices that materially change scope, product behavior, data contracts, or ongoing cost; continue independent investigation meanwhile. Resolve routine implementation details using established conventions. Seek authorization for destructive or external operations only when it is not already provided.
- Production writes, broad live synchronization, large uploads, and remote configuration/history changes require explicit operational scope and a verified target. Credentials or a dry run do not provide authorization. Read-only checks may use configured access within the task; keep private data and secrets out of output.

## Project Invariants

- `hhwx` owns the public Web app, public APIs, canonical Supabase schema/migrations, and public documentation. `../hhwx-bandori-backend` and `../hhwx-ournotes-backend` own their games' backend acquisition, normalization, artifacts, and jobs; `../hhwx-assets-builder` owns asset extraction, indexes, and publication. Before investigating another repository's implementation, planning changes to it, or running its commands, read its Agent entry point and relevant local rules/contracts. Apply each repository's rules to its own responsibilities; modify only repositories in scope and identify any rollout order.
- Preserve data sources, their owners, and access layers unless the task changes that contract. Public URLs, API shapes, persisted identifiers, environment variables, and external protocols require a compatibility or migration plan for breaking changes.
- Keep secrets, private deployment details, signing capabilities, and RLS-bypass access server-only. Browser Supabase access uses the configured publishable key and normal user sessions. Apply this boundary by responsibility, even before a new file is listed in a topic rule.
- Server readers of HHWX-owned catalogs, manifests, indexes, and aggregate metadata use private object storage. Public CDN URLs serve browsers and external clients; they are not a server-side fallback for failed private reads.
- Content changes to `public/res/**` or other explicitly immutable resources require new URLs and updated consumers. Other `public/**` files are not automatically immutable.
- Communicate in the user's language. Public documentation and code comments default to English; localized copy and operational material use their intended language. Update affected command, configuration, deployment, and contract documentation and review established English/`.zh-CN.md` pairs together. Update `documents/layout.md` and its translation only when directory responsibilities change.

## Professional Skills

- Follow relevant installed skills for their applicable workflows and quality requirements: Ponytail for minimal engineering, Supabase for its products, and build-web-apps for frontend design, browser verification, React performance, and Shadcn composition. Load only the relevant workflows and references; skills do not expand the requested scope or authorize extra features, artifacts, or operations.
- Evaluate existing code against that guidance instead of rejecting better approaches solely to preserve current practice. Resolve factual or version conflicts using official documentation and installed tools; preserve security and compatibility contracts, and explain material adaptations.
- For pages extending an established product pattern, inherit that pattern and design only the necessary differences. Use concept/design workflows for genuinely new visual directions or requested redesigns, and focused browser verification for affected UI behavior. A new route or component alone does not require a redesign.
- If a skill is unavailable, use official documentation and project constraints, reporting material limitations. Keep skill manuals, machine-specific paths, and plugin versions out of these rules.

## Investigation and Decisions

- Before choosing an implementation, trace the affected flow through producers, transformations, storage, readers, and consumers as applicable. Inspect relevant contracts, reference implementations, and callers beyond search snippets; include compatibility, recovery, and rollout paths when affected. Investigate enough to explain the change and its impact, without requiring a whole-repository survey.
- Before adding a capability, identify the closest applicable reference by responsibility, inputs/outputs, processing stages, trust boundaries, lifecycle, and consumers, not just names or directories. Inherit its applicable architecture, flow, contracts, and operational semantics; reuse suitable shared implementations. Ground material differences in accepted requirements, protocols, data characteristics, or runtime constraints and explain them before implementation. Do not copy unrelated domain details or create a generic framework or refactor the reference solely for uniformity.
- Identify the accepted requirements, applicable contract, and reference behavior; make material departures explicit before implementation. Distinguish verified facts, assumptions, and unresolved decisions. A factual observation does not itself request new behavior, and an agent-authored plan or document does not approve its own assumptions. Resolve material conflicts between requirements, contracts, and implementation rather than silently choosing one.
- Scale planning to the task: small, clear fixes need no separate plan document. For substantial changes, keep scope, reference paths, intended behavior differences, open decisions, and acceptance evidence in the existing task plan or discussion. Update it when requirements change, remove superseded tasks, and preserve those decisions when handing off or resuming work.

## Implementation

- After understanding the flow, reuse suitable existing code, standard-library/platform features, and installed packages before adding code. Fix the common cause; add abstractions or files only for clear responsibilities or meaningful reuse. Minimize changes to behavior, configuration, dependencies, persistent state, and maintenance obligations as well as the diff.
- Preserve the established Next.js App Router architecture. Keep shared domain, fetching/cache, and compatibility policies at their owning boundaries. Small local helpers may stay local; a pure function does not automatically need a new module. Keep expensive browser computation off the main thread.
- Follow the language's idioms and nearby naming conventions. Project-owned TypeScript domain/API fields use camelCase; SQL identifiers and database rows use snake_case. Map at the service boundary, preserving registered wire contracts. Do not rename unrelated legacy code to enforce style.
- Choose mature components or dependencies when they materially improve correctness, accessibility, performance, or maintenance. Explain a new runtime dependency or replacement before adding it if that decision is not already authorized. Use npm to update the manifest and lockfile together, keep tooling in devDependencies, and avoid unrelated dependency churn.
- Keep changes within the task. Add options, compatibility branches, validation, retries, or fallbacks only for a concrete requirement or failure mode, at the boundary that owns it. Reuse established internal guarantees while preserving trust-boundary validation, authorization, data integrity, recovery, and accessibility. Avoid speculative configuration, broad formatting, structural migrations, and commentary that merely restates code.

## Communication

- **Answer the user's current question before providing supporting evidence.** Start with the conclusion and what it means in practice. Technical terms, file paths, and code locations support an explanation; they do not replace it. Explain necessary terms through concrete actions when first introduced. Remove repetition when shortening an answer, while preserving causal links and key conditions.
- **When explaining a process, make clear how it unfolds step by step.** Start with what the process is meant to accomplish, then explain who does what at each stage in the actual sequence, how the stages connect, and the final result. Where the process can take different paths, explain the conditions and how the outcomes differ. Do not merely list steps, terms, or code and leave the reader to infer the key connections.
- **When the user questions an answer, clarify the disagreement before revising the plan.** First check the point in dispute and explain the supporting evidence; if there is an error, identify which statement is inaccurate, the correct explanation, and which conclusions change as a result. Do not treat a follow-up question as approval of the opposite approach, or repeatedly rewrite the plan instead of explaining it. Claims that something was "previously confirmed" must correspond to an actual confirmation, not merely the agent's own documents.

## Verification and Handoff

- Select the smallest set of checks covering accepted requirements, changed behavior, and independent risks; use current `package.json` scripts and topic rules. For work matching an existing module, compare affected behavior with the reference, not only with tests written for the new implementation. Cover affected authorization, compatibility, and primary/fallback paths; never weaken a useful assertion to obtain a pass.
- Run typecheck for TypeScript behavior or shared-type changes, and applicable lint/build checks when build inputs or application integration are affected. Prose/rule-only changes need diff, link, path/import, and bilingual review, not application tests or builds. Required CI checks still apply.
- Reuse existing tests. Add a focused runnable regression check when meaningful changed behavior is otherwise unprotected; ordinary prose, naming, or CSS edits do not automatically need new tests. Prefer observable behavior over assertions tied to incidental source text or class strings.
- Run checks after a coherent batch of edits and reuse successful local or CI evidence when the relevant code, dependencies, configuration, and environment are equivalent. Once necessary checks pass, stop; rerun or broaden only for new changes, failures, or an unresolved risk. Performance claims need measurements suited to the claim, not an automatic full benchmark campaign.
- Report unavailable verification and use the strongest safe available check. Static inspection, builds, and manual UI checks prove only what they actually exercise.
- Report the outcome, material design/dependency or compatibility changes, checks performed, and remaining limitations. Include file links and rollout steps when useful; scale the handoff to the task.

## Topic Rules and Maintenance

Before inspecting or editing implementation, Codex and Claude Code load the rules matching the task's responsibilities or file paths, including existing files outside the globs. Claude Code also uses `paths` for automatic loading. Reuse unchanged rule contents while available in context; reread after changes or loss from context. On scope expansion, load newly relevant rules and correct path gaps without enumerating every caller.

| Task scope | Rule |
| --- | --- |
| HTTP handlers and shared request/response contracts | [api-routes.md](.claude/rules/api-routes.md) |
| React pages, components, and styles | [frontend-components.md](.claude/rules/frontend-components.md) |
| Hooks and shared client state | [react-hooks.md](.claude/rules/react-hooks.md) |
| Server services, privileged access, private storage | [server-services.md](.claude/rules/server-services.md) |
| Localized messages, UI copy, locale configuration | [localization.md](.claude/rules/localization.md) |
| Supabase products, including schema, clients, Auth, Realtime, Storage, and privileged scripts | [supabase.md](.claude/rules/supabase.md) |
| Medley normalization, scoring, search, Worker/WASM delivery | [medley.md](.claude/rules/medley.md) |

Keep durable Agent instructions here and path-specific constraints in topic rules. Contracts belong to their owning repository; distinguish accepted contracts, current implementation, and proposals rather than turning an investigation into policy. Consult relevant CONTRIBUTING/setup procedures as needed, without requiring whole-document loading. Delete obsolete, duplicate, or inferable guidance; keep `.claude/CLAUDE.md` as a short import, not a duplicate rulebook.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
