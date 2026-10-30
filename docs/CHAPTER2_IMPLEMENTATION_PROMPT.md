# CODEX IMPLEMENTATION PROMPT — COMPLETE CHAPTER 2

Implement the complete playable **Reverse Falls Chapter 2 — «Не тот монстр» / “The Wrong Monster”** in the existing project.

This is an implementation task for the EXISTING visual novel.

Do NOT create a parallel Chapter 2 engine or a second story-state system.

Before modifying anything, inspect the current project architecture and reuse the systems already used by Chapter 0 and the rewritten Chapter 1.

---

# 0. CANON PRIORITY

The external story bible remains the highest-level canon source.

The canonical save state for the current intended playthrough is:

```text
ch0.creature = Wendigo

ch1.gideon_reason = Openness
ch1.tracks = Journal
ch1.slope = Pacifica
ch1.ending = Cautious

pacifica_gideon = 2
gideon_openness = 1
journal_doubt = 1
chapter1_cautious_end = true

inventory:
journal_3
```

Do NOT treat viewed alternate Chapter 1 branches as the active canon state.

However, Chapter 2 implementation must remain technically compatible with valid Chapter 1 saves where possible.

Never rename old choice IDs or break Chapter 0/1 save compatibility.

---

# 1. CRITICAL CANON RULE

Any newly introduced:

- monster;
- supernatural species;
- ability;
- artifact;
- world rule;
- character history;
- organization;
- lore connection;
- origin;
- global mystery;
- symbol meaning;

is PROVISIONAL unless explicitly approved by the user.

For Chapter 2 implementation, the script currently contains provisional concepts called:

```text
Intelligent Creature / Существо
Predator / Хищник
```

Their exact species, canonical names, origins and wider lore are NOT established.

Implement only what Chapter 2 visually requires.

Do NOT add encyclopedia entries, hidden lore explanations, origin files or future-story assumptions.

---

# 2. SCALE AND PACING

Use the rewritten Chapter 1 as the pacing reference.

Chapter 2 should feel approximately **1.2–1.3× Chapter 1**, not like several chapters merged together.

Target:

```text
9 scenes
roughly 5000–7000 words
roughly 2300–3300 script lines depending on engine formatting
3 meaningful choices
```

Do not artificially pad scenes.

Do not add extra choices merely to increase branching.

The structure is:

```text
Scene 1 — 10:30
Scene 2 — Two Tracks
Scene 3 — Too Convenient
Scene 4 — Found
Scene 5 — Not Him
Scene 6 — The Real Picture
Scene 7 — The Real Threat
Scene 8 — What To Do With The Monster
Scene 9 — Symbol
```

---

# 3. CHARACTER RULES

## Pacifica Southeast

Age: 14.

Must remain:

- active;
- curious;
- brave;
- impulsive;
- often acts first;
- enjoys investigation;
- sometimes overconfident;
- capable of admitting a mistake.

After Chapter 1, she no longer treats Journal #3 as infallible.

Do NOT turn her into a generic fearless “cool girl”.

She can be scared, embarrassed, mistaken and uncertain.

She is usually the character who pushes the scene forward.

---

## Gideon Pines

Age: 12.

He is NOT a constant coward.

Core traits:

- deadpan;
- dry sarcasm;
- calmness;
- restrained reactions;
- observational ability;
- notices contradictions;
- reads people;
- rarely shows strong emotion.

He may feel fear.

When afraid, he reacts rationally rather than hysterically.

His strong vocal reaction during the climax should have weight precisely because he is normally restrained.

Do not make him a comedy coward.

---

## Pacifica + Gideon

No romance.

They have only recently started becoming real friends.

At this point they:

- trust one another somewhat;
- tease one another;
- are beginning to understand one another;
- still misread each other;
- still argue;
- are learning teamwork.

The long-term direction is almost sibling-like.

Do NOT write them as if they have known each other for years.

---

# 4. SCENE 1 — 10:30

Location:

existing café used in Chapter 1.

Time:

morning, 10:30.

Reuse the Chapter 1 café background wherever possible.

The scene is intentionally shorter than the previously drafted Chapter 2 Scene 1.

Story beats:

