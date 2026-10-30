# Chapter 2 — «Не тот монстр» / “The Wrong Monster”

The chapter extends the supplied `game-main` project, imported at `505ab35`.
It uses the existing interpreter, Presentation System, CanonStoryState,
Discovery, AlternativeSession, save/import/export and decision-map systems.
No parallel chapter engine or second canonical state store was added.

## Story and scope

- Nine scenes, three decisions and one shared symbol ending.
- Nineteen resources per language: Russian and English, 38 resources total.
- The Russian source contains 634 paragraphs and 5,754 words; each language
  compiles to 3,011 physical script lines. Russian is approximately 1.30× the
  rewritten Chapter 1 by the same word-count method. English contains 7,431
  words because the full text was translated rather than shortened.
- Pacifica initiates much of the investigation; Gideon reconstructs the evidence
  and identifies the water tactic. Their spoken-word balance is approximately
  54/46. Their relationship remains an early friendship without romance.
- The Creature speaks in short fragments. The Predator retreats; its death,
  permanent defeat and future return are not established. `Neutralize` sets
  nonlethal boundaries and does not turn into an execution.
- Will is discussed briefly but never appears. No unsolicited familiar-character
  cameo, Journal author revelation, Journal #1 revelation, symbol explanation
  or future chapter implementation was added.

## Files changed and added

| Area | Files |
| --- | --- |
| Chapter registration and continuity | `campaign.js`, `story-bridge.js`, save-version defaults in `story-state.js` |
| Existing maps and replay | `flowchart.js`, `flowchart-view.js`, `flow-jump.js`, `canon-timeline.js` |
| Runtime and presentation integration | `app.js`, `engine.js`, `chapter-audio.js`, `index.html`, `style.css` |
| Build integration | `tools/build-data.py`, `package.json`, `package-lock.json`, generated `data.js`, `game.bundle.js` |
| New narrative sources | `tools/chapter2-content-part1.json`, `tools/chapter2-content-part2.json`, `tools/build-chapter2.py` |
| Generated chapter data | `assets/chapter2-scripts.json`, `assets/chapter2-build-report.json`, `assets/chapter2-voice-plan.json` |
| Modular artwork | `assets/chapter2-art.json`, `assets/chapter2/backgrounds/`, `assets/chapter2/sprites/`, `assets/chapter2/props/` |
| Audio | `assets/chapter2-audio.json`, `assets/chapter2/audio/`, `tools/build-chapter2-audio.py` |
| New QA | `tests/chapter2.test.mjs`, `tests/chapter2-state.test.mjs`, `tests/chapter2-audio.test.mjs`, `tests/chapter2-browser.test.mjs` |
| Shared regression assertions | `tests/engine.test.mjs`, `tests/campaign.test.mjs`, `tests/story-bridge.test.mjs`, `tests/story-map-ui.test.mjs`, `tests/canon-timeline.test.mjs` |
| Documentation | `README.md`, `STORY_STATE_ARCHITECTURE.md`, this report |

The shared interpreter additions are backwards-compatible initial inventory,
read-only conditional paragraphs and per-cue music gain. Existing Chapter 0/1
choice IDs and save keys remain stable. Old saves omit Chapter 2 choices and
therefore load with those choices unset. New save/export metadata defaults to
game version `4.0.0`; existing imported metadata is preserved. The story-state
schema and canonical model are unchanged.

## Decisions and sourced effects

| Stable choice ID | Options | Consequence |
| --- | --- | --- |
| `ch2.trail_focus` | `LargeTracks`, `Journal`, `Perimeter` | Both protagonists learn, respectively, `ch2_large_fiber`, `ch2_track_mismatch` or `ch2_tracks_separate`. All branches rejoin at the watch hut. |
| `ch2.threat_plan` | `Distract`, `Block`, `Protect` | `Block` grants both protagonists `ch2_predator_reacts_to_motion`; `Protect` adds +1 to the existing `pacifica_gideon` relationship. All branches rejoin at the water climax. |
| `ch2.creature_fate` | `Help`, `Expel`, `Neutralize` | `Help` adds +1 to `creature_trust`. All options persist independently and rejoin at the shared symbol ending. |

