import { ANIMATION_PRESETS, BACKGROUND_EFFECT_PRESETS, CAMERA_PANS, CAMERA_PRESETS, CAMERA_SHAKES, defaultPresentationState, finite, normalizePresentationState, optionNumber } from "./presentation.js";
const START = "chapter_0/part_1_intro/intro_1";
const CHARACTERS = "Gideon Pacifica Dipper Mabel Robbie Wendy Bill Will Helvest Mallardarty Ducktective Scot Toby Gumball Darwin Nicole Will_Humain Blubs Preston Priscilla Soos Bud Grenda Candy Crowd Mothman Narrator Constable Customer_1 Customer_2 Arcade_Owner Cashier".split(" ");
const SLOT_X = { outleft: -3e3, leftsecond: -1500, left: -740, center: 0, right: 740, rightsecond: 1500, outright: 3e3 };
const POSITIONS = { outleft: "outleft", leftout: "outleft", ol: "outleft", "-3": "outleft", leftsecond: "leftsecond", ls: "leftsecond", "-2": "leftsecond", left: "left", l: "left", "-1": "left", center: "center", c: "center", "0": "center", right: "right", r: "right", "1": "right", rightsecond: "rightsecond", rs: "rightsecond", "2": "rightsecond", rightout: "outright", outright: "outright", or: "outright", "3": "outright" };
const clone = (value) => JSON.parse(JSON.stringify(value));
const plainText = (text) => String(text).replace(/<[^>]*>/g, "").replace(/\\n/g, "\n");
const lengthOf = (text) => [...plainText(text)].length;
function parseLine(source) {
  const segments = [];
  let text = "", at = 0;
  const line = String(source).replace(/\/\/.*$/, "");
  const pattern = /\[([^\]]*)\]/g;
  let cursor = 0, match;
  while (match = pattern.exec(line)) {
    const part = line.slice(cursor, match.index);
    if (part) {
      segments.push({ type: "text", text: part });
      text += part;
      at += lengthOf(part);
    }
    const raw = match[1].trim();
    if (raw) segments.push({ type: "command", raw, args: raw.split(/\s+/), at });
    cursor = pattern.lastIndex;
  }
  const tail = line.slice(cursor);
  if (tail) {
    segments.push({ type: "text", text: tail });
    text += tail;
  }
  return { text, segments };
}
class StoryEngine {
  constructor({ scripts = {}, language = "english", initialLocation = "Town", onEvent = null, characters = null } = {}) {
    this.scripts = Object.fromEntries(Object.entries(scripts).map(([key, value]) => [key.toLowerCase(), String(value)]));
    this.language = language.toLowerCase();
    this.initialLocation = initialLocation;
    this.onEvent = onEvent;
    this.knownCharacters = new Map(CHARACTERS.map((name) => [name.toLowerCase(), name]));
    if (characters) for (const [key, value] of Object.entries(characters)) this.knownCharacters.set(key.toLowerCase(), value.name || value.trueName || key);
    this.lines = /* @__PURE__ */ new Map();
    this.events = [];
    this.state = this._initialState();
  }
  _initialState() {
    return {
      version: 1,
      language: this.language,
      phase: "idle",
      script: "",
      line: 0,
      speaker: "Narrator",
      text: "",
      segments: [],
      inline: [],
      revealed: 0,
      chars: {},
      bg: "black",
      choices: [],
      flags: {},
      scene: "chapter_0",
      location: this.initialLocation,
      visited: [],
      history: [],
      music: null,
      musicMuted: false,
      voice: null,
      light: null,
      item: null,
      inventory: [],
      shake: false,
      nextScript: null,
      sequence: 0,
      presentation: defaultPresentationState()
    };
  }
  _event(type, data = {}) {
    const event = { type, sourceLine: this.state.line, sourceScript: this.state.script, ...data };
    if (type === "character") event.characters = clone(this.state.chars);
    this.events.push(event);
    if (this.onEvent) this.onEvent(event, this.state);
  }
  _result() {
    return { state: this.state, events: this.events.slice() };
  }
  _clearEvents() {
    this.events = [];
  }
  _path(path) {
    let value = String(path).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").toLowerCase();
    if (value.startsWith("textes/")) value = value.split("/").slice(2).join("/");
    return value;
  }
  _resource(path) {
    const relative = this._path(path);
    for (const candidate of [`textes/${this.language}/${relative}`, `${this.language}/${relative}`, relative]) {
      if (Object.hasOwn(this.scripts, candidate)) return candidate;
    }
    throw new Error(`Original script unavailable for ${this.language}: ${relative}`);
  }
  hasScript(path, language = this.language) {
    const old = this.language;
    this.language = language.toLowerCase();
    try {
      this._resource(path);
      return true;
    } catch {
      return false;
    } finally {
      this.language = old;
    }
  }
  _load(path) {
    const resource = this._resource(path);
    if (!this.lines.has(resource)) this.lines.set(resource, this.scripts[resource].split(/\r\n|\r|\n/).filter((line) => line.length));
    this.state.script = this._path(path);
    this.state.line = 0;
    this.state.nextScript = null;
    this.state.phase = "running";
    this.state.choices = [];
    this.state.inline = [];
    this._event("script", { path: this.state.script, resource });
  }
  start(path = START, { flags = {} } = {}) {
    this._clearEvents();
    this.state = this._initialState();
    // Campaign carryover is copied before the first conditional script command.
    // No argument preserves the original chapter-zero start behavior.
    const initialFlags = flags && typeof flags === "object" && !Array.isArray(flags) ? clone(flags) : {};
    this.state.flags = Object.fromEntries(Object.entries(initialFlags).map(([key, value]) => [key.toLowerCase(), value]));
    this._load(path);
    this._run();
    return this._result();
  }
  advance() {
    this._clearEvents();
    if (["choice", "map", "credits", "idle"].includes(this.state.phase)) return this._result();
    this._reveal(Infinity);
    if (this.state.phase === "choice" || this.state.phase === "credits") return this._result();
    this.state.phase = "running";
    this._run();
    return this._result();
  }
  reveal(count = Infinity) {
    this._clearEvents();
    this._reveal(count);
    return this._result();
  }
  _reveal(count) {
    this.state.revealed = Math.max(this.state.revealed, Math.min(Number(count), lengthOf(this.state.text)));
    while (this.state.inline.length && this.state.inline[0].at <= this.state.revealed) {
      const command = this.state.inline.shift();
      this._command(command.args, { inline: true, at: command.at });
    }
  }
  choose(index) {
    this._clearEvents();
    if (this.state.phase !== "choice") throw new Error("There is no active choice");
    const choice = this.state.choices[index];
    if (!choice || !choice.order) throw new Error("Unknown choice");
    this._event("choice", { index, id: choice.id, text: choice.text });
    this.state.choices = [];
    this.state.presentation.choiceImportance = "normal";
    this.state.phase = "running";
    this._command(choice.order);
    if (this.state.nextScript) this._load(this.state.nextScript);
    this._run();
    return this._result();
  }
  /** Map controller supplies original scene metadata and the location's First script. */
  visit(location, { script, background = location, repeatScript = null, final = false } = {}) {
    this._clearEvents();
    if (this.state.phase !== "map") throw new Error("Map travel is available between scenes");
    const key = String(location).toLowerCase(), visited = this.state.visited.includes(key);
    this.state.location = location;
    this.state.bg = background;
    this._event("background", { name: background, instant: false, duration: 1 });
    if (!visited) this.state.visited.push(key);
    this._event("travel", { location, visited, final });
    const path = visited && repeatScript ? repeatScript : script;
    if (path) {
      this._load(path);
      this._run();
    } else this._map();
    return this._result();
  }
  snapshot() {
    return clone({ ...this.state, language: this.language });
  }
  restore(snapshot) {
    if (!snapshot || snapshot.version !== 1 || typeof snapshot.script !== "string" || !Number.isInteger(snapshot.line) || !Array.isArray(snapshot.inline) || typeof snapshot.chars !== "object") throw new Error("Invalid chapter save");
    const language = String(snapshot.language || this.language).toLowerCase();
    const previous = this.language;
    this.language = language;
    try {
      const resource = this._resource(snapshot.script);
      const lines = this.scripts[resource].split(/\r\n|\r|\n/).filter((line) => line.length);
      if (snapshot.line < 0 || snapshot.line > lines.length) throw new Error("Save line is outside the original script");
      this.lines.set(resource, lines);
    } catch (error) {
      this.language = previous;
      throw error;
    }
    this._clearEvents();
    this.state = clone(snapshot);
    this.state.presentation = normalizePresentationState(this.state.presentation);
    this.state.language = this.language;
    this._event("restore");
    return this._result();
  }
  _run() {
    let budget = 1e4;
    while (this.state.phase === "running" && budget-- > 0) {
      const resource = this._resource(this.state.script), lines = this.lines.get(resource);
      if (this.state.line >= lines.length) {
        if (this.state.nextScript) {
          this._load(this.state.nextScript);
          continue;
        }
        this._map();
        break;
      }
      const source = lines[this.state.line++], parsed = parseLine(source);
      if (!parsed.segments.length || !parsed.text.trim() && !parsed.segments.some((s) => s.type === "command")) continue;
      this.state.text = "";
      this.state.segments = [];
      this.state.inline = [];
      this.state.revealed = 0;
      let foundText = false, hasStop = false;
      for (const segment of parsed.segments) {
        if (segment.type === "text") {
          this.state.text += segment.text;
          this.state.segments.push(segment);
          if (segment.text.trim()) foundText = true;
        } else if (foundText) {
          this.state.inline.push(segment);
          this.state.segments.push(segment);
        } else {
          this._command(segment.args);
          if (segment.args[0].toLowerCase() === "stop") hasStop = true;
          if (this.state.phase === "credits") return;
        }
      }
      if (foundText) {
        this.state.phase = "dialogue";
        this.state.sequence++;
        this.state.history.push({ speaker: this.state.speaker, text: this.state.text, script: this.state.script, line: this.state.line - 1 });
        this._event("dialogue", { speaker: this.state.speaker, text: this.state.text, segments: clone(this.state.segments), sequence: this.state.sequence });
        return;
      }
      if (hasStop) {
        this.state.phase = this.state.choices.length ? "choice" : "pause";
        if (this.state.phase === "choice") this._event("choices", { choices: clone(this.state.choices) });
        else this._event("pause");
        return;
      }
    }
    if (budget <= 0) throw new Error("Script exceeded interpreter step budget");
  }
  _map() {
    this.state.phase = "map";
    this.state.text = "";
    this.state.inline = [];
    this.state.choices = [];
    this.state.bg = this.state.location;
    this._event("map", { location: this.state.location, visited: [...this.state.visited] });
  }
  _character(id) {
    const key = String(id).toLowerCase();
    if (!this.knownCharacters.has(key)) return null;
    return this.state.chars[key] ??= { id: key, name: this.knownCharacters.get(key), visible: false, expression: "idle", speaking: false, flip: "right", position: "center", x: 0, scaleX: 1, scaleY: 1, color: [1, 1, 1], secret: false, order: 0 };
  }
  _setSpeaker(name) {
    this.state.speaker = name;
    for (const char2 of Object.values(this.state.chars)) char2.speaking = false;
    const char = this._character(name);
    if (char) char.speaking = true;
    this._event("speaker", { name, secret: !!char?.secret });
  }
  _char(args) {
    const target = [], actions = {};
    let from = false;
    for (let i = 1; i < args.length; i++) {
      const word = args[i].toLowerCase();
      if (["show", "showi", "hide", "hidei"].includes(word)) actions[word] = true;
      else if (word === "from" || word === "f") from = true;
      else if (POSITIONS[word]) actions[from ? "from" : "position"] = POSITIONS[word];
      else if (word === "change") actions.expression = args[++i]?.toLowerCase();
      else if (word === "duration") actions.duration = finite(args[++i], 0.45, 0, 8);
      else if (word === "flip") {
        const direction = args[i + 1]?.toLowerCase();
        actions.flip = ["left", "right"].includes(direction) ? args[++i].toLowerCase() : "toggle";
      } else if (["move", "movei", "moveadd", "moveaddi", "scale", "scalexy"].includes(word)) {
        actions[word] = Number(args[++i]);
        if (word === "scalexy") actions.scaleY = Number(args[++i]);
      } else if (word === "color" || word === "colori") {
        const raw = args[++i] || "";
        actions.color = raw.replace(/[()]/g, "").split(",").map(Number);
        actions.colorInstant = word === "colori";
      } else {
        const char = this._character(word);
        if (char && !target.includes(char)) target.push(char);
      }
    }
    if (actions.hide || actions.hidei) {
      const oldSlots = target.map((char) => char.position);
      for (const char of target) {
        char.visible = false;
        char.exit = actions.position || actions.from || char.position;
      }
      const remaining = Object.values(this.state.chars).filter((char) => char.visible && !["outleft", "outright"].includes(char.position));
      if (remaining.length === 1) {
        remaining[0].position = "center";
        remaining[0].x = 0;
      } else if (remaining.length === 2) {
        const centered = remaining.find((char) => char.position === "center");
        const slot = oldSlots.find((position) => ["left", "right"].includes(position));
        if (centered && slot) {
          centered.position = slot;
          centered.x = SLOT_X[slot];
        }
      }
    }
    for (const char of target) {
      if (actions.show || actions.showi) {
        const others = Object.values(this.state.chars).filter((c) => c.visible && c !== char && !["outleft", "outright"].includes(c.position));
        char.visible = true;
        char.order = ++this.state.sequence;
        let position = actions.position;
        if (!position) position = others.length ? actions.from?.includes("left") ? "left" : "right" : "center";
        if (others.length === 1) {
          others[0].position = position === "left" ? "right" : "left";
          others[0].x = SLOT_X[others[0].position];
        } else if (others.length === 2) {
          const occupied = others.find((c) => c.position === position);
          if (occupied) {
            occupied.position = position === "center" ? others.some((c) => c.position === "right") ? "left" : "right" : "center";
            occupied.x = SLOT_X[occupied.position];
          }
        } else if (others.length > 2) {
          const occupied = others.find((c) => c.position === position);
          if (occupied) {
            occupied.position = position === "left" ? "outleft" : position === "right" ? "outright" : actions.from?.includes("left") ? "outright" : "outleft";
            occupied.x = SLOT_X[occupied.position];
          }
        }
        char.position = position;
        char.x = SLOT_X[position];
        char.from = actions.from || null;
      }
      if (actions.expression) char.expression = actions.expression;
      if (actions.flip) char.flip = actions.flip === "toggle" ? char.flip === "left" ? "right" : "left" : actions.flip;
      if (Number.isFinite(actions.scale)) char.scaleX = char.scaleY = actions.scale;
      if (Number.isFinite(actions.scalexy)) {
        char.scaleX = actions.scalexy;
        char.scaleY = actions.scaleY;
      }
      if (actions.color?.length >= 3) char.color = actions.color;
      for (const key of ["move", "movei", "moveadd", "moveaddi"]) if (Number.isFinite(actions[key])) {
        char.x = key.startsWith("moveadd") ? char.x + actions[key] : actions[key];
        char.position = "other";
      }
      this._event("character", { id: char.id, character: clone(char), actions: clone(actions), duration: actions.duration, instant: !!(actions.showi || actions.hidei || actions.movei !== void 0 || actions.moveaddi !== void 0) });
    }
  }
  _command(original, meta = {}) {
    if (!original?.length) return;
    const args = original.map(String), words = args.map((s) => s.toLowerCase()), command = words[0];
    this._event("command", { args: [...args], ...meta });
    switch (command) {
      case "emotion": {
        const emotion = words[2];
        if (!["neutral", "laugh", "sly", "afraid", "tremble", "panic", "embarrassed"].includes(emotion)) break;
        const char = this._character(words[1]);
        if (!char) break;
        char.emotion = emotion;
        this._event("character", { id: char.id, character: clone(char), actions: { emotion }, instant: true, ...meta });
        break;
      }
      case "expression": {
        const char = this._character(words[1]);
        const expression = words[2];
        if (!char || !expression) break;
        const transition = optionNumber(args, "transition", .18);
        char.expression = expression;
        char.emotion = "neutral";
        this._event("character", { id: char.id, character: clone(char), actions: { expression, transition }, duration: transition, instant: transition <= 0, ...meta });
        break;
      }
      case "anim": {
        const char = this._character(words[1]);
        const preset = words[2];
        if (!char || !ANIMATION_PRESETS[preset]) break;
        const duration = optionNumber(args, "duration", ANIMATION_PRESETS[preset].duration / 1000);
        this._event("animation", { id: char.id, preset, duration, ...meta });
        break;
      }
      case "camera": {
        const current = this.state.presentation.camera;
        const op = words[1];
        const duration = optionNumber(args, "duration", .6);
        let next = { ...current, duration, easing: words.includes("linear") ? "linear" : "ease" };
        if (op === "reset") next = { ...CAMERA_PRESETS.normal, focus: null, duration, easing: next.easing };
        else if (op === "preset" && CAMERA_PRESETS[words[2]]) next = { ...CAMERA_PRESETS[words[2]], focus: null, duration, easing: next.easing };
        else if (op === "zoom") next = { ...next, zoom: finite(args[2], current.zoom, .75, 1.5), focus: null };
        else if (op === "pan" && Object.hasOwn(CAMERA_PANS, words[2])) next = { ...next, x: CAMERA_PANS[words[2]], focus: null };
        else if (op === "focus" && words[2]) next = { ...next, focus: words[2], zoom: optionNumber(args, "zoom", Math.max(current.zoom, 1.06)) };
        else if (op === "shake" && CAMERA_SHAKES[words[2]]) {
          this._event("camera-shake", { strength: words[2], duration: CAMERA_SHAKES[words[2]] / 1000, ...meta });
          break;
        } else break;
        this.state.presentation.camera = next;
        this._event("camera", { camera: clone(next), ...meta });
        break;
      }
      case "fx": {
        const name = words[1] === "clear" ? null : words[1];
        if (name && !BACKGROUND_EFFECT_PRESETS.has(name)) break;
        this.state.presentation.backgroundEffect = name;
        this._event("background-fx", { name, ...meta });
        break;
      }
      case "ambience": {
        const name = words[1] === "stop" ? null : words[1];
        const fade = optionNumber(args, "fade", .6);
        this.state.presentation.ambience = name;
        this.state.presentation.ambienceFade = fade;
        this._event("ambience", { name, fade, ...meta });
        break;
      }
      case "sfx":
        if (words[1]) this._event("sfx", { name: words[1], ...meta });
        break;
      case "flag": {
        const name = words[2];
        if (!/^[a-z][a-z0-9_]*$/.test(name || "") || ["constructor", "prototype"].includes(name)) break;
        const raw = args.slice(3).join(" ");
        if (words[1] === "add") {
          const amount = Number(raw), old = this.state.flags[name] ?? 0;
          if (raw && Number.isFinite(amount) && typeof old === "number" && Number.isFinite(old)) this.state.flags[name] = old + amount;
        } else if (words[1] === "set") {
          this.state.flags[name] = raw === "true" ? true : raw === "false" ? false : raw.trim() !== "" && Number.isFinite(Number(raw)) ? Number(raw) : raw;
        }
        break;
      }
      case "effect":
        if (["blue_glow", "clear"].includes(words[1])) {
          this.state.visualEffect = words[1] === "clear" ? null : words[1];
          this._event("effect", { name: this.state.visualEffect, ...meta });
        }
        break;
      case "char":
        this._char(args);
        break;
      case "bg": {
        if (words[1] === "effect") {
          this.state.shake = words[2] === "shake";
          this._event("shake", { active: this.state.shake, duration: Number(words[3] || 0) });
          break;
        }
        const i = words.findIndex((w) => w === "change" || w === "changei");
        if (i >= 0 && args[i + 1]) {
          this.state.bg = args[i + 1];
          this.state.speaker = "";
          const time = words.indexOf("time");
          this._event("background", { name: this.state.bg, instant: words[i] === "changei", duration: time >= 0 ? Number(args[time + 1]) : 2.5 });
          if (words.includes("player")) this.state.location = this.state.bg;
        }
        break;
      }
      case "music": {
        const fade = optionNumber(args, "fade", 0);
        const crossfade = words.includes("crossfade");
        if (words[1] === "mute") this.state.musicMuted = true;
        else if (words[1] === "stop") {
          this.state.music = null;
          this.state.musicMuted = false;
        } else {
          this.state.music = args[1] || null;
          this.state.musicMuted = false;
        }
        this._event("audio", { channel: "music", name: this.state.music, muted: this.state.musicMuted, fade, crossfade, ...meta });
        break;
      }
      case "sound":
      case "voice": {
        const name = words[1] === "stop" ? null : args[1];
        if (command === "voice") this.state.voice = name;
        this._event("audio", { channel: command, name, pan: ["left", "right", "center"].find((p) => words.includes(p)) || "center", ...meta });
        break;
      }
      case "wait":
        this._event("wait", { duration: Number(args[1]) || 0, ...meta });
        break;
      case "stop":
        this._event("stop", meta);
        break;
      case "next":
        this.state.nextScript = this._path(args[1]);
        this._event("next", { path: this.state.nextScript });
        break;
      case "scene":
        this.state.scene = words[1];
        if (words[1] === "credits") {
          this.state.phase = "credits";
          this.state.inline = [];
          this._event("credits");
        } else this._event("scene", { name: args[1] });
        break;
      case "button": {
        const index = Math.max(0, Number(args[2]) - 1);
        this.state.choices[index] ??= { id: index + 1, text: "", order: null };
        if (words[1] === "text") this.state.choices[index].text = args.slice(3).join(" ");
        if (words[1] === "order") this.state.choices[index].order = args.slice(3);
        break;
      }
      case "choice":
        if (words[1] === "check") {
          if (String(this.state.flags[words[2]]).toLowerCase() === words[3]) this._command(args.slice(4), meta);
        } else if (words[1] === "importance" && ["minor", "normal", "important"].includes(words[2])) {
          this.state.presentation.choiceImportance = words[2];
          this._event("choice-importance", { importance: words[2], ...meta });
        } else this.state.flags[words[1]] = args[2];
        break;
      case "name":
        for (const name of args.slice(1)) {
          if (["secret", "reset"].includes(name.toLowerCase())) continue;
          const char = this._character(name);
          if (char) {
            char.secret = words.includes("secret");
            this._event("character", { id: char.id, character: clone(char), actions: { secret: char.secret }, instant: true });
          }
        }
        break;
      case "clean":
      case "cleani":
        this.state.speaker = "";
        for (const char of Object.values(this.state.chars)) char.speaking = false;
        this._event("clean", { instant: command === "cleani" });
        break;
      case "light":
        this.state.light = words[1].startsWith("hide") ? null : args[2];
        this._event("light", { name: this.state.light, instant: words[1].endsWith("i") });
        break;
      case "item":
        if (words[1].startsWith("show")) this.state.item = args[2];
        else if (words[1].startsWith("hide")) this.state.item = null;
        else if (words[1] === "give" && !this.state.inventory.includes(words[2])) this.state.inventory.push(words[2]);
        else if (words[1] === "take") this.state.inventory = this.state.inventory.filter((x) => x !== words[2]);
        this._event("item", { name: this.state.item, inventory: [...this.state.inventory], instant: words[1].endsWith("i") });
        break;
      case "link":
        this._event("link");
        break;
      default:
        this._setSpeaker(args[0]);
    }
  }
}
const DEFAULT_START = START;
export {
  DEFAULT_START,
  StoryEngine,
  parseLine,
  plainText
};
