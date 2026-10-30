import { StoryEngine } from './engine.js';
import { CHAPTERS, CHAPTER_IDS, CHAPTER1_CHOICES, CHAPTER2_CHOICES, CHAPTER3_CHOICES, chapterForSnapshot } from './campaign.js';
import { getFlowGraph } from './flowchart.js';

const MONSTERS = ['Werewolf', 'Wendigo', 'Vampire'];
const CITY = ['arcade', 'hardware_store', 'telepathy_tent'];
const CITY_NAMES = { arcade: 'Arcade', hardware_store: 'Hardware_Store', telepathy_tent: 'Telepathy_Tent' };
const CITY_NODES = { arcade: 'arcade', hardware: 'hardware_store', tent: 'telepathy_tent' };
const PATHS = [
  {
    intro: 'chapter_0/part_1_intro/intro_1',
    werewolf: 'chapter_0/part_1_intro/intro_2_werewolf',
    wendigo: 'chapter_0/part_1_intro/intro_2_wendigo',
    vampire: 'chapter_0/part_1_intro/intro_2_vampire',
    gideon: 'chapter_0/part_1_intro/intro_3_gideon',
    arcade: 'chapter_0/part_2_freetime/arcade/first',
    hardware: 'chapter_0/part_2_freetime/hardware_store/first',
    tent: 'chapter_0/part_2_freetime/telepathy_tent/first',
    forest: 'chapter_0/part_3_mothman/mothman_1',
    moth_paper: 'chapter_0/part_3_mothman/mothman_2_werewolf',
    moth_heat: 'chapter_0/part_3_mothman/mothman_2_wendigo',
    moth_reflection: 'chapter_0/part_3_mothman/mothman_2_vampire',
    finale: 'chapter_0/part_3_mothman/mothman_3'
  },
  ...CHAPTER_IDS.filter(id => id > 0).map(id => Object.fromEntries(getFlowGraph(id).nodes.map(node => [node.id, `${CHAPTERS[id].namespace}/${node.id}`])))
];
const MONSTER_TARGET = {
  werewolf: 'Werewolf', wendigo: 'Wendigo', vampire: 'Vampire',
  moth_paper: 'Werewolf', moth_heat: 'Wendigo', moth_reflection: 'Vampire',
  ...Object.fromEntries(['cafe', 'yard', 'clearing'].flatMap(scene => MONSTERS.map(monster => [`${scene}_${monster.toLowerCase()}`, monster])))
};
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = (value, options) => typeof value === 'string'
  ? options.find(option => option.toLowerCase() === value.trim().toLowerCase()) : undefined;
