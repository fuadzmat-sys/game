function freeze(value) {
  for (const child of Object.values(value)) if (child && typeof child === "object") freeze(child);
  return Object.freeze(value);
}
// Keep the campaign key so the original chapter-zero completion survives upgrades.
const CAMPAIGN_KEY = "reverse-falls-campaign-v1";
const CHAPTERS = freeze({
  0: {
    id: 0, title: { russian: "Глава 0", english: "Chapter 0" },
    languages: ["english", "french", "german", "polish", "russian", "spanish", "ukrainian"],
    start: "chapter_0/part_1_intro/intro_1", namespace: "chapter_0", exit: "chapter_0/part_3_mothman/mothman_3", authored: false
  },
  1: {
    id: 1, title: { russian: "Следы в лесу", english: "Tracks in the Forest" },
    languages: ["russian", "english"], start: "chapter_1_v3/start", namespace: "chapter_1_v3", exit: "chapter_1_v3/will", authored: true,
    storyVersion: 3, nextChapter: { id: 2, title: { russian: "Не тот монстр", english: "The Wrong Monster" }, available: true }
  },
  2: {
    id: 2, title: { russian: "Не тот монстр", english: "The Wrong Monster" },
    languages: ["russian", "english"], start: "chapter_2/start", namespace: "chapter_2", exit: "chapter_2/symbol", authored: true,
    storyVersion: 1, nextChapter: { id: 3, title: { russian: "Чужая находка", english: "Someone Else’s Find" }, available: true }
  },
  3: {
    id: 3, title: { russian: "Чужая находка", english: "Someone Else’s Find" },
    languages: ["russian", "english"], start: "chapter_3/start", namespace: "chapter_3", exit: "chapter_3/night_gate", authored: true,
    storyVersion: 1, nextChapter: null
  }
});
const CHAPTER_IDS = Object.freeze(Object.keys(CHAPTERS).map(Number));
const ENDINGS = freeze({
  Bold: {
    title: { russian: "Идти за звуком", english: "Follow the sound" },
    description: {
      russian: "Герои решают продолжить путь за звуком и проверить, что скрывается глубже в лесу.",
      english: "The friends decide to follow the sound and investigate deeper in the woods."
    }
  },
  Cautious: {
    title: { russian: "Вернуться подготовленными", english: "Return prepared" },
    description: {
      russian: "Герои решают вернуться и подготовиться перед следующим выходом в лес.",
      english: "The friends decide to return and prepare before their next visit to the woods."
    }
  },
  Observation: {
    title: { russian: "Устроить наблюдение", english: "Set up an observation" },
    description: {
      russian: "Герои решают сначала понаблюдать за лесом и не торопиться с выводами.",
      english: "The friends decide to observe the woods before drawing any conclusions."
    }
  }
});
const MONSTERS = ["Werewolf", "Wendigo", "Vampire"];
const CHAPTER1_CHOICES = freeze({
  reason: ["Deflect", "Curiosity", "Openness"],
  tracks: ["Bold", "Journal", "Search"],
  descent: ["Pacifica", "Gideon", "Careful"],
  ending: Object.keys(ENDINGS)
});

