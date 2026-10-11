# OurNotes Song Catalog

[简体中文](ournotes-songs.zh-CN.md)

`/ournotes/songs` and `/ournotes/songs/{songId}` follow the Bandori song catalog. Both games use the same song row, filter toolbar and level/sort controls, detail header, tabs, statistics, and difficulty buttons. Game-specific adapters retain separate data, regions, and search meanings. The shared components do not load either game's simulator.

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

## Detail behavior

Details retain Bandori's square artwork/header, equal-width information/simulator tabs, and four statistic cells (two columns on narrow screens). The simulator tab stays visible and disabled, including keyboard interaction. `view=simulator` is normalized back to information. No simulator runtime or chart is fetched for this page. Audio is loaded only when the global player needs the selected track.

OurNotes has EASY/NORMAL/HARD/EXPERT only. Difficulty buttons live in the information panel because the simulator is disabled. The default is the highest referenced difficulty in the resolved region; `difficulty` records an explicit selection. If the selected difficulty is absent in a newly selected region, choose its highest referenced difficulty and normalize the query. Invalid IDs, nonexistent songs, malformed difficulty names, and difficulties absent from every region return not-found. Source failures use the route error/retry interface.

The level label truncates `musicScoreDisplayLevel` toward zero, following the verified game behavior; level sorting retains its fraction. Search and level bounds compare the displayed integer. A value of `20.5` therefore displays as `20`, sorts above `20`, and never becomes `20+`. `musicScoreLevel` remains an independent API source value.

The quantity cell is official `fullComboCount`, labeled Combo count, not the number of chart objects. BPM is the minimum/maximum of the selected difficulty's published BPM values; duration comes from API `length`, displayed as minutes and seconds. These statistics do not require downloading charts or audio. Missing score rows, fields, or media do not become zero or make an otherwise valid detail page disappear; known BPM can coexist with missing official score data.

Attribute and three GEKISO mission rows use the shared detail-row style. Missions retain their slot order, duplicates, explicit None, unknown codes, and missing values. The list has no additional attribute/mission controls. Rewards, acquisition, MV, alternate-vocal, and player unlock features are outside this catalog change. Metadata follows the existing song-page locale-based server choice; it cannot read a browser preference.

## Catalog playback

Both catalogs and detail headers share a difficulty strip followed by the event-page-style 28 × 28 px play button. Desktop badges retain difficulty names; below the `sm` breakpoint they show only level numbers in the fixed difficulty colors and order, with full names retained for assistive technology and tooltips. The detail header uses an 80 px mobile cover and 128 px desktop cover, placing the strip below the artist. Existing difficulty selectors keep their original responsibility.

Catalog playback preserves the temporary queue, appends a new track, or selects an existing track by its provider-prefixed ID. Clicking the active track toggles pause/resume. New additions stop at the existing 500-track persistence limit without removing earlier tracks. Bandori event-page playback retains its existing replace-queue behavior. The additive `ournotes` provider uses the existing v1 snapshot format and continues to read older Bandori/Falcom queues; restored queues start paused.

OurNotes MP3 descriptors must match `ournotes/music/audio/{sha256}.mp3`, with a valid digest and positive size; optional index duration must be positive and finite. The player uses the same cached index as artwork and never guesses media paths. Missing audio disables the button; fetching the catalog alone does not download song audio. The simulator tab remains disabled.

## Verification

`npm run test:ournotes-songs` covers regions, missing data, native display/sort levels, search composition, categories, query round trips, missions, and image descriptors. Shared changes also use `test:bandori-music`, `test:bandori-chart-simulator`, `test:ournotes-cards`, and `test:ournotes-master`, plus typecheck, lint, i18n, and build.

Browser acceptance uses `http://localhost:3000`: compare Bandori and OurNotes at desktop and mobile widths, in both locales and color schemes. Exercise search, clear, sorting, pagination, history, preference changes, difficulty selection, disabled tabs, and failures/retry. Verify OurNotes requests contain no simulator media. Builds and unit tests alone do not establish visual parity or production deployment.
