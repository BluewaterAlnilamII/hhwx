# Theme guide

中文说明见 [theme-guide.zh-CN.md](theme-guide.zh-CN.md).

This is the current contract for Smile Patrol's light and dark web UI. CSS is the executable source of truth; this guide explains ownership and intended use. [design-qa.md](../design-qa.md) is a historical record, including superseded alternatives, rather than a second specification.

## Configuration and ownership

The locale [layout](../src/app/[locale]/layout.tsx) imports `globals.css` and selects `data-visual-theme="smile-patrol"`. `globals.css` imports Tailwind and `visual-theme/index.css`; the latter imports recipes before Smile Patrol. Light/dark mode follows the browser's `prefers-color-scheme`. There is no separate application theme toggle or JavaScript palette.

| Layer | Edit here | Responsibility |
| --- | --- | --- |
| Fixed palette and seed assignments | [smile-patrol.css](../src/app/visual-theme/smile-patrol.css) | Nine HHW accent colors, neutral/functional inputs and theme effects |
| Shared semantic defaults | [recipes.css](../src/app/visual-theme/recipes.css) | Theme-independent role relationships and paired action colors |
| Current theme and scheme values | [smile-patrol.css](../src/app/visual-theme/smile-patrol.css) | Base values followed by light/dark media overrides; dark native controls use `color-scheme: dark` |
| Shared appearance | [globals.css](../src/app/globals.css) | `hhwx-*` classes consuming roles; components retain their dimensions and layout |

Components use `--theme-color-*`, `--theme-shadow-*` and shared appearance classes. They must not read `--theme-seed-*` or private `--smile-patrol-*` inputs. Do not add local site-color literals or `dark:` overrides to compensate for a missing role. Introduce a role only when an existing role cannot express a real responsibility.

The shared appearance classes are in Tailwind's `components` layer. Utilities can override that layer: remove competing local background, foreground, border or shadow utilities when a shared class owns them. Use explicit color hints such as `outline-[color:var(--theme-color-selection-subtle-ring)]` when Tailwind could confuse a color with a width.

## Palette responsibilities

Smile Patrol paints its page canvas in a fixed viewport layer, not with `background-attachment: fixed`. The layer uses the large viewport height so document growth and mobile browser chrome changes do not resize the pattern; the existing fixed logo decorations stay above it.

The nine HHW accent seeds are fixed. Neutrals and functional success/warning/danger inputs are separate; they are not additional HHW brand seeds. Seed use is judged by purpose, not equal area or frequency.

| Fixed HHW seed | Light use | Dark use |
| --- | --- | --- |
| `#FFEE22` bright yellow | Sunny canvas band mix | Kept in the palette; no forced bright-yellow fill |
| `#FF9922` orange | Header, loading indicator, diagonal mix | Loading indicator |
| `#44DDFF` sky blue | 15% of the derived operation fill | Operation text/icons, outlines, selected tabs and keyboard focus |
| `#AA33CC` purple | Decoration slot B | Lightened decoration slot B |
| `#006699` blue | Information and operation ink/outlines, 85% of operation fill, profile banner, scrollbar, decoration C | Profile banner; lightened information ink, decoration C and silver canvas mix |
| `#F5A4CD` pink | Reserved; not used for ordinary text | Page headings |
| `#F9E065` soft yellow | Canvas bands and navigation | Restrained current-navigation accent |
| `#EF392B` red | Page headings and derived rest-day text | Lightened rest-day text |
| `#F35E38` red-orange | Toolbar icon and decoration A | Lightened toolbar icon and decoration A |

Information uses HHW blue `#006699` in light mode and a 50% mix of HHW blue and white in dark mode. Light operation text/outlines also use `#006699`; operation fills mix 15% sky blue with 85% HHW blue (approximately `#0A78A8`). Information and operation roles remain separate even where values match. Dark operations use `#44DDFF` for text/outlines and `#0070A0` for solid fills with inverse ink. These are two treatments of the same operation category, not two additional semantic categories. Status ink may brighten independently of solid fills. Pink is a heading accent, not an error color.

