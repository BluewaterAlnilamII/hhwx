# Card search

[简体中文](bandori-card-search.zh-CN.md)

Scope: the card catalog, account avatar picker, profile card collection and add-card dialog, and team builder owned-card exclusions and temporary-card dialog. All use the same search rules and filter controls. Searches run when the user submits with Enter or the search button, with IME composition protection.

Each scenario determines its candidate set first: the avatar picker expands collision entities; profile additions stay within the profile server; temporary additions retain their JP fallback; owned-card searches only inspect the supplied collection. Search then narrows that set. For example, `en` in a CN profile matches owned entities also available in EN; it cannot select the different EN entity sharing a CN card's numeric ID.

## Matching contract

- Normalize NFKC, case and whitespace; preserve punctuation. Recognize explicitly listed multiword band names before splitting on whitespace.
- Union the structured meanings of one token; intersect different tokens. Unrecognized tokens use case-insensitive substring search across card names, character names, skill names and skill descriptions in JP/EN/TW/CN.
- Recognized conditions with no results do not fall back to text. `happy` is an attribute and `lock` is Rokka, even if card text contains those words.
- Intersect search results with existing filter selections. Server terms check entity availability, without changing preferred server, display language or sorting.
- Keep CN/EN collision entities separate, including for text and skill matching. Do not deduplicate by numeric ID. Missing metadata does not remove a card from unrelated queries.
- Clearing the input with its native clear button or deleting all text immediately removes the search condition, while preserving other filters and sorting. Nonempty edits still require submission, and IME composition does not clear a search. The existing clear-all button still resets all filters.
- Sorting changes order only; missing release dates remain last in either direction.

## Syntax

| Input | Meaning |
| --- | --- |
| `4` | ID 4 OR rarity 4 OR search skill rate 4% |
| `115` | ID 115 OR search skill rate 115% |
| `#115` | Exact ID 115 |
| `115%` | Search skill rate 115% only |
| `4*` | Exactly four stars |
| `4*+`, `4*-` | At least / at most four stars only |
| `>=4*`, `<=4*` | Equivalent to `4*+`, `4*-` |
| `>4*`, `<4*` | Strict rarity bounds only |
| `115+`, `115%+`, `>=115`, `>=115%` | Search skill rate ≥115% |
| `115-`, `115%-`, `<=115`, `<=115%` | Search skill rate ≤115% |
| `>115`, `>115%` | Search skill rate >115% |
| `<115`, `<115%` | Search skill rate <115% |
| `>4` | Rarity >4 OR search skill rate >4% |
| `4+`, `4-` | Rarity ≥4 OR rate ≥4%; rarity ≤4 OR rate ≤4%, respectively |
| `>=4`, `<=4` | Equivalent to `4+`, `4-`, including their unions |
| `r cool 4*+` | Roselia AND Cool AND at least four stars |
| `hikawa` | Hina OR Sayo |
| `jp en` | The same entity is available in both JP and EN |
| `135% 分卡` | A scorer with search skill rate 135% |

Bare numeric interpretation accepts positive safe integers, including leading zeroes. Only 1–5 have a rarity interpretation. Explicit percentages accept complete nonnegative decimal numbers. Malformed explicit numeric expressions such as `#10001abc` and `6*` match nothing; they are not partially parsed or ignored.

Comparisons use the same skill rate as exact percentage searches. Without a unit, valid rarity and skill conditions are unioned; `*` restricts the comparison to rarity and `%` restricts it to skill rate. Comparison operators never apply to card IDs. `115%+ <150% 分卡` requires a scorer with rate at least 115% and below 150%. Missing skill rates do not match even an upper bound. Bare star-range queries such as `4+` now include the skill-rate interpretation; use `4*+` to retain a star-only query.

On the card catalog, `?q=` stores the submitted query. Existing `?id=4` links remain exact ID queries, equivalent to `#4`. Existing selection and sort URL parameters retain their meanings. Other selectors retain local filter state.

`/special` or `"special"` forces a multilingual card-name substring search, excluding character names and skill text and bypassing keyword, ID, and numeric interpretation. A slash prefixes one word; use `"Hello, Happy World!"` for names containing spaces. Straight and Chinese double quotes (`“…”`) are supported. The phrase must occur within one name field; other terms and visible filters still intersect. Empty name conditions match nothing; an unclosed quote treats the rest of the input as a name phrase.

