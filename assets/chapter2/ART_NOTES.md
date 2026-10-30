# Chapter 2 visual production notes

All Chapter 0 and Chapter 1 source artwork is preserved. Existing protagonist sprites, expressions, the diner, forest and road backgrounds, the Journal #3 illustration and Buster's dog sprite are reused through the existing renderer.

Five new backgrounds are registered in `assets/chapter2-art.json`: the watch-hut interior, rock hollow, hidden animal shelter, drainage entrance and concrete drainage tunnel. Each is 1672 × 941. The shelter background includes one small live dog and two cats; Buster is the existing separate dog sprite. The tunnel illustration includes the gate, chain, valve, pipes, side route and shallow water used in the action. `hidden-shelter-base.png` is retained as the production source before the animal-detail edit and is not referenced at runtime.

## Provisional creature staging

**Intelligent Creature design — PROVISIONAL**

Three transparent 1024 × 1536 illustrations provide neutral, defensive and listening postures. The renderer exposes the six requested semantic expressions with explicit reuse: `alert` uses neutral, `distrustful` uses defensive and `calmer` uses listening. `silhouette` uses the neutral artwork with a dark CSS filter. These are restrained body-posture variants, not six separately drawn faces. No species, origin, power or future story is established by the design.

**Predator design — PROVISIONAL**

Three transparent 1536 × 1024 illustrations provide crouched, aggressive and recoiling postures. A fourth transparent image contains only the eye-reflection reveal, so the early tunnel beat does not expose the full body. A dark silhouette expression reuses the crouched sprite. The recoiling pose shows an alive, uninjured animal retreating. It does not confirm the predator's death or permanent defeat.

**Unknown Symbol design — PROVISIONAL**

The replaceable vector prop is `props/symbol_ch2_unknown_provisional.svg`: an incomplete ring with a lower gap, one inner vertical stroke and two angular notches. It contains no eye, triangle, blue glow or deciphered meaning. Its identifier remains stable so a later approved design can replace the file without changing story/state data.

The backgrounds and sprite edits were generated as original illustrations for this implementation, using the existing Chapter 2 base sprites to preserve visual continuity across their pose variants. Every runtime image was visually inspected. The art manifest records source dimensions, logical stage dimensions, explicit expression aliases and provisional status. `Mimic` is a dialogue-only speaker; it never creates a visible human cameo or a new character sprite.

Final species designs and expression art remain subject to the user's art-direction review. Provisional status is production metadata, not an in-game lore statement.