## Current role pairs

Values below are the current configuration, not literals to copy into components. Mixed colors are rounded to their nearest hex value for reference.

| Role / surface | Light | Dark |
| --- | --- | --- |
| Canvas base | `#FAF8F4`, sunny yellow bands | `#121C26`, ink-blue bands and silver-blue lines |
| Panel | `#FCFCFC` | `#1C2936` |
| Control | `#FFFFFF` | `#283947` |
| Floating surface | `#FCFCFC` | `#304250` |
| Chart plot / axis | `#FFFFFF` / `#FFFEF4` | Both `#192532` |
| Body / muted text | `#0F172A` / `#475569` | `#E9F0F5` / `#A9BDCA` |
| Page heading | `#EF392B` | `#F5A4CD` |
| Information ink and passive progress fill | `#006699` | Approximately `#80B3CC` |
| Operation text / outline | `#006699` | `#44DDFF` |
| Quiet selection background / text | White / `#006699` | Control background / `#44DDFF` |
| Strong selection and solid blue operation | Approximately `#0A78A8` / `#FFFEF4` | `#0070A0` / `#E9F0F5` |
| Interactive seek / volume fill | Same as solid blue operation | Same as solid blue operation |
| Custom range track / thumb edge | `#E5E9EC` / white | `#08111A` / white |
| Solid success action | `#008348` / `#FFFEF4` | `#008348` / `#FFFFFF` |
| Solid danger action | `#E0002F` / `#FFFEF4` | `#E0002F` / `#FFFFFF` |
| Primary action | Same blue fill and inverse ink as solid blue operation | Same blue fill and inverse ink as solid blue operation |
| Selected tab and standard focus | Operation blue | Sky blue |

The legacy `--theme-seed-surface: #FFFEF4` still supplies light chart-axis and other base recipes. Independent inverse ink also uses that value in light mode. Neither is the content-panel source. `--smile-patrol-content-surface` owns light panel/floating content; the dark panel currently inherits the dark surface role. `--theme-seed-shell-canvas: #FFEA2F` is a legacy input still used by light toolbar icon hover; the actual canvas has its own explicit role. Do not mass-replace these values to change panels.

## Component rules and exceptions

Make the interface understandable through layout, hierarchy, grouping, and familiar controls. Omit decorative slogans, redundant explanations, and secondary labels. If removing them makes a flow unclear, redesign the affected composition instead of adding explanatory filler. Keep necessary action names, validation, domain information, and accessible labels.