1. Pacifica waits at the café.
2. It is 10:29.
3. She insists she is not “waiting”.
4. Gideon arrives exactly at 10:30.
5. Callback to his 17-minute lateness in Chapter 1.
6. Gideon again orders hot chocolate.
7. Pacifica reveals Journal #3.
8. They discuss yesterday's evidence.
9. Pacifica explicitly says they should stop trying to confirm the Wendigo theory and instead examine what actually exists.
10. Brief discussion of Will's blue glow.
11. Pacifica is suspicious.
12. Gideon admits Will's presence bothers him but reminds her that Will saved his life.
13. They agree to finish the animal investigation first.
14. Leave café.

No choice in Scene 1.

Do not overanimate.

Use:

- small expression changes;
- one or two pauses for jokes;
- slight camera emphasis when Will is mentioned;
- no supernatural VFX.

Audio:

- café ambience;
- quiet morning music;
- cups / door bell SFX;
- music slightly lower during Will discussion.

---

# 5. SCENE 2 — TWO TRACKS

Location:

old forest road / Chapter 1 investigation area.

Reuse existing forest-road and forest backgrounds if visually suitable.

Pacifica has brought ordinary practical supplies:

- flashlight;
- water;
- small backpack.

These are normal mundane objects, not supernatural artifacts.

Do not automatically add them to persistent inventory unless the engine requires a temporary scene prop.

They find:

- larger tracks;
- a second set of smaller tracks.

They realize the two sets may belong to separate creatures.

This naturally creates the first choice.

---

## CHOICE 1

Choice ID:

```text
ch2.trail_focus
```

Options:

```text
LargeTracks
Journal
Perimeter
```

### LargeTracks

They follow the larger tracks slightly more closely.

Find a pale rough fiber caught on bark.

Effect/knowledge:

```text
ch2_large_fiber
```

Do not make it a major inventory item unless the current state architecture strongly prefers inventory.

---

### Journal

Pacifica compares track anatomy with Journal #3.

Notices weight distribution does not perfectly match.

Effect/knowledge:

```text
ch2_track_mismatch
```

This should reinforce the theme already represented by:

```text
journal_doubt
```

Do not overwrite the old value.

Use the existing effect/state mechanism.

---

### Perimeter

They inspect around the obvious trail.

Discover that the smaller tracks curve around / avoid the larger ones.

Effect/knowledge:

```text
ch2_tracks_separate
```

---

All three branches reconverge.

They discover an old forest watch hut.

---

# 6. SCENE 3 — TOO CONVENIENT

Location:

old forest watch hut.

New background probably required unless an existing abandoned cabin/hut asset fits.

Visual requirements:

- small wooden structure;
- partially rotten;
- damaged window;
- old table;
- shelves;
- dust;
- old map or faded paper;
- scratches on wall;
- metal water bowl;
- small bits of different-coloured animal fur.

The evidence initially looks extremely good for the Wendigo theory.

Important investigation details:

- scratches match the kind of shape Pacifica expects;
- scratches are old;
- several fur colours are present;
- there is clean water;
- no blood;
- no fresh remains.

Gideon notices that the evidence looks too convenient.

Keep humour short and natural.

At the end:

- exterior branch snap;
- silhouette passes window;
- creature looks large and vaguely consistent with Pacifica's theory;
- Pacifica follows.

Do NOT fully reveal the creature yet.

Horror timing:

- lower music;
- increase forest ambience;
- use one branch crack;
- brief silence;
- silhouette through window;
- no loud jumpscare sting unless existing VN style strongly supports one.

---

# 7. SCENE 4 — FOUND

Location:

rocky hollow / forest depression.

A new background may be required.

The Intelligent Creature receives its first clear visual reveal.

IMPORTANT:

Its exact final design is provisional.

Do NOT lock a species name into global lore.

Suggested visual requirements only:

- taller than Pacifica;
- thin but physically capable;
- unsettling forest silhouette;
- some branch-like / irregular shapes around upper silhouette;
- visually plausible enough at distance to be mistaken for the selected Wendigo theory;
- not obviously cute;
- not obviously demonic;
- not designed as a clear villain.

It speaks.

Use sparse language.

It should NOT suddenly speak perfect conversational Russian.

