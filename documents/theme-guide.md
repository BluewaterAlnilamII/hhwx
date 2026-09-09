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

The nine HHW accent seeds are fixed. Neutrals and functional success/warning/danger inputs are separate; they are not additional HHW brand seeds. Seed use is judged by purpose, not equal area or frequency.

| Fixed HHW seed | Light use | Dark use |
| --- | --- | --- |
| `#FFEE22` bright yellow | Sunny canvas band mix | Kept in the palette; no forced bright-yellow fill |
| `#FF9922` orange | Header, primary action, diagonal mix | Small primary actions |
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
| Solid danger/retry action | `#E0002F` / `#FFFEF4` | `#E0002F` / `#FFFFFF` |
| Primary action | Orange / `#0F172A` | Orange / `#0F172A` |
| Selected tab and standard focus | Operation blue | Sky blue |

The legacy `--theme-seed-surface: #FFFEF4` still supplies light chart-axis and other base recipes. Independent inverse ink also uses that value in light mode. Neither is the content-panel source. `--smile-patrol-content-surface` owns light panel/floating content; the dark panel currently inherits the dark surface role. `--theme-seed-shell-canvas: #FFEA2F` is a legacy input still used by light toolbar icon hover; the actual canvas has its own explicit role. Do not mass-replace these values to change panels.

## Component rules and exceptions

| Purpose | Use |
| --- | --- |
| Page panel | `hhwx-panel`; nested content uses the panel background with its own geometry |
| Neutral button/input | `hhwx-control`, including selected and disabled states where applicable |
| Solid blue operation | `hhwx-action-accent`, or the matching `action-accent-background` / `foreground` pair in custom controls |
| Quiet operation, link or reply/expand button | `action-secondary-*`; neutral or lightly tinted surface, operation text and border |
| Solid success or danger/retry action | Matching `action-success-*` or `action-danger-*` background/foreground pair; hover keeps the same fill unless separately configured |
| Quiet destructive action | Existing `action-destructive-*` roles; these use a quiet surface, distinct from solid danger feedback |
| Floating menu, help, tooltip or dialog | `hhwx-floating-surface`, or matching floating roles when geometry is specialized |
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

Band colors, card artwork, chart-series identities, game pieces and fixed media-overlay ink belong to their content domains. The remaining local `dark:` utilities cover chart-series red/blue text and animated-stamp badge ring offsets. They are not examples for ordinary site controls. Preserve the actual logo silhouette when changing its decorative treatment.

Calendar bars retain band identity, white labels and no added colored outlines. Dark mode shades the existing bar through `--theme-color-calendar-event-shade`; light mode leaves it transparent. Plain white text on some bright light-mode bands remains an accepted contrast limitation, not a blanket accessibility pass.

PWA installation colors are separate metadata in `src/app/manifest.ts` and `src/app/[locale]/manifest.webmanifest/route.ts`. They currently retain the fixed yellow brand color and are not changed by CSS media queries.

## How to change and verify a color

1. Find the semantic role and all consumers before changing it. For a panel adjustment, edit the panel role in the relevant Smile Patrol media block; for an action, inspect its background, foreground, hover and disabled states together.
2. Change shared recipes only when the relationship should apply to every theme. Put Smile Patrol values and scheme differences in its theme file. Keep the two modes on the same component markup.
3. Verify computed colors in light and dark mode after transitions settle. Exercise default, selected, hover, keyboard focus, disabled and applicable success/error states, including compact mobile layouts. Check glyphs as well as text; a text-only audit misses icon buttons.
4. Check for undefined roles, unused aliases and competing local classes. Use the applicable existing tests, lint and production build from [CONTRIBUTING](../CONTRIBUTING.md). Compare the rendered production CSS because bundling can affect cascade order; use `http://localhost:3000` when CDN-backed local browser data is required.

For normal text target at least [4.5:1 contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html); large text and meaningful control graphics generally require [3:1](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). Measure the actual pair and any composited opacity. Record accepted domain-specific exceptions and untested states rather than claiming whole-site compliance from a few palette samples.