const scriptPath = value => typeof value === 'string'
  ? value.toLowerCase().replace(/\\/g, '/').replace(/^textes\/[a-z]+\//, '') : '';

function selectedChapter(value) {
  const chapter = CHAPTER_IDS.find(id => value === id || value === String(id) || value === CHAPTERS[id].namespace || id === 1 && value === 'chapter_1');
  if (chapter === undefined) throw new Error('Unknown chapter for the choices map');
  return chapter;
}

function hints(snapshot, chapter) {
  const empty = { paths: [], flags: {}, cities: [] };
  if (!record(snapshot) || chapterForSnapshot(snapshot) !== chapter || !Array.isArray(snapshot.history)) return empty;
  const namespace = CHAPTERS[chapter].namespace + '/';
  const paths = [...snapshot.history.map(row => scriptPath(row?.script)), scriptPath(snapshot.script)].filter(path => path.startsWith(namespace));
  const flags = record(snapshot.flags)
    ? Object.fromEntries(Object.entries(snapshot.flags).map(([key, value]) => [key.toLowerCase(), value])) : {};
  const cities = [];
  for (const path of paths) {
    const match = path.match(/^chapter_0\/part_2_freetime\/(arcade|hardware_store|telepathy_tent)\/first$/);
    if (match && !cities.includes(match[1])) cities.push(match[1]);
  }
  // Actual history is authoritative. The visited list also supports early saves
  // made immediately after travel, before the first spoken line is recorded.
  if (Array.isArray(snapshot.visited)) for (const location of snapshot.visited) {
    if (typeof location !== 'string') continue;
    const city = location.toLowerCase();
    if (CITY.includes(city) && !cities.includes(city)) cities.push(city);
  }
  return { paths, flags, cities };
}

function inferredMonster(source, chapter) {
  const pattern = chapter === 0 ? /\/intro_2_(werewolf|wendigo|vampire)$/ : /\/(?:cafe|yard|clearing)_(werewolf|wendigo|vampire)$/;
  const path = source.paths.find(path => pattern.test(path));
  return canonical(path?.match(pattern)?.[1], MONSTERS) || canonical(source.flags.monster, MONSTERS);
}

/** Reconstruct a coherent scene entry by executing the same story as normal play.
 * This does not read/write storage, alter campaign progress, or mutate the source
 * save. Only the target's required branches override earlier preferred choices.
 */
export function createFlowJump({ chapter, nodeId, scripts, characters, language = 'english', snapshot = null, monster = 'Werewolf', canonicalChoices = null, cityOrder: explicitCityOrder = null, initialFlags = {}, initialInventory = null } = {}) {
  chapter = selectedChapter(chapter);
  if (typeof nodeId !== 'string' || !getFlowGraph(chapter).nodes.some(node => node.id === nodeId)) throw new Error('Unknown scene on the choices map');
  if (typeof language !== 'string' || !CHAPTERS[chapter].languages.includes(language.trim().toLowerCase())) throw new Error('This chapter is not available in the selected language');
  language = language.trim().toLowerCase();
  const source = hints(snapshot, chapter);
  // An explicit canonical projection deliberately bypasses every legacy hint.
  const explicit = record(canonicalChoices);
  const selectedMonster = MONSTER_TARGET[nodeId] || (explicit ? canonical(canonicalChoices['ch0.creature'], MONSTERS) : inferredMonster(source, chapter)) || canonical(monster, MONSTERS) || 'Werewolf';
  const chapterDefinitions = { 1: CHAPTER1_CHOICES, 2: CHAPTER2_CHOICES, 3: CHAPTER3_CHOICES };
  const choiceIndices = Object.entries(chapterDefinitions[chapter] ?? {}).map(([key, values]) => {
    const prefix = { trail_focus: 'trail', threat_plan: 'plan', creature_fate: 'fate', wendy_approach: 'approach', test_method: 'test', exit_plan: 'exit' }[key] ?? key;
    const paths = source.paths.map(path => path.split('/').at(-1));
    const previous = paths.find(path => values.some(value => path === `${prefix}_${value.toLowerCase()}`));
    const required = values.find(value => nodeId === `${prefix}_${value.toLowerCase()}`);
    const stableId = { reason: 'ch1.gideon_reason', tracks: 'ch1.tracks', descent: 'ch1.slope', ending: 'ch1.ending', trail_focus: 'ch2.trail_focus', threat_plan: 'ch2.threat_plan', creature_fate: 'ch2.creature_fate', wendy_approach: 'ch3.wendy_approach', test_method: 'ch3.test_method', exit_plan: 'ch3.exit_plan' }[key];
    return values.indexOf(required || (explicit ? canonical(canonicalChoices[stableId], values) : canonical(previous?.slice(prefix.length + 1), values) || canonical(source.flags[key], values)) || values[0]);
  });
  const cityTarget = chapter === 0 ? CITY_NODES[nodeId] : null;
  const priorCities = explicit ? (Array.isArray(explicitCityOrder) ? explicitCityOrder.filter(city => CITY.includes(city)) : []) : source.cities;
  const preferredCities = [...priorCities, ...CITY.filter(city => !priorCities.includes(city))];
  const cityOrder = cityTarget
    ? priorCities.includes(cityTarget) ? priorCities.slice(0, priorCities.indexOf(cityTarget) + 1) : [...priorCities, cityTarget]
    : preferredCities;
  const targetPath = PATHS[chapter][nodeId];
  const engine = new StoryEngine({ scripts, characters, language });
  engine.start(CHAPTERS[chapter].start, { flags: { ...(record(initialFlags) ? initialFlags : {}), ...(chapter > 0 ? { monster: selectedMonster } : {}) }, inventory: Array.isArray(initialInventory) ? initialInventory : [] });
  let choice = 0;

  for (let step = 0; step < 12000; step++) {
    const state = engine.state;
    if (nodeId === 'town' && chapter === 0 && state.phase === 'map') return engine.snapshot();
    if (state.script === targetPath && state.phase === 'dialogue') return engine.snapshot();
    if (state.phase === 'credits' || state.phase === 'idle') break;
    if (state.phase === 'choice') {
      const index = chapter === 0 ? MONSTERS.indexOf(selectedMonster)
        : choiceIndices[choice];
      engine.choose(index);
      choice++;
      continue;
    }
    if (state.phase === 'map') {
      if (chapter !== 0) break;
      const city = cityOrder.find(city => !state.visited.includes(city));
      if (city) {
        engine.visit(CITY_NAMES[city], { script: `chapter_0/part_2_freetime/${city}/first`, background: city, repeatScript: 'defaultmap/alreadyhere' });
      } else if (!cityTarget && !state.visited.includes('forest')) {
        engine.visit('Forest', { script: PATHS[0].forest, background: 'forest_1_dusk', final: true });
      } else break;
      continue;
    }
    engine.advance();
  }
  const error = new Error(language === 'french' && /^moth_(?:paper|heat)$/.test(nodeId)
    ? 'This branch is unavailable in the original French script. Choose English or Russian.'
    : 'The selected scene could not be reached through this story.');
  error.code = 'FLOW_BRANCH_UNAVAILABLE';
  throw error;
}