Example delivery:

```text
Нет.
Не оно.
Немного.
Живы.
Тихо.
Другое.
```

The creature claims the animals are alive and leads them somewhere.

No choice here.

The scene itself is the surprise.

Do not interrupt it with an unnecessary UI choice.

---

# 8. SCENE 5 — NOT HIM

Location:

hidden forest shelter / natural clearing under roots.

New background likely required.

Visual details:

- protected clearing;
- old boxes;
- cloth;
- bowls with water;
- several living animals.

Buster is alive.

Several missing animals are alive.

The Intelligent Creature explains imperfectly:

- it found the animals after they left;
- it brought them here;
- it removed noisy collars;
- something else hears / hunts them;
- the other thing uses a voice.

The creature is not revealed to be universally good.

It has made its own decisions about taking and hiding animals.

This preserves later moral ambiguity.

Important character scene:

Pacifica realizes her original theory was badly wrong.

She feels responsible.

Gideon says:

```text
Мы были вдвоём.
Я пошёл с тобой сам.
Не собирай себе все ошибки.
```

Keep this emotionally restrained.

Do not make it sentimental.

They are still early friends.

Then the real supernatural hook:

A human voice calls:

```text
Бастер...
Бастер... домой...
```

The pronunciation becomes subtly wrong.

The Intelligent Creature confirms:

```text
Не люди.
Голос людей.
```

IMPORTANT:

The Predator's ability to imitate heard sounds is PROVISIONAL.

Implement it only as required for this chapter.

Do not invent an origin for the ability.

---

# 9. SCENE 6 — THE REAL PICTURE

Location sequence:

forest → stream → old drainage entrance.

Use existing forest assets where possible.

A new drainage entrance background may be required.

This is Gideon's main investigation payoff.

He reconstructs the evidence:

```text
the fence broke outward
animals willingly left
collars were removed later
large and small tracks were separate
large creature found animals afterward
small tracks were present earlier
```

Conclusion:

The smaller creature was not chasing the animals after the Intelligent Creature.

It was leading/luring them first.

Pacifica recognizes that they selected the obvious large tracks because they were already looking for a large monster.

This is the Chapter 2 payoff to confirmation bias established in Chapter 1.

They hear a repeated animal noise.

Then near the drainage tunnel, the Predator imitates Pacifica:

```text
Гидеон?
Гидеон, иди сюда.
```

The real Pacifica is standing beside him.

Do not fully reveal Predator design yet.

End with them entering / approaching the tunnel.

---

# 10. PREDATOR DESIGN — PROVISIONAL

The exact design is NOT canon.

For implementation, create only a functional Chapter 2 visual concept.

Requirements:

- animal-like;
- smaller than the Intelligent Creature;
- low body profile;
- fast;
- unnerving rather than gigantic;
- visually different from a Wendigo;
- not humanoid enough to confuse the two at close range;
- reflective eyes suitable for dark reveal;
- long forelimbs may be used if it works visually.

Do NOT create lore text explaining what species it is.

Do NOT add it to Journal #3 unless later explicitly approved.

---

# 11. SCENE 7 — THE REAL THREAT

Location:

old drainage / maintenance tunnel.

New background required.

Suggested layers:

- concrete tunnel;
- shallow water;
- pipes;
- rusted maintenance elements;
- hanging old chain;
- damaged gate/grating;
- dark side passage.

The heroes find:

- torn collars;
- signs that animals were brought here;
- one living trapped dog.

The Predator appears.

Use partial reveal first.

It mimics voices it previously heard.

It should use:

- Pacifica's voice;
- Gideon's voice;
- one or two generic human calls.

Do not overuse the gimmick.

The effect is strongest when sparse.

Gideon recognizes it is trying to separate them.

This naturally creates Choice 2.

---

# 12. CHOICE 2

Choice ID:

```text
ch2.threat_plan
```

Options:

```text
Distract
Block
Protect
```

---

## Distract

Pacifica distracts the Predator with movement/noise while Gideon frees the dog.

Emphasize Pacifica's action tendency.

Persistent value:

```text
ch2.threat_plan = Distract
```

No permanent relationship effect required.

---

## Block

Gideon notices an old metal gate / grating.