| Purpose | Use |
| --- | --- |
| Page panel | `hhwx-panel`; nested content uses the panel background with its own geometry |
| Song Meta table | Compact and full tables share `hhwx-meta-table` and `table-*` roles: a quiet header, alternating visible rows, subtle separators, and row feedback on hover-capable input or visible keyboard focus. Smile Patrol uses restrained cool-blue fills in light mode and lifted blue surfaces in dark mode. Header labels are smaller and lighter than song titles; numeric cells and their headers stay centered. |
| Neutral button/input | `hhwx-control`, including selected and disabled states where applicable |
| Solid blue operation | `hhwx-action-accent`, or the matching `action-accent-background` / `foreground` pair in custom controls |
| Quiet operation, link or reply/expand button | `action-secondary-*`; neutral or lightly tinted surface, operation text and border |
| Content-title link in compact song cards and Song Meta tables | `hhwx-title-link` uses default text color, an underline on hover, and an underline plus the standard outline on visible keyboard focus. Compact and catalog Meta titles share this appearance; group headings retain their own color role. |
| Bandori difficulty badges | Cards, details and Meta use the shared `hhwx-bandori-difficulty` appearance: solid blue / green / yellow / red / magenta for EASY / NORMAL / HARD / EXPERT / SPECIAL, with the existing `rounded-lg` (8 px) corners shared by song play/pause buttons. Meta badges are 22 px on narrow layouts and 24 px on wide layouts. The fills slightly soften the game's color identities while retaining distinct hues and solid color. Green and yellow use dark ink; the other fills use white. These domain colors stay fixed in both schemes. Missing charts retain a pale neutral cross. Other games keep their own presentation. |
| Solid success or danger action | Matching `action-success-*` or `action-danger-*` background/foreground pair; hover keeps the same fill unless separately configured |
| Quiet destructive action | Existing `action-destructive-*` roles; these use a quiet surface, distinct from solid danger feedback |
| Floating menu, help, tooltip or dialog | `hhwx-floating-surface`, or matching floating roles when geometry is specialized |
| Chat message canvas and own bubbles | `chat-background` and paired `chat-own-background` / `chat-own-foreground`; others use control fill and default text. Smile Patrol mixes cyan into the control fill for own bubbles, inheriting the active light/dark roles. |
| Explicit chat mentions | `chat-mention-background` / `chat-mention-foreground` provide the same blue treatment in drafts and sent text. `chat-mentioned-background` / `chat-mentioned-accent` mark the whole message from another account mentioning the viewer, independently of read state. Smile Patrol uses soft yellow, with a warm dark surface; these are attention roles, not warning statuses. |
| Chat mention notification | A compact floating surface emerges below the dialog header. Only the sender uses `chat-mention-foreground`; the suffix uses normal text and the time uses muted text. `--theme-shadow-chat-mention-card` supplies the lower edge and shallow elevation. Entry/retraction respect reduced motion, while consecutive mentions keep the same card position. |
| Chat message feedback | `chat-row-hover` marks fine-pointer hover and the target of an open message menu/reaction picker; `chat-row-locate` briefly emphasizes a navigation target without an outline. Mentioned rows use `chat-mentioned-hover` / `chat-mentioned-locate` to retain warm yellow. Normal backdrops extend 3 px above and below the row content; mentioned rows keep their original bounds and gaps. The same row defines the message context-menu/long-press hit area, while independent controls own their gestures. An independent fading layer reveals the current hover/menu/base state underneath. Button press scaling is scoped to chat and disabled with reduced motion; keyboard focus indicators stay intact. |
| Selection / focus | Their respective roles; these are separate responsibilities even when colors match |
| Passive progress, such as event completion | `progress-*` information roles |
| Draggable seek and volume | `action-accent-background` for fill/accent, matching the play button; custom tracks use `range-track-background` |

Never use status **text** or **border** roles, or a progress fill, as the background behind inverse button text. A status dot can legitimately use status ink; a labeled solid button requires a complete pair. For example:

```tsx
className="bg-[var(--theme-color-action-success-background)] text-[var(--theme-color-action-success-foreground)]"
```

Standard focus rings, outlines and focus borders use `--theme-color-focus-ring`. Ring offsets follow the containing surface. The remaining `focus-ring-on-dark` / information-on-dark recipe serves the colored toolbar; fixed blue profile banners and media overlays may retain their contrasting inverse focus treatment. These surface-specific exceptions do not select the application color scheme. The remaining muted-on-dark alias serves chart ink.

Keep compact ranking-button dimensions, rings and spacing; do not add a checkmark slot. Native dropdowns retain neutral surfaces and do not inherit a blue selected-container fill. Geometry does not change with color scheme.

Apply these roles to secondary states too: operation hover uses action roles, selected options/tabs use selection/tab roles, and informational notices and unread dots keep information roles. Image-loading and unavailable-image placeholders use `control-background-muted` with `text-muted`; they are UI feedback, not domain artwork. Do not reduce muted tooltip text opacity without checking its composited contrast on the floating surface.

Keep the existing white custom range-thumb edges in both schemes. Native volume controls retain their native geometry; their accent follows the solid operation fill. Do not make draggable media progress inherit passive event-progress colors.

