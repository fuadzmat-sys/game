# Decision map / canon story system implementation

This implements the supplied **Reverse Falls — Decision Map - Canon Story
System** specification on top of the user's newer game version. The work is
about coherent story state, alternatives and saves; it does not replace chapter
0 or rewrite the chapter 1 plot. Existing presentation/animation systems remain
part of the game. Chapter 0 source content, the complete chapter 1 content and
the user's animation additions are preserved.

## Architecture

- `story-state.js` owns the official story envelope under
  `reverse-falls-canon-story-v1`. Canonical choices and progress are primary;
  flags, relationships, items, knowledge and quests are recomputed with sources.
- Discovery is a separate object in that envelope. It remains profile-wide
  across New Game for the single browser campaign. It never supplies canon.
- Alternative sessions have detached canon/cursor copies and exist only in
  memory. They can extend discovery but cannot publish official story mutations.
- `story-bridge.js` registers the released chapter decisions, sources effects,
  maps existing scene/node IDs, reconciles engine projections and replays resume
  cursors. `app.js` uses this boundary for play, save/load, chapter handoff and map
  operations. The old campaign object is now a projection of official progress.
- Relationship totals equal a base plus sourced modifiers. The current
  `pacifica_gideon` relationship gains one from openness and one from a
  Pacifica-first descent, when those choices occur in canon.
- `STORY_STATE_ARCHITECTURE.md` documents the format, public service, dependency
  rules, lifecycle, future registrations and ten rules for later chapters.
- Only two full engine history snapshots are cached. Every chapter's canonical
  decisions and compact progress/language remain; an evicted cursor can be
  replayed. Metadata's current chapter/scene are derived summaries, and each
  bounded log entry records sourced `changedChoices` for diagnosis.

## Files

Primary new implementation files:

- `story-state.js`
- `story-bridge.js`
- `tests/story-state.test.mjs`
- `tests/story-bridge.test.mjs`
- `tests/story-map-ui.test.mjs`
- `tests/canon-browser.test.mjs`
- `STORY_STATE_ARCHITECTURE.md`
- `docs/CANON_SYSTEM_IMPLEMENTATION_REPORT.md`

Existing integration/presentation files updated for the system:

- `app.js`: service initialization, one-time migration, official session
  synchronization, protected alternative lifecycle, canonical save/load and
  chapter projections, map preview/rewrite handlers and alternative indicator.
- `flow-jump.js`: accepts explicit canonical choices rather than inferring them
  from an old snapshot when used through the new bridge.
- `flowchart-view.js`: three modes, nonmutating clicks, explicit preview/rewrite
  actions, confirmation, separate route colors, details and discovered-option
  gating.
- `flowchart.js`: map descriptions retain observed chapter events instead of
  exposing future chapter consequences.
- `campaign.js`: ending descriptions describe the observed decision without
  revealing unplayed chapter 2 bonuses.
- `index.html`, `style.css`: mode controls, legend, details/confirmation elements
  and the small alternative indicator, preserving the current visual style.
- `game.bundle.js`: rebuilt generated application bundle.
- `package.json`, `package-lock.json`: application version `3.1.0`, the new unit
  suites in `npm test`, and a separate `test:browser` command.
- `README.md`: player-facing map-mode and development verification guidance.

User-supplied animation files are the baseline of this work, rather than deletions
to undo.

## Migrations

When the official key is absent, legacy chapter snapshots, campaign completion
and map discovery are converted once. The inputs remain untouched at their old
storage keys and are archived in `metadata.legacyArchive`, including the first
recovery envelope. They are no longer consulted for canon after conversion.

A manual in-progress chapter is treated as a whole timeline; later decisions
from an older completed campaign are not merged into it. If old chapter saves
disagree about the creature, the active saved chapter takes priority and other
cursors are replayed consistently. Damaged or unreplayable cursors produce a
warning and a safe restart point instead of an invented history. Discovery
imports separately, even if it contains every creature or several endings.

Future schema conversion uses explicitly registered consecutive migrations.
Unsupported future schemas, missing migration steps and write failures retain
the original primary data. Load may repair derived caches from actual selected
IDs, or restore a valid recovery envelope. It never guesses choices from map
history.

## Choices, dependencies and rewrite

The shared registry contains `ch0.creature`, `ch1.gideon_reason`, `ch1.tracks`,
`ch1.slope` and `ch1.ending`. Existing option values, such as `Search` and
`Observation`, and existing node IDs are preserved. IDs are separate from
translated labels.

Requirements state whether a selected choice/option can exist; effect
requirements express conditional consequences. Branches can rejoin without
losing persistent facts. The current chapter 1 decisions remain possible for
all three creatures, so a creature rewrite preserves them and recomputes the
creature-specific scenes. Impossible dependent choices are removed recursively.
An explicitly uncertain dependency falls back to a safe chapter boundary.

The map's **Full mode** lets the player select a discovered option and then
choose either a temporary preview or an official rewrite. Node selection alone
does not change the save. Rewrite requires an explicit confirmation.

The service clones official state, applies the changed decision to the copy,
rechecks dependencies, derives effects, rebuilds engine cursors and validates
the whole result. Only then does it save a checkpoint and publish the coherent
candidate in a single official storage write. UI code does not decide which
flags to delete.

## Recovery and alternatives

Three durable recovery envelopes are retained by default under the `:recovery`
key. The internal mutation log is bounded to 80 entries. Failed replay,
validation, backup publication or official publication never leaves a partially
rewritten official timeline. Rollback restores a validated recovery envelope
while preserving profile discoveries.