They lure the Predator into the correct position and temporarily block it.

Potential knowledge:

```text
ch2_predator_reacts_to_motion
```

Persistent value:

```text
ch2.threat_plan = Block
```

---

## Protect

They remain together and prioritize getting the dog out.

This is slower and riskier but shows teamwork.

Persistent:

```text
ch2.threat_plan = Protect
```

Relationship:

```text
Pacifica ↔ Gideon +1
```

Use the project's existing relationship-effect mechanism.

Do not create a duplicate relationship variable if one already exists.

---

# 13. CHOICE 2 CONVERGENCE / CLIMAX

All branches reconnect.

The Predator continues pursuing them.

Gideon observes it repeatedly avoids standing water.

He realizes water can be used tactically.

This is his strongest observation moment in the chapter.

He may raise his voice once when Pacifica asks how he knows.

The strong reaction should be noticeable because Gideon is normally restrained.

Pacifica immediately acts on his observation.

They use an old valve / damaged pipe.

They work together to release water into part of the tunnel.

The Predator retreats into another passage.

IMPORTANT:

Do NOT confirm that it is dead.

Do NOT confirm that it is permanently defeated.

Do NOT create a future plot around it automatically.

Its survival status can remain:

```text
escaped / unresolved locally
```

until the user later decides whether to reuse it.

---

# 14. SCENE 8 — WHAT TO DO WITH THE MONSTER

Location:

hidden clearing.

Time:

late afternoon / early evening.

Return to the Intelligent Creature.

It learns that the Predator has retreated.

It believes the Predator may return.

Do not establish this as a universal supernatural rule.

It is only what the creature believes.

The protagonists now confront the unresolved issue:

The Intelligent Creature saved animals.

But:

- it secretly removed them from their normal environment;
- it did not return them;
- it is physically dangerous;
- the heroes know almost nothing about it;
- people may eventually discover it.

The creature wants safety.

The animals need to return home.

This creates the major moral choice.

---

# 15. CHOICE 3 — MAIN CHAPTER 2 LONG-TERM CHOICE

Choice ID:

```text
ch2.creature_fate
```

Options:

```text
Help
Expel
Neutralize
```

This choice MUST appear on the decision map.

It is the main persistent Chapter 2 decision.

---

## Help

The heroes decide to trust the creature enough to:

- return the animals;
- avoid exposing the creature;
- allow it to move deeper into the forest without being treated as an enemy.

Persistent:

```text
ch2.creature_fate = Help
```

If the project has a relationship/trust store for non-main characters, add:

```text
creature_trust +1
```

Otherwise use a lightweight effect associated with the choice.

Future implication:

The creature may willingly help them later IF the user later decides to reuse it.

Do not implement future scenes now.

---

## Expel

The heroes decide:

- the creature helped;
- but remaining close to town is too risky;
- it must leave the immediate area;
- the animals return to their owners.

Persistent:

```text
ch2.creature_fate = Expel
```

Future implication:

It remembers the decision negatively / coldly if reused.

Do not create automatic revenge.

---

## Neutralize

This is NOT an “evil” option.

The reasoning is:

- the creature helped;
- but the heroes cannot verify its claims;
- it has already removed animals without permission;
- it is an unknown dangerous supernatural entity.

The heroes impose strict boundaries:

- do not approach town;
- do not remove animals again;
- remain away from homes;
- violation may trigger a stronger response.

Persistent:

```text
ch2.creature_fate = Neutralize
```

This option represents distrust / containment rather than murder.

Do not force Pacifica or Gideon into cruelty.

No graphic violence.

---

# 16. SCENE 9 — SYMBOL

Location:

old forest road.

Time:

sunset / early dusk.

Reuse existing forest-road background if possible.

Pacifica and Gideon reflect briefly.

Important dialogue point:

Pacifica explicitly acknowledges:

```text
Дневник был полезен.
Но если бы мы просто ему поверили...
```

Gideon completes:

```text
Мы бы нашли не того монстра.
```

They have learned something, but do not turn the scene into a moral lecture.

Then Gideon notices a carved symbol.

Pacifica checks Journal #3.

Nothing matches.

Do NOT explain the symbol.

Do NOT show:

