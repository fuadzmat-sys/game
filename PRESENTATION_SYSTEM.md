# Reverse Falls — Presentation System

## Purpose

The presentation layer makes scenes feel alive without changing story logic. It is deliberately separate from choices, flags and campaign state: presentation commands may move the camera, animate a character, change ambience or add a visual layer, but they never decide story outcomes.

The implementation is backward-compatible. Chapter 0 keeps its existing commands. Chapter 1 uses the new commands selectively. Old saves that do not contain `presentation` data are restored with safe defaults.

## Architecture

- `presentation.js` — stable preset IDs, defaults, expression fallbacks and state normalization.
- `engine.js` — parses presentation commands and stores final presentation state in the normal snapshot.
- `app.js` — renders camera movement, transient character animations, ambience, music fades, background FX and accessibility settings.
- `style.css` — animation/camera/background-effect presets.
- `tools/build-chapter1.py` — applies presentation direction to authored Chapter 1 moments while preserving all dialogue and choices.

Persistent scene state is stored under `snapshot.presentation`:

```js
{
  camera: { zoom: 1, x: 0, y: 0, focus: null, duration: 0, easing: "ease" },
  backgroundEffect: null,
  ambience: null,
  ambienceFade: 0,
  choiceImportance: "normal"
}
```

Short transient animations (a recoil or a shake) are not stored mid-frame. On load, their final logical state is restored, which is intentional for 0.2–0.6 second effects.

## Commands

### Character expression

```text
[expression Pacifica annoyed transition .2]
[expression Gideon deadpan transition .15]
```

The engine stores the selected expression. If an exact Chapter 1 art asset is missing, the renderer uses a character-specific fallback and logs a warning rather than breaking the scene.

### Character animation preset

```text
[anim Pacifica surprise_jump]
[anim Gideon lean_forward duration .4]
```

Available stable IDs:

- `enter_left`
- `enter_right`
- `exit_left`
- `exit_right`
- `small_shake`
- `big_shake`
- `surprise_jump`
- `recoil`
- `lean_forward`
- `step_forward`
- `step_back`
- `sad_drop`

The existing `[char ...]` command also accepts `duration`:

```text
[char Pacifica show left from outleft duration .45]
[char Gideon move -350 duration .3]
```

### Camera

```text
[camera reset duration .5]
[camera preset close duration .8]
[camera zoom 1.08 duration 1.2]
[camera pan left duration .8]
[camera focus Pacifica zoom 1.08 duration .6]
[camera shake small]
```

Camera presets:

- `normal`
- `medium`
- `close`
- `dramatic`
- `horror`

Shake strengths:

- `small`
- `medium`
- `big`

### Background effects

```text
[fx forest_wind]
[fx dark_vignette]
[fx electric_blue]
[fx clear]
```

Available stable IDs:

- `forest_wind`
- `forest_fog`
- `rain_light`
- `rain_heavy`
- `dust`
- `electric_blue`
- `dark_vignette`
- `mirror_distortion`
- `cafe_warm`

These are lightweight CSS layers, not video backgrounds.

### Ambience

```text
[ambience forest_day fade 1]
[ambience forest_tension]
[ambience road_night]
[ambience stop]
```

Current synthetic ambience presets reuse the local Chapter 1 sound system:

- `forest_day`
- `forest_tension`
- `road_night`

A future ambience ID may also point to a normal audio asset; the renderer will loop it on the dedicated ambience channel.

### Music transitions

Existing music commands still work. Optional transition metadata is now supported:

```text
[music curious fade .8]
[music forest_day_1 crossfade fade 1.2]
[music stop fade .7]
```

### Choice importance

```text
[Choice importance important]
```

Values: `minor`, `normal`, `important`.

Important Chapter 1 decisions receive a restrained visual confirmation delay. No future consequence is revealed.

### Pause / timing

The existing command remains the canonical pause command:

```text
[wait .5]
```

Inline waits still pause text reveal at the authored point. Auto mode still waits for voice playback when voice is available; Skip collapses presentation delays and does not wait for transient animations.

## Expressions

The renderer supports the broader semantic expression vocabulary even when new art has not been drawn yet. Current fallback examples:

### Pacifica

`neutral`, `smile`, `smug`, `annoyed`, `angry`, `surprised`, `scared`, `suspicious`, `sad`, `embarrassed`, `determined`.

### Gideon

`neutral`, `deadpan`, `mild_smile`, `annoyed`, `suspicious`, `surprised`, `scared`, `uncomfortable`, `embarrassed`, `sad`, `angry`.

`deadpan` intentionally falls back to Gideon's restrained idle art when no dedicated head is present.

## Sound categories

Settings now expose:

- Master
- Music
- Voice
- SFX
- Ambience

Master multiplies the other channel volumes. Existing Chapter 0 and Chapter 1 sound playback remains supported.

## Effects Quality and Reduced Motion

`Effects Quality` has High / Medium / Low.

- High: full lightweight FX.
- Medium: reduced FX opacity.
- Low: background FX and recurring synthetic ambience are disabled; story transitions remain intact.

`Reduced Motion` reduces camera displacement and zoom, disables transient character motion and suppresses camera shake. The browser `prefers-reduced-motion` setting is also respected in CSS.

## Save / Load

The snapshot stores the final camera, background effect and ambience state. Loading does **not** attempt to recreate the middle of a short animation; it restores the scene's stable end state.

Legacy snapshots with no `presentation` object are normalized to `defaultPresentationState()` and remain loadable.

## Skip / Auto

- Skip uses near-instant scene effects and does not block on camera/character animation.
- Auto continues to respect voice playback and normal reading buffer.
- Presentation events do not alter choices or flags.

## Chapter 1 usage

The upgrade is applied selectively:

- Cafe: warm layer, bell cue, restrained camera focus, Gideon deadpan timing.
- Yard / broken fence: short movement and focus rather than long sprite slides.
- Forest edge / tracks: recurring wind/birds ambience and subtle camera push.
- Dog false alarm: short crack cue, small camera shake, Pacifica jump/recoil, Gideon deadpan.
- Deep forest: vignette, tension ambience and slow camera tightening.
- Clearing / watched scene: closer framing and reduced music.
- Blue glow / Will ending: electric-blue layer, restrained spark SFX and slow dramatic focus.

No Chapter 1 dialogue, jokes, choice labels or story flags were rewritten for this presentation pass.

## Debug preview

With the game open, the browser console can use:

```js
game.presentation.preview("animation", "surprise_jump", "pacifica")
game.presentation.preview("camera", "close")
game.presentation.preview("fx", "electric_blue")
game.presentation.preview("sfx", "branch_crack")
```

This is intentionally a development helper, not player UI.

## Adding presentation to future chapters

Prefer stable semantic IDs, not filenames or low-level DOM code.

Example:

```text
[BG change forest_day time 1]
[ambience forest_day fade 1]
[fx forest_wind]

[char Pacifica show left]
[expression Pacifica suspicious transition .15]
[char Gideon show right]
[expression Gideon deadpan transition .15]

[Pacifica]
Ты это слышал?

[wait .3]
[expression Gideon suspicious transition .15]
[camera zoom 1.05 duration .8]
[sfx branch_crack]

[Gideon]
Да.

[wait .5]
[music curious crossfade fade 1.2]
```

Do not write direct `sprite.style...`, `setTimeout(...)` or raw `audio.play()` logic into future story files. Add or reuse a stable presentation command/preset instead.