Effects are derived from choice sources by the existing registry. Replaying or
rewriting a decision does not stack duplicate relationship modifiers or leave
knowledge from a discarded branch. The interpreter's short flag names
`trail_focus`, `threat_plan` and `creature_fate` are projections of those choices.
The prior `journal_doubt` value is preserved rather than overwritten.

## Transition, saves and maps

Completing the real canonical Chapter 1 unlocks Chapter 2 in the chapter picker
and on the Chapter 1 ending screen. Chapter 2 starts the next morning at 10:30.
It seeds its monster, prior decisions, relationships, flags and inventory from
the player's actual canon. It supports Werewolf, Wendigo and Vampire saves and
all three valid Chapter 1 endings. Ordinary water, flashlight and backpack
preparation do not become supernatural items or persistent loot.

The supplied `reverse_falls_canon_save (6).json` remains an optional portable
save and a test fixture. It is not automatically imported and does not replace
the player's route. Its intended path is Wendigo / Openness / Journal /
Pacifica / Cautious, relationship 2, openness 1, Journal doubt 1 and `journal_3`.
An earlier route's `cloth_scrap`, if earned, also survives the transition.

The Chapter 2 map has 19 nodes and 24 edges, with three local splits and clear
rejoins. True Story joins the existing chapters into the real canonical path;
alternate exploration remains isolated. The final decision remains available
to future content without adding a runtime Chapter 3 or exposing future lore.

## Reused and new assets

Existing café, forest road, investigation forest and deep forest backgrounds,
Pacifica/Gideon designs and expressions, Journal #3 artwork and real inventory
object, Buster's dog sprite, music, bell/branch/dog SFX, transitions, restrained
camera effects and choice UI are reused. Main characters were not redesigned.

Five new backgrounds cover locations not represented by suitable old assets:
the watch hut interior, rocky hollow, animal shelter under roots, concrete
drainage entrance and concrete maintenance tunnel. The tunnel includes water,
pipe/valve, grate and side passage. The shelter includes supporting living
animals; Buster uses the existing foreground dog sprite. Simple investigative
props are embedded in the new backgrounds where suitable rather than added
as redundant persistent objects.

The new creature art is modular, generic and replaceable:

- **Intelligent Creature design — PROVISIONAL.**
- **Predator design — PROVISIONAL.**
- **Unknown Symbol design — PROVISIONAL.**

Creature neutral/defensive/listening and Predator crouched/aggressive/recoiling
are three distinct illustrated postures each. Creature alert reuses neutral,
distrustful reuses defensive and calmer reuses listening; those aliases are
documented in the art manifest. Dark silhouettes reuse filtered poses; the
Predator's first eye reflection uses a dedicated isolated cutout so its full
body remains concealed until the later reveal.
This is a small replaceable production set rather than six separately painted
Creature expressions presented as finished canon.

The three fate branches select calmer, defensive and distrustful staging as
appropriate; the new pose illustrations therefore appear in actual play.
Tunnel scenes use Pacifica's existing serious/focused expression rather than
the café smile. The low-profile Predator is positioned high enough for its
clear reveal to remain visible above the dialogue panel. The symbol has a
timber-post backing so the final close-up
reads as a carved mark instead of a floating icon. Its four glyph paths remain
separate from that replaceable backing.

These labels also apply to their names, species, origin, wider connections and
the observed imitation ability. No encyclopedia or origin lore was invented.
The symbol is a separate SVG with an incomplete ring, inner vertical mark,
side notches and lower gap; it is not blue, an eye, a triangle or a Cipher icon.

## Audio and voice limitations

Seven original environmental Foley clips cover cup, wood creak, stream,
tunnel drips, grate, valve and rushing water. Stream/tunnel ambience loops,
reused music and selected existing effects support restrained horror cues.
Local one-shots replace repeats and allow at most two overlapping recordings.