- Will;
- Mabel;
- Dipper;
- the Journal author;
- another hidden observer.

End only on the symbol.

---

# 17. SYMBOL DESIGN — PROVISIONAL

The symbol design itself is NOT approved canon.

For the current implementation draft, use a replaceable provisional asset.

Suggested shape:

- incomplete ring;
- short vertical mark inside;
- two small angular notches on one side;
- deliberate gap in lower part.

Requirements:

- simple silhouette;
- readable at small size;
- easy to recognize later;
- not an eye;
- not a triangle;
- not an obvious Bill Cipher reference;
- not blue;
- not visually linked directly to Will;
- not copied from an existing Gravity Falls zodiac/symbol system.

Asset naming suggestion:

```text
symbol_ch2_unknown_provisional
```

Keep it easy to replace later.

---

# 18. BACKGROUND PLAN

## Existing backgrounds to reuse where possible

Inspect the project first and reuse suitable existing assets for:

- café interior;
- Gravity Falls morning exterior if needed;
- forest road;
- regular forest;
- deeper/darker forest.

Do NOT recreate good existing backgrounds simply because Chapter 2 is new.

---

## Likely new backgrounds

### `ch2_watch_hut_interior`

Old forest watch hut.

Requirements:

- wooden;
- partially damaged;
- old scratches;
- old table / shelves;
- broken window;
- room for dialogue sprites.

---

### `ch2_rock_hollow`

Rocky woodland depression used for first direct creature encounter.

Requirements:

- enough visual depth for creature reveal;
- shaded;
- background trees;
- no dramatic fantasy architecture.

---

### `ch2_hidden_shelter`

Natural concealed clearing.

Requirements:

- roots / fallen tree;
- improvised animal shelter;
- bowls / boxes;
- believable forest environment.

---

### `ch2_drainage_entrance`

Old concrete drain / maintenance tunnel entrance near stream.

Requirements:

- partially hidden by vegetation;
- dark interior;
- clear entry direction.

---

### `ch2_drainage_tunnel`

Main climax location.

Requirements:

- concrete;
- pipe;
- valve;
- shallow water;
- old metal grate;
- side passage;
- enough visual space for threat positioning.

---

# 19. CHARACTER SPRITES

## Pacifica

Reuse existing Chapter 0/1 design.

Do NOT redesign her.

Required expressions/poses where existing assets allow:

- neutral;
- confident;
- annoyed;
- small smile;
- amused;
- suspicious;
- concentrated;
- surprised;
- worried;
- frightened but controlled;
- embarrassed;
- serious;
- reflective.

Add only genuinely missing expressions.

Do not create dozens of near-duplicate sprites.

---

## Gideon

Reuse existing design.

Required:

- neutral/deadpan;
- dry amused;
- mild irritation;
- skeptical;
- focused;
- concerned;
- restrained fear;
- surprised;
- serious;
- one stronger stressed expression for climax.

His default visual language should remain understated.

---

# 20. INTELLIGENT CREATURE SPRITES

PROVISIONAL DESIGN.

Minimum required:

- neutral;
- alert;
- defensive;
- listening;
- calmer;
- distrustful.

The creature's face does not need exaggerated human expressions.

Body posture can communicate most emotion.

Avoid making it cute.

Avoid making it obviously evil.

---

# 21. PREDATOR ASSETS

PROVISIONAL DESIGN.

Prefer a small set of flexible assets:

- partial dark silhouette;
- eye reflection;
- normal crouched pose;
- aggressive pose;
- retreating / recoiling pose.

Do not overspend production work on a final polished species design until user approval.

---

# 22. NPC / ANIMAL ASSETS

Reuse existing generic assets where available.

Needed:

- Buster / medium dog;
- one small dog;
- one or two cats;
- optional generic animal silhouettes.

Do not create elaborate character sheets for every animal.

They are supporting visual elements.

---

# 23. PROPS

Reuse or create simple assets for:

- Journal #3;
- flashlight;
- backpack;
- animal collars;
- metal bowl;
- fur patches;
- chain / grate;
- valve;
- unknown symbol.

Journal #3 must be the existing real inventory/story object.

Do not create a duplicate Journal item.

---

