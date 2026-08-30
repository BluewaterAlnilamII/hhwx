# Bandori medley reference scorer

This crate is the transparent oracle for one already selected five-card team per song. It validates the fixed input, evaluates all 120 game-defined first-five skill orders, applies the leader again at the sixth trigger, propagates PERFECT/GREAT skill state, and returns an IEEE-754-bit trace.

It is intentionally unsuitable as a team-search implementation. It has no roster enumeration, candidate representation, bounds, pruning, ranking, memory budget, cancellation, or partial-result semantics. Its small ordered state map favors reviewability over throughput and exists to verify future production scoring code.

The complete rule/provenance boundary is documented in [the medley foundation specification](../../documents/bandori-medley-foundation.md).
