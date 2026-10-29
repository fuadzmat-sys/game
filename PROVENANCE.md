# Source materials

Recreated from the two game-archive volumes supplied by the user.

Joined 7z SHA-256: `8c0c20560ea790bf0df857473212679bb001f2d178440e347742180db63a4e44`.

Uploaded game: Helvest / Reverse Falls The Game / Unity 2019.2.20f1. No original EXE or DLL was executed. Story content, translations, artwork, font glyphs and audio were read as data. Tight-packed sprites were restored to their original transparent canvas dimensions using their original mesh/pivot coordinates. FLAC conversion preserves every decoded PCM sample; the one SDF fallback font was decoded for offline canvas rendering.

Exported named assets: 194 sprites, 83 texture entries, 409 audio clips. Some entries share an original texture. All original in-game credits are retained. Chapter 0 source scripts, original config, manifest, artwork and audio remain unchanged by the Chapter 1 replacement.

## Canon and the new Chapter 1

The user-provided story bible in `docs/story-bible.md` is the main canon. `docs/CHAPTER1_REWRITE.md` contains the exact implementation brief and full Russian script for Chapter 1, «Следы в лесу» / Tracks in the Forest. Both supplied documents are retained without editorial rewriting. Previous Chapter 1 story material is superseded and is not an alternate playable canon.

`tools/build-chapter1.py` compiles the complete Russian scene text from the brief into the separate `chapter_1_v3/` namespace. `tools/chapter1-english.json` provides a complete original English translation keyed by each source paragraph. All eleven scenes, four choices and local variants are included. Script comments retain source line numbers. Branch flag instructions become typed state changes, and future Chapter 2 consequences become handoff metadata rather than invented Chapter 2 dialogue.

## Artwork and scene staging

The new chapter reuses original character sprites, expressions, town and forest backgrounds, and the game's supplied soundtrack. The generated diner interior from the previous Chapter 1 is retained as a location asset. Its old plot is not retained.

New generated illustrations under `assets/chapter1/v3/` provide locations and props missing from the original collection: a damaged-fence yard, a forest clearing, a late-afternoon forest road, a muddy dog, a cloth scrap and a BUSTER collar. A separate transparent Will observer illustration is used provisionally for the last shot: the original tiny sprite had a rectangular backing unsuitable for enlargement. It preserves the blue triangle silhouette and awaits final art-direction review. Existing generated creature illustrations are reused only as Journal-page illustrations. No real creature attack is staged in this chapter. Original art was not repainted; new assets and aliases are listed separately in `assets/chapter1-art.json`.

Procedural birds, wind, breaking branches, a dog's whine, an unidentified low call and the blue spark are produced locally through Web Audio. The blue-glow cue and other effects are renderer state, so they can be restored with a save. These effects provide atmosphere, not early answers to the mystery.

## Dialogue audio

New Chapter 1 has no final voice recordings yet. Old Chapter 1-specific synthetic MP3s and their runtime mappings are removed. Chapter 1 does not use Web Speech or automatic synthetic placeholders. Pending per-line slots and character/delivery requirements are preparation for future acted recordings; they contain no substituted audio. No real actor's or celebrity's voice has been cloned.

Chapter 0's existing delivered speech recordings remain. Those older local recordings were generated with Piper VITS models through sherpa-onnx 1.12.30 and encoded as MP3 using fictional character presets. Exact sources and verbatim primary model cards are retained in `tools/voice-sources.json`. Only prepared audio is shipped; the inference models and runtime are outside the game. This provenance describes the existing Chapter 0 voice pack and does not claim that it is final actor-quality speech. The game does not contact an external voice service.