Alternative progress uses a memory-only session, indicated by **Alternative
path**. Its item/relationship/knowledge/progress mutations stay temporary.
Returning restores the origin cursor or map/menu. A reload discards the session
and loads official canon. The normal Save action cannot overwrite canon from an
alternative.

## Verification

Release verification completed:

- `npm run build`: **passed**. Rebuilt 74 authored localized resources, including
  620 Russian paragraphs / 398 spoken paragraphs. The build does not generate
  new voice recordings.
- `npm test`: **passed**, including existing engine, presentation, campaign,
  chapter, map, audio, font, voice-pack and jump regressions: **152 Node tests**
  plus **5 standalone UI assertion groups**. Existing coverage includes all
  seven original chapter 0 languages and 486 chapter 1 combinations.
- The new suites in that run passed **27 story-state tests**, **16 bridge tests**
  and **5 UI assertion groups**.
- `node --check game.bundle.js`: **passed** for the rebuilt 256,063-byte bundle.
- `git diff --check`: **passed**.

These cover independent state domains, sourced effects and relationship totals,
alternative leakage across reload, all six creature changes, independent and
dependent later decisions, storage failure atomicity, bounded checkpoints,
repair/rollback, schema validation/migration, exact legacy recovery archives,
separate service keys, real chapter replay, conflicting saves, stale counters
and inventory, protected map modes, spoilers not unlocking write actions,
bounded history caching, validation of evicted progress and retained language.

`npm run test:browser`: **15 real Chromium checks passed**, with no unexpected
browser errors. The final run covers actual chapter 0 play and complete town
travel, canonical creature carryover into chapter 1, all four chapter 1 choices,
actionable chapter 1 creature scenes even when chapter 0 was skipped, nonmutating
node clicks, temporary clue/relationship/ending changes, alternative exit/reload,
menu Save protection against an abandoned alternative engine, New Game
cancellation, an actual browser storage-quota rejection with visible error and
unchanged canon, confirmed rewrites/reload, and one-time legacy conversion with
the original recovery archive retained.

The built game was served using
`python3 -m http.server 8780 --bind 127.0.0.1`. Browser verification needs
Playwright and Chromium only in the development environment; the game itself
ships without that dependency. The test supports `REVERSE_FALLS_TEST_URL`
(default `http://127.0.0.1:8780`) and `CHROMIUM_PATH` (default
`/usr/bin/chromium`).

## Specification coverage

| PDF requirements | Implementation / verification |
| --- | --- |
| 1–2, 23–24, 28–29, 37 | Four distinct domains; canonical choice values; discovery and character knowledge separation. |
| 3–9, 30–33 | Existing map extended with Full mode, details-only clicks, explicit actions, alternative indicator, route colors and spoiler gating. |
| 10–12, 18–19, 42–44, 58 | Detached transactional rewrite, dependency invalidation, safe boundary, recovery checkpoint, recomputation, visible failure. |
| 13–17, 20–22, 35 | Stable released IDs; registered graph branching/rejoins; sourced flags, relationships and inventory. |
| 25–27 | Versioned envelope, consecutive migrations, load validation and non-destructive repair/recovery. |
| 34, 45–50 | Six-direction creature replay, alternative-leak, rewrite/reload, independent/dependent, legacy and New Game tests. |
| 36, 38–41 | Story queries/summary, centralized service and effects, bounded internal mutation log. |
| 51 | Current profile-wide discovery explicitly documented; distinct custom service keys tested for independent slots. |
| 52–53, 57 | Current UI and chapter-scoped graph retained; generic state service avoids a giant enumerated story tree. |
| 54–56 | Architecture document, ten future rules and concrete next-chapter registration example. |
| 59 | Invariants exercised by service/adapter/UI tests and validation on publication/load. |
| 60 | This report and architecture guide, successful build/regressions and 15 real browser checks recorded above. |

## Known limitations

- Only chapters 0 and 1 are playable. Chapter 2 **The Wrong Monster** remains a
  future handoff. The architecture supports later registrations; it does not
  author the other chapters automatically.
- The original French chapter 0 scripts cannot reproduce every creature route.
  Such a conflicting replay fails safely instead of forging a contradictory
  snapshot; English/Russian can be used for those rewrites.
- No independent-slot selector or cloud save synchronization is shipped.
  Browser-local recovery cannot survive clearing browser data. Cross-tab
  concurrent write conflict resolution is not implemented.
- The two-history cache bounds ordinary progress growth. Browser localStorage
  can still reject oversized external imports or exhausted storage; errors abort
  publication and protect the previous official save.
- Alternative sessions intentionally do not resume after page reload.
- Knowledge and quests are explicit generic effect types; a scene being viewed
  does not automatically grant a character knowledge.
- Map pan/zoom is retained per chapter/mode for the current page session. The
  application does not pre-render hypothetical graphs for future unshipped
  chapters.
- The voice-production task is separate; this update does not claim that new
  natural full-chapter recordings have been generated or approved.

## Future chapter example

The architecture guide gives a complete registration example for
`ch2.cloth_examination`, with stable `Inspect`/`Keep` options and a requirement on
`ch1.tracks = Search`. Its knowledge/quest effects automatically receive the
choice-option source. Rewriting away from the cloth branch removes only that
dependent choice and its facts. A later chapter queries those facts through the
service; it does not reparse earlier scripts or discovered paths. This is a
technical example, not a change to the chapter 2 story canon.