Band colors, card artwork, chart-series identities, game pieces and fixed media-overlay ink belong to their content domains. The remaining local `dark:` utilities cover chart-series red/blue text; they are not examples for ordinary site controls. Preserve the actual logo silhouette when changing its decorative treatment. Stamp sound badges use the complete official `icon_voice_stamp` PNG at the artwork's bottom right, at 24% of the rendered artwork width, without a CSS disc, ring, or recoloring. Artwork and badge share one coordinate plane sized to the image or animation aspect ratio, then scale together to fit the available space; button padding and layout letterboxing are outside that plane. Pickers and comment/reward views show it whenever `voiceUrl` exists, including changed-stamp sound effects; chat playback retains its normal-voiced-stamp condition.

The shared stamp picker keeps four image columns at every width. Below `sm`, categories form one horizontal strip below the stamp grid; at `sm` and above, they form a left sidebar. Server selection stays at the top at every width. All and Favorites stay fixed while the eight band icons and Other scroll independently of the stamp grid. Favorite stars occupy the top right: always visible on mobile/touch and for saved stamps, otherwise revealed by hover or keyboard focus. The visible disc is 20 px with a 14 px star, while its hit area stays 32 px on mobile and 28 px on desktop. Saved stars and the Favorites category icon use a solid yellow `stamp-favorite` role in both color schemes. Category glyphs are 20 px and band artwork is 24 px inside adjacent 40 px buttons. A 2 px divider separates All/Favorites from the scrollable categories, horizontal on desktop and vertical on mobile. Selecting a star never selects or sends the stamp; there is no context-menu or long-press action. Favorites are browser-local, shared across comment/chat pickers, shown in catalog order (ascending ID, normal before changed for the same ID), and distinguish region, ID and normal/changed kind. Reopening or editing favorites reads the latest browser storage so stale tabs do not overwrite each other; failed writes retain local edits until a later successful edit persists them. Region, category, category-strip offsets and the current category's stamp anchors persist for the current browser-tab session, including close/reopen and reloads. Switching categories discards saved grid positions so the new category starts at the top, including when returning to a previously visited category; missing catalog entries do not delete favorites. The picker uses the existing band icons and character groups without new backend metadata.

Calendar bars retain band identity, white labels and no added colored outlines. Dark mode shades the existing bar through `--theme-color-calendar-event-shade`; light mode leaves it transparent. Plain white text on some bright light-mode bands remains an accepted contrast limitation, not a blanket accessibility pass.

PWA installation colors are separate metadata in `src/app/manifest.ts` and `src/app/[locale]/manifest.webmanifest/route.ts`. They currently retain the fixed yellow brand color and are not changed by CSS media queries.

## Event tracker chart interaction

The tracking and information tabs retain separate content-scroll offsets during the current page visit. The heading above the tabs is shared: switching while it is visible keeps the current document position, even when the destination has a saved offset. Once the tab bar is fully sticky, switching keeps it sticky; returning to a tab last viewed above the bar starts at its content opening, never brings the heading back into view. Otherwise, returning restores the saved content offset; changing event or server clears both offsets. This does not persist across reloads. The incoming panel previews its target position during the horizontal transition, and committing the tab restores document scrolling without a smooth vertical animation. Comments remain outside the tabs.

Below 1280 CSS pixels, a single-finger horizontal swipe can start on the tab bar or noninteractive panel content. Vertical gestures retain normal page scrolling. A zoomed page keeps native horizontal panning. Charts, inputs, links/buttons, the planner, and nested horizontal scrollers keep their own gestures; they do not initiate tab switching. Short or cancelled swipes return to the current tab without changing its scroll position, and do not suppress a subsequent independent touch or mouse click. Clicking and keyboard selection use the same position restoration, including reduced motion.

A compact, left-aligned chart heading identifies the server, event number or month, ranking mode, and tier/TOP10 before the score summary. Song-specific charts also identify the song number. Omit full event names; allow wrapping at narrow widths or larger text settings instead of truncating identifiers. An initial overview failure keeps the server controls and an empty, disabled event selector in the existing heading layout; one failure state replaces the event name and dates below. Disable dependent selection actions, and keep an available banner from its independent asset index. Downstream modules wait for a valid overview. An initial score failure replaces the summary and chart. Event information has one failure state for its required dependencies.

