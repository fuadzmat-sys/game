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
    start: "chapter_0/part_1_intro/intro_1", authored: false
  },
  1: {
    id: 1, title: { russian: "Следы в лесу", english: "Tracks in the Forest" },
    languages: ["russian", "english"], start: "chapter_1_v3/start", authored: true,
    storyVersion: 3, nextChapter: { id: 2, title: { russian: "Не тот монстр", english: "The Wrong Monster" }, available: false }
  }
});
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
const COUNTERS = ["gideon_deflects", "gideon_curiosity", "gideon_openness", "pacifica_gideon_trust", "pacifica_bold", "journal_doubt", "pacifica_protective"];
const BOOL_FLAGS = ["extra_clue_01", "careful_route", "chapter1_bold_end", "chapter1_cautious_end", "chapter1_observation_end"];
const INVENTORY = ["journal_3", "cloth_scrap"];
const ENDING_FLAGS = { Bold: "chapter1_bold_end", Cautious: "chapter1_cautious_end", Observation: "chapter1_observation_end" };
const record = value => value !== null && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const canonical = (value, values) => typeof value === "string" ? values.find(item => item.toLowerCase() === value.trim().toLowerCase()) ?? null : null;
const parse = value => { if (typeof value !== "string") return value; try { return JSON.parse(value); } catch { return null; } };
function normalizeChapter(value) { return value === 1 || value === "1" || value === "chapter_1" || value === "chapter_1_v3" ? 1 : 0; }
function chapterForSnapshot(snapshot) {
  if (!record(snapshot) || snapshot.version !== 1 || typeof snapshot.script !== "string") return null;
  const path = snapshot.script.toLowerCase().replace(/\\/g, "/");
  const match = path.match(/^(?:textes\/(?:english|french|german|polish|russian|spanish|ukrainian)\/)?(chapter_0|chapter_1_v3)\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/);
  return match ? match[1] === "chapter_0" ? 0 : 1 : null;
}
function saveKey(chapter) { return normalizeChapter(chapter) === 1 ? "reverse-falls-chapter1-v3-save-v1" : "reverse-falls-chapter0-save-v1"; }
function normalizeMonster(value) { return canonical(value, MONSTERS) ?? "Werewolf"; }
function chapterLanguage(chapter, language) {
  const selected = typeof language === "string" ? language.trim().toLowerCase() : "english";
  return CHAPTERS[normalizeChapter(chapter)].languages.includes(selected) ? selected : "english";
}
function chapterTitle(chapter, language = "english") { const title = CHAPTERS[normalizeChapter(chapter)].title; return title[language] ?? title.english; }
function emptyCampaign() {
  return { version: 2, chapters: {
    0: { completed: false, monster: null },
    1: { completed: false, monster: null, ending: null, flags: {}, inventory: [], nextChapter: null }
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
    title: { ...CHAPTERS[1].nextChapter.title }, available: false,
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
  if (data.version !== 2 || !record(data.chapters[1])) return result;
  const source = data.chapters[1], target = result.chapters[1];
  target.monster = canonical(source.monster, MONSTERS);
  target.ending = canonical(source.ending, Object.keys(ENDINGS));
  target.flags = storyFlags(source.flags);
  target.inventory = Array.isArray(source.inventory) ? INVENTORY.filter(id => source.inventory.includes(id) && (id !== "cloth_scrap" || target.flags.extra_clue_01 === true)) : [];
  target.completed = source.completed === true && target.monster !== null && target.flags.monster === target.monster && completeChoices(target.flags, target.ending, target.inventory);
  if (target.completed) target.nextChapter = makeHandoff(target.monster, target.ending, target.flags, target.inventory);
  return result;
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
function completionSummary(campaign, chapter, language = "english") {
  const progress = readCampaign(campaign).chapters[normalizeChapter(chapter)];
  if (!progress.completed) return language === "russian" ? "Не завершена" : "Not completed";
  if (normalizeChapter(chapter) === 1) return ENDINGS[progress.ending].title[language] ?? ENDINGS[progress.ending].title.english;
  return language === "russian" ? "Пройдена" : "Completed";
}
export {
  CAMPAIGN_KEY, CHAPTERS, ENDINGS, CHAPTER1_CHOICES,
  chapterForSnapshot, chapterLanguage, chapterTitle, completionSummary, chapter2Handoff,
  markCompleted, normalizeChapter, normalizeMonster, readCampaign, saveKey, seedFlags, validCampaign
};