# 24. JOURNAL #3 RULES

Journal #3 remains useful but imperfect.

In Chapter 2 it is used to:

- compare Wendigo tracks;
- compare scratch patterns;
- demonstrate that visual similarities can mislead;
- check the final symbol.

Do NOT add:

- the Predator;
- the Intelligent Creature;
- the final symbol;

to the Journal unless the script explicitly says they are already documented.

The current script specifically requires that the final symbol is NOT found in Journal #3.

---

# 25. VN STAGING

This is a visual novel, not an animated show.

Use restrained staging.

Recommended:

- sprite slide/fade for entrances;
- expression swaps;
- small background pans;
- occasional mild zoom;
- short screen shake only during physical impact;
- fades / dissolves between locations.

Avoid:

- constant sprite bouncing;
- excessive camera movement;
- cinematic action animation every line.

---

# 26. COMEDIC TIMING

Chapter 1 is the tonal model.

Especially for Gideon:

1. setup line;
2. short pause;
3. deadpan response;
4. Pacifica reaction.

Example rhythm:

```text
Pacifica:
— Я могу найти новую.

pause

Gideon:
— Прогресс закончился.
```

Do not add a comedy sound effect to every punchline.

Sometimes silence is the punchline.

---

# 27. HORROR / MYSTERY TIMING

When tension rises:

- reduce music;
- increase environmental ambience;
- allow longer pauses;
- use off-screen sounds before visual reveal;
- avoid showing the full creature immediately;
- use limited lighting.

Important tension moments:

1. silhouette outside watch hut;
2. first spoken word from Intelligent Creature;
3. fake voice calling Buster;
4. Pacifica's own voice from drainage tunnel;
5. Predator partial reveal;
6. final silent symbol.

Do not use cheap jumpscares repeatedly.

---

# 28. AUDIO PLAN

## Scene 1

Ambience:

- quiet café;
- dishes;
- low voices;
- door bell.

Music:

- light Chapter 1-style morning/comedy track.

---

## Scene 2

Ambience:

- forest;
- birds;
- leaves.

Music:

- light investigation theme.

---

## Scene 3

Ambience:

- wooden creaks;
- distant forest.

Music:

- mystery theme reduced near reveal.

SFX:

- branch crack;
- door creak.

---

## Scene 4

Music:

- minimal tension pad or near-silence.

SFX:

- leaves;
- creature movement;
- distant low call.

Do not add monster roar unless script later requires it.

---

## Scene 5

Ambience:

- protected quiet forest area;
- animals;
- subtle wind.

Music:

- softer mystery tone.

During fake voice:

- reduce music almost entirely.

---

## Scene 6

Ambience:

- stream;
- dripping water near tunnel.

Music:

- restrained investigation tension.

Fake voice should sound like Pacifica's voice but subtly unnatural.

Do not make it robotic in an obvious electronic way.

The threat is imitation, not a machine.

---

## Scene 7

Ambience:

- water drops;
- tunnel reverb;
- distant movement.

Music:

- low tension;
- increase only during chase/climax.

SFX:

- metal;
- dog whine;
- gate;
- pipe/valve;
- rushing water.

Do not overload.

---

## Scene 8

Music:

- quiet reflective theme.

No triumphant victory music.

The decision should feel morally unresolved.

---

## Scene 9

Music:

- soft ending theme initially;
- fade music out after symbol discovery;
- final seconds use only wind/forest ambience.

---

# 29. CHOICE SYSTEM

Use the EXISTING choice UI and existing story architecture.

Do not build a Chapter 2-specific choice system.

Required choices:

```text
ch2.trail_focus
ch2.threat_plan
ch2.creature_fate
```

Option IDs must remain stable exactly as written unless a technical naming restriction requires normalization.

If normalization is required, document it clearly.

---

# 30. BRANCHING

Branches are local.

Expected structure:

```text
Scene 2
   ├── LargeTracks
   ├── Journal
   └── Perimeter
        ↓
   watch hut convergence

Scene 7
   ├── Distract
   ├── Block
   └── Protect
        ↓
   water-pipe climax convergence

Scene 8
   ├── Help
   ├── Expel
   └── Neutralize
        ↓
   Scene 9 shared ending
```

