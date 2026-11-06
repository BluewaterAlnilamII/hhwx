# HHWX Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

HHWX serves visitors to a personal community and experimental site. People come
for its HHW identity, shared interests, play, and experiments, as well as useful
Bandori and OurNotes tools. Game players are an audience within that community;
the product is not defined solely by either game's utility features.

## Product Purpose

Create a recognizable, enjoyable place for community participation and personal
experiments, with practical game tools as part of that experience. Success means
preserving the site's personality and making both playful visits and purposeful
tasks worthwhile.

The owner confirmed this positioning and the priority of community identity and
fun during initialization on 2026-11-05. Accuracy, usability, phone and desktop
access, privacy, and third-party rights remain requirements.

## Positioning

HHWX combines an HHW fan-club identity, character-based play, community features,
and game data tools within a personal site. That combination guides product
decisions; the number of game tools does not make utility the sole priority.
This is an unofficial fan project, with no claim of affiliation or endorsement.

## Operating Context

- Visitors use a browser on phones and desktop computers. The existing app uses
  Next.js App Router; this product record does not propose a platform migration.
- Simplified Chinese is the default and source locale; English is also supported.
  Interface language and game-server selection are separate choices.
- Public browsing, play, and account-backed workflows coexist. Authentication and
  private service availability depend on the specific feature; do not introduce
  an account requirement merely to make unrelated flows uniform.
- The existing homepage deliberately uses Japanese HHW club copy and a retro
  entrance/mailbox interaction. Tool pages have their own established patterns.

## Capabilities and Constraints

The following are current repository capabilities, not promises of equal feature
coverage across games or of availability in every self-hosted deployment:

- **Community and play:** HHW club homepage, character-based Othello, comments,
  user profiles, and account/notification workflows.
- **Bandori:** card and song catalogs, chart simulation, event calendar and
  tracking, player lookup, game-profile import/sync, cards/items, and single-song
  and medley team builders.
- **OurNotes:** card and song catalog pages. Backend API support alone does not
  establish that a corresponding public page or full Bandori-equivalent workflow
  exists.
- **Shared services:** account management, music playback, and service status.
  Some capabilities require configured private services or feature flags.

Preserve meaningful distinctions between games, servers, source data, and UI
language. Follow [AGENTS.md](AGENTS.md) for repository ownership, private data
boundaries, public contracts, and immutable asset URLs.

For team builders, `exact` proves an optimum only within validated normalized
inputs and documented scoring rules. `incomplete` is a best-so-far result, not a
proof of optimality. See the [team-builder contract](documents/bandori-team-builder/README.md).
Fun and presentation must not obscure these limits or fabricate data, usage
counts, endorsements, or service guarantees. The homepage's random visitor
counter is decorative, not audience evidence.

## Brand Commitments

- Keep the HHWX name and HHW community identity recognizable.
- Prioritize community character and fun while keeping practical tasks usable.
- Treat the existing homepage artwork and interactions as incumbent product
  identity. A new feature is not authorization to replace that identity.
- Preserve the unofficial status and third-party ownership notices in
  [NOTICE.md](NOTICE.md).

Visual implementation remains governed by the existing
[Theme Guide](documents/theme-guide.md) and current code/assets. This record
does not choose a new palette, typography, component system, or page concept.

## Evidence on Hand

- [README](README.md) and [Chinese README](README.zh-CN.md): project purpose,
  setup, operational dependencies, and existing homepage behavior.
- [Page source](src/app/%5Blocale%5D) and
  [navigation copy](messages/zh-CN/navigation.json): current public surfaces and
  feature names. The route tree includes capabilities beyond the README summary.
- [Homepage assets](public/res/home/v1): title, emblem, and mailbox artwork.
  [SOS reference](documents/home-mailbox-sos-reference.png) and
  [HHW reference](documents/home-mailbox-hhw-reference.png) preserve the existing
  mailbox references.
- [Theme Guide](documents/theme-guide.md),
  [localization contract](documents/localization.md), and
  [team-builder documentation](documents/bandori-team-builder/README.md):
  established behavior and constraints. `design-qa.md` is historical evidence,
  not a competing current design specification.

## Product Principles

1. **Community identity first.** Judge additions by their fit with this personal
   HHW community, not only by the breadth of the tool catalog.
2. **Make room for fun.** Play and experiments are part of the product's purpose;
   preserve them while keeping required actions understandable.
3. **Earn trust through accuracy.** Distinguish real data, estimates, incomplete
   results, missing information, and decoration.
4. **Make everyday use easy.** Keep common tasks efficient on phones and desktops,
   with consistent language, navigation, and accessible interactions.
5. **Respect people and ownership.** Protect account privacy and preserve the
   boundaries around third-party names, data, and media.

## Accessibility & Inclusion

Preserve the existing requirements for keyboard access, visible focus, accessible
names/status feedback, reduced motion, and touch usability. Follow the
[Theme Guide](documents/theme-guide.md) for contrast targets and documented
domain-artwork exceptions. These are requirements for affected work, not a claim
of whole-site accessibility certification.

## Open Decisions

No narrower primary audience, growth target, monetization model, or additional
accessibility certification was established during initialization. Future work
should resolve these only when a concrete product decision needs them.
