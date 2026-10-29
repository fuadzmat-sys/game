# Canon story state

The current story has one authoritative timeline. `story-state.js` owns its
publication; `story-bridge.js` adapts existing chapter scripts and engine cursors.
The decision map displays these objects and requests operations. It does not
decide story effects or invalidate saves itself.

## Storage and the four state domains

The application's single active campaign uses localStorage key
`reverse-falls-canon-story-v1` (`STORY_KEY`). Its versioned envelope contains:

| Field | Purpose |
| --- | --- |
| `canon.choices` | The selected stable option ID for each answered stable choice ID. This is the primary record of decisions. |
| `canon.currentChapter`, `canon.progress` | The official chapter and reached scene/cursor/travel progress. |
| `canon.derived` | Recomputed flags, relationships, inventory, character knowledge and quest state, including effect sources. |
| `discovery` | Previously discovered map nodes and edges, independently of the official route. |
| `metadata` | Save ID, creation/update timestamps, game version, latest recovery checkpoint reference and derived current chapter/scene summary. |
| `snapshots` | A bounded cache of validated engine resume histories, reconciled with canonical choices. They are not a second authority for past choices. |
| `backups`, `log` | Bounded checkpoint references and internal mutation history. |

`schemaVersion` is currently `1` on the envelope and canon; `saveFormatVersion`
is `1` on the envelope. These describe different compatibility concerns from a
chapter script's `snapshot.version` or the older campaign/map versions.

The alternative session is **not stored in this envelope**. The service keeps it
in memory: session ID, `originSaveId`, `startNode`, an origin resume descriptor,
and detached `canon`/`snapshots` copies. Reloading the page discards an unfinished
alternative and loads the official save.

The bridge's `boundSnapshotCache()` retains at most **two** full chapter engine
histories by default, prioritizing the current chapter. All official choices and
compact progress entries remain; cache eviction does not erase completed
chapters. Progress includes scene, paragraph, phase, travel order and language.
An evicted resume cursor is replayed from that progress and canonical decisions,
using the recorded language. Rewrite updates compact creature-dependent scene
references without recreating a full history for every past chapter. This keeps
the cache bounded as the game grows. `metadata.currentChapter` and
`metadata.sceneId` are derived from canon at publication and are checked when
present; they are not additional story authorities.

### Discovery scope

Discovery is explicitly profile-wide for the current browser campaign: New Game
clears official choices/progress but preserves previously discovered routes.
The chapter 0/1 resume entries are chapter cursors in that one campaign, not
independent save slots. The shipped interface has no independent slot selector.
If one is added, instantiate the service with a distinct `key` for each slot;
the recovery key follows that key, and canon, discovery and alternatives stay
separate. The service's independent-key isolation has a dedicated test.

Discovery may retain all three creatures. Canon still selects only one. Neither
discovery, visited map nodes, alternative history nor UI selection supplies a
canonical choice. A character's knowledge is also distinct from what a player
has viewed in an alternative.

## Released identifiers and effects

The registry in `story-bridge.js` preserves the existing option values and map
node IDs. Translated text is display data, never an identifier.

| Stable choice ID | Stable option IDs | Existing engine flag |
| --- | --- | --- |
| `ch0.creature` | `Werewolf`, `Wendigo`, `Vampire` | `monster` |
| `ch1.gideon_reason` | `Deflect`, `Curiosity`, `Openness` | `reason` |
| `ch1.tracks` | `Bold`, `Journal`, `Search` | `tracks` |
| `ch1.slope` | `Pacifica`, `Gideon`, `Careful` | `descent` |
| `ch1.ending` | `Bold`, `Cautious`, `Observation` | `ending` |

Node identity is scoped by chapter. For example, chapter `1` node
`tracks_search` belongs to choice `ch1.tracks`, option `Search`. Registry graph
nodes expose `nodeId`, `chapterId`, parents/children, requirements, effects,
choice/option IDs where applicable, and a `rejoinNode`. Branches can merge while
retaining different persistent facts.

Supported declarative effect types are `flag`, `counter`, `relationship`, `item`,
`knowledge` and `quest`. Choice effects are sourced as
`<choiceId>.<optionId>`, such as `ch1.tracks.Search`. Base effects require an
explicit source, such as `chapter1.start` for `journal_3`.

