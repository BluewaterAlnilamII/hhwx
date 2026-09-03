# Bandori Team Builder

Chinese version: [README.zh-CN.md](README.zh-CN.md)

HHWX provides two team builders for Bandori:

- the **single-song team builder** selects one five-card team for one song and can optimize score or supported event-point targets;
- the **medley team builder** selects three five-card teams for three ordered songs, with one shared area-item configuration, and proves the best total average score when the search finishes successfully.

Both calculators start from an HHWX game profile and Bandori master/chart data. They share product concepts, but their scoring and search implementations are separate. A change to one calculator must not be assumed to affect the other.

## Reading order

For the single-song calculator, read [Single-Song Team Builder Algorithm](single-song-algorithm.md).

For the medley calculator, read:

1. [Medley Rules and Scoring](medley-foundation.md) for user-visible behavior, inputs, parameter calculation, chart normalization and exact scoring;
2. [Medley Exact Search](medley-search.md) for the search space, upper bounds, pruning proof, failure semantics and resource model;
3. [Medley Testing and Verification](medley-testing.md) for repository checks and the optional private real-profile regression suite.

The Rust crate READMEs provide shorter implementation-level entry points:

- [`bandori-medley-model`](../../crates/bandori-medley-model/README.md) defines the normalized fixed-team scoring contract;
- [`bandori-medley-reference`](../../crates/bandori-medley-reference/README.md) is the deliberately direct reference scorer;
- [`bandori-medley-search`](../../crates/bandori-medley-search/README.md) owns exact roster search and result hydration.

## Core terms

- **Master card ID** identifies a card definition in Bandori master data.
- **Physical card instance** is one usable card in the normalized roster. The same physical instance cannot appear in two medley teams.
- **Character uniqueness** means that the five cards in one team must belong to five different characters. Different cards of one character may still be used in different medley teams.
- **Leader** is one member selected to activate again at the sixth skill trigger. In normalized medley output, the leader is member index two.
- **Area configuration** is one legal, owned combination of band, attribute and parameter area items. One selected configuration applies to all three medley teams.
- **Exact result** means every legal alternative was either evaluated or eliminated by a proved-safe bound. It is a statement about search completeness, not merely a high score.
- **Incomplete result** means a controlled search-time stop such as timeout, cancellation, search-storage pressure or internal arithmetic/invariant failure ended the proof. A best-so-far team may still be displayed, but it is not certified optimal. Input or hydration failures are request errors instead.
- **Retained candidates** are at most ten strong complete solutions encountered naturally while searching. They support result display and maximum-score hydration; they are not a proved global top ten.

## Medley data flow

```text
HHWX profile + Bandori masters + three charts + event settings
    -> TypeScript validation and normalization
    -> versioned Rust search input
    -> exact Rust search compiled to WebAssembly
    -> hydration of retained complete solutions
    -> Web Worker progress and final result
    -> Team Builder page
```

The frontend supplies the selected profile, temporary-card and card-preference settings, three songs in fixed order, event settings, PERFECT rate and a time limit. The Worker obtains the required master and chart records. The frontend does not supply teams, leaders or the winning area configuration; those are search results. The Web Worker keeps the expensive search off the browser's main thread and controls timeout and progress publication.

## Source map

- `src/lib/bandori/team-builder/core/` and `single/` implement the single-song calculator.
- `src/lib/bandori/medley-foundation/` converts HHWX profile/master data into the normalized medley contracts.
- `crates/bandori-medley-model/` validates fixed-team scoring inputs.
- `crates/bandori-medley-reference/` provides the direct 120-order reference calculation used for scoring checks.
- `crates/bandori-medley-search/` implements production scoring, exact search, diagnostics and result hydration.
- `crates/bandori-medley-wasm/` exposes search and hydration to the browser.
- `src/app/[locale]/bandori/teambuilder/team-search-worker.ts` loads the WebAssembly package and maps results into the frontend contract.

## Verification quick start

The checks below use only files tracked by this repository:

```bash
npm run test:medley-foundation:source
npm run test:medley-foundation
npm run check:medley-foundation:wasm
```

Run `npm run build:medley-foundation:wasm` after changing Rust code that ships to the browser. This requires a `wasm-bindgen-cli` version matching the locked Rust crate. The normal Next.js build consumes the committed WebAssembly artifact but does not regenerate or execute it; browser runtime verification remains a separate release check.

Private profiles, historical score reports and run-specific benchmark output remain under ignored `temp/` paths. They supplement the portable checks but are not required to understand the product contract or review the correctness proof.