Four Russian spoken lures are independently text-designed fictional Qwen3-TTS
drafts: the Buster call, Pacifica's longer call, «Я здесь» and Gideon's
«Я рядом». No actor reference, original-game voice recording, voice cloning,
pitch shift or tempo shift was used. Provenance, immutable model revision,
generation descriptions, hashes and actual ASR output are included beside the
audio. ASR matches three clips; the longer Pacifica call is recognized with
«Гидион» rather than «Гидеон». This pronunciation and the performances require
listener review. ASR is not proof of naturalness, age or final voice approval.

These are diegetic SFX, not a completed character dub. Russian spoken lures are
suppressed in English. **English spoken lures and full dialogue voice acting
remain pending.** Missing dialogue recordings stay silent; Chapter 2 never
falls back to Chapter 0 text hashes, browser speech or robotic filler voices.

## QA evidence and release checks

The following were run directly against the continued repository state:

- `node tests/chapter2-state.test.mjs` — 9/9 passed: all 27 local combinations
  in both languages; real carryover, replay, rewrite, canonical completion,
  source-based effects and True Story.
- `node tests/chapter2-audio.test.mjs` — 8/8 passed: recorded-only chapter slots,
  no original/system fallback, missing/failed recording behavior, bounded local
  effects, valid Foley files/hashes, language gating, spoken-lure provenance
  and all 1,268 pending voice contexts matching real interpreter dialogue.
- `node tests/chapter2.test.mjs` — 12/12 passed on 486 complete plays:
  27 Chapter 2 combinations × 2 languages × 3 earlier monsters × 3 earlier
  endings. All 38 resources and nine scenes were reached. Sixty before/after
  decision and climax/aftermath/finale save restorations reproduced remaining
  text, flags, inventory, presentation and derived state. The asset check also
  validates every expression replacement file, PNG dimensions, documented pose
  aliases, distinct postures and provisional metadata.
- `git diff --exit-code 505ab35 -- assets/chapter1-scripts.json
  assets/chapter1-art.json assets/config.json assets/manifest.json presentation.js
  tools/build-chapter1.py tools/build-chapter1-voice-plan.mjs`
  — passed: those existing narrative, asset and presentation sources
  were unchanged at the audit checkpoint.

Final rebuilt-game and regression results are recorded below. Asset checks cover
the shipped expression replacements as well as the default poses.

### Final integration results

- `npm test` — 196 `node:test` cases plus seven map-UI and five timeline groups
  passed across the 17 test families after the final visual integration. The
  expanded expression-path asset check is included in that passing run.
- Existing actual Chromium regression — 15 checks passed, browser errors `[]`:
  Chapter 0/1 play, choices, carryover, isolated alternatives, source-based
  rewrites, quota failure handling and legacy save recovery.
- Existing portable-save Chromium regression — nine checks passed, browser
  errors `[]`: actual JSON download, file validation/cancellation/confirmed
  import, reload persistence, read-only True Story and invalid-file rejection.
- Dedicated Chapter 2 Chromium integration — nine groups passed with browser
  errors `[]` on the final post, mood and raised-Predator staging: real import
  and Chapter 1 ending transition; gated start; cursor/presentation saves before
  and after a decision; all nine scenes and three choices; live asset loading;
  climax restoration; relationship/knowledge effects; Chapter 2/True Story maps;
  isolated alternatives; confirmed rewrite; export/import into another browser
  context; and complete Russian/English play without browser TTS.
- Final isolated eye-placement Chromium check — three checks passed, errors
  `[]`: both reflected points are visible without the full body, the later full
  reveal resets the horizontal staging offset and shows the head/forelimbs, and
  play continues through the saved completed `Help` ending.

## Known limits

- Creature, Predator and symbol designs require canon approval and are intended
  to be replaceable. Provisional observations do not establish global lore.
- Full character dialogue VO and English imitation recordings are pending.
  Existing readable dialogue remains complete in both languages.
- Generated Russian imitation cues are drafts with the pronunciation caveat
  above, not approved final casting.
- English's 7,431-word translation is slightly above the approximate 5,000–7,000
  target; the Russian original meets the requested scale without trimming text.
- No Chapter 3 story or promised future creature reappearance is implemented.