const CHAPTER2_CHOICES = freeze({
  trail_focus: ["LargeTracks", "Journal", "Perimeter"],
  threat_plan: ["Distract", "Block", "Protect"],
  creature_fate: ["Help", "Expel", "Neutralize"]
});
const CHAPTER2_ENDINGS = freeze({
  Help: { title: { russian: "Помочь Существу", english: "Help the creature" }, description: { russian: "Животные вернутся домой. Существо может уйти глубже в лес, сохранив своё укрытие в тайне.", english: "The animals will return home. The creature may move deeper into the woods without its shelter being exposed." } },
  Expel: { title: { russian: "Попросить уйти", english: "Ask it to leave" }, description: { russian: "Животные вернутся к хозяевам. Существо должно покинуть окрестности города.", english: "The animals will return to their owners. The creature must leave the area around town." } },
  Neutralize: { title: { russian: "Установить границы", english: "Set firm boundaries" }, description: { russian: "Животные вернутся домой. Герои требуют не приближаться к домам и больше не забирать животных.", english: "The animals will return home. The friends demand that the creature stay away from homes and stop taking animals." } }
});
const CHAPTER3_CHOICES = freeze({
  wendy_approach: ["Direct", "Bargain", "Wait"],
  test_method: ["Mark", "Listen", "CheckPlans"],
  exit_plan: ["HoldGate", "Guide", "SecureBag"]
});
const CHAPTER3_ENDINGS = freeze({
  HoldGate: { title: { russian: "Удержать выход", english: "Hold the exit" }, description: { russian: "Пасифика и Гидеон вместе удержали проход, пока Венди выбралась из цеха. Она по-прежнему держит находку при себе.", english: "Pacifica and Gideon held the passage together while Wendy got out of the shed. She still keeps the object." } },
  Guide: { title: { russian: "Провести по меткам", english: "Follow the marks" }, description: { russian: "Герои согласовали каждый шаг и выбрались по проверенным ориентирам. Венди пришлось прислушаться, но союзницей она ещё не стала.", english: "The three coordinated each step and escaped by verified landmarks. Wendy had to listen, but she is not an ally yet." } },
  SecureBag: { title: { russian: "Закрепить сумку", english: "Secure the bag" }, description: { russian: "Находку удалось удержать неподвижно, чтобы выбраться из опасного прохода. Её происхождение и назначение остаются неизвестными.", english: "They kept the object still long enough to escape the dangerous passage. Its origin and purpose remain unknown." } }
});
const COUNTERS = ["gideon_deflects", "gideon_curiosity", "gideon_openness", "pacifica_gideon_trust", "pacifica_bold", "journal_doubt", "pacifica_protective"];
const BOOL_FLAGS = ["extra_clue_01", "careful_route", "chapter1_bold_end", "chapter1_cautious_end", "chapter1_observation_end"];
const INVENTORY = ["journal_3", "cloth_scrap"];
const ENDING_FLAGS = { Bold: "chapter1_bold_end", Cautious: "chapter1_cautious_end", Observation: "chapter1_observation_end" };
const record = value => value !== null && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const canonical = (value, values) => typeof value === "string" ? values.find(item => item.toLowerCase() === value.trim().toLowerCase()) ?? null : null;
const parse = value => { if (typeof value !== "string") return value; try { return JSON.parse(value); } catch { return null; } };
function normalizeChapter(value) {
  const chapter = CHAPTER_IDS.find(id => value === id || value === String(id) || value === CHAPTERS[id].namespace || id === 1 && value === "chapter_1");
  return chapter ?? 0;
}
function chapterForSnapshot(snapshot) {
  if (!record(snapshot) || snapshot.version !== 1 || typeof snapshot.script !== "string") return null;
  let path = snapshot.script.toLowerCase().replace(/\\/g, "/");
  const localized = path.match(/^textes\/([a-z]+)\/(.+)$/);
  if (localized) {
    if (!CHAPTERS[0].languages.includes(localized[1])) return null;
    path = localized[2];
  }
  if (!/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)+$/.test(path)) return null;
  return CHAPTER_IDS.find(id => path.startsWith(CHAPTERS[id].namespace + "/")) ?? null;
}
function saveKey(chapter) {
  const id = normalizeChapter(chapter);
  return id === 0 ? "reverse-falls-chapter0-save-v1" : id === 1 ? "reverse-falls-chapter1-v3-save-v1" : `reverse-falls-chapter${id}-save-v1`;
}
function normalizeMonster(value) { return canonical(value, MONSTERS) ?? "Werewolf"; }
function chapterLanguage(chapter, language) {
  const selected = typeof language === "string" ? language.trim().toLowerCase() : "english";
  return CHAPTERS[normalizeChapter(chapter)].languages.includes(selected) ? selected : "english";
}
function chapterTitle(chapter, language = "english") { const title = CHAPTERS[normalizeChapter(chapter)].title; return title[language] ?? title.english; }
function emptyCampaign() {
  return { version: 2, chapters: {
    0: { completed: false, monster: null },
    1: { completed: false, monster: null, ending: null, flags: {}, inventory: [], nextChapter: null },
    2: { completed: false, monster: null, ending: null, flags: {}, inventory: [], nextChapter: null },
    3: { completed: false, monster: null, ending: null, flags: {}, inventory: [], nextChapter: null }
  } };
}
function storyFlags(value) {
  if (!record(value)) return {};
  const flags = {};
  const monster = canonical(value.monster, MONSTERS);
  if (monster) flags.monster = monster;
  for (const [key, options] of Object.entries(CHAPTER1_CHOICES)) {
    const selected = canonical(value[key], options);
    if (selected) flags[key] = selected;
  }
  for (const key of COUNTERS) if (Number.isSafeInteger(value[key]) && value[key] >= 0 && value[key] <= 99) flags[key] = value[key];
  for (const key of BOOL_FLAGS) if (typeof value[key] === "boolean") flags[key] = value[key];
  return flags;
}
function completeChoices(flags, ending, inventory) {
  if (!inventory.includes("journal_3")) return false;
  if (!Object.entries(CHAPTER1_CHOICES).every(([key, values]) => values.includes(flags[key]))) return false;
  if (flags.ending !== ending || flags[ENDING_FLAGS[ending]] !== true) return false;
  if (Object.entries(ENDING_FLAGS).some(([key, flag]) => key !== ending && flags[flag] === true)) return false;
  const expected = {
    gideon_deflects: Number(flags.reason === "Deflect"),
    gideon_curiosity: Number(flags.reason === "Curiosity"),
    gideon_openness: Number(flags.reason === "Openness"),
    pacifica_gideon_trust: Number(flags.reason === "Openness") + Number(flags.descent === "Pacifica"),
    pacifica_bold: Number(flags.tracks === "Bold"),
    journal_doubt: Number(flags.tracks === "Journal"),
    pacifica_protective: Number(flags.descent === "Gideon")
  };
  if (Object.entries(expected).some(([key, value]) => (flags[key] ?? 0) !== value)) return false;
  if ((flags.extra_clue_01 === true) !== (flags.tracks === "Search") || (flags.careful_route === true) !== (flags.descent === "Careful")) return false;
  // A carried clue must actually have been found, rather than inferred from a later choice.
  return flags.extra_clue_01 === true ? inventory.includes("cloth_scrap") : !inventory.includes("cloth_scrap");
}
function makeHandoff(monster, ending, flags, inventory) {
  return {
    version: 1, fromChapter: 1, toChapter: 2,
    title: { ...CHAPTERS[1].nextChapter.title }, available: true,
    monster, ending, flags: { ...flags }, inventory: [...inventory],
    setup: {
      startNearSuspectedLair: ending === "Bold",
      extraItemAvailable: ending === "Cautious",
      clueBonus: ending === "Observation" ? 1 : 0
    }
  };
}
function validCampaign(value) {
  const data = parse(value);
  if (!record(data) || data.version !== 2 || !record(data.chapters)) return false;
  for (const chapter of [0, 1]) {
    const item = data.chapters[chapter];
    if (!record(item) || typeof item.completed !== "boolean" || item.monster !== null && canonical(item.monster, MONSTERS) !== item.monster || item.completed && !item.monster) return false;
    if (chapter === 1) {
      if (!record(item.flags) || !Array.isArray(item.inventory) || item.ending !== null && canonical(item.ending, Object.keys(ENDINGS)) !== item.ending) return false;
      if (Object.keys(storyFlags(item.flags)).length !== Object.keys(item.flags).length || Object.entries(storyFlags(item.flags)).some(([key, value]) => item.flags[key] !== value)) return false;
      if (item.inventory.some(id => !INVENTORY.includes(id)) || new Set(item.inventory).size !== item.inventory.length) return false;
      if (item.completed && (!completeChoices(item.flags, item.ending, item.inventory) || item.flags.monster !== item.monster)) return false;
      if (JSON.stringify(item.nextChapter) !== JSON.stringify(item.completed ? makeHandoff(item.monster, item.ending, item.flags, item.inventory) : null)) return false;
    }
  }
  const two = data.chapters[2];
  if (two !== undefined) {
    if (!record(two) || typeof two.completed !== 'boolean' || two.monster !== null && canonical(two.monster, MONSTERS) !== two.monster || !record(two.flags) || !Array.isArray(two.inventory) || two.nextChapter !== null) return false;
    if (two.ending !== null && !CHAPTER2_CHOICES.creature_fate.includes(two.ending)) return false;
    if (Object.keys(storyFlags2(two.flags)).length !== Object.keys(two.flags).length || Object.entries(storyFlags2(two.flags)).some(([key, value]) => two.flags[key] !== value) || two.inventory.some(id => !INVENTORY.includes(id))) return false;
    if (two.completed && (!two.monster || two.flags.monster !== two.monster || !completeChoices2(two.flags, two.ending, two.inventory))) return false;
  }
  const three = data.chapters[3];
  if (three !== undefined) {
    if (!record(three) || typeof three.completed !== 'boolean' || three.monster !== null && canonical(three.monster, MONSTERS) !== three.monster || !record(three.flags) || !Array.isArray(three.inventory) || three.nextChapter !== null) return false;
    if (three.ending !== null && !CHAPTER3_CHOICES.exit_plan.includes(three.ending)) return false;
    if (Object.keys(storyFlags3(three.flags)).length !== Object.keys(three.flags).length || Object.entries(storyFlags3(three.flags)).some(([key, value]) => three.flags[key] !== value) || three.inventory.some(id => !INVENTORY.includes(id))) return false;
    if (three.completed && (!three.monster || three.flags.monster !== three.monster || !completeChoices3(three.flags, three.ending, three.inventory))) return false;
  }
  return true;
}
function readCampaign(value) {
  const data = parse(value), result = emptyCampaign();
  if (!record(data) || ![1, 2].includes(data.version) || !record(data.chapters)) return result;
  const zero = data.chapters[0];
  if (record(zero)) {
    result.chapters[0].monster = canonical(zero.monster, MONSTERS);
    result.chapters[0].completed = zero.completed === true && result.chapters[0].monster !== null;
  }
  // Version-one chapter-one records refer to a discarded story, even if a label matches.
  if (data.version !== 2) return result;
  if (!record(data.chapters[1])) { readChapter2(data.chapters[2], result.chapters[2]); readChapter3(data.chapters[3], result.chapters[3]); return result; }
  const source = data.chapters[1], target = result.chapters[1];
  target.monster = canonical(source.monster, MONSTERS);
  target.ending = canonical(source.ending, Object.keys(ENDINGS));
  target.flags = storyFlags(source.flags);
  target.inventory = Array.isArray(source.inventory) ? INVENTORY.filter(id => source.inventory.includes(id) && (id !== "cloth_scrap" || target.flags.extra_clue_01 === true)) : [];
  target.completed = source.completed === true && target.monster !== null && target.flags.monster === target.monster && completeChoices(target.flags, target.ending, target.inventory);
  if (target.completed) target.nextChapter = makeHandoff(target.monster, target.ending, target.flags, target.inventory);
  readChapter2(data.chapters[2], result.chapters[2]);
  readChapter3(data.chapters[3], result.chapters[3]);
  return result;
}