- `Search` grants `extra_clue_01` and the released item ID `cloth_scrap`.
- `Openness` and a `Pacifica` descent each contribute one sourced
  `pacifica_gideon` relationship modifier. The total is base plus modifiers,
  not an independently incremented durable number.
- Counters are summed from their sources; contradictory assignments to the same
  flag fail validation.
- Inventory and character knowledge retain source lists. Removing a branch
  removes its effects on recomputation. Discovery never grants knowledge.

`deriveStoryState()` runs effects in registry order, rather than relying on the
property order of a loaded save. Derived facts may be repaired from primary
choices. Do not edit a cached total or inject an unsourced item into a snapshot.
Existing script effect commands operate on the engine's transient projection;
the bridge registers the corresponding persistent effects centrally.

## Service API

`createStoryStateService({ storage, registry, validateSnapshot, validateProgress, key, migrations })`
accepts a storage adapter with `get(key)` and `set(key, value)`. A false return or
exception from `set` is a failed publication. Its readers return copies.

```js
story.getChoice('ch0.creature');
story.hasFlag('extra_clue_01');
story.getFlag('journal_doubt');
story.getRelationship('pacifica_gideon');
story.hasItem('cloth_scrap');
story.characterKnows('pacifica', 'an_explicitly_registered_fact');
story.getCanonSummary();
```

These readers use official canon by default, even while an alternative is open.
Pass `{ alternative: true }` to the individual query methods when a scene needs
the temporary context, or obtain `getSessionCanon()` for the active context.
The summary intentionally always describes the official story.

Mutation entry points are `setChoice`, `updateCanonical`, `recordDiscovery`,
`createAlternativeSession`, `updateAlternative`, `exitAlternative`,
`rewriteCanonFrom`, `importSave` and `rollback`. `updateCanonical` replaces any supplied maps;
it is not a deep merge API. The application bridge constructs a coherent patch.
Persistent effects are applied by registered option/base effects and
`deriveStoryState`; there is no unrestricted public `applyEffect` that could
bypass source tracking.

## Dependencies and transactional rewrites

Each choice/option may specify requirements. A requirement names a `choiceId`
and optionally `optionId`, `optionIds`, or `notOptionId`. `dependsOn` records
registered upstream IDs; **requirements express when the choice/option can
exist**. Merely naming an upstream dependency does not mean every later choice
must be deleted when it changes. Effect requirements allow conditional facts.

The four current chapter 1 decisions are independently possible for every
creature. Changing the creature therefore preserves those decisions while
replaying creature-dependent scenes. Effects are always recomputed. Future
choices whose requirements become false are removed recursively, along with
only their derived effects. When dependencies are not reliably known, set
`dependenciesKnown: false` and optionally `fallbackChapterId`; the generic
service clears the uncertain boundary and later progress/choices safely.

`rewriteCanonFrom(choiceId, optionId, { prepare })` performs:

1. Clone the official envelope and apply the new selection to the copy.
2. Remove impossible dependent choices; handle an uncertain safe boundary.
3. Recompute derived facts. A synchronous adapter `prepare` replays validated
   engine resume cursors using canonical choices, never discovered history.
4. Validate the complete candidate, including application scene validation.
5. Persist a recovery checkpoint of the previous state.
6. Publish one coherent envelope with one authoritative `setItem`, then replace
   the in-memory official state.

A preparation/validation failure publishes nothing. A checkpoint write failure
aborts. A primary write failure leaves the previous official envelope and
in-memory canon unchanged; its recovery checkpoint may already exist. There are
no intermediate official writes of half-recalculated choices or flags.

Recovery snapshots live under `reverse-falls-canon-story-v1:recovery`, with a
default maximum of **three** entries. Checkpoints do not recursively embed older
checkpoints. The mutation log retains the most recent **80** entries. Each log
entry records the reason and `changedChoices`: choice ID, previous/new option,
effect source and whether the selection was removed. It is bounded diagnostic
provenance rather than another source of truth.
`rollback(checkpointId)` restores a valid checkpoint while retaining discoveries
from the current profile.

## Alternatives and the decision map

