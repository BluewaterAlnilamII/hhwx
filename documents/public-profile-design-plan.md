# Personal profile design and work checklist

简体中文：[public-profile-design-plan.zh-CN.md](public-profile-design-plan.zh-CN.md).

Updated 2026-11-18. The overall design and existing interactions are complete. The user subsequently authorized production integration, unified motion and linked account privacy switches. The November 18 Bandori favorites implementation is described below. Production integration and optional character-policy changes are separate work, not unfinished design.

## Current design and accepted requirements

The latest user decisions supersede view switching, mobile info disclosure, UID copying and duplicate editing entries. The mobile username placement retains the user-requested trial after the authorized autonomous critique/polish comparison. That is this pass's design conclusion, not a claim that the user separately approved its final appearance.

### Structure and navigation

- Desktop uses a wide main column and a 256px personal-info sidebar. The outer width follows the [score tracker standard](theme-guide.md#default-content-width). UID, join date and bound accounts flow continuously from the left without repeated cards or headings.
- Compact left-aligned Home / Details / Settings tabs change only the content below, retaining the cover, identity and sidebar. Settings is owner-only. On touchscreens, swipe horizontally through the available tabs. A short drag returns to the current tab.
- Favorites become public Home content by category on collection and disappear on removal. Settings controls visibility; no source mapping, second publishing step or separate display switch is added.
- Visitors without public favorites see no empty modules, explanatory empty state or hidden count; identity and public details remain.

### Header and direct editing

- Desktop preserves the accepted composition: wide card artwork, overlapping avatar, username/title together and signature below, with the artwork continuing through the translucent identity gradient. The upper image is approximately 6.4:1.
- Mobile uses a short 4.4:1 image and continuous opaque identity surface. The title sits beside the avatar, the full username starts below at the left, followed by signature, UID/join date and bound game IDs. There is no drawn divider or collapsed info; dark mode uses its corresponding opaque surface.
- Names take priority and wrap completely. Layout cases include 24 English letters/spaces, uninterrupted English and 24 wide W characters, without changing the existing character policy. Names are display-only here, retaining their existing dedicated edit entry.
- UID reuses the existing icon without copying. Mobile UID and “XX 加入” stay together and visible; desktop uses the same date wording. Bound accounts are also permanently visible.
- Owners can select an avatar directly. Owners with a bound game account can open the header title chooser. With no bound account, desktop and mobile show the current default title as static artwork. Details lists the titles owned by each game account.
- Signatures default to one line. Owners edit in place, blur to save and Escape to cancel, without a submit button. Display and input are both 24px high, with internal scrolling for long input. Editable avatar and title artwork dim on hover and show a centered pencil. The editable signature gets a lighter surface and text cursor. Visitors see static artwork and a non-interactive one-line signature; an empty signature leaves no row.
- Editing uses an internal surface, caret and necessary keyboard feedback rather than expanding outlines. Signature, UID/date and account rows use 24px content height and 8px gaps; names retain their own hierarchy and wrapping space.
- The small top-right cover action opens Choose card / Adjust position. Avatar and cover reuse the actual BandoriCardPicker, preserving search, filters, ordering and trained/untrained choices.
- One cover focal point is adjusted by dragging the actual image, then saved or canceled. A plain reticle sits at the visible image centre; there are no explanatory labels, sliders or distorted dual-device previews.
- Remove view switching and the catch-all Edit profile button. Actual owner/visitor identity still governs editing and privacy. Hit bounds and hover feedback match visible controls; surrounding blank space never triggers neighboring actions.

### Details and Settings

- Only Details shows game ID and game name together, as 16px/600 account headings. Ten fullwidth characters provide layout coverage, not a verified game input limit.
- **Missing game names leave only the ID.** Undefined, null, empty and whitespace-only values create no name node, unknown/unsynced placeholder or empty slot, and do not affect the account's titles. An available name follows the ID. Settings, desktop sidebar and mobile header always show only game IDs and region icons.
- Details currently shows owned titles, not account cards. Keep compact artwork, game categories and intrinsic ordering; omit empty groups and separate groups by one title row. Add no category tabs, custom sorting or repeated visible group headings.
- Settings has Home display and Bound accounts columns, becoming one column below 600px of actual available content width rather than using the full window width.
- Fixed module types have order and public controls in compact Settings rows. Mouse, keyboard and touch ordering apply immediately, with no Home-level reorder button or Save step. Module order is separate from item order within favorites.
- Binding privacy follows master switch → account visibility/order → each account's titles. Master/account visibility and ordering apply uniformly to Details, desktop sidebar and mobile header.
- Disabling a parent retains child choices and disables their controls; re-enabling restores them. Hiding only titles retains the public account identity. Preserve the data hierarchy without displaying unimplemented data controls.
- Owners retain private modules/accounts/titles with an eye-off icon and no visible Only you text. Visitors see neither the hidden content nor its count.

### Save and loading behavior reviewed on 2026-11-18

- Saved confirms the settings column just edited. When two tabs save the same column, the last successful save determines its settings. For example, if the second tab saves Bound accounts showing A public and B hidden, the result is A public and B hidden. Disabling a parent preserves its children's stored choices.
- Favorites and Bound accounts save independently. An order saved in one tab survives a binding change in another. The signature also saves independently. Leaving the input by clicking a switch completes both actions, with each result shown at its own control.
- A blocking failure of data required by Details uses one failure state and retry for the whole panel. When the panel only shows public account identities, it can render them without the title catalog.
- [x] Saving a signature allows a privacy switch click to complete. The signature response updates the signature alone and preserves the list of current bindings.
- [x] Details shows the game ID once when an automatic profile uses `UID <its game ID>` for a missing game name.
- [x] Each Settings column saves its displayed choices together. A two-tab Chrome check verified that the last save in the same column wins and edits to the other column survive reload. On one page, either column can finish saving while the other waits and then fails.
- [x] Owners without bindings see static header title artwork. Hover and click checks at 390px and 1440px verified that the title stays static and the avatar remains editable.
- [x] The header still requests the shared title catalog. With the catalog unavailable, Details renders account identities when those are the only visible data. When a title list is required, one panel-level retry restores both the list and the header title.

## How references shape the result

| Reference | Adopted behavior | Result |
| --- | --- | --- |
| User-provided Bilibili screenshots | Wide cover, light cover-side actions, main-column sections | Compact contextual cover menu; view switching removed by later instruction |
| User-provided Zhihu screenshots | Overlapping avatar, identity hierarchy, local main-column tabs | Device-specific identity composition and a shared tab frame |
| [Steam showcases](https://steamcommunity.com/tradingcards/faq/) | Customizing standard module types | Settings order/visibility; interiors deferred |
| [GitHub pinned items](https://docs.github.com/en/account-and-profile/how-tos/profile-customization/pinning-items-to-your-profile) | Pinning and ordering reference | Future favorites interiors only, preserving automatic display |
| Existing HHWX theme/components | 58px toolbar, 270px desktop navigation, semantic colors, UID icon and card picker | Preserve product identity instead of redesigning to satisfy detector style hints |

Bilibili/Zhihu findings come from user screenshots; Steam/GitHub are official references, not claimed hands-on authenticated-editor sessions. Earlier worktree implementations are not assumed to exist in the current checkout.

## Work checklist

### Complete: overall design

- [x] Reconcile questionnaire answers, references and later corrections; remove superseded requirements/tasks.
- [x] Complete desktop/mobile headers, name priority, signature, permanent info and shared three-tab frame.
- [x] Complete cover menu/positioning, avatar selection, displayed-title selection and inline signature editing.
- [x] Compare mobile name placement and retain the full name below the avatar without changing desktop.
- [x] Complete account headings and catalog-backed title categories/intrinsic ordering.
- [x] Complete responsive two-column Settings, module/account ordering, three-level privacy and owner/visitor states.
- [x] Check control hit bounds, keyboard focus, row rhythm and layout on edit entry.
- [x] Investigate local CN APK title grouping/order with versioned evidence.
- [x] Trace username/signature length rules and game-name sources without changing production policy.
- [x] Complete two independent assessments; fix empty visitor signature spacing and missing-name literals.
- [x] Complete focused regression, whole-page visual verification and bilingual checklist cleanup.

### Bandori favorites

Collection headings show the total number of saved items in parentheses. The event total includes favorites from all servers. The banner and title link to the event. On desktop, the link continues across the gap between them. Below the event title, the theme band and bonus attribute icons sit directly before the status on the same line. Mixed events show only the bonus attributes. When the selected server has more upcoming favorites beyond the preview, the last timeline marker extends into a dashed line. When the horizontal timeline wraps in the full collection, the solid line reaches the right edge of each continued row and stops at the final event marker.

Stars on the card wall and event timeline reflect the visitor's own favorites. Hover or focus to reveal the star. On touchscreens, tap the artwork or banner to reveal it and tap the same image again to open details. The event title opens details directly. An event favorite belongs to the selected server. Signed-out visitors can sign in from the star and return to the same profile.

The pencil at the right of the Favorite Events heading opens the owner's editor. The flags switch servers, and each list follows the order of that server's full timeline. A desktop row shows the theme band and bonus attribute icons, the event number, a dash, the linked event title, and the removal star. On phones the icons and number sit above the title, with the star on the right. Mixed-band events show only their bonus attribute icons. The title opens the event for the selected server.

Favorite Songs is a playlist. The tracks start directly below the section heading in the preview, full list, and edit mode. On desktop the title and band sit on two lines beside the jacket, followed by album and duration columns. On phones the duration sits beside the band, with a persistent options button at the end of the row. Bandori tracks belong to `BanG Dream In-Game Version`. The player uses `Our Notes In-Game Version` for OurNotes tracks. On desktop, double-click the song row or click its play button to play the full collection from that track, including playable favorites beyond the home preview. The jacket and title share the row hover state. A single tap plays the track on a touchscreen. A right-click, a long press, or the options button opens track actions. The desktop menu stays in place while scrolling, and clicking outside dismisses it and activates the clicked control. On touch-first devices, the bottom sheet works in portrait and landscape. Tapping its backdrop only dismisses it. The sheet floats inside the safe area. Pulling its top grip down dismisses it. Long-pressing a track gives a short vibration where supported. Reduced motion skips sliding transitions and vibration. The jacket and title in both the player and the menu open song details. Track actions, in order, are Add to favorites or Remove from favorites, Go to song details, Play next, and Add to queue.

The home pencil opens the full playlist in edit mode. Inside the playlist, the pencil and checkmark toggle editing in place. The row number becomes a drag handle and the options button becomes a removal star. Only the controls animate, respecting reduced motion. Row playback still works, and track menus are available in browse mode. Each drop saves the order used by the ten-song preview and by newly started queues. New favorites go at the end.

Activating the current song row restarts playback at the beginning and preserves the current queue, including tracks added manually. The leading play/pause button pauses or resumes at the current position. On phones the jacket shows only its artwork, and the current song’s playback button takes the place of its number in browse mode.

Card and event edit rows use the same title weight and a separate column for the character or event number on desktop. On phones the title moves below that information. The song editor’s favorite star has a 44 × 44 pixel touch target. Removing a favorite confirms the save at the section heading. When using the keyboard, focus moves to the next visible item, the preceding item at the end of a list, or the heading if there is no adjacent item.

Owners can use a mouse to reorder tracks from the jacket, title, metadata, or blank space in a row, both in the home preview and in the full playlist. A drop in the preview reorders the visible tracks and preserves the order of the rest. The grab cursor appears in edit mode. On touchscreens, the edit handle drags immediately, holding a row briefly picks it up, and a quick swipe scrolls. In browse mode a long press opens track actions.

Finishing an edit returns the collection to its previous preview or full view. When all items fit in the preview, the heading and footer omit the disclosure controls. Events use the selected server’s timeline for this check.

Reloading the profile opens all three collections in preview mode. Returning from a detail page restores the collection view and reading position. Switching profile tabs also preserves the reading position when the other tab is too short to scroll.

- By default, cards and songs appear in the order they were added, earliest first. Home previews up to six full card illustrations in a repeating mosaic and ten songs. For nearby artwork, the browser caps the image at 1.5 times the physical dimensions needed to cover the tile. Smaller originals go directly to display. The browser handles the final scaling and crop without a sharpening filter. A card with two illustrations starts with its trained art. The owner can use the circular arrows to switch art without moving the card. The owner's filled star sits to the left of the artwork switch, has no favorite count, and immediately removes the tile after a successful write. The next favorite fills the preview slot. On touchscreens, the first tap reveals the caption and controls. A second tap on the artwork opens the card.
- On desktop, groups of one, three, or six cards size their base tiles to the unframed artwork visible in the CN 10.1.3 member detail view. The game scales a 1334-unit-wide illustration by 0.36 and shows 318 units of its height, giving a 2001:1325 aspect ratio. A two-card group splits its width 3:2. A four-card group uses that same split on top and a mirrored 2:3 split below, with the first and fourth cards in the wide slots. The narrow 4:3 tile sets each row's height. A five-card group splits the top row 1.618:1, with the narrow 4:3 tile on the right setting its height. Its second row has three equal 4:3 tiles. At the same column width these groups fit within the height of six cards.
- On mobile, each full six-card group has one, two, two, and one cards per row, in collection order. “All” repeats that pattern. Paired tiles use the 2001:1325 artwork ratio. A single favorite also uses this ratio at full width. In larger collections, full-width tiles use a 2:1 ratio, including a lone card in the final group.
- The owner can edit favorite cards with the pencil at the right of the heading. The inline list autosaves each drop. The band icon precedes the character name. Both names share one desktop line and use separate lines on phones. Drag from the thumbnail, name or row background. On touchscreens, hold the row to drag or swipe immediately to scroll. The handle also supports keyboard sorting. Moving the graphic divider or dragging a card across it sets the one to six cards visible on the home page. At six, an incoming card displaces the last visible card. New cards append at the end. The divider follows the end by default, showing up to six cards. Adding a card leaves a shorter preview fixed while there are cards below it. Moving the divider, moving a card, or removing a favorite so that all remaining cards are visible restores the default behavior.
- In the card editor, the thumbnail, character name and card title link to the card detail page. The star removes the card from favorites. It follows the title on desktop and sits at the right edge of the row on mobile. The diagonal double-arrow button beside it switches the editor thumbnail and the image wall between artwork variants. Both views keep that button in place and disable it when switching is unavailable. Successful card edits show “Saved”.
- A cataloged event can be favorited on any server before its dates are known. Each server has its own count. The timeline opens on the server with the most favorites. Ties follow the site server order. Its four places cover one ended event and three current or future events, filling missing places from the other direction. The timeline calculates event status and the preview window from the current time when Home opens or becomes visible again. Status labels match the event detail page. Events awaiting local dates show “Upcoming” with a dash for the date and fill upcoming places in ascending event ID order after dated events. Once an estimated or official local schedule is available, the same favorite appears in date order.
- All expands one collection in the profile and collapses the previous one. Each preview and expanded heading sticks below the site toolbar within its section, with the same padding above and below its controls. When more content is available, the whole heading toggles between preview and full view. Its chevron points right in the preview and down when expanded. A complete preview reserves an empty chevron slot. Each truncated preview ends with a centered All button and a downward chevron. The expanded list ends with Collapse and an upward chevron in the same position. The owner’s edit button at the right appears on section hover or keyboard focus and stays visible on touchscreens. The edit button and event flags handle their own clicks. The flags stay in the sticky heading and wrap together when space is tight. The playlist retains existing rows, artwork and numbers when showing or hiding additional songs. New items fade in and departing items fade out. Reduced motion switches immediately. The card wall keeps the preview mosaic intact and adds groups of up to six. Opening the playlist from its footer keeps the tenth track in place. Opening the timeline preserves the visible event and its desktop column as earlier events appear above, whether the heading is sticky or still in the page. The selected server persists. The back-to-top button returns to the expanded collection.
- Collapsing the card wall keeps any visible preview tile in place. After the reader has passed the entire preview, the end of the retained mosaic meets the bottom of the sticky heading and the next section follows immediately below.
- Cards and events open their full edit lists inside the profile, keeping the cover, tabs and other collections visible. The checkmark restores the entry view (preview or full). The heading collapses directly to the preview. Switching modes anchors the visible card or event where possible and keeps the selected event server. A collection link opens the corresponding section of the profile.
- Detail and catalog stars share the signed-in viewer’s set of favorite keys. Each fresh read of the owner's collection supplies those keys directly. Saved additions and removals update open views for the same account, including changes confirmed while a read is in flight. Otherwise the first star loads the keys once for the account. The application does not query or display site-wide totals. Each saved favorite contributes one record for statistics, including favorites in private modules. Profile headings show the number of items in the visible collection.
- Card previews have a star in the upper-right corner. Song cards group the star with playback. On desktop, Meta rows show it beside the title on hover or keyboard focus, and keep saved songs starred across difficulties. On touchscreens the song card provides the action.
- Each detail star has a 44 px target. The event star sits directly after the event name. Cards place the star at the right end of the back-link row, and songs use the right end of the ID row.

Local browser tests in `tests/bandori-favorites.browser.mjs` cover desktop and touch interactions, shared membership reads, failed writes and retries. Database regression `supabase/tests/bandori_favorites.sql` covers role access, private favorites in statistics, ordering and collections exceeding 1,000 records.

### Production work and separate follow-up topics

- [x] Implementation authorized; current components/contracts reconciled, with data, authorization, persistence and failure recovery integrated.
- [x] Details reads an optional synchronized game name, otherwise ID only. No forced profile creation or synchronization; subsequent reads use the latest existing name.
- [x] Persist avatar, cover focal point, signature, title, order and privacy; reuse existing capabilities and remove the duplicate account-page title entry.
- [x] Integrated components and local account authorization checked; fixtures cover network failure. Physical devices and other browsers remain verification limitations, not new design requirements.
- [x] Signatures allow 80 half-width units. Usernames retain the counting rule of their dedicated editor.

## Delivery and acceptance evidence

[Open the final overall prototype](http://localhost:4317/?revision=7&stage=initial). It is available while the service runs; restart with `node serve.cjs` from the prototype directory.

The local prototype uses index.html and profile.js. The picker is compiled from the application components. The prototype's asset-sources.json, fixtures/sources.json and fixtures/degree-sources.json record the sources. Accounts are illustrative and edits persist only in page memory.

The final pass used independent design assessment A and detector/browser assessment B, read by the parent only after A finished. Combined record: [2026-11-16 critique](../.impeccable/critique/2026-11-16T09-58-59Z__index-html.md). The prototype retains final-review-a.md, final-review-b.md, final-detector.json and final-browser-b.json. The pre-polish score is 33/40, with no P0/P1; both P2 issues were fixed without inventing a higher post-fix score. Historical 25/32 and 33/40 runs cover different scopes, and earlier review missed desktop regressions; they are neither a continuous quality trend nor current acceptance evidence.

- Independent browser work and existing checks cover 320/390px phones, intermediate thresholds and 1440px desktop, both themes, 24-character names, no public content, no accounts, privacy/order, actual pickers, cover cancellation and signature editing. Reading, keyboard and emulated-touch paths have retained evidence.
- The existing 36 interaction groups and nine focused layout cases passed. The final two fixes use critique-after-check.cjs: critique-after-checks.json records zero header-height change on edit entry at 320/390/1440px, an 8px name-to-UID gap for empty-signature visitors, and no name nodes with titles preserved for undefined/null/empty/whitespace fixtures.
- Final screenshots include critique-after-empty-signature-visitor.png, critique-after-missing-game-name.png and scope-details-*.png. Visual inspection covers full pages, empty/long content and edit states rather than treating test counts as design quality.
- Sixteen detector hints were checked in the browser: thirteen mixed theme colors, two ignored actual flex spacing, one inherited-font style suggestion. Preserve the theme. Sampled opaque-panel contrast passes; no complete image/gradient pixel certification is claimed.
- Prototype evidence does not establish production authentication, persistence, privacy enforcement or failed-write recovery. Physical devices, other browsers and real screen readers were not tested. At the design-only checkpoint, no production TypeScript or build input changed, so the application build was not rerun; production integration evidence is recorded below.

## Data findings and production boundaries

### Length

src/lib/username-policy.ts defines 2–24 Unicode code points using Array.from(value).length, trimming surrounding whitespace and collapsing runs. Registration/profile clients and APIs share it; the baseline migration uses char_length(username) BETWEEN 2 AND 24. Live database state and the actual longest saved name were not queried. A, 中 and 😀 each count one; a family emoji sequence counts seven, é one, and e plus combining accent two. This does not measure glyphs or width.

Site signatures allow 80 half-width units. Latin letters, internal ASCII spaces and half-width katakana use one unit each. Wide characters, full-width punctuation and emoji presentations use two. Input accepts whole graphemes, preserves the suffix when pasting in the middle, and checks IME text on commitment. The API trims and enforces the same limit. The complete settings request also has a 32 KiB size limit.

### Game usernames

snapshotToNormalizedProfile reads profile.user_name from a synchronized snapshot; syncAutoGameProfile persists profile_name through upsert_auto_game_profile. GET /api/account/game-bind/bindings currently returns only game_uid/bound_at, and a binding does not guarantee a synchronized profile. GET /api/users/[publicUid] reads available names from the same owner's CN auto profiles and omits missing names or auxiliary name-query failures without new synchronization. Settings, sidebar and mobile summary show IDs only.

### CN title categories

Delegated research verified ARM64 methods and UI prefabs in retained CN 10.1.3, versionCode 106 (retained 2026-11-02). Categories are Normal, Character, Event point ranking, Other event and Effect. Chinese labels use CN master 20260612160059 matched to APK keys, not a current online wording snapshot. Evidence: cn-degree-grouping-evidence.md in the prototype directory.

Classify actual owned effect variants/built-in animation first, then character association and degreeType. The first four categories use master.seq. Effect joins owned effect variants before built-in animated titles, each batch sorted by seq. An available effect resource alone does not move a plain variant into Effect. Existing BandoriDegreeCatalogItem and ownedDegreeEffectIds can derive the categories without new classification API fields. The game and online IFix were not tested. Each region has six static prototype examples backed by real catalog fields/artwork; ownership is illustrative. Validate dynamic variants during production integration.

## Iteration and review workflow

1. Start from actual needs, outcomes and constraints; compare the full page, mature references and device scope. Challenge conflicting execution: correct agent-invented goals yourself, and explain an actual problem with a user goal before proposing changes. A plan cannot approve its own assumptions.
2. Before and after each coherent edit, inspect the whole page at normal scale: identity hierarchy, whitespace, alignment, continuity and natural interaction. Compare the accepted version to detect damage on another device or area.
3. Walk affected flows with long/empty/missing data, narrow screens, edit entry/exit and keyboard/pointer states. Compare dimensions, neighboring positions and clipping during the interaction, not only after it ends.
4. Automated checks protect explicit requirements and functional boundaries; scores and no overflow do not prove sound design. Fix and recheck findings. At module boundaries, report completion, evidence, limits and the next step. This design is complete; the next stage is authorized production integration, with the three favorites interiors awaiting requirements.

## Implementation pass (2026-11-16)

- [x] Data/authorization: add service-only homepage preferences; project public accounts/titles through all parent privacy switches, omit missing names and preserve existing APIs.
- [x] Page: integrate /user/[publicUid] using existing avatar/title/card pickers and UID; remove the old account-page title entry.
- [x] Settings: persist module/account order and three-level privacy; preserve disabled child choices and update all three surfaces.
- [x] Motion: brief tab fade, light menu transitions, switch feedback and dnd-kit ordering; no entrance choreography, preserve static feedback with reduced motion.
- [x] Validation: types, focused unit/API/permission regressions, i18n, lint/build; compare whole pages with the prototype, failure recovery, mobile/desktop, keyboard and reduced motion.

References: current account profile/display-degree APIs, AccountCardAvatar, BandoriCardPicker, BandoriDegreeView, Switch and ActionFeedback. The earlier worktree's per-title publishing model differs from the agreed hierarchy and will not be imported wholesale. The new migration was replayed against minimal dependencies in an isolated Postgres 17 container, including actual-role checks; this is not a full migration-history replay. No remote database writes. Apply the additive migration before the app and retain the new table on app rollback.

### Integration evidence

- Production page and services are integrated. Only the interiors of the three favorites modules await requirements; their order and public preferences persist. No new runtime dependency or username-count policy was introduced.
- Disabled parents make child switches appear off and disabled while retaining stored choices. Re-enabling restores them. Public responses use the same effective-visibility projection. Orders save on drop and roll back on failure; signature failures retain drafts. The save API returns stored preferences. The signature editor takes only the confirmed signature from that response.
- Desktop keeps the translucent identity area; mobile keeps the short cover, full name, UID/join date row and permanent binding IDs. Existing avatar/title pickers have direct triggers. The title picker now uses 36px account options and 127×36px title options with shared game grouping. The old account-page title entry is removed.
- Tabs, menus, switches, sorting and picker transitions respect reduced motion. Cover dragging operates directly on the image; keyboard adjustment, save/cancel and picker dismissal restore focus. Signature feedback stays on its own row without covering the name or changing header height.
- Retained tests/profile-homepage.browser.mjs exercises the real Next page through request-boundary fixtures, intercepting all account writes. Set PLAYWRIGHT_MODULE, optional CHROME_PATH, PROFILE_TEST_ORIGIN (localhost:3000 by default), PROFILE_TEST_UID (an existing public route, default 10001), and optional PROFILE_TEST_OUTPUT for screenshots. The server reads only generic metadata for that public route; account/privacy/editor requests use fixtures.
- Sixteen focused domain/service/auth regressions and 17 actual-role SQL assertions passed. Advisors report only the expected RLS-without-client-policies information for the new service-only table; the dependency profiles table is a minimal fixture, not the full production policy setup. Typecheck, i18n and whole-repository lint passed.
- The moved import in tests/react-state-lifecycle.browser.mjs was updated, but its full run is blocked by existing email-flow fixtures missing Supabase exports. Email tests were not redesigned for this task; affected real avatar/title picker flows are covered through the new Next-page check.
- No remote migration, deployment, physical-device, alternate-browser or real screen-reader verification. Review/apply the additive migration before deploying the app; retain the table on application rollback. Completion here refers to implementation and local checks, not a production rollout.

- Final npm run build passed, including Next TypeScript and 71 generated static pages. Latest changed-file lint and final nine browser groups passed; 11 homepage writes were intercepted. Direct cover dragging, reticle-to-image center error below 1px and signature Escape focus restoration have assertions.
- Independent integration critique is complete: A scored 32/40 before polish, without re-scoring. Its signature-feedback and title-picker density P2 findings passed independent rechecks. B's desktop reticle P2 and signature-focus P3 are fixed; cream-palette is an inapplicable style hint. Snapshot: .impeccable/critique/2026-11-16T14-22-46Z__src-components-account-publicprofileview-tsx.md.
- Temporary database, review browsers and detector service were removed. The 3000 dev server and existing 4317 prototype remain. The dev environment connected to the original database still requires the additive migration before real homepage-settings reads/writes; browser acceptance and screenshots used intercepted fixtures.

- B closed both remaining findings on independent recheck: reticle center error was 0px at 1440px and -0.0078125px at 390px; Escape restored visible signature-entry focus at both sizes. The final critique/polish snapshot is closed with no remaining priority issues.

## Interactive local database environment (2026-11-17)

- [x] Created isolated `hhwx-profile-dev` Supabase and replayed all 47 repository migrations; retained the older local `hhwx` volume and hosted configuration.
- [x] Browser and API on the real `localhost:3000` app use local Auth/database through ignored `.env.development.local`, without request interception. See [local development instructions](supabase-setup.md#local-profile-development) for startup and restoration.
- [x] Created a login-capable UID 10001 fixture with a 24-character English/space username, two synthetic CN bindings, one ten-Chinese-character game name and one missing name; exercised real OTP email, registration and password login.
- [x] Passed all 17 homepage SQL checks on complete Supabase. Chrome exercised 14 successful homepage writes, checking the actual database, reload persistence, hierarchical privacy and retained child choices, anonymous API/page filtering, module/account order, cover focus, missing names and 320/390px name/editor geometry. No browser runtime errors; initial fixture preferences restored afterward.
- [x] Rebuilding the development cache resolved repeated hot reloads. Real CDN cover/avatar/title images loaded and whole pages were reviewed. Ignored local evidence is in `temp/profile-dev/verification.json`, `verify.log` and `ready-*.png`.
- [x] Fixed the header title's 3px owner/visitor vertical difference with a shared 24px flex-centered container, removing inline baseline spacing for visitors. Real authenticated/anonymous renders agree at 320/390/768/1024/1440px. The original owner layout and both states' avatar, name, signature and header height are unchanged. Keyboard picker opening, Escape dismissal and focus restoration passed without browser runtime errors. The prototype evidence directory retains `title-align-before/after.json` and full-page screenshots.

This supersedes the earlier local limitation that the original database still needed the new migration; no hosted release occurred. Stop/start retains edits and must not reset the database. Real CAPTCHA, email changes, game synchronization and chat are outside this verification scope; local CAPTCHA is disabled, and development overrides disable real email/external writes. The three favorites interiors still await requirements.

## Component reuse and interaction review (2026-11-17)

The earlier card-picker reuse acceptance was incomplete: the cover reused the card list but implemented another dialog shell, scrolling container and actions; the avatar also duplicated the existing card dialog shell. This review covers every profile display/edit entry and existing callers affected by the shared-dialog change. Reuse is checked across the complete operation, not inferred from an import.

| Feature | Existing implementation and disposition |
| --- | --- |
| Avatar and cover selection | Extracted same-file `BandoriCardPickerDialogContent` from `BandoriCardPickerDialog`, sharing title, close, scrolling body, footer and the original `BandoriCardPicker`. Removed cover-specific dialog CSS. Avatar retains authorization, defaults, draft/save and error behavior. Cover retains select→position→save; selecting an image does not persist it. |
| Game-profile/team-builder selection | Preserved the `BandoriCardPickerDialog` interface, fixed server, metadata and scroll ref. The art toggle stays hidden and selection opens parameter editing, without profile confirmation actions. |
| Avatar, title, UID and server icon | Reuse `AccountCardAvatar`, `BandoriDegreeView`, `CommentPublicUid` and `BandoriServerIcon`; title editing continues through `AccountDisplayDegreeControl`, without a second selection implementation. |
| Privacy switches and feedback | Reuse `Switch`, `ActionFeedback` and `useActionFeedback`. Save targets identify the master switch, account, titles, favorites module or reordered item. Absolutely positioned feedback follows the actual action without layout growth; failures retain rollback and retry through that action. |
| Sorting | Retained installed dnd-kit with existing pointer/keyboard patterns. No existing shared list had matching responsibilities; no new generic sorting framework. |
| Loading, failure and retry | Profile/title reads use `LoadingIndicator` and `LoadingError`. Card-catalog loading, filtering, retry and virtualized rendering remain owned by the original picker. |
| Cover artwork | Reuse card/index caches, asset URL lookup and `LoadingImage`. `BandoriCardArtImage` supports only thumb/trim; the cover requires full artwork and draggable object position, so this requirement-driven difference remains. |
| Tabs, signature and cover menu | Retained the agreed inline tabs, constant-height signature editor and lightweight native menu. No matching shared component was found; unrelated components were not forced into these responsibilities. |

- [x] Restored the desktop prototype's single translucent gradient: it starts 28px above the identity area, 8px higher than before, using 74%→86% panel color. Removed the near-opaque composition of two layers. Mobile keeps its short cover and solid identity surface.
- [x] Reviewed whole light/dark desktop and mobile pages. Checked picker containers, internal scrolling, actions, selection/cancel and failed avatar saves at 1440/390/320px. Feedback checks cover switch success/failure, reordered-item location, 320px bounds and unchanged row height.
- [x] Repeated real local authenticated/anonymous comparisons at 320/390/768/1024/1440px: zero title-position differences; matching avatar/name/signature/header geometry. No test-account profile writes.
- [x] Typecheck and whole-repository lint passed. Production build initially failed while starting a child process from the old Turbopack cache; retaining and replacing that cache produced a successful build, including TypeScript and 71 static pages. No build configuration or dependency changes.
- [x] All 13 groups in the expanded `tests/profile-homepage.browser.mjs` passed, including the existing account avatar entry, game-profile select→parameter editor→cancel→close, and every added feedback/dialog assertion. No browser runtime errors; all 17 homepage and two avatar writes were intercepted. The fixture now resolves the same environment configuration as dev, avoiding the old Auth URL after local database setup.
- [x] Opened the cover picker read-only with the real local account and reviewed it after visible images finished loading: all 347 visible image elements at 1440px and 61 at 390px loaded successfully. Evidence: `real-picker-1440.png` and `real-picker-390.png`.

Screenshots are in `reuse-audit/` under the local prototype evidence directory. Browser regression account writes are intercepted at the request boundary. Unchanged SQL/backend-protocol checks were not repeated; no remote writes, deployment or physical-device Safari checks. The team-builder caller was reviewed and type/build checked; a complete team calculation is outside this UI regression scope. The three favorites interiors still await requirements.

## Public profile links (2026-11-18)

- [x] The signed-in avatar menu links to the owner's profile directly above Account Center. Card and event comments (including replies), chat message authors, reaction previews and full lists, and online members link only the avatar and name. Without a public UID the identity stays plain.
- [x] Profile navigation dismisses the chat panel and nested dialogs. Quotes still locate the original, reaction chips still toggle, and chat right-click/long-press still opens message actions. Othello's legacy comments, mention suggestions and notification cards retain their existing behavior.
- [x] Browser checks: real Next account-menu navigation; comment/reply and participant link targets at 393/1440px; English desktop and Chinese mobile chat links, keyboard/touch navigation from the member list, and closure of both dialogs.

## Display defaults and missing artwork (2026-11-18)

- [x] Without saved preferences, the cards, events and songs modules are public in that order. Bound accounts and each account are public; each account’s full title collection is private. The owner still sees owned titles. The selected site display title is independent. Existing saved choices are preserved.
- [x] Unset covers use the full trained artwork of card #2087, with the saved focus at x=50%, y=33.111000870726784%. This display and editing default is independent of avatars and future changes to the test account. An unavailable custom cover falls back to that artwork and focus; if the default also fails, the themed surface remains without an indefinite loading placeholder.
- [x] The second row of Bound accounts, “Let others find my account by game ID”, starts at the heading’s left edge with its switch aligned on the right. This owner-only preference defaults on. The master switch disables it without erasing the saved choice. Game ID lookup itself is not implemented.
- [x] Each visibility switch shows its effective state on the left using “Public” or a crossed-out eye. Account and title indicators follow their parent switches. Save feedback appears to the left of the indicator. Game ID search permission uses the switch alone.

## Default page width alignment (2026-11-18)

- [x] Compared both pages in local Chrome at matching viewport widths. At 390px the profile measured 362px and the tracker 374px. At 1440px both measured 1106px. At 1920px the profile measured 1120px and the tracker 1152px.
- [x] Shared `PageContent` defaults to `max-w-6xl`. The tracker and Bandori loading view inherit the default. Focused forms retain their existing widths.
- [x] The profile route layout uses the same container. Removed the local 1120px cap, extra mobile inset and 896px loading-view cap. Additional desktop space goes to the main column, with a 256px personal-info sidebar and 24px gap.
- [x] Both edges matched at 17 viewport widths from 320 to 1920px. Checks covered column transitions, 16-digit game IDs, switch feedback and horizontal overflow. At 1920px the initial route fallback, pending profile request and failed read each measured 1152px wide.
- [x] Comparing the same artwork and focal point, the exposed strip retained its 4.4:1 compact and 6.4:1 desktop ratios. At 1920px the artwork including the translucent identity area grew from 1120×261px to 1152×266px, adjusting its crop from 4.29:1 to 4.33:1.

## Profile polish (2026-11-18)

- [x] Owners view and edit their signature in a single native field. It measures 36rem on desktop, fits the available width on narrower layouts and fills the mobile row. The first click places the caret at the clicked character. Brief save feedback sits below the field at its left edge.
- [x] A failed Enter submission retains the draft and returns focus to the field. In Details, the private icon aligns with the first title and an empty title list occupies no row. The header reserves its title position during loading and displays the title when its data arrives. Owners with a bound game account can click to edit. Unbound owners see the static default title.
- [x] Delaying the title catalog at 390px and 1440px produced identical header and username bounds before and after loading. Browser checks covered the first click, the signature limit, insertion in the middle and IME commitment. On mobile and desktop the save message shares the input’s left edge and sits 4px below it.
- [x] Keyboard focus stays on the switch or reordered handle during autosave. The other settings column remains usable. Completing the earlier save leaves focus on the last control used.
- [x] The English search permission label reads “Let others find me by game ID”. The label can wrap to two lines in a narrow column. At 320px in English and Chinese the row stays 44px tall before and after a successful or failed save, with an 8px gap on both sides of the feedback.