function storyFlags2(value) {
  const flags = storyFlags(value);
  if (!record(value)) return flags;
  for (const [key, values] of Object.entries(CHAPTER2_CHOICES)) {
    const option = canonical(value[key], values);
    if (option) flags[key] = option;
  }
  if (Number.isSafeInteger(value.creature_trust) && value.creature_trust >= 0 && value.creature_trust <= 99) flags.creature_trust = value.creature_trust;
  return flags;
}
function completeChoices2(flags, ending, inventory) {
  if (!inventory.includes('journal_3') || !Object.entries(CHAPTER2_CHOICES).every(([key, values]) => values.includes(flags[key])) || flags.creature_fate !== ending) return false;
  const expectedTrust = Number(flags.reason === 'Openness') + Number(flags.descent === 'Pacifica') + Number(flags.threat_plan === 'Protect');
  return (flags.pacifica_gideon_trust ?? 0) === expectedTrust && (flags.creature_trust ?? 0) === Number(flags.creature_fate === 'Help');
}
function readChapter2(source, target) {
  if (!record(source)) return;
  target.monster = canonical(source.monster, MONSTERS);
  target.ending = canonical(source.ending, CHAPTER2_CHOICES.creature_fate);
  target.flags = storyFlags2(source.flags);
  target.inventory = Array.isArray(source.inventory) ? INVENTORY.filter(id => source.inventory.includes(id) && (id !== 'cloth_scrap' || target.flags.extra_clue_01 === true)) : [];
  target.completed = source.completed === true && target.monster !== null && target.flags.monster === target.monster && completeChoices2(target.flags, target.ending, target.inventory);
}
function storyFlags3(value) {
  const flags = storyFlags2(value);
  if (!record(value)) return flags;
  for (const [key, values] of Object.entries(CHAPTER3_CHOICES)) {
    const option = canonical(value[key], values);
    if (option) flags[key] = option;
  }
  if (Number.isSafeInteger(value.wendy_respect) && value.wendy_respect >= 0 && value.wendy_respect <= 99) flags.wendy_respect = value.wendy_respect;
  for (const key of ['ch3_wendy_guarded', 'ch3_object_secured']) if (typeof value[key] === 'boolean') flags[key] = value[key];
  return flags;
}
function completeChoices3(flags, ending, inventory) {
  if (!inventory.includes('journal_3') || !Object.entries(CHAPTER3_CHOICES).every(([key, values]) => values.includes(flags[key])) || flags.exit_plan !== ending) return false;
  const expectedTrust = Number(flags.reason === 'Openness') + Number(flags.descent === 'Pacifica') + Number(flags.threat_plan === 'Protect') + Number(flags.exit_plan === 'HoldGate');
  const expectedRespect = Number(flags.wendy_approach === 'Bargain') + Number(flags.exit_plan === 'Guide');
  return (flags.pacifica_gideon_trust ?? 0) === expectedTrust && (flags.wendy_respect ?? 0) === expectedRespect &&
    (flags.creature_trust ?? 0) === Number(flags.creature_fate === 'Help') &&
    (flags.ch3_wendy_guarded === true) === (flags.wendy_approach === 'Direct') &&
    (flags.ch3_object_secured === true) === (flags.exit_plan === 'SecureBag');
}
function readChapter3(source, target) {
  if (!record(source)) return;
  target.monster = canonical(source.monster, MONSTERS);
  target.ending = canonical(source.ending, CHAPTER3_CHOICES.exit_plan);
  target.flags = storyFlags3(source.flags);
  target.inventory = Array.isArray(source.inventory) ? INVENTORY.filter(id => source.inventory.includes(id) && (id !== 'cloth_scrap' || target.flags.extra_clue_01 === true)) : [];
  target.completed = source.completed === true && target.monster !== null && target.flags.monster === target.monster && completeChoices3(target.flags, target.ending, target.inventory);
}
function seedFlags({ monster, chapter0Snapshot, campaign } = {}) {
  const progress = readCampaign(campaign).chapters[0];
  const oldMonster = chapterForSnapshot(chapter0Snapshot) === 0 && record(chapter0Snapshot.flags) ? canonical(chapter0Snapshot.flags.monster, MONSTERS) : null;
  return { monster: canonical(monster, MONSTERS) ?? (progress.completed ? progress.monster : null) ?? oldMonster ?? "Werewolf" };
}
function markCompleted(campaign, snapshot) {
  const result = readCampaign(campaign), chapter = chapterForSnapshot(snapshot);
  if (chapter === null || snapshot.phase !== "credits" || !record(snapshot.flags)) return result;
  const monster = canonical(snapshot.flags.monster, MONSTERS);
  if (!monster) return result;
  if (chapter === 0) { result.chapters[0] = { completed: true, monster }; return result; }
  if (chapter === 3) {
    const flags = storyFlags3(snapshot.flags), ending = canonical(flags.exit_plan, CHAPTER3_CHOICES.exit_plan);
    const inventory = Array.isArray(snapshot.inventory) ? INVENTORY.filter(id => snapshot.inventory.includes(id)) : [];
    if (snapshot.script.toLowerCase().replace(/\\/g, '/').endsWith('/night_gate') && ending && completeChoices3(flags, ending, inventory)) result.chapters[3] = { completed: true, monster, ending, flags, inventory, nextChapter: null };
    return result;
  }
  if (chapter === 2) {
    const flags = storyFlags2(snapshot.flags), ending = canonical(flags.creature_fate, CHAPTER2_CHOICES.creature_fate);
    const inventory = Array.isArray(snapshot.inventory) ? INVENTORY.filter(id => snapshot.inventory.includes(id)) : [];
    if (snapshot.script.toLowerCase().replace(/\\/g, '/').endsWith('/symbol') && ending && completeChoices2(flags, ending, inventory)) result.chapters[2] = { completed: true, monster, ending, flags, inventory, nextChapter: null };
    return result;
  }
  const flags = storyFlags(snapshot.flags), ending = canonical(flags.ending, Object.keys(ENDINGS));
  const inventory = Array.isArray(snapshot.inventory) ? INVENTORY.filter(id => snapshot.inventory.includes(id)) : [];
  if (!snapshot.script.toLowerCase().replace(/\\/g, "/").endsWith("/will") || !ending || !completeChoices(flags, ending, inventory)) return result;
  result.chapters[1] = { completed: true, monster, ending, flags, inventory, nextChapter: makeHandoff(monster, ending, flags, inventory) };
  return result;
}
function chapter2Handoff(campaign) {
  const next = readCampaign(campaign).chapters[1].nextChapter;
  return next ? JSON.parse(JSON.stringify(next)) : null;
}
function chapter3Handoff(campaign) {
  const progress = readCampaign(campaign).chapters[2];
  if (!progress.completed) return null;
  return { version: 1, fromChapter: 2, toChapter: 3, title: { ...CHAPTERS[3].title }, available: true,
    monster: progress.monster, flags: { ...progress.flags }, inventory: [...progress.inventory] };
}
function completionSummary(campaign, chapter, language = "english") {
  const progress = readCampaign(campaign).chapters[normalizeChapter(chapter)];
  if (!progress.completed) return language === "russian" ? "Не завершена" : "Not completed";
  if (normalizeChapter(chapter) === 1) return ENDINGS[progress.ending].title[language] ?? ENDINGS[progress.ending].title.english;
  if (normalizeChapter(chapter) === 3) return CHAPTER3_ENDINGS[progress.ending].title[language] ?? CHAPTER3_ENDINGS[progress.ending].title.english;
  if (normalizeChapter(chapter) === 2) return CHAPTER2_ENDINGS[progress.ending].title[language] ?? CHAPTER2_ENDINGS[progress.ending].title.english;
  return language === "russian" ? "Пройдена" : "Completed";
}
export {
  CAMPAIGN_KEY, CHAPTERS, CHAPTER_IDS, ENDINGS, CHAPTER1_CHOICES, CHAPTER2_CHOICES, CHAPTER2_ENDINGS, CHAPTER3_CHOICES, CHAPTER3_ENDINGS,
  chapterForSnapshot, chapterLanguage, chapterTitle, completionSummary, chapter2Handoff, chapter3Handoff,
  markCompleted, normalizeChapter, normalizeMonster, readCampaign, saveKey, seedFlags, validCampaign
};