The map has **My path**, **Full mode** and **Entire graph**. A normal node click
only selects details. My path is projected from official choices/progress;
Full mode and Entire graph show all implemented noncanonical routes, independently
of discovery. Full mode offers explicit preview/rewrite actions for registered
choice options even when they have never been viewed. No spoiler toggle exists.

Preview builds a detached temporary story and shows a small **Alternative path**
indicator. Save cannot overwrite the official timeline from this mode. New
temporary choices/progress/effects stay in the session; discovery alone may be
published. Exit restores the origin cursor or returns to the map/menu and drops
the session. Canonical mutations are rejected while a session is active.

Rewrite has a separate confirmation explaining that dependent states may be
recomputed or reset. The map invokes the story operation rather than editing
JSON. Cyan means official route, gold alternative route, muted gray previously
discovered, and the current scene has a separate highlight. The existing chapter
tabs, description panel, zoom and pan remain; transforms are remembered per
chapter/mode while the page remains open. The True Story tab derives a continuous
read-only timeline across reached installed chapters. No future placeholder
chapter is rendered.

## Legacy conversion and future migrations

On first launch without the new official key, the app reads existing chapter
manual snapshots, campaign completion and map discovery. It converts these once:

- Manual chapter snapshots supply their actual selected flags, not scene/map
  guesses. An unfinished manual chapter does not inherit future decisions from
  an older completed version of the same chapter.
- Conflicting old creature selections use the current saved chapter's selection
  and replay other chapter cursors consistently. An unreplayable cursor falls
  back safely and produces a warning.
- Campaign completion is used only when there is no newer manual snapshot for
  the chapter; discovery imports into its separate domain.
- The unmodified conversion inputs are retained as `metadata.legacyArchive`,
  including in the first recovery envelope. This is technical recovery evidence,
  not a second story state used by subsequent chapter logic.
- Existing legacy storage keys remain untouched. Once the new official key
  exists they are not read again to decide canon, including by Save/Load.

The legacy keys are `reverse-falls-chapter0-save-v1`,
`reverse-falls-chapter1-v3-save-v1`, `reverse-falls-campaign-v1`, and
`reverse-falls-flowchart-v1`. Retaining them is a recovery aid, not a second
official timeline.

Future envelope migrations register a function for each previous version and
must advance exactly one version (`v1 → v2 → v3`). Conversion runs on detached
data, with recovery before publication. Unknown future versions and missing
migrations are rejected without replacing the original data with a New Game.
On load, stale derived caches can be recomputed with backup and warning; invalid
primary IDs require a valid recovery checkpoint or a visible failure. The app
also validates compact chapter progress even when a full snapshot has been
evicted: known scene/script namespace, cursor type, allowed phase and recorded
language. Cached snapshots additionally undergo engine restoration and canonical
flags/inventory/creature-specific scene checks.

## Adding a future chapter safely

The following is a **technical registration example**, not new chapter 2 canon.
Register choices before creating the service; add the chapter's actual scripts,
chapter metadata, graph and replay adapter separately.

```js
const clothChoice = {
  id: 'ch2.cloth_examination',
  chapterId: 2,
  dependsOn: ['ch1.tracks'],
  requirements: [{ choiceId: 'ch1.tracks', optionId: 'Search' }],
  options: [
    { id: 'Inspect', effects: [
      { type: 'knowledge', character: 'pacifica', key: 'cloth_examined' },
      { type: 'quest', key: 'cloth_examination', value: 'examined' }
    ] },
    { id: 'Keep', effects: [
      { type: 'quest', key: 'cloth_examination', value: 'deferred' }
    ] }
  ]
};
const registry = {
  ...STORY_REGISTRY,
  chapterIds: [...STORY_REGISTRY.chapterIds, 2],
  choices: [...STORY_REGISTRY.choices, clothChoice]
};
// Wire this registry and a chapter-aware snapshot validator into the app.
const story = createStoryStateService({ storage, registry, validateSnapshot });
story.init();
if (story.hasItem('cloth_scrap')) {
  // Show the authored scene, then commit the player's actual selection.
  story.setChoice('ch2.cloth_examination', 'Inspect');
}
```

Its effect source becomes `ch2.cloth_examination.Inspect`. Rewriting
`ch1.tracks` away from `Search` invalidates this decision and its knowledge/quest
facts, while an unrelated decision remains. A much later chapter can query that
knowledge/quest or require this choice without traversing old scripts. Add
tests for dependent/independent rewrites and migration before releasing IDs.