Failed chart requests do not show the successful-empty message, including TOP10. Retry controls follow the existing service-status action: `hhwx-control`, a small rounded border, and `px-3 py-1` padding. Extend the hit area to at least 44 px without stretching the visible button. The temporary zoom readout disables its fade when reduced motion is requested.

Activity, song and monthly cutoff charts zoom horizontally from 1× to 32×; the Y axis keeps its score scale. TOP10 retains its full-timeline view. Fine-pointer devices show compact minus/multiplier/plus controls at the bottom right, below the time labels. Buttons use adjacent 1/2/4/8/16/32× levels. Touch devices hide these controls during ordinary use (keyboard focus reveals them); a small multiplier appears at the plot's top left during zoom, stays until 700 ms after the gesture ends, then fades. There is no separate reset control; 1× shows the full timeline.

One finger inside the plot selects points immediately without scrolling the page. A double tap zooms in one level at that time; repeated double taps stop at 32× and never toggle back. Holding the second tap and dragging up zooms in continuously; dragging down zooms out. Releasing a drag does not also trigger a zoom step. Two fingers pan horizontally and pinch around their midpoint; after one finger lifts, selection waits until all contacts end. Gestures beginning on the fixed Y axis scroll the page, including when they cross into the plot. Only the plot captures chart gestures; browser page zoom remains available outside it.

Mouse dragging pans a zoomed chart. Clicking the plot or zoom controls enables wheel zoom around the pointer's time; wheel up zooms in, wheel down zooms out continuously. Leaving the whole chart, clicking outside, Escape or window blur disables it. The Y axis and modified browser zoom shortcuts remain outside wheel capture. Limits never hand an active wheel sequence back to page scrolling unexpectedly.

Button zoom anchors to an explicitly selected time, otherwise to the latest actual main-series point at approximately 76% of the viewport, with edge clamping. New data and tracker/info tab switches preserve the viewport; changing server, event, ranking mode, month, tier or song resets it. Pinch and drag updates follow the input directly; button, double-tap and wheel transitions are brief, interruptible, and respect reduced motion. Repeated wheel input accumulates the target scale, while reversing direction starts from the visible view immediately. Pointer contacts, animation frames, feedback timers and listeners are cleaned up with their owner.

## Catalog filters and Meta parameters

Bandori and OurNotes card/song catalogs share the compact mobile layout through [FilterControls](../src/components/FilterControls.tsx), [SongFilterControls](../src/components/SongFilterControls.tsx), and their card filter consumers. The same primitives also serve card pickers and OurNotes detail skill levels. OurNotes Meta adds its parameter layout in [OurNotesSongMeta](../src/components/ournotes/OurNotesSongMeta.tsx). Keep these dimensions in the owning components; do not shrink every `hhwx-control` globally or apply them to navigation, playback controls, artwork, or unrelated forms.

Use the existing `sm` breakpoint: below `40rem` (640 CSS px with the default root size), use the mobile column below; at and above it, preserve the wider layout. Colors, capsule shapes, selected/disabled states and focus feedback keep their shared roles in both color schemes.

| Element | Below `sm` | At and above `sm` |
| --- | --- | --- |
| OurNotes catalog tab button | 44px high, 14px text | 56px high, 16px text |
| Selection and skill-level button | 32px high, minimum width 32px | 36px high, minimum width 36px |
| Search, select and number field | 36px high | 40px high |
| Search and search-help button | 36 × 36px | 40 × 40px |
| Result-count badge and Clear | 32px high, 12px text | 40px high, 14px text |
| Filter / Meta parameter panel padding | 12px | 16px |
| Filter label | 13px text, 20px line height, no top padding | 14px text, 8px top padding |
| Inline row label-to-control gap | 12px | 8px |
| Stacked label-to-options / option gap | 6px | 8px |
| Filter-group gap | 12px | 12px |
| Band icon previously sized at 28px | 24px | 28px |

