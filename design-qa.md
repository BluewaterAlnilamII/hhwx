# Historical design and QA records

The current light/dark configuration and component contract are maintained in the [Theme Guide](documents/theme-guide.md) ([中文](documents/theme-guide.zh-CN.md)). The records below describe earlier iterations, including rejected alternatives and the pre-dark-theme state. Their palette values, migration status and coverage claims apply only to the named iteration; they are not the current theme specification.

## Component and light-theme unification (PR #201)

Date: 2026-09-09 (Asia/Shanghai). Base: `85b88e3a` (PR #200). The user accepted the initial unification and neutral content, then chose to restore the original button treatment and blue selection after comparing alternatives. Only the tracker mode container's gold border changes to neutral gray. The four initial audit findings are corrected. Verification below records the local checks completed before PR publication; remote CI and merge status are recorded on the PR. No production deployment is included. The dev server is left running at `http://localhost:3000`.

## PR dependency prerequisite

PR #201's initial CI stopped at the production dependency audit: the existing `sharp` override was pinned to `0.35.3`, affected by [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c). The merge prerequisite updates only that override to patched `0.35.4` and refreshes its lockfile entries. Next.js and the other direct dependencies remain unchanged. The local UI checks below preceded this dependency patch; the PR records the subsequent audit/build results for the final dependency set.

Local verification of the updated dependency set: `npm audit --omit=dev --audit-level=moderate` reported zero vulnerabilities. A native image smoke check verified `sharp 0.35.4` / `libheif 1.23.2`, encoded PNG/WebP/AVIF inputs, and decoded/resized each to an 8 x 6 PNG successfully. The lockfile changes are limited to sharp and its platform/libvips/runtime dependencies.

## Design contract and implementation

- Preserve the decisions in #121 (theme ownership), #187 (card/popover interaction), #191 (light baseline), #192 (catalog/search behavior), #196/#198 (homepage and immutable artwork), and #200 (continuous comment rows and reaction previews).
- The nine HHW swatches remain `#FFEE22`, `#FF9922`, `#44DDFF`, `#AA33CC`, `#006699`, `#F5A4CD`, `#F9E065`, `#EF392B`, and `#F35E38`. Cyan and pink remain reserved. Selection uses the existing blue defaults through independent selection roles. Functional status colors and independent heading decoration slots retain their existing responsibilities.
- Smile Patrol owns one `#FCFCFC` content source, replacing the initially unified `#FFFEFA`. Panel and light floating roles refer to it. Page panels share square corners, `#DDDCD5` light borders and no shadow; nested content keeps its own geometry. White controls, chart plotting/axis surfaces, profile banners and inverse text have separate roles. The profile banner retains HHW blue `#006699` through the theme instead of local literals.
- `hhwx-panel`, `hhwx-control`, `hhwx-action-accent` and `hhwx-floating-surface` own shared appearance. Consumers retain dimensions and layout. The affected shared classes now use the components cascade layer so explicit, temporary dark color utilities can still work; this is a scoped change, not a migration of the entire stylesheet. Competing local appearance declarations and the old descendant filter overrides were removed.
- Inputs, neutral/solid actions, selected cards and disabled states consume paired foreground/background and focus roles. Content fill no longer doubles as inverse text. Card selection uses the existing `cn` utility to resolve base and selected outlines; explicit Tailwind color hints preserve the 2px blue outline.
- Light page-tab text and indicators share information blue; page headings retain brand red. Calendar event bars preserve band colors and plain white labels without outlines, per the user's final visual preference. Rest-day numbers retain the readable red derivative. Light native selects keep a neutral background while hovered or focused.
- Account/auth/public-profile surfaces, catalogs and pickers, event panels, calendar/subscription UI, team-builder UI, legacy guestbook, comment pagination, menus/player chrome and game dialogs were migrated by responsibility. Auth/calendar/public-profile headings reuse `Heading`. Calendar band identities, card artwork, game pieces, charts, APIs, authentication, UID handling, search behavior and storage remain outside the change.
- Panel/media geometry, navigation markers and song statistics no longer switch shape with the color scheme. Game dialogs share a viewport-constrained width. This does not establish a completed dark palette.

## Initial unification verification (before palette refinement)

| Area | Evidence |
| --- | --- |
| Cards, desktop | Dev and production: panel/filter/row fill `rgb(255, 254, 250)`, border `rgb(221, 220, 213)`, 0px radius, no shadow. Inputs remain white. Search draft does not change the URL; Enter submits `HHW`, and clearing restores the unfiltered URL/list. |
| Theme propagation | In production, temporarily setting the panel role to `#123456` changed every rendered `hhwx-panel` to that color while the input stayed white and inverse text stayed `#FFFEF4`. The temporary override and transition suppression were removed immediately. |
| Focus and card popover | Search focus has a 2px `#0070A0` outline. Event 322 card selection has a solid 2px `#0070A0` outline with no transform. Its native popover contains an `#FFFEFA` floating surface and closes with Escape. Final production build checked. |
| Songs | Public catalog and song 10004 detail checked. At 390px, statistics form the same 2-by-2 grid in light/dark, with square cells, 20px/900 values and the same separators. At 1440px, the light statistics form one row. No horizontal page overflow. |
| Calendar | Main panels and expanded subscription content use the panel fill. At 390px, the expanded subscription controls and URL field fit without horizontal page overflow. Official band/character identity visuals remain. |
| Auth and navigation | Signed-out login at 390px has the shared panel and readable controls. Mobile drawer opening, focus containment, Escape and focus restoration passed. The English homepage at 320px loads visible artwork, has no horizontal overflow, and restores focus to the entrance after Escape. |
| Comments | Event 322 reaction preview opens in the native top layer and retains its `#FFFEFA` background and UID presentation. No reactions/comments were submitted. Existing comment and picker accessibility checks passed. |
| Color pairs | Computed theme contrast ratios: panel body 17.69:1, muted text 7.51:1, solid information action 5.42:1, disabled foreground/background 6.81:1, profile banner 6.17:1, success status 4.59:1, warning status 5.27:1. Temporary DOM probes verified the shared normal/disabled control and action CSS, plus profile foreground roles; these are not authenticated-flow tests. |

- `npm run typecheck`: passed. Final `npm run build`: passed, including TypeScript and all 52 static pages. Production preview verified separately from HMR/dev CSS, then stopped.
- `npm run lint`: 0 errors, 24 existing warnings (including existing hooks, image and TanStack Virtual warnings).
- 72 existing checks passed across `comment-ui-regressions`, `comment-picker-a11y`, `bandori-card-detail-ui-contract`, `bandori-card-hover-tooltip`, `bandori-song-ui-contract`, `bandori-eventtracker-top10-ui`, `bandori-eventtracker-comment-links`, `music-player-ui-contract`, and `bandori-chart-simulator-ui-contract`, using `node --import tsx --test`. The card-outline source assertion was updated for the semantic color/hint while retaining its selection, width and no-translation checks.
- Source audit found no component references to the generic surface token, old `#FFFEF4`/local `#FFFEFA`, private palette variables or theme seeds. `#FFFEF4` remains intentionally inside the theme as the legacy surface seed and independent inverse ink, not as a content-container color.
- No dependency, API/library/hook, database or immutable asset changes. `git diff --check` passed. Tested browser paths reported no console warnings/errors.

Current screenshots, captured in dev Chromium on Windows (DPR 1):

- [Song detail, 1440 x 1000](documents/theme-unification-song-desktop.jpg)
- [Expanded calendar subscription, 390 x 844](documents/theme-unification-calendar-mobile.jpg)

## Final audit corrections

- Removed the shared card picker's EN/CN corner badge at the user's request. The `entityServer` data, `data-entity-server` attribute, filtering and selection behavior remain intact. Shared picker consumers were traced; this removal was verified in source, not through an authenticated avatar-editing session.
- Removed the competing light text/hover utilities from both catalog pagination buttons. In the final production build, Cards and Songs use `#0070A0` text and a 2px focus outline; actual hover uses the secondary-action background and border. Temporary role overrides changed text to `#008348`, hover fill to `#E3F6EA` and border to `#008348`, then were removed. The Cards button retains its existing dark slate/sky colors, square geometry and 390px fit.
- Restored a transparent top border on all three auth loading rings. Exact-class probes against the production auth CSS confirmed a transparent top, blue remaining sides and the `spin` animation in both schemes. These probes do not exercise email verification or account state.
- Removed the opaque layer over outside-month calendar cells. The actual September calendar now exposes the muted fill on August 31 and October 1–4; no panel-colored overlay remains. Weekend date text retains the existing rest-day foreground.
- After these corrections, the production build passed with TypeScript and 52 static pages, all 72 focused checks passed again, and lint on the six corrected files reported no errors or warnings. The earlier full lint result remains 0 errors / 24 existing warnings. `git diff --check` passed. The final catalog checks reported no console errors or warnings; the temporary production preview was stopped afterward.
- The neutral content and cyan-derived selection candidates were subsequently approved and implemented as described below.

## Neutral content and sky-selection exploration (superseded)

- Light content is now `#FCFCFC`. Quiet selection mixes 12% HHW cyan into this surface (rendered `#E6F8FC`), with HHW blue `#006699` text. Selection borders and strong fills mix 40% cyan with 60% HHW blue (rendered `#1B96C2`); strong fills use `#0F172A` text. The theme owns these mixes; consumers use existing semantic roles.
- Information, action and keyboard-focus blue remain `#0070A0`. Secondary-action hover no longer inherits the pressed-selection background. A production role probe changed the selection border to green while information, action, focus and panel colors remained unchanged, then restored the role.
- Shared filter buttons, card outlines/check badges, switches, menu indicators, editor radio groups, native checkboxes, team-builder selections, comment reactions/pickers and media selection controls now consume selection roles. Selected filter and picker buttons retain their selection colors on hover. Existing ARIA state, event handlers, metadata, filtering and media behavior are unchanged.
- Dev desktop Cards: deselecting all bands and selecting HHW updates the URL to `?bands=3`, returns 397 cards and distinguishes the selected band from neutral peers. Selected filters keep their cyan border/fill on hover. Production Cards at 390px has no horizontal overflow and renders neutral panels with sky selection.
- Production Event 322: changing T500 to T100 updates the URL and `aria-pressed`; the strong selection has sky fill and dark text. The quiet active ranking tab has pale cyan fill and blue text. At 390px, the controls and loaded chart fit without horizontal page overflow. No relevant browser console errors/warnings were reported on the tested Cards/Event routes.
- Computed light colors give 5.71:1 quiet-selection text contrast, 5.26:1 strong-selection text contrast, 3.10:1 border contrast against the quiet fill and 3.31:1 against the panel. Production CSS probes also verified disabled selected controls, the native checkbox accent and the check-badge foreground/background pair. These probes are not authenticated interaction tests.
- Sky overrides are light-only. Dark Cards retains the existing white selected control with `#0070A0` text/border and fits at 390px; the dark strong-selection role retains `#0070A0` with inverse ink. Reusing selection roles makes the former info-tinted dark filter fill white; no complete dark palette is claimed.
- Final build passed with TypeScript and 52 static pages. The 72 focused checks passed across the initial run and the necessary reruns after updating the old token assertions. Full lint reports 0 errors and the same 24 warnings. The card-outline, switch and muted-player source assertions now refer to selection roles without dropping their interaction assertions. `git diff --check` passed.
- The source audit covers 63 TS/TSX files in the overall uncommitted patch. Differences after stripping appearance are the previously reviewed heading/cn reuse, inverse-player text, and badge/calendar-overlay removal; no new business logic or data contract changes were found. Browser plugin is unavailable; verification reused the established Chrome DevTools fallback without adding dependencies. Current desktop/mobile screenshots are retained with local review artifacts; the earlier linked screenshots document the pre-refinement stage.

## Accepted selection rollback

- Keep `#FCFCFC` content, shared appearance classes and selection-role ownership. Remove the light cyan/sky overrides from Smile Patrol: strong selection again uses `#0070A0` with `#FFFEF4` inverse text; quiet selection uses white with `#0070A0` text/ring. No new palette seed or screenshot-sampled color is introduced.
- Keep the original tracker button dimensions, radii, shadows, double ring and spacing; no checkmark or reserved icon slot is added. The only tracker component change replaces the mode-list border role with `--theme-color-panel-border` (`#DDDCD5` in light). The generic border role and chart nonworking-day bands retain their existing colors; dark mode-list utilities are preserved.
- Dev Event 322 at 1440px: T500 -> T100 updates the URL and `aria-pressed`; selected fill/text compute to `#0070A0` / `#FFFEF4`, while T500 returns to white. Tier height is 36px, radius 14px, with no child icon. Mode-list border computes to `#DDDCD5`, and content remains `#FCFCFC`.
- At 390px, Event 322 retains the selected pair and gray mode border, renders the chart, and has no horizontal overflow. Cards at 1440px uses white selected filters with `#0070A0` text/border and `#FCFCFC` panels. Both routes have meaningful content, no framework overlay and no console errors/warnings. Verification reused the established Chrome DevTools fallback; screenshots remain in the local review artifacts.
- The final production build passed TypeScript and all 52 static pages. Focused ESLint passed, and all 10 existing ranking/TOP10 tests passed. Earlier broader checks remain evidence for the unchanged parts of the patch.

## Initial light text contrast refinement (tab and calendar ink superseded below)

- Keep the nine HHW seeds, `#FCFCFC` content and accepted selection buttons. The light theme derives small red text from 80% brand red plus 20% primary ink (approximately `#C2322B`), shared by selected page-tab text and rest-day text. Page headings and tab indicators retain the original brand red. Calculated contrast is about 5.40:1 on the panel and 5.10:1 on the rest-day fill.
- Shared control placeholders now consume an explicit role, mapped to the existing `#475569` muted text in light mode (7.58:1 on white). The recipe fallback preserves the prior half-current-color placeholder treatment for the deferred dark theme.
- Card detail's return link consumes the secondary-action foreground, keeps `#0070A0` on actual hover and adds an underline. Focus-visible shows the shared 2px outline with a 3px offset; Enter returns to the Cards route. Its temporary dark text utility remains intact.
- Calendar labels use theme-owned dark/light inks against the existing band colors. Roselia keeps white text; other current solid bands use black. Mixed backgrounds requiring incompatible inks get a neutral backing only behind their text. The local presentation helper and two runnable tests cover all nine band colors, all two-color combinations, and the 0.97 bar opacity over the neutral panel. No band colors, API contracts or scheduling data changed.
- In the light month grid, labels stop at the current-month segment's end. Actual September event 325 has a 57.14% right inset, preserving its faded October continuation. Leading-month clipping and the existing 20px bar height remain intact. May event 311 exercises the real gray/Roselia mixed backing at 390px without horizontal overflow.
- Dev Chromium checks passed on Cards, Event 322, card 2402 and Calendar, with desktop 1440 x 1000 and calendar 390 x 844. The card placeholder, selected page-tab red, restored tier blue pair, return-link hover/focus/navigation, month navigation, mixed backing and cross-month bounds were read from rendered DOM. Calendar and card-hover screenshots support visual inspection; no relevant console warnings/errors or framework overlay were observed. Browser plugin is absent; the established Chrome DevTools fallback was reused. Screenshots are retained outside the repository with the local review artifacts.
- A repeat mounted-HTML audit found no definite text-contrast failures on the sampled Cards, Event 322 and May Calendar states. Gradients and ancestor opacity remain manual checks; this is not a full WCAG conformance claim. Calendar ink combinations are separately covered by the contrast test and actual rendered pair checks.
- `npm run typecheck`, focused ESLint, all 16 calendar-label/card-detail checks and `npm run build` (including 52 static pages) passed. Earlier broader evidence applies to unchanged portions of the patch. No dependency or dark-palette redesign is included.

## Blue page tabs and outlined white calendar labels (outline superseded below)

- After reviewing the red tabs and black calendar labels, the user preferred information blue for page tabs and white calendar text. Selected tab text and its 2px indicator now use `#0070A0` (5.35:1 against `#FCFCFC`); Event Tracker and Song Detail share these roles. Inactive text stays muted, page headings retain brand red, and rest-day text keeps its red derivative.
- Every calendar event label is white again. Roselia's solid deep-blue bars retain plain white text. Other current solid colors and mixed stripes use a 70% primary-ink outline: a 2px stroke is painted before the white fill to leave an approximately 1px outer halo. One pixel of inline padding protects the leading halo from clipping. The former light text backing and black-ink roles are removed; band colors, 20px bar height, lanes and month-segment bounds stay intact. The deferred dark scheme keeps white text with a transparent outline.
- The outline follows the [W3C G18 outline/halo technique](https://www.w3.org/WAI/WCAG22/Techniques/general/G18). The runnable check compares white text against its immediate band or composited outline for all nine colors and all two-color combinations, including bar opacity. This calculation does not certify text rasterization or complete browser/accessibility coverage.
- Dev Chromium verified Event 322 switching from tracker to information: URL/ARIA selection updated, active text and indicator both computed to `#0070A0`, and the inactive tab became muted. Calendar May event 311 uses white outlined text with no backing; September shows white HHW/Pastel labels and plain Roselia labels. Desktop 1440 x 1000 and 390 x 844 screenshots were inspected. No horizontal overflow or relevant console errors/warnings were found. The existing September 325 month-end clipping remains intact.
- All 11 calendar-label, song-UI and TOP10 checks passed, focused ESLint passed, and the final production build passed TypeScript and 52 static pages. Browser plugin remains unavailable; verification used the established Chrome DevTools fallback. Safari/Firefox and physical-device rasterization remain unverified. Dev remains available for visual review.

## Neutral selects and plain white calendar labels (current)

- The event select's pale-blue fill came from its hover utility, not its selected event value. Removed that light hover fill from the shared Event Switcher (used by Event Tracker and Team Builder). Light native `select.hhwx-control` also retains the control background while hovered; button/input hover styling, disabled fills and existing dark overrides remain unchanged.
- Actual Event 322 select hover, focus and open-menu checks compute to white. Its native menu background is white; the browser's current-option highlight remains native. Escape closes the menu without changing event 322. Cards' shared sort select also stays white on actual hover. Existing focus rings are retained.
- Removed the calendar text outline, its 1px padding, its extra text wrapper, the obsolete label-treatment helper and the outline-specific contrast tests. All event names now render plain white with `0px` text stroke, no text shadow and no backing. The accepted page-tab blue, original band colors, 20px bar height and current-month text bounds remain intact.
- This explicitly supersedes the preceding outline-based contrast claim. Plain white text on bright band colors does not meet normal-text AA contrast (approximately 1.34:1 on HHW yellow and 1.72:1 on Pastel green with the existing bar opacity). Record this known readability trade-off rather than claiming the final calendar palette passes all text-contrast checks.
- Dev Chromium inspected the open Event select at 1440 x 1000 and the plain-white calendar at 390 x 844, with no relevant console errors/warnings or horizontal overflow. Focused ESLint, 10 existing ranking/TOP10 checks and the final build (TypeScript plus 52 static pages) passed. The established Chrome DevTools fallback was reused; dev remains running. These checks do not establish cross-browser or full accessibility conformance.

## Follow-up design opportunities

1. Default-all catalog filters currently emphasize almost every chip. Consider rendering an unrestricted group quietly and emphasizing explicit restrictions, while keeping all/some/none states and accessible labels clear. This needs an interaction decision, not another blue adjustment.
2. `--theme-color-border-default` still aliases the yellow shell tint. The tracker mode container now explicitly uses the gray panel border. Other consumers, including toolbar menus and chart bands, need a separate review before any shared-token change.
3. The user chose to retain the original compact tracker buttons after visual comparison. Do not add checkmark space or flatten their rings/shadows as part of this unification. Other controls can be discussed by purpose; artwork, band identity, blue page tabs and yellow navigation roles remain distinct.

## Remaining dark-theme decisions and coverage limits

The dark scheme still has the legacy yellow canvas, mixed cream/white controls and dark slate content overrides. Comment previews intentionally remain light while the complete participants dialog retains its existing `#232428` dark surface. Game result/resume dialogs retain the legacy dark gradient. These are recorded transition items, not a proposed dark palette or a dark-theme acceptance result. A follow-up should map paired semantic roles from the fixed HHW seeds and remove those local dark color overrides, preserving the shared component geometry and interaction.

Authenticated profile editing, team-builder/picker flows, calendar writes, complete/long reaction participant lists and a full game-to-result session were not exercised in the signed-out browser. Their styles were inspected, and relevant existing checks were reused; no auth bypass or live write was used for visual testing. Physical touch devices, Safari/Firefox and complete assistive-technology coverage remain unverified. These limitations should be retained during user review rather than treating a build or a temporary CSS probe as full interaction coverage.

---

# HHW homepage verification

Date: 2026-09-07 (Asia/Shanghai). Local release review: passed after resolving both reported P3 findings.

## Accepted behavior

The homepage retains the existing header, sidebar appearance, background, original HHW logo, Japanese homage copy, and decorative random counter. Othello moves to `/othello` and `/en/othello`, retaining the original game page and storage key. Navigation groups are HHWX / Home, Bandori, and Games / Othello.

On screens narrower than the existing 64rem breakpoint, both 入り口 and the mailbox open the navigation drawer. On desktop, the entrance has no action and the mailbox uses a native `href="#"` link. Mail text stays plain text. The main-logo Michelle sticker is removed; the original mailbox keeps its own ears and bear face.

## Visual references and screenshots

- [Original SOS mailbox](documents/home-mailbox-sos-reference.png): user-provided 40 x 40 reference. Preserve the compact body, broad white sign, short post, and small base.
- [Accepted original HHW artwork](documents/home-mailbox-hhw-reference.png): keep its ears, face, proportions, and base. Compare both reference images before future edits; the rejected wide and elongated mailbox variants are not used.
- [Final desktop homepage](documents/homepage-desktop.png): production build, 1280 x 720.
- [Final mobile drawer](documents/homepage-mobile-drawer.png): production build, 390 x 844, showing the corrected backdrop over the header.

The heading uses thin raster lettering and the accepted text ＨＨＷ団のサイトにようこそ！. Its original reference font is unknown, so the result is a visual approximation. The same Japanese region uses `lang="ja"` in both site locales.

## Assets and layout

`public/res/home/v1/hhwtitle.png` is a 450 x 60 transparent image rendered from installed MS Gothic Regular at 30px; no font file is redistributed. `public/res/home/v1/post_no.png` is the proportionally prepared 144 x 176 transparent original HHW artwork, displayed in a 72 x 88 slot. The component covers its old raster lettering with a 56 x 22 white sign and accurate live 工事中 text. The image alone is not the final typeset sign. `public/res/home/v1/logo.png` is an independent copy of the original 512 x 512 logo, so later favicon changes do not change the homepage emblem.

All three homepage images use the existing `/res/**` one-year immutable browser and Cloudflare cache policy. Their bytes must not change at these v1 URLs; publish future edits at new versioned URLs and update the consumers.

The 200 x 247 emblem slot, 252px original logo, and 25px entrance remain unchanged. Footer text is 16px, with a 32px top gap and text aligned to the sign. Counter and sign colors use explicit black/white semantic tokens in both color schemes. The counter is decorative (0029850–0029899), not analytics. The three homepage image files total 126,629 bytes. No runtime dependency was added.

## Release review and checks

- Resolved: the mobile backdrop now covers the header as well as the page, matching Radix's modal interaction boundary. The drawer stays above the backdrop, keeps its internal close button and focus protection, and releases header controls when closed.
- Resolved: both README versions describe the accepted narrow-screen and desktop behavior.
- Production-mode keyboard checks passed at 320px: entrance Enter, close-button autofocus, Shift+Tab cycling to Othello, Escape, and focus restoration to each actual trigger.
- Both narrow-screen triggers open the same localized drawer without changing the URL. Outside clicks and the internal close button close it. Resizing to desktop closes the modal and releases its input restrictions.
- Desktop entrance clicks have no effect; the mailbox appends # without opening a drawer or resetting the counter. Original toolbar navigation and language controls remain usable after the drawer closes.
- No horizontal clipping or missing homepage images at 320px. Production browser logs have no warnings or errors in the tested flow. Dark-theme sign readability was verified in the earlier equivalent styling review.
- The moved Othello page is identical to the previous homepage after normalizing line endings and renaming its component. The storage key and game logic are unchanged.
- Production review covered player selection, a move against Kaoru, the AI response, refreshing the resulting 3:3 board, and finding the same saved board on the English route. Existing game comments load; none were submitted.
- Local production HTTP checks passed for both homepages, both Othello pages, both manifests, and both images. The legacy default-locale-prefixed Othello URL redirects to /othello. Manifest start URLs remain / and /en.
- Build and type checks passed. Full lint: 0 errors and 24 existing warnings, including two img warnings carried with the unchanged game page. Internationalization check: 2 locales and 9 namespaces passed. Decorative-counter and Kaoru Worker/fallback tests passed. Production dependency audit: 0 vulnerabilities.
- Required remote CI and the deployment result are recorded on the pull request. No database migration, environment change, dependency update, or sibling-repository deployment is required by this change.

Browser coverage is Chromium on Windows, with desktop and 320/390px viewports. Safari, Firefox, physical mobile devices, and complete assistive-technology combinations are not covered by this local check.

---

<details>
<summary>Previous Smile Patrol audit (2026-09-05)</summary>

# Smile Patrol pre-release audit

Date: 2026-09-05. Base commit: `42e3650f`. Result: no blocking issues found in the scoped local working-tree audit. No commit, remote CI run or deployment was performed.

Final light-theme screenshot from the audited production build, captured at 1920 x 1000 in a signed-out Chromium session for the PR. The temporary local preview was stopped after capture.

![Final Smile Patrol light theme](documents/smile-patrol-light-theme.png)

## Accepted design and code boundaries

- Canvas: `#FAF8F4`, with continuous, unequal-width 132-degree yellow, pale-yellow and white ribbons. The upper-left bright yellow is restored and the lower-right yellow area enlarged. Fine strokes have softened edges and a mask that fades toward the center.
- Selected sidebar item: the same bright yellow as the canvas ribbon, with a 3 px orange indicator and bold text.
- Page panels and nested ranking-mode/chart containers share `--theme-color-panel-background: #FFFEFA`. Main panels are square with a `#DDDCD5` border and no shadow; nested containers retain their existing geometry. Plot backgrounds and individual controls keep their own color roles.
- Theme-specific palette/effects remain in the theme stylesheet; shared recipes provide semantic fallbacks. Components consume semantic tokens, and the frontend rules now document this separation of fill and geometry. No unresolved theme variable references were found.
- The white LOGO preserves the geometry and cutouts of `src/app/icon.png`. Stars remain undecided. Chart rendering/data, dark-mode values, event behavior and data sources were not changed.
- Reviewed all changed TSX, CSS and rule files. TSX edits only affect class names; no dependency or API changes are included.

## Verification

- `npm run build`: passed, including TypeScript validation and generation of 50 static pages. Compiled CSS contains the accepted panel color, panel class and LOGO URL.
- `npm run lint`: passed with 0 errors and 24 warnings, all in files outside this patch. Existing warnings were left outside this visual change.
- `node --import tsx --test tests/comment-ui-regressions.test.mjs tests/bandori-eventtracker-top10-ui.test.mjs tests/bandori-eventtracker-comment-links.test.mjs tests/bandori-events-consumers.test.mjs`: 21/21 passed.
- `node scripts/build-smile-patrol-logo.mjs`: passed its geometry/cutout checks and reproduced the PNG byte-for-byte. The dev asset URL returned HTTP 200, `image/png`, 65,014 bytes.
- Reused focused Chromium desktop/mobile evidence from this iteration: no horizontal overflow at 390 px, navigation drawer and tracker/info switching work, decorative layers do not intercept input, and toolbar controls retain their styles. Latest computed fills were `rgb(255, 254, 250)` for both nested containers and white for the plot; their existing corner radii were retained.
- Dark-mode checks from earlier in this change remain applicable: subsequent overrides are light-only, and the new nested semantic token defaults to the previous surface color in dark mode. Dynamic chart SVG element counts were not used as a pixel-equivalence claim.

## Release handoff

- Include both new files, `public/favicon/smile-patrol-logo-white.png` and `scripts/build-smile-patrol-logo.mjs`, with the eventual commit; the stylesheet depends on the PNG.
- Full unrelated CI/Rust suites, Safari/Firefox and authenticated write flows were not exercised. Required CI remains an integration gate.
- `git diff --check`: passed. The verified HHWX dev process tree was stopped; port 3000 has no listening process.

---

# Earlier Smile Patrol light-theme iterations

The following captures and results describe earlier iterations. The accepted palette and audit above supersede their old color and background descriptions.

## Scope and visual reference

- Date: 2026-09-05. Base commit: `42e3650f`; reviewed working-tree changes.
- Reference: `C:/Users/bluew/.codex/generated_images/01a070b0-9b13-7550-984e-65941d43a710/exec-d0d6ca69-262e-481a-8f53-bbd2277bf8ec.png` (1844 x 853 pixels).
- Preview: http://localhost:3000/bandori/events/322?type=event&tier=1000&server=cn&page=1
- Desktop capture: `C:/Users/bluew/.codex/visualizations/2026/09/05/01a070b0-9b13-7550-984e-65941d43a710/hhwx-desktop.png` (1842 x 854 CSS/image pixels, DPR 1).
- Mobile capture: same evidence directory, `hhwx-mobile.png` (390 x 844, DPR 1).
- Dark capture: same evidence directory, `hhwx-dark.png` (929 x 861, DPR 1).
- Browser: Chrome DevTools MCP. The in-app browser had repeatedly timed out during the preceding design iterations. Screenshot file export was denied by the tool's workspace mapping; its returned image bytes were saved unchanged through the local filesystem tools.
- State: Chinese, signed out, CN event 322, event ranking T1000. Live scores, timestamps and progress naturally differ from the generated mock.

## Visual comparison

The selected reference and final desktop capture were opened together for comparison. The negligible frame-size difference was recorded rather than resizing UI or changing the existing responsive layout. Existing layout, functional controls, chart internals and dark mode take precedence over incidental variations in the generated mock, as agreed with the user.

| Surface | Result |
| --- | --- |
| Typography and content | Existing fonts, sizes, labels, event banner and live data retained. Red title, blue functional accents and text hierarchy remain readable. |
| Layout and spacing | Main panel positions, dimensions and padding match the pre-change application. Outer panels are square, white and lightly bordered. |
| Colors and tokens | Broad warm-white center with continuous diagonal yellow/pale-yellow/white corner bands; pale-yellow navigation selection and orange indicator. Orange toolbar retained. |
| Assets | White site LOGO derived from `src/app/icon.png`, preserving the source geometry and negative space. The generated mock's inaccurate decorative mark is intentionally not reproduced. |
| Controls and layers | Existing toolbar button computed styles unchanged. Background decoration uses non-interactive body pseudo-elements without creating a new app stacking context. |

Initial review covered toolbar buttons, selected navigation, panel edges, the event banner frame and the derived LOGO on a yellow backing. It missed the diagonal hairlines and overly sparse background identified in the user's subsequent screenshot; those were corrected below. Individual comment cards and other pages' panels were not redesigned in this first rollout.

## Background refinement after user review

- The orange diagonal hairlines came from hard-stop, one-pixel gradient strokes. Removed these strokes and their orange token; continuous ribbons now have actual width and one-pixel color transitions at their edges.
- Expanded both corner compositions using unequal yellow, soft-yellow, pale-yellow and white bands. A very pale intermediate band connects each group to the warm-white center. Existing LOGO geometry, placement, controls and panel styling were retained.
- Updated captures in the evidence directory above: `hhwx-background-v2-desktop.png` (1920 x 911, DPR 1, matching the user's browser content area) and `hhwx-background-v2-mobile.png` (390 x 844, DPR 1). Visual inspection confirmed the circled orange hairlines were absent and the wider ribbons remained continuous.
- At 1842 x 854, light-mode chart styles/tokens, panel styles/rectangles, toolbar and navigation matched the state immediately before this refinement. Dark-mode styles also matched after responsive/color transitions settled; only the live comment section's height differed by 1.25 px.
- Mobile client width and scroll width both remained 390 px; decorative layers retained `pointer-events: none`. No browser console errors or warnings were observed.
- `npm run build` passed after the CSS refinement. Earlier lint/typecheck evidence remains applicable to the unchanged TypeScript files. No new application logic, dependency, chart styling or dark-mode rule was introduced.

## Iterations and verification

- The first mobile drawer check exposed the old saturated yellow backdrop. It was replaced with a white drawer and a neutral translucent backdrop; a subsequent 390 px screenshot verified the visible selection and overlay.
- The initial decorative layer used app isolation. It was moved to body pseudo-elements to preserve existing modal/header stacking; the final desktop comparison verified both LOGOs remained visible.
- Light-mode comparison: all 174 chart-subtree elements' captured style properties, chart color tokens, outer panel rectangles and toolbar controls matched the pre-change baseline.
- Dark-mode comparison: chart, outer-panel, toolbar, navigation and canvas styles matched the pre-change baseline. Decorative pseudo-elements are absent. A small comment-section height difference followed live content/image loading; the first four panel rectangles were identical.
- Mobile page width and scroll width both measured 390 px. Navigation opened and closed; switching to Activity Information updated the URL and rendered the overview/rewards/songs, then switching back restored the tracker.
- Long-page comment-area inspection verified the fixed background and non-obstructing decoration. Team-builder shell smoke check rendered meaningful content without horizontal overflow or console errors.
- No relevant browser console warnings/errors or framework error overlay were observed. The development toolbar is present in local screenshots.
- Passed: targeted ESLint for changed components and the logo script; `npm run typecheck`; final `npm run build`; `git diff --check`.
- `node scripts/build-smile-patrol-logo.mjs` generated the repository asset and verified both solid geometry and transparent cutouts. No runtime dependency was added.

## Remaining coverage

Chromium desktop/mobile emulation was exercised; Safari and Firefox were not. Authenticated comment submission and optimizer execution were outside this visual-only scope. Stars remain a separate future design decision. No production deployment was performed.

---

# Display Degree Design QA

## Comparison target

- Source visual truth:
  - `C:\Users\bluew\AppData\Local\Temp\codex-clipboard-19f6bc45-36e0-47b7-bfba-0930c9c7400e.png` (account-center identity card and requested insertion point)
  - `C:\Users\bluew\AppData\Local\Temp\codex-clipboard-da6c663a-5be7-4cc4-acce-a888f367b7d9.png` (team-builder profile-card visual language used only as the account-selector style reference)
  - `C:\Users\bluew\AppData\Local\Temp\codex-clipboard-3f6dff89-8fea-4965-9e71-36c902bf7dbc.png` (authoritative ranking-Degree layer geometry)
- Rendered implementation before the final size-only refinement:
  - `C:\Users\bluew\.codex\visualizations\2026\08\15\01a00701-7fad-7b83-aecc-de0004d42023\account-degree-saved-desktop.png`
  - `C:\Users\bluew\.codex\visualizations\2026\08\15\01a00701-7fad-7b83-aecc-de0004d42023\account-degree-mobile.png`
  - `C:\Users\bluew\.codex\visualizations\2026\08\15\01a00701-7fad-7b83-aecc-de0004d42023\account-degree-picker-desktop-post-fix.png`
  - `C:\Users\bluew\.codex\visualizations\2026\08\15\01a00701-7fad-7b83-aecc-de0004d42023\account-degree-picker-empty-account-mobile.png`
- Final focused ranking-Degree evidence:
  - `C:\Users\bluew\AppData\Local\Temp\hhwx-degree-ranking-same-origin.png`
  - `C:\Users\bluew\AppData\Local\Temp\hhwx-degree-ranking-comparison.png`
- Local implementation URL: `http://localhost:3001/account`
- Local asset source during browser QA: `http://localhost:4000` via a process-only `NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL` override, because the production CDN CORS policy permits `http://localhost:3000` but not the worktree's port 3001; no repository environment file was changed
- State: authenticated, verified local QA user; CN binding selected; `It's MyGO!!!!! TOP500` draft-selected only for the focused capture, then cancelled without saving

## Viewport and density normalization

| Artifact | Pixels | CSS viewport / crop | Density handling |
| --- | ---: | ---: | --- |
| Account source | 485 x 269 | Annotated crop, not a complete browser viewport | Compared as a focused identity-card region |
| Account desktop implementation | 1092 x 893 | 1100 x 900 viewport override | Browser capture at device scale 1; scrollbar/chrome account for the small pixel delta |
| Account mobile implementation | 477 x 747 | 485 x 760 viewport override | Browser capture at device scale 1; compared at the same nominal width as the account source |
| Picker style source | 996 x 300 | Related team-builder surface, not the final dialog state | Used for card geometry, border, spacing, server icon, and UID hierarchy only |
| Picker desktop implementation | 1100 x 900 | 1100 x 900 viewport override | Browser capture at device scale 1 |
| Picker mobile empty-state implementation | 477 x 747 | 485 x 760 viewport override | Browser capture at device scale 1 |
| Ranking layout source | 2532 x 1170 | 319 x 69 focused title region | Source render normalized from about 1.385x to the 115 x 25 CSS target |
| Ranking implementation | 190 x 95 | 115 x 25 Degree inside the focused capture | Chrome viewport 1920 x 911, device scale 1; compared at an equal 115 x 25 footprint |

The two sources describe different product states from the new selector, so a pixel overlay would create false precision. The source and implementation were opened together in the same comparison inputs, and the comparison was normalized around the focused card regions and the explicitly requested visual language.

## Full-view comparison evidence

- The account card preserves the existing HHWX blue identity surface, large radius, white primary type, subdued email, UID pill, avatar control, and verification badge.
- The Degree sits directly below the UID and to the right of the avatar, matching the annotated insertion point without disturbing the existing profile-entry cards. After the interaction pass, the shared display box was reduced from 230 x 50 to the final 115 x 25 at the user's request.
- The dialog keeps the account selector visually close to the team-builder cards: white surfaces, subtle border/shadow, server SVG, bold UID, and a sky selected outline. It deliberately omits profile name, card count, sync date, and cloud badge because the new control selects a bound account rather than a saved profile.
- At 485 px the identity card and Degree remain unclipped. The dialog becomes a one-column account and Degree list with a persistent footer and internal scrolling.

## Focused region comparison evidence

- Account identity region: compared the 485 px source crop against `account-degree-mobile.png`. Avatar, name/email/UID hierarchy, blue radius, and the requested below-UID Degree placement remained legible and balanced before the final size-only refinement.
- Account-selector region: compared the team-builder source against `account-degree-picker-desktop-post-fix.png`. Card height, radius, border weight, server icon scale, UID emphasis, two-column desktop grid, and selected outline carry over; the simplified content is intentional.
- Ranking-Degree region: matched the exact `It's MyGO!!!!! TOP500` base, rank, and crown resources from the implementation against the same title in the ranking-layout source. The source crown and 230 x 50 body share the same top-left origin; a zero-pixel native offset was the best pixel match. The final browser capture was normalized beside the source in `hhwx-degree-ranking-comparison.png`.
- Asset fidelity: the account cards use the existing `BandoriServerIcon` SVG assets. Every title uses the real Bandori Degree base/rank/icon resources or animation atlas; there are no hand-drawn or placeholder replacements.

## Required fidelity surfaces

- Fonts and typography: existing HHWX font stack and account hierarchy are unchanged. Dialog title, section labels, UIDs, helper copy, and button text use the established weights and line heights; no clipping or awkward wrapping was observed at either viewport.
- Spacing and layout rhythm: every Degree keeps the final 115 x 25 footprint. Ranking base and rank layers fill that box; the 25 x 25 crown layer starts at the same `left: 0; top: 0` coordinate and is painted above them. Its own transparent and grey connector pixels create the intended protruding-crown silhouette without expanding or offsetting the layout box. Desktop uses two account columns and up to three Degree columns; mobile collapses cleanly to one column. Radii, gaps, borders, and footer spacing match nearby account UI.
- Colors and tokens: existing blue identity-card color is preserved. White/light-slate selector surfaces and sky selected states match the supplied profile-card reference and maintain clear disabled/empty contrast.
- Image quality and asset fidelity: static PNG descriptors remain sharp and contained at native aspect ratio. Dynamic atlases render through the existing canvas implementation and hold the first frame when inactive or reduced motion applies.
- Copy and content: account grouping and selector copy are concise. Empty accounts and the empty list use the approved exact text `暂无可用称号`. JP Degree 100 is not exposed as a synthetic option and there is no reset control.

## Interaction and accessibility evidence

- Flow tested: `/account` -> click current Degree -> inspect grouped bound accounts -> select a different dynamic Degree -> save -> dialog closes -> account card updates.
- Save is disabled while the draft is unchanged and enabled after selection.
- Cancel discards the draft and preserves the saved Degree.
- The empty binding remains visible, is greyed, and displays `暂无可用称号`.
- The selected dynamic Degree changes rendered frames while active; inactive animations hold the first frame. Offscreen, page-visibility, and reduced-motion behavior remains delegated to `BandoriAtlasAnimationCanvas`.
- Post-fix dialog behavior: Escape closes the dialog, Shift+Tab wraps from the close button to the final enabled control, outside content is inert while open, and focus returns to the trigger.
- Page identity was `账号中心 - HHWX`; the page was non-blank; no Next.js error overlay appeared; Browser console error/warn log was empty after the final interaction pass.

## Comparison history

### Pass 1

- [P2] The custom portal dialog matched the visual reference but did not provide a focus trap or Escape-to-close behavior.
  - Impact: keyboard users could move focus behind the modal and could not use the conventional Escape shortcut.
  - Fix: replaced the custom portal semantics with the repository's existing Radix Dialog primitive, kept the same visual composition, added an explicit close label, and added pressed-state semantics to account cards.

### Pass 2

- Post-fix evidence: `account-degree-picker-desktop-post-fix.png` shows the unchanged visual composition with the Radix dialog active.
- Browser DOM and interaction evidence confirmed that background controls were inert, Shift+Tab wrapped to Cancel, Escape closed the dialog, and the trigger returned to the closed state.
- No remaining actionable P0, P1, or P2 findings.

### Pass 3

- [P2] The first ranking-Degree fix treated the crown as an external badge and shifted the 230 x 50 body right by 25 native pixels, producing a 127.5 x 25 outer footprint at the account size.
  - Evidence: this disagreed with the supplied game screenshot, where the crown resource's grey connector occupies the body's left edge rather than extending the layout box.
  - Fix: measured the exact source assets and screenshot instead of retaining the half-overlap estimate.

### Pass 4

- Source matching located the crown resource at approximately `(593, 627)` and about `1.385x` scale. Compositing the 50 x 50 crown and 230 x 50 body at a zero-pixel native offset produced the best match; even a one-pixel body shift increased the pixel error.
- Browser geometry for the final implementation measured base and rank at `(1225.15625, 454.5)`, 115 x 25, and the crown at the same `(1225.15625, 454.5)` origin, 25 x 25.
- `hhwx-degree-ranking-comparison.png` contains the equal-size source and final implementation crops. No actionable P0, P1, or P2 geometry mismatch remains.

## Findings

- No actionable P0, P1, or P2 visual, responsive, interaction, accessibility, asset, or copy differences remain.
- The final requested size is enforced as one 115 x 25 box by the shared `BandoriDegreeView` and the account-card fallback. Ranking base, rank, and crown layers share the same origin; the crown remains square at 25 x 25 and overlays the body's left edge. A focused source regression test rejects the earlier 230 x 50 classes, the incorrect shared aspect-ratio box, and any ranking-only width expansion. The underlying static and animated resources retain their original resolution.

## Primary interactions tested

1. Authenticated account card renders the stored default JP Degree 100.
2. Dialog loads every binding in stable UID order and initially selects the first account owning the saved Degree.
3. A valid static Degree and two dynamic Degrees render from the public Degree catalog.
4. Dynamic draft selection enables Save; save persists and updates the account card.
5. Cancel discards a later draft.
6. Empty account grouping, mobile layout, internal dialog scrolling, fixed footer, Escape, and keyboard focus wrapping work.

## Comment Display Degree QA

### Comparison target

- Source visual truth: `C:\Users\bluew\AppData\Local\Temp\codex-clipboard-445f5270-596f-47c4-9f79-892de6efe589.png` (the requested second line below the author metadata)
- Desktop implementation: `C:\Users\bluew\.codex\visualizations\2026\08\15\01a00701-7fad-7b83-aecc-de0004d42023\comment-degree-preview-desktop-3px.png`
- Narrow implementation: `C:\Users\bluew\.codex\visualizations\2026\08\15\01a00701-7fad-7b83-aecc-de0004d42023\comment-degree-preview-mobile-3px.png`
- Local implementation URL: `http://localhost:3001/bandori/cards/595?server=cn&page=1`
- State: authenticated local QA user; one public card comment; dynamic CN Degree 20099 selected

| Artifact | Pixels | Viewport / crop | Comparison use |
| --- | ---: | ---: | --- |
| Comment source | 258 x 75 | Focused annotated crop | Author avatar, first-line metadata, and requested second-line placement |
| Desktop implementation | 1092 x 893 | Default in-app browser viewport | Full page and comment-card relationship |
| Narrow implementation | 477 x 747 | 485 x 760 viewport override | Wrapping, clipping, and horizontal-overflow check |

The source and final desktop capture were opened together in the same comparison input. The source is an annotated crop rather than a complete screen, so fidelity was evaluated around the author header rather than by pixel overlay.

### Layout and asset evidence

- The author area now has two explicit rows to the right of the avatar: nickname and timestamp on the first row, the Degree on the second.
- The comment variant is one 92 x 20 box for both ordinary and ranking Degrees. Ranking icons remain 20 x 20 and share the body's top-left origin, so they do not increase the footprint. Its two 20 px rows plus the final 3 px inter-row gap fit inside the existing 44 px avatar/header minimum, so a normal one-line author header does not gain vertical height from the Degree. The 43 px group remains vertically centered by the header's flex alignment.
- The account-center variant remains 115 x 25; the compact size is scoped to comments and does not silently change the selector or account card.
- The captured dynamic Degree rendered through the existing canvas path at 92 x 20 with the correct accessible name. Static Degrees use the same catalog mapping and image path.
- The comment thread loads one shared Degree catalog and resolves all author selections from that map. Each comment does not create an independent catalog request.
- At 485 px the Degree, metadata, content, and actions remain inside the comment card without horizontal overflow or clipping.

### Behavior and regression evidence

- The comment API returns the author's current `display_degree_server` and `display_degree_id`; existing comments therefore follow the latest account-center selection instead of storing a publish-time snapshot.
- Refreshing the comment list preserved the comment and Degree.
- Dynamic rendering retains the existing offscreen, page-visibility, and reduced-motion controls. The QA browser exposed the resource through the canvas path; a static capture is expected when reduced motion or an unchanged animation frame applies.
- Page identity was `山吹 沙绫 - 点缀 卡牌图鉴 - HHWX`; the page was non-blank; no Next.js error overlay appeared; the final browser console error/warn log was empty.
- Focused comment contract, UI regression, account Degree, Degree catalog, Supabase, type-check, lint, and production-build validation passed. Lint retained 30 pre-existing warnings and introduced no errors.

### Comment findings

- No actionable P0, P1, or P2 visual, responsive, data-contract, accessibility, or asset-fidelity differences remain.
- The single 92 x 20 footprint is legible at both tested widths and satisfies the requirement not to add height to the common one-line comment header. Further reduction is not needed for this layout.

final result: passed

---

# Chart Simulator Controls Design QA

## Comparison target

- Game control references:
  - `C:/Users/bluew/AppData/Local/Temp/codex-clipboard-39a38488-2222-4cdf-aba8-908999e983fa.png`
  - `C:/Users/bluew/AppData/Local/Temp/codex-clipboard-9fa3c9e0-70db-4832-9ec8-b0922ce8b490.png`
- Existing HHWX product references:
  - `C:/Users/bluew/.codex/visualizations/2026/08/23/01a02dda-1b7c-74e2-a50f-33d9b06df9f4/song-simulator-audit/05-cards-controls-reference.png`
  - `C:/Users/bluew/.codex/visualizations/2026/08/23/01a02dda-1b7c-74e2-a50f-33d9b06df9f4/song-simulator-audit/06-events-tabs-reference.png`
- Final full-page implementation:
  - `C:/Users/bluew/.codex/visualizations/2026/08/23/01a02dda-1b7c-74e2-a50f-33d9b06df9f4/song-simulator-implementation/09-full-page-final.png`
- Combined focused control comparison:
  - `C:/Users/bluew/.codex/visualizations/2026/08/23/01a02dda-1b7c-74e2-a50f-33d9b06df9f4/song-simulator-implementation/06-focused-comparison.png`
- Combined HHWX system comparison:
  - `C:/Users/bluew/.codex/visualizations/2026/08/23/01a02dda-1b7c-74e2-a50f-33d9b06df9f4/song-simulator-implementation/10-system-comparison.png`
- Mobile implementation after the responsive correction:
  - `C:/Users/bluew/.codex/visualizations/2026/08/23/01a02dda-1b7c-74e2-a50f-33d9b06df9f4/song-simulator-implementation/08-mobile-loop-effects-final.png`
- Local route: `http://localhost:3000/bandori/songs/359?difficulty=special&view=simulator`
- State: Chinese locale, light theme, song 359 SPECIAL, simulator resources ready, playback paused, full-song loop range, ordinary skin settings selected

## Viewport and state

- Desktop captures use the in-app browser's default 1272 x 718 viewport; the final full-page capture is 1272 x 3187.
- The responsive pass uses a temporary 390 x 844 viewport override and restores the default browser viewport after capture.
- Reference screenshots describe the game control hierarchy and existing HHWX visual system rather than a pixel-identical complete simulator page. Fidelity is judged at the relevant controls and product-system surfaces.

## Full-view comparison evidence

- The simulator preserves the existing white rounded HHWX surfaces, subtle borders and shadows, orange primary action, deep-teal secondary controls, and red first-level tab emphasis.
- The effect and skin groups remain in their approved order and stay expanded at the bottom of the page.
- The skin choice grid uses the same compact rounded-choice language as Cards filters, including a deep-teal selected state and neutral unselected state.
- The song-detail top tab continues the established Events-style first-level tab treatment instead of introducing a simulator-only navigation pattern.

## Focused control comparison evidence

- Note speed uses the requested seven-part `double chevron / chevron / minus / value / plus / chevron / double chevron` hierarchy. Playback speed uses the approved five-part subset.
- Visible controls contain icons only; step magnitudes are exposed through accessible names and are not rendered as `+0.50`-style labels.
- The controls retain the game reference's square rounded button rhythm while applying HHWX's deep-teal action tokens instead of copying the source's pink.
- Switches use real `role="switch"` semantics, visible on/off text, a neutral off state, and a deep-teal active state.
- Playback time renders to three decimal places, and the loop timeline uses fixed deep-teal boundary indicators plus a translucent selected span.

## Interaction and accessibility evidence

- Note-speed `+0.01` changed `10.00` to `10.01`, and the inverse control restored the original value.
- Automatic loop and simultaneous-line switches updated both `aria-checked` and their visible state labels, then restored their original settings.
- Applying `10.000-20.000` updated the loop range and timeline positions. Reset immediately restored `0.000-108.480` without changing the loop mode or switch state.
- Playback advanced to `0:01.251 / 1:48.480`, the pause action returned the control to Play, and the millisecond display remained stable.
- Browser logs contained no runtime errors, missing-message failures, or Next.js error overlay in the final state.

## Comparison history

### Pass 1

- [P2] The seven-part note-speed control overflowed the effect card at 390 px and exposed a horizontal scrollbar.
- Fix: reduced only the narrow-viewport button width, value width, and gap while retaining 40 px control height and the full desktop sizing.

### Pass 2

- The 390 x 844 recapture shows the complete seven-part control on one line without clipping or horizontal scrolling.
- No remaining actionable P0, P1, or P2 visual, responsive, interaction, accessibility, copy, or system-alignment findings were observed.

final result: passed

---

# Simulator Skin Controls Design QA

## Evidence

- Source visual truth: `C:/Users/bluew/AppData/Local/Temp/codex-clipboard-4f4896d5-8f18-4620-9d52-5971854c9ecd.png`
- Browser-rendered implementation: `C:/Users/bluew/.codex/visualizations/2026/08/16/01a00c88-d223-7962-a332-c648184cf7e0/simulator-skin-controls-viewport.png`
- Focused implementation crop: `C:/Users/bluew/.codex/visualizations/2026/08/16/01a00c88-d223-7962-a332-c648184cf7e0/simulator-skin-controls-implementation-crop.png`
- Combined comparison: `C:/Users/bluew/.codex/visualizations/2026/08/16/01a00c88-d223-7962-a332-c648184cf7e0/simulator-skin-controls-comparison.png`
- Local route: `http://localhost:3000/bandori/songs/1`
- Requested CSS viewport: `1568×827`, device pixel ratio `1`
- Source bitmap: `1600×827`; implementation viewport bitmap: `1560×823`
- Focused source crop: `1460×310`; focused implementation crop: `1142×363`
- Density normalization: none. Both crops were compared at their captured one-pixel density; the narrower implementation width is the existing HHWX content-container constraint, not an image scaling artifact.
- State: Chinese locale, light theme, simulator stage ready, default field/note/directional skins selected, page scrolled to the style controls.

## Comparison Scope

The reference supplies an organization target rather than a full HHWX page target. Full-page composition, background, navigation, palette, and typography remain governed by the existing HHWX design system. The valid full-view comparison is therefore the four-row selector region: note style, directional Flick style, paired field/judgment-line style, and background.

The focused combined comparison confirms the same left-label/right-choice hierarchy, the same row order, wrapping for the long field-skin list, visible selected states, and a single `skin00` background choice. A separate finer crop is unnecessary because all labels and button states are legible in the focused comparison.

## Required Fidelity Surfaces

- Fonts and typography: the implementation keeps HHWX's established font, weight, and text hierarchy. It does not copy Bestdori typography; this is intentional because only the organization was requested.
- Spacing and layout rhythm: four aligned rows, a stable label column, wrapping choice groups, and consistent row gaps are present. The implementation is narrower because it remains inside the existing song-detail content container.
- Colors and visual tokens: existing HHWX surface, border, focus, and pressed-state tokens are retained. Bestdori's blue selection treatment is not imported as a new visual parameter.
- Image quality and asset fidelity: these controls contain no imagery or non-standard icons, so no asset substitution is involved.
- Copy and content: TYPE1–TYPE7, TYPE1–TYPE5, all 15 master-ordered field labels, and the sole `skin00` background choice are present. The paired field/judgment-line label makes the runtime coupling explicit.

## Findings

No actionable P0, P1, or P2 differences were found for the approved organization-only target.

Intentional differences:

- HHWX theme tokens, rounded controls, content width, and typography remain unchanged.
- The background row contains only `skin00`, as explicitly requested.
- Controls outside the four approved style selectors are not cloned from the reference.

## Comparison History

- Pass 1: no P0/P1/P2 finding; no visual fix was required.

## Static Verification

- The four groups and all expected labels were present in the rendered DOM.
- The default selections were visible as pressed states.
- The browser console contained no errors or warnings in the captured state.
- Interaction testing was intentionally omitted at the user's request; the implementation is covered by source contracts and focused tests instead.

## Implementation Checklist

- [x] Keep the four selector rows in reference order.
- [x] Preserve the existing HHWX visual system.
- [x] Keep background limited to one selected `skin00` button.
- [x] Keep unverified simulator capabilities disabled.

final result: passed

</details>
