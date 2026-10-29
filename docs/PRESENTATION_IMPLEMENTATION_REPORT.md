# Presentation / Animation Upgrade — Implementation Report

## Files changed

Core runtime:
- `app.js`
- `engine.js`
- `style.css`
- `index.html`
- `chapter-audio.js`
- `presentation.js` (new)

Chapter 1 / generated runtime data:
- `tools/build-chapter1.py`
- `assets/chapter1-scripts.json`
- `assets/chapter1-voice-plan.json` (regenerated)
- `data.js` (regenerated)
- `game.bundle.js` (regenerated)

Build / tests / docs:
- `tools/simple-bundle.mjs` (new dependency-free local bundler)
- `tests/presentation.test.mjs` (new)
- `package.json`
- `package-lock.json`
- `PRESENTATION_SYSTEM.md` (new)

## New systems

- Persistent camera state with zoom, pan, focus and presets.
- Transient character animation presets.
- Soft expression transitions with safe art fallback.
- Lightweight animated background FX.
- Dedicated ambience preference/channel plus synthetic forest ambience presets.
- Music fade and crossfade metadata.
- Choice importance presentation.
- Master / Music / Voice / SFX / Ambience volume controls.
- Effects Quality and Reduced Motion settings.
- Presentation debug preview API.
- Backward-compatible legacy-save normalization.

## Commands

Added: `expression`, `anim`, `camera`, `fx`, `ambience`, and `Choice importance` plus `duration` on character motion and `fade/crossfade` on music.

See `PRESENTATION_SYSTEM.md` for syntax and stable preset IDs.

## Chapter 1

Presentation was added to authored moments rather than every line. The cafe uses a warm layer and bell cue; forest scenes use wind/birds ambience and restrained camera motion; the dog false alarm uses short reaction timing; the deep-forest/clearing sequence progressively tightens the frame; the blue-glow/Will ending uses the electric-blue identity without turning every line into a large effect.

The Chapter 1 compiler still preserves all canonical Russian source paragraphs and English translations. Dialogue and choice labels were not rewritten.

## Performance

- Background animation uses CSS layers instead of video.
- Low Effects Quality disables background FX and recurring synthetic ambience.
- Transient animations remove their classes after completion.
- Existing scene assets remain unchanged.
- No new large media assets were added.

## Accessibility

- Reduced Motion reduces zoom/pan, disables character motion presets and suppresses camera shake.
- CSS also respects `prefers-reduced-motion`.
- Effects Quality can reduce visual load independently.
- Audio now has separate master and ambience controls.

## Missing assets

No new character art was generated. Semantic expressions therefore fall back to the closest existing expression where needed. In particular, Gideon's `deadpan` currently uses his restrained idle artwork. This is a deliberate fallback, not a missing-state crash.

No bespoke cafe-room ambience recording was added; the cafe uses the existing music plus a local bell cue. Forest ambience uses the existing local synthetic SFX engine.

## Tests performed

- Full existing `npm test` suite: passed.
- New presentation-state / save compatibility tests: passed.
- All Chapter 1 path traversal tests: passed (486 combinations across Russian/English and three Chapter 0 creature states).
- Existing Chapter 0 traversal tests: passed.
- Save/restore tests: passed.
- Flowchart / jump tests: passed.
- Audio / voice-pack tests: passed.
- Font/layout tests: passed.
- `npm run build`: passed with the new dependency-free bundler.
- `node --check game.bundle.js`: passed.
- Static HTTP retrieval of `index.html`, `data.js`, `game.bundle.js` and `style.css`: HTTP 200.

A real graphical browser was not available in the build environment, so final visual taste (exact zoom strength / timing) should still be judged by playing the packaged build on Windows. The automated story, save, audio and build checks all pass.

## Known limitations

- No lip sync.
- No new bespoke facial art; fallbacks are used where art is missing.
- Dynamic ambience is intentionally lightweight and currently strongest in forest scenes.
- The presentation debug API is console-based rather than a dedicated in-game developer panel.
- Exact visual feel still benefits from human playtesting on the target display.