The moral choice remains stored even though all paths enter Scene 9.

Do NOT create three separate Chapter 3 implementations.

Future content can condition dialogue on the stored choice later.

---

# 31. STORY STATE

Inspect the existing:

- STORY_REGISTRY;
- StoryState;
- effects system;
- choice registration;
- relationship state;
- inventory;
- derived flags;
- save serialization.

Use existing architecture.

Do NOT manually store duplicate shadow variables if effects/choice history already provides the required information.

Preferred canonical persistent choice values:

```text
ch2.trail_focus
ch2.threat_plan
ch2.creature_fate
```

Optional lightweight knowledge/effects:

```text
ch2_large_fiber
ch2_track_mismatch
ch2_tracks_separate
ch2_predator_reacts_to_motion
```

If the project already derives knowledge from choices, derive these rather than storing redundant booleans.

---

# 32. SAVE / LOAD

Requirements:

- Chapter 0 saves remain valid.
- Chapter 1 saves remain valid.
- Canonical Chapter 1 state transitions into Chapter 2.
- Chapter 2 can save at normal checkpoints.
- Loading restores:
  - current scene;
  - chosen branches;
  - relationship effects;
  - Journal inventory;
  - Chapter 2 choice history.
- Do not corrupt older save structures.

If schema migration is required, use backward-compatible defaults.

Old saves with no Chapter 2 fields should simply treat Chapter 2 choices as unset.

---

# 33. CHAPTER 1 → CHAPTER 2 TRANSITION

The canonical Chapter 1 ending is:

```text
ch1.ending = Cautious
```

Chapter 2 Scene 1 starts the next morning at 10:30.

The protagonists are slightly better prepared because they chose to stop and return later.

Do not grant a magical or special bonus item.

The preparation is mundane:

- flashlight;
- water;
- backpack.

If old Chapter 1 implementation has a generic “extra item available” mechanic from the cautious ending, do NOT automatically invent a supernatural item.

Either:

- leave it unused;
- or map it only to ordinary preparation if technically appropriate.

---

# 34. DECISION MAP

Update the existing decision-map system.

Chapter 2 should show the three player choices:

```text
Trail Focus
Threat Plan
Creature Fate
```

Show:

- selected option;
- alternate options;
- convergence points.

Do not reveal hidden future consequences.

The decision map must not expose:

- future creature reappearance;
- future symbol meaning;
- future antagonist links;
- Chapter 3+ secrets.

Use the same visual style as Chapter 1.

---

# 35. EXISTING ASSETS TO REUSE

Before creating anything, inspect:

- Chapter 0 assets;
- Chapter 1 assets;
- current backgrounds;
- Pacifica sprites;
- Gideon sprites;
- Journal art;
- forest art;
- café art;
- Go-Kart if available;
- generic animal assets;
- music;
- SFX;
- transitions;
- lighting overlays;
- choice UI.

Do not duplicate equivalent assets under new filenames unless necessary.

---

# 36. NEW BACKGROUNDS REQUIRED — EXPECTED

Likely:

```text
watch hut interior
rock hollow
hidden animal shelter
drainage entrance
drainage tunnel
```

If visually suitable existing assets already cover any of these, reuse them instead.

---

# 37. NEW SPRITES / EXPRESSIONS — EXPECTED

Likely:

```text
Pacifica:
possibly 1–3 missing expressions only

Gideon:
possibly 1–2 missing focused/stressed expressions only

Intelligent Creature:
small provisional set

Predator:
small provisional set
```

Do not redesign main characters.

---

# 38. NEW CREATURE ASSETS

Keep creature assets modular and replaceable.

The user has NOT approved their final nature/design yet.

Therefore:

- do not embed species names into hundreds of code references;
- prefer generic internal IDs.

Example:

```text
ch2_intelligent_creature
ch2_predator
```

rather than a lore-specific species identifier.

---

# 39. OPTIONAL POLISH

Only after core chapter works:

- subtle fog/depth overlays in deep forest;
- slight light flicker in drainage tunnel;
- gentle background camera push during symbol ending;
- minor dog movement/idle;
- subtle water reflection.

These are optional.

Do not delay functional implementation for polish.

---

