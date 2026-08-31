# Bandori medley reference scorer

This crate is the transparent oracle for one already selected five-card team per song. It validates the fixed input, evaluates the 120 equiprobable first-five skill orders, applies the leader again at the sixth trigger, and returns an IEEE-754-bit trace. PERFECT rate enters Bestdori's deterministic judgment and skill formulas before the two score floors; no P/G history distribution is built. Known native-client differences remain documentation-only.

The reference deliberately scans the chart for each skill order so the source formula, covered-note counts, and independently rounded overlap extras remain easy to audit. Integer order sums are exact; their common factor of 24 is cancelled before converting the mean numerator to binary64 and dividing by five. Its trace contains the actual base coefficient, one integer base score per note, all order scores, combo offsets, and binary64 words. It has no roster enumeration, candidate representation, bounds, pruning, ranking, memory budget, cancellation, or partial-result semantics.

The complete rule/provenance boundary is documented in [the medley foundation specification](../../documents/bandori-medley-foundation.md).