Input text stays 14px. Existing 12px text capsules keep that size; skill-level numbers retain 14px. Icon buttons can be wider than their minimum width to fit artwork and padding. Do not shrink an icon's silhouette or remove its accessible name to fit the minimum.

Multi-select groups put their label above full-width wrapping options on mobile; wider layouts retain the 5.5rem label column. Short rows such as live mode, level bounds and sort use `FilterRow`'s `inlineOnMobile` layout. Sort selects can shrink beside the direction button instead of enforcing a 256px mobile minimum. Song-level inputs are 56px wide on mobile and 80px at `sm`; Meta number inputs are 80px and 96px respectively. Search stays above the count/Clear row on mobile.

For Meta skills, place the label and five level buttons on the first mobile row, with the full-width select below. Wider layouts retain label, select and levels in one row. Perfect rate and Live interval use two mobile columns when both fit; each column needs 9rem and the gap is 12px, otherwise they stack. At `sm`, these return to independent labeled rows. Keep the parameter section's accessible name, without adding a visible Parameters subtitle or explanatory condition note.

OurNotes catalog tabs touch their filter panel with zero gap; Meta filters likewise touch the parameter panel. Each join has exactly one 1px subtle border: the tab list omits its bottom border, and the parameter panel omits its top border. The selected tab indicator remains 2px. Results retain the existing separate spacing (16px below `lg`, 32px at `lg`), rather than joining the controls into the table or card list.

When changing these shared components, check complete loaded filters in both games, the OurNotes tabs and detail skill controls, and the card picker/profile consumers when accessible. Cover narrow phones, both sides of `sm`, desktop, both locales and color schemes, wrapping, focus and touch activation. A compact screenshot alone does not prove touch usability or accessibility compliance. Record login-gated or real-device checks that were not performed in the page's verification notes.

## Binary switches

The shared [Switch](../src/components/Switch.tsx) uses a 36 × 20px track and 16px thumb below `sm`, and a 40 × 22px track and 18px thumb at and above `sm`. Uniform 2px track padding keeps the thumb equally inset at either endpoint; avoid asymmetric inset highlights or thumb shadows. Labels use 13px text on mobile and 14px at `sm`. The button retains a minimum 44px touch height, visible keyboard focus, switch semantics and reduced-motion support. Event-song Fever controls reuse this geometry without visible On/Off text.

The off track uses `--theme-color-switch-off-background`, separate from disabled controls, to keep the white thumb and track visible in both color schemes. Keep the accessible name stable when toggling; `aria-checked` conveys the state.

## Account forms

Login, registration, password recovery, password changes, and email changes share `AccountFormPage`: one panel, a `max-w-lg` container, and a lightweight back link naming the actual destination. Panel padding is 16 px on mobile and 40 px on desktop. Account overview and game-profile pages retain their wider layouts.

Account forms use a 24 px semibold heading in the default text color, without a step counter or eyebrow. This is a functional-form exception to the site's colored page-heading treatment. Put known email addresses in a readable summary instead of a disabled input. Each form has one full-width primary action, using the shared blue fill and inverse white ink in both themes. Resend and navigation actions use the secondary text treatment. Button spinners inherit their text color, while standalone loading indicators retain their own orange role.

Use concise, conventional labels: Username, Email, Password, and Verification code. The username remains a nonunique display name; the label does not change account identity or login rules. Completion states share `AccountFormResult`: centered status icon, neutral heading and one centered action capped at 192 px. Successful registration, password changes and email changes use the success icon; an already-registered email uses an information icon. Omit conversational instructions and prose that merely repeats the next action. Show the new email after an email change so the result can be checked.