Only chapters 0 and 1 are currently playable. Chapter 2 **The Wrong Monster**
remains a future handoff, not an implemented episode. The generic state service
does not require one giant branch per possible 60-chapter combination.

## Rules for future work

1. Never infer canon from discovery.
2. Never directly edit canonical JSON from UI.
3. Every choice needs a stable ID.
4. Every option needs a stable ID.
5. Every persistent effect should have a source.
6. Relationship changes should be traceable.
7. Items/clues should have sources.
8. Alternative sessions must never write to canonical state.
9. Canon rewrites must be transactional.
10. Save schema changes require migrations.

## Running the verification

From the project directory, run `npm run build` and `npm test`. The build creates
the standalone bundle; ordinary players do not need Node or Playwright.
For the browser integration test, serve the built project in one terminal:

```sh
python3 -m http.server 8780 --bind 127.0.0.1
```

In another terminal run `npm run test:browser`. This development-only check needs
Playwright and a Chromium executable. `REVERSE_FALLS_TEST_URL` overrides its
default `http://127.0.0.1:8780`; `CHROMIUM_PATH` overrides
`/usr/bin/chromium`. The test exercises actual built-game controls and reloads,
including save isolation, confirmed rewrites, legacy migration and an actual
browser storage-quota failure.

The release verification passed the build, 152 Node tests plus five standalone
UI assertion groups, and 15 Chromium checks with no unexpected browser errors.
Existing coverage of all seven original chapter 0 languages and 486 chapter 1
choice/language combinations is retained. Details are recorded in
`docs/CANON_SYSTEM_IMPLEMENTATION_REPORT.md`.

## Limits to preserve honestly

Independent slot UI and cloud save synchronization are not implemented. Storage
is browser-local, and recovery cannot survive a user clearing that storage.
Concurrent-tab conflict resolution is not provided. Alternative sessions do not
resume after a page reload. Generic knowledge/quest effects are supported but
must be explicitly authored; watching a scene creates no automatic knowledge.
Future chapter scripts/graphs/adapters and schema migrations must be registered
when those chapters/formats are introduced.

The bounded histories reduce localStorage growth, but a browser can still reject
large imported external data or exhausted storage. Failed publication leaves the
previous official save intact and shows an error; it cannot manufacture more
browser storage.

The original French chapter 0 scripts cannot reproduce every requested creature
route. A conflicting replay fails safely with the official state unchanged;
use English or Russian for such a rewrite. Original scripts are not silently
rewritten to hide this limitation. No future consequence labels are invented by
the story service.


## CANON SAVE EXPORT / IMPORT

The Decision Map offers **Сохранить путь / Export Save** and **Import Save**.
`storyState.exportSave({ gameVersion })` validates and copies the official
state, even during an alternative. The UI downloads `reverse_falls_canon_save.json`:

```json
{
  "format": "reverse-falls-canon-save",
  "saveFormatVersion": 1,
  "schemaVersion": 1,
  "gameVersion": "3.1.0",
  "exportedAt": "2026-10-29T12:00:00.000Z",
  "canon": {
    "schemaVersion": 1,
    "choices": {},
    "currentChapter": 0,
    "progress": {},
    "derived": {
      "flags": {}, "relationships": {}, "inventory": {},
      "knowledge": {}, "quests": {}
    }
  },
  "snapshots": {}
}
```

`canon.derived` includes sourced persistent flags/counters, relationship bases and
modifiers, items/clues, character knowledge and quest state. It must exactly
match registered effects derived from the selected IDs and canonical progress.
Optional `snapshots` are validated resume caches, never a choice authority.
Discovery, recovery history and temporary alternative data are not exported.

`previewImport(input)` parses/migrates/validates detached JSON without writes.
The UI then asks **Загрузить сохранённый путь?** with Cancel/Load buttons.
`importSave(input, { prepare })` repeats validation on the original selected text,
prepares optional resume caches, validates again, persists a recovery checkpoint,
and publishes the candidate through the same atomic authoritative write used
by canon rewrites. Cancellation, malformed JSON, unsupported versions, unknown
choice/option IDs, unmet requirements, conflicting effects, forged sources,
invalid cursors, preparation errors or write failures leave the official save
unchanged. A failed primary write may leave a valid recovery checkpoint; it does
not change in-memory canon. `rollback()` can restore the pre-import checkpoint.

