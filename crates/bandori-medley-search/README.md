# Bandori medley exact search

`bandori-medley-search` validates a normalized roster, scores complete teams, exhaustively searches legal three-team assignments and hydrates the retained result candidates. It depends on `bandori-medley-model`; `bandori-medley-reference` remains a development-only scorer used for independent checks.

## Input and output

The normalized input contains owned physical cards, hard-exclusion flags, card and event parameters, four resolved whole-team skill contexts, owned area-item rows, every legal shared area configuration and exactly three ordered normalized songs. Teams, leaders and the winning area configuration are outputs rather than caller selections. Member index two is the leader.

Area-item IDs preserve their supplied calculation order. Output members are normalized by stable instance ID, then the selected leader is moved to index two. Validation does not silently sort or repair malformed input. The Rust schema accepts one unique empty selected-item configuration; the source adapter generates it only when no usable item exists in a category.

The terminal result is either:

- `exact`, after every legal range has been evaluated or safely pruned; or
- `incomplete`, with a controlled reason and any available diagnostic best-so-far solutions.

The discovered list contains at most ten complete solutions encountered during search and is not a proved global top ten. `hydrate_medley_search_solutions` expands that list with minimum, average and maximum scores plus best-order information after search stops.

## Scoring and search

Production scoring prepares chart boundaries once, reuses independently rounded skill-window extras and reduces the 120-order average algebraically. It floors each song before comparison and before summing the medley, and is checked bit-for-bit against the direct reference scorer.

Search combines single-team upper bounds, a joint three-team allocation bound, forward/backward conditional tables, reversible card destinations and exact enumeration of small residual blocks. Numeric uncertainty or insufficient optimization memory disables the affected pruning work rather than removing a candidate. Tiny searches are checked against an independent exhaustive oracle.

The configured storage budget covers local rows and indexes, score-cache capacity, joint workspace reservations and live conditional tables. Input/model data, ranked single-team indexes, traversal state and chart-sized scorer scratch are accounted separately. Exhaustive correctness does not depend on any cache entry surviving.

The browser binding in `bandori-medley-wasm` runs search, reports strict incumbent improvements and hydrates the retained solutions. The Team Builder Web Worker owns the deadline, progress throttling and mapping to frontend display objects.

See [Bandori Medley Exact Search](../../documents/bandori-team-builder/medley-search.md) for the full proof and [Bandori Medley Testing and Verification](../../documents/bandori-team-builder/medley-testing.md) for runnable checks and private-regression boundaries.