Omit instructions that repeat the heading or obvious controls. Associate password hints and errors with their fields; use a numeric, pasteable, autofill-compatible OTP input labeled "Verification code". Keep code length and expiry rules in validation, without displaying them as instructions. Place one resend control directly below the input, changing its label from the disabled cooldown countdown to resend when ready. Do not add a collapsible help section or an edit-address button to code-entry steps. Explain expired verification only when it requires action; an already-issued code remains usable after the current-email authorization window expires. A completed step has a clear result and one next action. Announce errors/status and move focus when advancing to a new step.

Password fields provide a keyboard-accessible show/hide button without a confirmation field. Inputs share `AccountField`: labels cover only their text, field errors are associated with the input and clear on editing, and network/service failures remain form-level. Login tab order reaches email and password before the visibility/help controls. Turnstile follows the site locale and system color scheme; mobile layouts allow a 300px widget where possible and use compact mode only below that width.

## Loading and interaction feedback

Reuse the loading components below. Block loading follows the event information panel: an orange spinner above muted text. Keep dimensions appropriate to the containing page, panel or dialog rather than making every loader full-screen.

Group required dependencies behind one initial panel loader; do not give each column or field its own spinner. Individual images retain their dimensions with a placeholder. Missing or failed images use an existing icon placeholder, or the shared `common.states.imageUnavailable` message ("Image unavailable") when text is necessary, without per-image retry buttons or media-specific wording.

Default to no additional copy. Blocking read failures use the shared `common.states.loadFailed` and `common.actions.retry` labels. Do not add resource-specific or initial-load/refresh variants, technical fallback explanations, or repeated messages. A blocking read failure replaces the affected module's contents in its existing slot with one `LoadingError`; it does not append an alert, expand the layout, or leave unusable fields beneath it. Optional artwork, audio and other auxiliary requests fail silently.

Action outcomes are separate from content availability. Posting, saving, deleting, reacting, copying, and manual refresh use `ActionFeedback`, extracted from the existing comment refresh feedback: a compact outlined pill with a success/check or danger/cross icon, placed beside the relevant action without changing layout height. It appears only after completion and clears after 2 seconds for success or 4 seconds for failure; clear it when retrying, editing the affected input, or changing target. Keep failed-operation content and input and retry through the original action, without replacing the module with `LoadingError`. Use concise action-matched copy, never raw exceptions or HTTP details; recognized actionable validation or permission errors may use their localized reason. Content reads, including pagination, tab changes, and load retries, restore content on success without a success badge. Their being triggered by a click does not turn them into write operations.

| Component | Purpose |
| --- | --- |
| `LoadingIndicator` | Initial page or panel loading; `compact` places a small spinner beside the label for inline sections |
| `LoadingError` | One blocking failure in the affected module's existing content slot, with a retry action when available |
| `RetryButton` | Shared compact read-retry control, including content pagination and route errors; preserve its styling and expanded hit area |
| `ActionFeedback` | Success or failure of an explicit operation, using the compact comment-refresh appearance beside its action |
| `LoadingSpinner` | Decorative progress inside an action; keep an accessible button label and use `text-current` when it should inherit the button ink |
| `LoadingPlaceholder` | Reserve image or known layout dimensions while data is pending; supply a localized accessible label |
| `LoadingImage` | Keep an image hidden until its actual source loads; reuse the placeholder and preserve the image dimensions. |

Wait for the data required to render a meaningful initial view. Do not present initial defaults such as zero results, unknown service states, a fallback card identity or an incomplete filter list as loaded content. Show an empty state only after a successful response. An initial failure replaces loading with one failure state and retries missing dependencies; it must not also show a false empty state. Keep usable data during a background refresh of the same resource and handle refresh failure silently. A different account, item or data key must not inherit the previous result.