Portable `saveFormatVersion` migrations are explicitly registered in the service's
`portableMigrations` option and must advance exactly one version. Schema migration
uses the existing `migrations` pipeline after creating an envelope candidate.
Version 1 is currently the only shipped portable version; unknown future versions
and absent migration steps are rejected, never guessed. Existing browser save
migrations remain unchanged. Imported derived effects are checked before any
recomputation so tampering is not silently repaired as it can be for a trusted
local legacy cache.

Local Discovery State is retained on import. The imported canon replaces the
whole official path; it is not merged with local choices or alternate state.
An active alternative is discarded only after successful import. The app restores
the imported official cursor, refreshes chapter projections and rebuilds the map.
No second special map save or timeline save is written.

When a user supplies this project together with `reverse_falls_canon_save.json`,
a future Codex session may read the JSON as a dated snapshot of the user's
explicit official choices, relationships, flags, inventory, knowledge and
persistent consequences. Do not assume arbitrary JSON is current or import it
automatically. During play, StoryState remains the runtime source of truth.
After further play/rewrite, export again to obtain an up-to-date transfer file.

## DECISION MAP VISIBILITY

The initial mode is **Full mode**. It and **Entire graph** show the labels and
structure of every implemented branch in the installed chapter graphs. Discovery
continues to record seen scenes, endings and player statistics but does not gate
visibility or registered preview/rewrite actions. Visible does not mean seen,
discovered, played or canonical. Simply opening/selecting a node never grants its
story effects. **My path** still projects only the official route for that chapter.

Preview uses the existing isolated Alternative Session. Only an explicit confirmed
**Change main path** operation requests a transactional rewrite/checkpoint.
The UI never promotes a preview, discovery or exported JSON into canon on its own.
When rewriting a previously unplayed chapter option, the application also prepares
a real coherent entry cursor for that option before publication. Existing earlier
official selections are reused. Any earlier unanswered decisions needed to reach
that scene take their first options; the rewrite confirmation explicitly explains
this. These prerequisite selections, their sourced effects and the target cursor
are committed together, never by a preview or a normal node click.

Only installed chapter graphs are shown. There are no Chapter 2–60 placeholders,
secret future nodes or future callback/consequence disclosures. Descriptions for
current ending choices explain the current scene, not unreleased future effects.

## TRUE STORY / CANON TIMELINE

The **Настоящая история / True Story** tab is a virtual derived view, not a chapter
ID or saved domain. `buildCanonTimeline(storyState.getCanon())` in
`canon-timeline.js` walks registered graphs from each chapter entry to its official
cursor. It filters branch requirements using stable choice/option IDs and follows
canonical travel order. It ignores Discovery State, engine history caches,
Alternative Session and portable files. Chapters without official progress are
omitted; starting Chapter 1 independently does not invent a played Chapter 0.
A route stops at its reached cursor rather than displaying unplayed consequences.

The projection gives each rendered occurrence a namespaced ID (chapter/node plus
an occurrence suffix for repeated town hubs), keeps the stable `nodeId` and
`chapterId` for inspection, and connects consecutive chapter routes by an explicit
chapter-transition edge. Nodes use cyan official-path styling only. Clicking
shows chapter and node information; preview/rewrite controls and handlers are
unavailable in this view. Nothing is persisted by the projection.

To register a newly implemented chapter, supply an ordered descriptor in
`CANON_TIMELINE_CHAPTERS`: `chapterId`, `available`, `entry`, `exit`, localized
chapter label, nodes with stable IDs and scene IDs/choice requirements, and graph
edges. Optional `phaseNodes` maps special cursors (e.g. town travel), and optional
`visitKey` orders visited locations. The existing chapter registrations adapt their
old scene naming; the traversal and rendering have no Chapter 0/1 switch.
A mock Chapter 2 test supplies a third descriptor and proves cross-chapter linking
without a renderer change. This mock is test data only and is never shipped as
playable or visible future content.

Every opening/refresh builds from the current official canon, so rewrite and import
are reflected immediately. Alternatives cannot supply input to this view. Export,
My path and True Story all read the same authoritative StoryState.
