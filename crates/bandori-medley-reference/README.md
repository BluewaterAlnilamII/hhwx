# Bandori medley reference scorer

`bandori-medley-reference` is the deliberately direct scorer used to check the optimized production scorer. It accepts the fixed-team model from `bandori-medley-model`; it does not generate teams or prune candidates.

For each song, it evaluates all 120 equally likely orders of the first five skill activations, repeats the selected leader at the sixth activation, and scans the chart for each order. This is slower than the production reduction, but the calculation is easy to inspect and returns an IEEE-754 trace with the base coefficient, integer base note scores, per-order scores, combo offsets and binary64 words.

PERFECT rate enters the deterministic judgment and skill multipliers before the two note-score floors. The scorer does not build histories of individual PERFECT and GREAT outcomes. Integer order sums are exact; their common factor of 24 is cancelled before the mean numerator is converted to binary64 and divided by five. Each song mean is floored before the medley total is formed.

The reference contains no roster enumeration, ranking, upper bounds, memory budget, timeout or partial-result behavior. The full formula and compatibility boundary is documented in [Bandori Medley Team Builder: Rules and Scoring](../../documents/bandori-team-builder/medley-foundation.md).