Event pages fetch `/api/bandori/master/events` in the browser and derive the selected event, title, dates, and progress locally. The overview is the only game-data dependency of the heading; the banner uses the optional public asset index. Once an event is resolved, tracking reads its ranking API, while opening or swiping toward information requests `/api/bandori/master/events/{eventId}` and the required metadata APIs through the shared client cache. Server pages validate route syntax and supply generic metadata without preloading game data. A valid numeric ID missing from a successfully loaded overview shows the not-found view; a failed overview request remains retryable. Event-specific document titles update after the overview loads.

Manual comment refresh keeps the current list and page until the replacement succeeds. Reuse the existing feedback beside the refresh control for success or failure, without changing layout height. Its outcome follows the main list request; updating already-expanded replies is an auxiliary read and retains old replies silently on failure. If no list is available, show only the module failure instead of duplicating it beside the control. Posting and saving feedback use their corresponding action verbs. A successful POST immediately reports success and clears the submitted draft; the subsequent list read runs independently, preserves the previous list/page on failure, and never turns a confirmed post into a publishing failure. Replies returned by a successful POST can be inserted directly.

For explicit reply expansion or participant pagination, retain loaded entries and retry only the failed page through `RetryButton` in the existing action/loading slot. Participant lists reserve one fixed-height footer for loading and retry; a failure must not append a second row or restart automatic pagination. A first failure without usable entries replaces the list slot with `LoadingError`. Chat resend and player play/retry icons retain their operation-specific controls; they are not ordinary content-read retry buttons.

Image identity follows the resolved source URL. When it changes, remove the old image immediately and show a placeholder until the new image loads; do not remount an unchanged URL merely because the selected server changed. Metadata loading and the subsequent image download both need feedback. A viewer that needs its own image ref for zoom and gestures may keep a keyed native image with a centered `LoadingSpinner` over it. Viewers show no visible loading text; the status container retains a generic localized loading label for assistive technology. Failure ends the busy state. Fixed dark viewer overlays may retain white feedback text for contrast; ordinary image placeholders still use the theme roles above.

Use hover styling only for hover-capable input (`@media (hover: hover)` for handwritten CSS). Pointer-driven previews open for mouse input; keyboard previews use `:focus-visible`. Touch activation performs the action on the first tap without a leftover hover selection. An intentional long-press preview can remain available independently. Escape closes the current preview before its containing dialog and restores focus to the trigger if focus was inside the preview. Button focus styling uses `focus-visible`; text inputs may retain a visible editing focus treatment. Filtering a picker must not reset its scroll container merely because results became empty and returned.

Shared indicators and placeholders expose an accessible loading label/status and use `motion-safe` animation, leaving static feedback when reduced motion is requested. Specialized layout skeletons, such as the calendar grid, may keep their geometry and theme colors; they follow the same state and accessibility rules instead of introducing another loading style.

Verify delayed responses, failure and retry, successful empty results, cached data, changed and unchanged image URLs, light/dark mode, reduced motion, and touch/keyboard behavior where applicable. These rules define the target for affected components; they do not imply that every unrelated site flow has been audited.

## How to change and verify a color

1. Find the semantic role and all consumers before changing it. For a panel adjustment, edit the panel role in the relevant Smile Patrol media block; for an action, inspect its background, foreground, hover and disabled states together.
2. Change shared recipes only when the relationship should apply to every theme. Put Smile Patrol values and scheme differences in its theme file. Keep the two modes on the same component markup.
3. Verify computed colors in light and dark mode after transitions settle. Exercise default, selected, hover, keyboard focus, disabled and applicable success/error states, including compact mobile layouts. Check glyphs as well as text; a text-only audit misses icon buttons.
4. Check for undefined roles, unused aliases and competing local classes. Use the applicable existing tests, lint and production build from [CONTRIBUTING](../CONTRIBUTING.md). Compare the rendered production CSS because bundling can affect cascade order; use `http://localhost:3000` when CDN-backed local browser data is required.

For normal text target at least [4.5:1 contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html); large text and meaningful control graphics generally require [3:1](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). Measure the actual pair and any composited opacity. Record accepted domain-specific exceptions and untested states rather than claiming whole-site compliance from a few palette samples.
