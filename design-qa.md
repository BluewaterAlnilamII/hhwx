# Display Degree Design QA

## Comparison target

- Source visual truth:
  - `C:\Users\bluew\AppData\Local\Temp\codex-clipboard-19f6bc45-36e0-47b7-bfba-0930c9c7400e.png` (account-center identity card and requested insertion point)
  - `C:\Users\bluew\AppData\Local\Temp\codex-clipboard-da6c663a-5be7-4cc4-acce-a888f367b7d9.png` (team-builder profile-card visual language used only as the account-selector style reference)
- Rendered implementation before the final size-only refinement:
  - `C:\Users\bluew\.codex\visualizations\2026\08\15\01a00701-7fad-7b83-aecc-de0004d42023\account-degree-saved-desktop.png`
  - `C:\Users\bluew\.codex\visualizations\2026\08\15\01a00701-7fad-7b83-aecc-de0004d42023\account-degree-mobile.png`
  - `C:\Users\bluew\.codex\visualizations\2026\08\15\01a00701-7fad-7b83-aecc-de0004d42023\account-degree-picker-desktop-post-fix.png`
  - `C:\Users\bluew\.codex\visualizations\2026\08\15\01a00701-7fad-7b83-aecc-de0004d42023\account-degree-picker-empty-account-mobile.png`
- Local implementation URL: `http://localhost:3001/account`
- State: authenticated, verified local QA user; one CN binding with four Degrees, one empty CN binding; dynamic CN Degree 20099 selected

## Viewport and density normalization

| Artifact | Pixels | CSS viewport / crop | Density handling |
| --- | ---: | ---: | --- |
| Account source | 485 x 269 | Annotated crop, not a complete browser viewport | Compared as a focused identity-card region |
| Account desktop implementation | 1092 x 893 | 1100 x 900 viewport override | Browser capture at device scale 1; scrollbar/chrome account for the small pixel delta |
| Account mobile implementation | 477 x 747 | 485 x 760 viewport override | Browser capture at device scale 1; compared at the same nominal width as the account source |
| Picker style source | 996 x 300 | Related team-builder surface, not the final dialog state | Used for card geometry, border, spacing, server icon, and UID hierarchy only |
| Picker desktop implementation | 1100 x 900 | 1100 x 900 viewport override | Browser capture at device scale 1 |
| Picker mobile empty-state implementation | 477 x 747 | 485 x 760 viewport override | Browser capture at device scale 1 |

The two sources describe different product states from the new selector, so a pixel overlay would create false precision. The source and implementation were opened together in the same comparison inputs, and the comparison was normalized around the focused card regions and the explicitly requested visual language.

## Full-view comparison evidence

- The account card preserves the existing HHWX blue identity surface, large radius, white primary type, subdued email, UID pill, avatar control, and verification badge.
- The Degree sits directly below the UID and to the right of the avatar, matching the annotated insertion point without disturbing the existing profile-entry cards. After the interaction pass, the shared display box was reduced from 230 x 50 to the final 115 x 25 at the user's request.
- The dialog keeps the account selector visually close to the team-builder cards: white surfaces, subtle border/shadow, server SVG, bold UID, and a sky selected outline. It deliberately omits profile name, card count, sync date, and cloud badge because the new control selects a bound account rather than a saved profile.
- At 485 px the identity card and Degree remain unclipped. The dialog becomes a one-column account and Degree list with a persistent footer and internal scrolling.

## Focused region comparison evidence

- Account identity region: compared the 485 px source crop against `account-degree-mobile.png`. Avatar, name/email/UID hierarchy, blue radius, and the requested below-UID Degree placement remained legible and balanced before the final size-only refinement.
- Account-selector region: compared the team-builder source against `account-degree-picker-desktop-post-fix.png`. Card height, radius, border weight, server icon scale, UID emphasis, two-column desktop grid, and selected outline carry over; the simplified content is intentional.
- Asset fidelity: the account cards use the existing `BandoriServerIcon` SVG assets. Every title uses the real Bandori Degree base/rank/icon resources or animation atlas; there are no hand-drawn or placeholder replacements.

## Required fidelity surfaces

- Fonts and typography: existing HHWX font stack and account hierarchy are unchanged. Dialog title, section labels, UIDs, helper copy, and button text use the established weights and line heights; no clipping or awkward wrapping was observed at either viewport.
- Spacing and layout rhythm: the final 115 x 25 Degree footprint is shared by the account card and options. Desktop uses two account columns and up to three Degree columns; mobile collapses cleanly to one column. Radii, gaps, borders, and footer spacing match nearby account UI.
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

## Findings

- No actionable P0, P1, or P2 visual, responsive, interaction, accessibility, asset, or copy differences remain.
- The final requested display size is enforced as 115 x 25 by the shared `BandoriDegreeView` aspect-ratio box and the account-card fallback. A focused source regression test rejects the earlier 230 x 50 classes. The underlying static and animated resources retain their original resolution.

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
- The comment variant is exactly 92 x 20. Its two 20 px rows plus the final 3 px inter-row gap fit inside the existing 44 px avatar/header minimum, so a normal one-line author header does not gain vertical height from the Degree. The 43 px group remains vertically centered by the header's flex alignment.
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
- The 92 x 20 result is legible at both tested widths and satisfies the requirement not to add height to the common one-line comment header. Further reduction is not needed for this layout.

final result: passed
