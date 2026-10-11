# OurNotes Song Catalog

[简体中文](ournotes-songs.zh-CN.md)

`/ournotes/songs` and `/ournotes/songs/{songId}` follow the Bandori song catalog. Both games use the same song row, filter toolbar and level/sort controls, detail header, tabs, statistics, and difficulty buttons. Game-specific adapters retain separate data, regions, and search meanings. The shared components do not load either game's simulator.

## Catalog views and layout

The catalog has two equal-width tabs: **Songs / Chart Meta** (Chinese: **歌曲 / 谱面 Meta**). `/ournotes/songs` opens Songs; `?view=meta` opens Chart Meta. Switching tabs preserves the other query parameters. The song-detail information/simulator tabs are a separate control and retain their existing names and behavior.

The catalog tabs, filters and Meta parameters follow the [Theme Guide's compact layout](theme-guide.md#catalog-filters-and-meta-parameters). Tabs touch the filter panel; Meta filters touch an independent parameter section with no visible subtitle. Each join has one 1px divider and zero gap, while the selected tab indicator remains 2px. Results keep their separate spacing. The parameter region retains the accessible name Parameters / 参数设置; its interval field is labeled Live interval / 演出间隔, without renaming the `downtime` URL or storage key.

## Data and regions

The list reads the existing Music and Bands master APIs in parallel through `useOurNotesMaster`. Detail pages and metadata use the private Music detail reader, with request-local deduplication; only the regional presentation fields reach the detail client. Browsers resolve official `thumb` and `jacket` images through the URL-keyed public music index cache. Image descriptors must match the OurNotes content-addressed PNG paths. Missing images remain unavailable; server readers never fall back to public CDN metadata.

The five slots are JP/EN/TW/CN_INTL/KR, with CN_INTL presented as CN. The existing OurNotes toolbar preference chooses the display region, defaulting to CN independently of the website language and Bandori preference. An unavailable preferred slot falls back in JP/EN/TW/CN_INTL/KR order. Apply that region's complete field replacements and deletions before reading classification, difficulty, attribute, or mission values. Song titles prefer the JP slot as the original title and fall back to the resolved region's title when JP is empty. This applies to list display and title sorting, detail headers, metadata, and tracks added to the player; search still includes all regional titles. Other missing regional text or numbers stay missing instead of being filled from another region. Generic band filter labels may use the existing regional text fallback.

Availability filters only control inclusion, not the display preference. Presence comes from `serverExtensions`, not `startAt`, and does not imply that a song is currently playable or unlocked. The first known positive start date is shown in the row; regional date sorts use their own `startAt`, formatted in JST under the Music contract. Unset dates sort last in either direction. Historical and future records are retained.

## List behavior

- Default order is numeric song ID descending, matching Bandori. Other choices are title, level, and the five regional start dates. API `sortOrder` remains the native game ordering field and does not replace this catalog default.
- Filters use `q`, `available`, `bands`, `types`, `difficulty`, `minLevel`, `maxLevel`, `sort`, and `direction`. Absent selection parameters mean all; explicit empty values mean none. `available=cn` and `available=cn_intl` identify the same slot. The obsolete list/detail `server` parameter is removed without changing the preference or URL hash.
- Filters within a group use OR; groups and search terms use AND. Multi-band songs match any listed band. Songs without a known catalog band use Other, including a dedicated artist name such as CRYCHIC.
- Categories are Original, Virtual, J-POP, Anime, Game, and Another Band. `musicType` describes the separate song attribute and is not a category. Unknown or uncategorized songs remain in an unfiltered catalog; they do not match an explicitly selected known category.
- Search reuses catalog NFKC/case normalization, reviewed OurNotes band aliases, server aliases, and difficulty comparisons. Full band names remain phrases. Unrecognized words search all regional song and artist names. `/name`, `"name"`, and `“name”` search only song titles. Recognized identities do not fall back to unrelated title text.
- A bare positive integer matches the song ID or displayed level; `#ID` matches only the ID. Difficulty and level comparisons support `+`, `-`, `>=`, `<=`, `>`, and `<`. All difficulty and level conditions must hold for the same selected chart. Anime means the OurNotes anime category, not Bandori's broader cover classification.
- Search commits on Enter or the search button; clearing the input clears the committed query, with IME protection. Level fields commit on Enter or blur. Clear removes both committed conditions and uncommitted level drafts. Pagination starts at 40 and adds 40; a changed query resets the visible batch. Browser history retains the list URL.
- Initial loading waits for the necessary data and hydrated preference. An initial dependency failure displays a retry without a false empty result. Refresh failures retain valid data; retry reloads only failed dependencies.

## Chart Meta

### Parameters and calculation

Meta reads Music, Bands, Skills and `music/meta` in parallel through `useOurNotesMaster`, waiting for the required data and browser preference hydration before showing the controls and results. It uses the [Meta API and calculation contract](ournotes-master-api.md#chart-meta); it does not download charts/audio or apply note-type weights a second time. Free Live is available; Gekisou Live remains visible and disabled. There is no Fever control.

| Parameter | URL / preference field | First-use default and accepted values |
| --- | --- | --- |
| Live mode | `mode` | `free` only |
| Member skill and level | `liveSkill`, `liveLevel` | `5` (Perfect-and-above +150%), level 5; levels 1–5 |
| Support skill and level | `supportSkill`, `supportLevel` | `11` (MyGO!!!!! +5 seconds), level 5; levels 1–5, or skill `none` |
| Perfect rate | `perfect` | 100%; finite values from 0 to 100, including decimals |
| Live interval | `downtime` | 30 seconds; finite values from 0 to 3600, including decimals |
| Table sort | `metaSort`, `metaDirection` | `score`, `desc`; independent of the Songs tab's `sort` / `direction` |

Skill options use the preferred region's complete effects, falling back to the first available region only when the skill is absent there. All five levels must be supported; duplicate options with identical effects, descriptions and description parameters are collapsed. Member options cover the supported score boosts, and support options cover the equipped member's live-skill extension. Score-rank-triggered bonuses, pure judgement and LIFE-only skills are excluded. Conditions use their satisfied branch without summing complementary branches; the UI adds no condition footnote. An unavailable published duration produces the existing unsupported-combination state.

### Results and explanations

Each row represents one song/difficulty pair. The order is **Rank, Song, Difficulty, Score, Efficiency, Time, BPM, N, NPS, SR**. The initial sort is unrounded score descending; clicking another numeric column starts descending, Song starts ascending, and clicking the active sort toggles direction. Missing sortable measurements stay last in either direction. The Songs tab still defaults to song ID descending.

Time uses `m:ss.SSS`, rounded to milliseconds. Score, efficiency, NPS and SR retain exactly two decimal places, including trailing zeros; BPM is rounded to an integer and N remains an integer. BPM uses the longest individual tempo segment; multiple distinct BPM values add `*` and expose the values. Official `fullComboCount` supplies note count N and `N / length` supplies NPS. SR includes overlapping skill activations and can exceed 100%. Missing or uncomputable Meta charts are excluded; missing display measurements remain unavailable. Song titles retain the JP-first/current-region fallback.

Song is left-aligned; other headings and values are centered. Each heading's text and help icon are centered as one group, with the sort arrow positioned separately so sorting does not change column widths. From Score onward, except Time, use the existing `HelpPopover` with these concise explanations:

| Column | English | Chinese |
| --- | --- | --- |
| Score | Score relative to total power | 出分相对于综合力的比率 |
| Efficiency | Average score per minute relative to total power | 每分钟平均出分相对于综合力的比率 |
| BPM | Beats per minute | 每分钟节拍数 |
| N | Total notes in the chart | 谱面音符总数 |
| NPS | Average notes per second | 每秒平均音符数 |
| SR | Skill coverage | 技能覆盖率 |

Below `sm`, the table scrolls horizontally within its panel, has a 768px minimum width, and uses a 120px minimum Song column with titles limited to two lines. At `sm` it uses a 960px minimum table width and a 164px minimum Song column, with unclamped titles. Numeric columns stay compact; remaining width goes to Song. The table must not widen the page.

Score and efficiency independently bold the top 5% of all computable song/difficulty pairs in the resolved catalog under the current skill and Perfect-rate settings (and live interval for efficiency). Each cutoff uses the `ceil(chartCount * 0.05)`-th highest unrounded value, including all exact ties. Search, availability, band, type, difficulty, level and sort controls do not change this comparison population; charts that cannot be calculated are excluded.

### Browser preferences

`hhwx:ournotes:song-meta-preferences:v1` saves the nine fields in the parameter table. These preferences belong to the current browser, are shared across UI locales, and are independent of server preferences and Bandori settings. Explicit `supportSkill=none` and its remembered level are retained. Ordinary catalog filters stay in the URL and are not added to this preference record.

Valid explicit URL values take precedence over remembered values, then defaults; skill availability is resolved after Skills loads. Complete effective settings are written to the URL for reproducible links, without adopting the link's settings as saved preferences. Only explicit user edits update the corresponding saved fields. Number inputs commit valid, changed values on Enter or blur; invalid drafts restore the current value. Opening links, restoring settings and falling back from unavailable skills never overwrite remembered choices. Malformed or blocked storage does not interrupt the page. Clear removes only catalog filters, retaining the current parameters and table sort; it also clears uncommitted level-filter drafts.

## Detail behavior

Details retain Bandori's square artwork/header, equal-width information/simulator tabs, and four statistic cells (two columns on narrow screens). The simulator tab stays visible and disabled, including keyboard interaction. `view=simulator` is normalized back to information. No simulator runtime or chart is fetched for this page. Audio is loaded only when the global player needs the selected track.

OurNotes has EASY/NORMAL/HARD/EXPERT only. Difficulty buttons live in the information panel because the simulator is disabled. The default is the highest referenced difficulty in the resolved region; `difficulty` records an explicit selection. If the selected difficulty is absent in a newly selected region, choose its highest referenced difficulty and normalize the query. Invalid IDs, nonexistent songs, malformed difficulty names, and difficulties absent from every region return not-found. Source failures use the route error/retry interface.

The level label truncates `musicScoreDisplayLevel` toward zero, following the verified game behavior; level sorting retains its fraction. Search and level bounds compare the displayed integer. A value of `20.5` therefore displays as `20`, sorts above `20`, and never becomes `20+`. `musicScoreLevel` remains an independent API source value.

The quantity cell uses official `fullComboCount`, labeled Combo count; the same official count supplies Meta's note count N. It is not recomputed by counting raw chart objects. BPM is the minimum/maximum of the selected difficulty's published BPM values; duration comes from API `length`, displayed as minutes and seconds. These statistics do not require downloading charts or audio. Missing score rows, fields, or media do not become zero or make an otherwise valid detail page disappear; known BPM can coexist with missing official score data.

Attribute and three GEKISO mission rows use the shared detail-row style. Missions retain their slot order, duplicates, explicit None, unknown codes, and missing values. The list has no additional attribute/mission controls. Rewards, acquisition, MV, alternate-vocal, and player unlock features are outside this catalog change. Metadata follows the existing song-page locale-based server choice; it cannot read a browser preference.

## Catalog playback

Both catalogs and detail headers share a difficulty strip followed by the event-page-style 28 × 28 px play button. Desktop badges retain difficulty names; below the `sm` breakpoint they show only level numbers in the fixed difficulty colors and order, with full names retained for assistive technology and tooltips. The detail header uses an 80 px mobile cover and 128 px desktop cover, placing the strip below the artist. Existing difficulty selectors keep their original responsibility.

Catalog playback preserves the temporary queue, appends a new track, or selects an existing track by its provider-prefixed ID. Clicking the active track toggles pause/resume. New additions stop at the existing 500-track persistence limit without removing earlier tracks. Bandori event-page playback retains its existing replace-queue behavior. The additive `ournotes` provider uses the existing v1 snapshot format and continues to read older Bandori/Falcom queues; restored queues start paused.

OurNotes MP3 descriptors must match `ournotes/music/audio/{sha256}.mp3`, with a valid digest and positive size; optional index duration must be positive and finite. The player uses the same cached index as artwork and never guesses media paths. Missing audio disables the button; fetching the catalog alone does not download song audio. The simulator tab remains disabled.

## Verification

`npm run test:ournotes-songs` covers regions, missing data, native display/sort levels, search composition, categories, query round trips, missions, image/audio descriptors, Meta integrity, supported skills, scoring, top-5% ranking and preferences. Select additional suites by the affected consumers under [CONTRIBUTING](../CONTRIBUTING.md): shared music/simulator changes use `test:bandori-music` / `test:bandori-chart-simulator`, card behavior uses `test:ournotes-cards`, and master-reader changes use `test:ournotes-master`. Apply typecheck, lint, i18n and build when relevant; CSS or prose alone does not require all of these suites.

Browser acceptance uses `http://localhost:3000`: compare Bandori and OurNotes at desktop and mobile widths, in both locales and color schemes. Exercise search, clear, sorting, pagination, history, preference changes, difficulty selection, disabled tabs, and failures/retry. Verify OurNotes requests contain no simulator media. Builds and unit tests alone do not establish visual parity or production deployment.

For Meta, also check refresh and locale changes, explicit-URL precedence without overwriting saved settings, unavailable skills, invalid/blocked storage, numeric Enter/blur commits, rapid blur-then-click edits, sort toggling and Clear retaining parameters. Verify tooltip touch/keyboard behavior, stable sort geometry, independent score/efficiency highlights, narrow-screen wrapping and panel-only table scrolling.

2026-10-12 local acceptance: typecheck, focused lint, 31 song/Meta tests, production build, i18n and diff checks passed. Chrome mobile-layout checks covered Meta at widths 320/375/393/430/640/768/1440px; both games' loaded catalogs were checked at 320/393/1440px, with English and light/dark Meta checks. At 393px, the filter panel changed from 686 to 506px and parameters from 545 to 303px, moving the table from page Y=1384 to Y=950; the measured 1440px layout retained its previous dimensions. Skill levels, numeric parameters, search/Clear, help touch/Escape, the disabled mode and an OurNotes card-detail level control were exercised without relevant runtime errors or horizontal page overflow. These are browser-emulation results, not iOS-device acceptance. The team-builder's internal picker required login in the isolated session and was only inspected in code; authenticated profile consumers also remain outside this browser pass. No production deployment was performed.