The shared `?` button beside Search immediately shows ten categories of examples (including name search) on hover and hides them when the pointer leaves the button. Click it to keep the help open; click again, click outside, or press Escape to close it. Touch and keyboard users can activate the same button. Opening help does not submit the search; Escape closes open help before its containing picker dialog.

Shared controls use search, server, band, attribute, rarity, character, card type and sort rows in that order. Scenario-specific servers and power sorting remain available where applicable. Content surfaces use the panel role; help popovers use the floating role. Both schemes follow the current [Theme Guide](theme-guide.md). Compact thumbnail grids, virtualization, card-art toggles and confirmation actions retain their existing behavior.

The shared toolbar uses a magnifier submit button, `Clear`, and immediate `?` help. Selected filter buttons use quiet-selection background, text and ring roles; solid selected controls use the strong-selection pair. Result counts use information text and borders on the panel background, with tabular digits reserving at least four character widths. Theme roles and shared components own these styles.

The global preferred server is a versioned browser preference. Queries and sort selections remain URL state in the catalog and local state in pickers; they do not write the global preference. Cards query edits synchronously patch the current browser URL, preserving earlier edits, the locale path and hash without a server navigation. The return-to-list snapshot remains session-local. On a server-scope change, an all-selected server group follows the new scope; an explicitly empty group stays empty, and partial selections keep only available options. Other conditions remain unchanged. Optional browser persistence failures must not interrupt the active UI session.

## Keywords and skills

Reviewed three-syllable given-name aliases: `ksm`→Kasumi, `ars`→Arisa, `hmr`→Himari, `tme`→Tomoe, `tgm`→Tsugumi, `kkr`→Kokoro, `kor`→Kaoru, `hgm`→Hagumi, `msk`→Misaki, `cst`→Chisato, `ykn`→Yukina, `msr`→Mashiro, `nnm`→Nanami, `tks`→Tsukushi, and `tmr`→Tomori. This review excludes RAS and does not count moraic `ん` or vowel length as additional syllables. These are explicit entries, not generated aliases; `msr` belongs only to Mashiro.

- [Reviewed name and band aliases](../src/lib/bandori/cards/search-aliases.ts) explicitly include `r`, `m`, `go`, `chu2`, `chuchu`, `chu`, both Misaki/Michelle identities, surname matches and approved alternate spellings. No prefix matching, nickname inference, punctuation stripping or CP expansions.
- [The parser](../src/lib/bandori/cards/search.ts) contains attribute, available-server and card-type aliases. They target the same metadata as the corresponding filter buttons.
- `score`, `scorer`, `分`, `分卡`: score effects without healing or judgment enhancement.
- `plock`, `判`, `判卡`: judgment enhancement. `lock` belongs exclusively to Rokka.
- `heal`, `healer`, `奶`, `奶卡`: life recovery. A composite skill may satisfy both healing and judgment conditions.
- Fixed and conditional scoring tiers use the highest defined tier, including same-band/attribute conditions, without evaluating a team. Per-note accumulating skills use their initial rate: 100% growing to 150% matches 100%, not 150%.
- Percentage matching is independent of skill class. `100% heal` may match; `100% scorer` excludes healing skills. Duration, healing amounts and missing regional values never become score percentages.
- Owned cards use catalog search metadata regardless of their current skill level, training state or power. Power remains a sort option, not an implicit numeric search field; character and band IDs are not implicit text fields either.

No future-release suffix (`en+`), negation, explicit OR, parentheses, training-state search or fuzzy spelling expansion is implemented. Unknown text continues to use ordinary substring search.

## Implementation and checks

Catalog and profile entry builders prepare multilingual and regional skill metadata from the canonical source snapshot. Queries compile once per filter operation, then evaluate entity entries. Display projection and scenario availability remain separate from canonical search availability. Existing unknown-metadata policies remain in effect; an unknown owned card can still match its explicit ID when its collection allows it.

Run the focused regression checks:

```sh
node --import tsx --test tests/bandori-card-search.test.mjs tests/bandori-card-catalog.test.mjs tests/bandori-profile-card-collection.test.mjs
```

The search tests are also included in `npm run test:bandori-cards`. They cover all reviewed aliases, numeric unions, token intersections, skill classification/rates, multilingual text, missing metadata, entity collisions and filter/sort interaction.