# 40. VOICE / DELIVERY

If the game currently supports voice lines, preserve existing character voice direction.

Gideon:

- calm;
- dry;
- restrained;
- sarcasm must not sound exaggerated.

Pacifica:

- energetic;
- confident;
- irritated easily;
- softer in self-doubt scene;
- scared without becoming helpless.

Intelligent Creature:

- sparse;
- deliberate;
- not a generic monster growl voice.

Predator imitation:

- should resemble the copied voice enough to be disturbing;
- but with subtle rhythm/pronunciation imperfections.

Do NOT imitate real actors.

---

# 41. DO NOT REVEAL

Chapter 2 must NOT answer:

- who wrote the Journals;
- where Journal #1 is;
- Will's real nature;
- why Will is linked to the Gleefuls;
- Dipper and Mabel's long-term plan;
- reason for increased paranormal activity;
- final antagonist;
- meaning of the new symbol.

Do not add hidden explanatory dialogue that reveals these early.

---

# 42. DO NOT ADD UNREQUESTED CAMEOS

Do not insert:

- Wendy;
- Soos;
- Dipper;
- Mabel;
- Will;

into Chapter 2 simply because assets exist.

Will is discussed briefly in Scene 1.

He does NOT physically appear.

Scene 9 ends only on the symbol.

---

# 43. QA CHECKLIST

After implementation, run/verify all of the following.

## Core

- project launches;
- Chapter 0 still works;
- Chapter 1 still works;
- Chapter 1 canonical ending opens Chapter 2;
- Chapter 2 Scene 1 starts correctly;
- all 9 scenes are reachable;
- final Chapter 2 completion state saves.

## Choice 1

Test:

```text
LargeTracks
Journal
Perimeter
```

Verify:

- correct dialogue;
- correct local clue;
- all converge at watch hut.

## Choice 2

Test:

```text
Distract
Block
Protect
```

Verify:

- branch-specific staging;
- correct state;
- Protect applies intended relationship effect;
- all converge at climax.

## Choice 3

Test:

```text
Help
Expel
Neutralize
```

Verify:

- correct dialogue;
- state persists;
- all enter Scene 9;
- decision remains available for future chapter conditionals.

## Save/load

Test saving/loading:

- before every choice;
- after every choice;
- Scene 7 climax;
- Scene 8;
- Scene 9.

Verify selected option restores correctly.

## Assets

Check:

- no missing backgrounds;
- no missing sprites;
- no broken asset paths;
- no old unrelated monster art accidentally appears;
- Journal #3 displays correctly;
- provisional symbol asset displays.

## Audio

Check:

- no missing audio;
- fake voices play at correct moments;
- no excessive overlapping SFX;
- music fades correctly before horror beats.

## Decision map

Check:

- Chapter 2 choices appear;
- chosen route highlighted;
- alternate options visible;
- convergence displayed;
- no future spoilers.

## Regression

Check:

- Chapter 0 decision map;
- Chapter 1 decision map;
- Chapter 0 save/load;
- Chapter 1 save/load;
- old Chapter 1 choices;
- relationship values;
- inventory;
- Russian text;
- history/log;
- skip;
- auto;
- fullscreen.

---

# 44. IMPLEMENTATION PRIORITY

Work in this order:

1. inspect existing architecture;
2. register Chapter 2 story structure;
3. implement scenes/dialogue;
4. implement three choices and convergence;
5. wire StoryState/effects;
6. connect Chapter 1 → Chapter 2;
7. implement decision map;
8. reuse existing assets;
9. add minimum required new assets;
10. add audio;
11. add polish;
12. run QA.

Do NOT begin by generating dozens of new assets.

Functionality and canon-safe story implementation come first.

---

# 45. FINAL REPORT

After implementing Chapter 2, provide a concise report containing:

```text
Files changed
Files added
New choice IDs
New state/effect fields
Reused assets
New assets
Any provisional assets
Tests run
Known issues
```

Explicitly label:

```text
Intelligent Creature design — PROVISIONAL
Predator design — PROVISIONAL
Unknown Symbol design — PROVISIONAL
```

Do not claim these concepts are final canon.

# END OF CODEX IMPLEMENTATION PROMPT