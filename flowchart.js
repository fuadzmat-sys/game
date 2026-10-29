// Progress is deliberately separate from manual saves. A map records discoveries,
// while the highlighted route always comes from the currently loaded story.
const FLOW_KEY = "reverse-falls-flowchart-v1";
const size = { width: 420, height: 155 };
const words = (russian, english) => ({ russian, english });
const node = (id, column, y, ru, en, ruDetail, enDetail, kind = "event") => ({
  id, x: 100 + column * 570, y, ...size,
  label: words(ru, en), detail: words(ruDetail, enDetail), kind
});
const edge = (from, to) => ({ id: `${from}>${to}`, from, to });
const connect = (from, targets) => targets.map(to => edge(from, to));

const chapter0 = {
  chapter: 0, width: 4610, height: 1280,
  nodes: [
    node("intro", 0, 540, "Дневник №3", "Journal Three", "Пасифика находит дневник и выбирает страницу для охоты.", "Pacifica finds the journal and chooses a page for the hunt.", "start"),
    node("werewolf", 1, 220, "Страница оборотня", "Werewolf page", "Подготовка к выбранной охоте на оборотня.", "Preparation for the chosen werewolf hunt."),
    node("wendigo", 1, 540, "Страница вендиго", "Wendigo page", "Подготовка к выбранной охоте на вендиго.", "Preparation for the chosen wendigo hunt."),
    node("vampire", 1, 860, "Страница вампира", "Vampire page", "Подготовка к выбранной охоте на вампира.", "Preparation for the chosen vampire hunt."),
    node("gideon", 2, 540, "Поручение Гидеона", "Gideon's errand", "Разговор с отцом отправляет Гидеона в город.", "A conversation with his father sends Gideon into town."),
    node("town", 3, 540, "Свободное время", "Free time", "Три городских места можно посетить в любом порядке. После сцен герои возвращаются на карту.", "The three town locations can be visited in any order. Scenes return to the town map.", "choice"),
    node("arcade", 4, 220, "Игровые автоматы", "The arcade", "Городской эпизод в зале игровых автоматов.", "The town episode at the arcade."),
    node("hardware", 4, 540, "Хозяйственный магазин", "Hardware store", "Городской эпизод в хозяйственном магазине.", "The town episode at the hardware store."),
    node("tent", 4, 860, "Шатёр телепатии", "Telepathy tent", "Городской эпизод в шатре близнецов.", "The town episode at the twins' tent."),
    node("forest", 5, 540, "Встреча в лесу", "The forest encounter", "После городских дел начинается охота на загадочное существо.", "After the town visits, the hunt for a mysterious creature begins."),
    node("moth_paper", 6, 220, "Бутерброд для монстра", "A sandwich for the monster", "Пригодилась подготовка к охоте на оборотня.", "The preparations for a werewolf hunt come into play."),
    node("moth_heat", 6, 540, "Острый соус", "Hot sauce", "Пригодилась подготовка к охоте на вендиго.", "The preparations for a wendigo hunt come into play."),
    node("moth_reflection", 6, 860, "Охота и отражения", "Hunting and reflections", "Пригодилась подготовка к охоте на вампира.", "The preparations for a vampire hunt come into play."),
    node("finale", 7, 540, "Синий свет", "The blue light", "Встреча с Мотыльком заканчивается побегом и приглашением в закусочную.", "The Mothman encounter ends with an escape and an invitation to the diner.", "ending")
  ],
  edges: [
    ...connect("intro", ["werewolf", "wendigo", "vampire"]),
    ...["werewolf", "wendigo", "vampire"].flatMap(id => connect(id, ["gideon"])),
    edge("gideon", "town"),
    ...connect("town", ["arcade", "hardware", "tent", "forest"]),
    ...["arcade", "hardware", "tent"].map(id => edge(id, "town")),
    ...connect("forest", ["moth_paper", "moth_heat", "moth_reflection"]),
    ...["moth_paper", "moth_heat", "moth_reflection"].map(id => edge(id, "finale"))
  ]
};

const chapter1 = {
  chapter: 1, width: 13160, height: 1280,
  nodes: [
    node("start", 0, 540, "Утро, 09:17", "Morning, 09:17", "Пасифика ждёт Гидеона возле кафе. После вчерашнего они всё-таки встретились.", "Pacifica waits outside the café. After yesterday, they still kept their promise.", "start"),
    node("cafe", 1, 540, "Дневник за завтраком", "The journal at breakfast", "Первый разговор о вчерашнем и Дневнике №3. Выбранное существо пока только рабочая версия.", "Breakfast, yesterday’s events, and Journal Three. The chosen creature is still only a working theory.", "event"),
    node("cafe_werewolf", 2, 220, "Версия: оборотень", "Theory: werewolf", "Пасифика показывает страницу оборотня. Гидеон напоминает: они ещё ничего не нашли.", "Pacifica shows the werewolf page. Gideon reminds her they have not found anything yet.", "event"),
    node("cafe_wendigo", 2, 540, "Версия: вендиго", "Theory: wendigo", "Лес в записи — зацепка для Пасифики и просто география для Гидеона.", "The forest in the entry is a lead to Pacifica and merely geography to Gideon.", "event"),
    node("cafe_vampire", 2, 860, "Версия: вампир", "Theory: vampire", "Запись допускает охоту возле города, но сама по себе ничего не доказывает.", "The entry mentions hunting near settlements, but proves nothing by itself.", "event"),
    node("reason", 3, 540, "Почему он пришёл?", "Why did he come?", "Гидеон всё-таки пришёл на встречу. Что он ответит Пасифике?", "Gideon came after all. What will he tell Pacifica?", "choice"),
    node("reason_deflect", 4, 220, "Нечего делать", "Nothing else to do", "Гидеон отшучивается. gideon_deflects +1.", "Gideon deflects with a joke. gideon_deflects +1.", "event"),
    node("reason_curiosity", 4, 540, "Понять вчерашнее", "Understand yesterday", "Гидеон признаёт любопытство. gideon_curiosity +1.", "Gideon admits his curiosity. gideon_curiosity +1.", "event"),
    node("reason_openness", 4, 860, "Не с кем говорить", "Nobody else to talk to", "Гидеон ненадолго открывается. gideon_openness +1, доверие +1.", "Gideon opens up briefly. gideon_openness +1, trust +1.", "event"),
    node("cafe_after", 5, 540, "Пропавшие животные", "Missing animals", "Разговор посетительниц приводит друзей к северной границе леса.", "A conversation between customers leads the friends toward the northern forest edge.", "event"),
    node("yard", 6, 540, "Сломанный забор", "The broken fence", "Гидеон замечает: доска сломана наружу. Собака выбиралась сама.", "Gideon notices the board broke outward. The dog was trying to get out.", "event"),
    node("yard_werewolf", 7, 220, "Лапы: почти совпадают", "Paw prints: almost a match", "Размер следов лишь почти совпадает с рисунком оборотня.", "The prints only almost match the werewolf drawing.", "event"),
    node("yard_wendigo", 7, 540, "Пальцы не те", "Different fingers", "На рисунке вендиго пальцы длиннее, чем в найденном следе.", "The wendigo drawing has longer fingers than the actual print.", "event"),
    node("yard_vampire", 7, 860, "Следы и кровь", "Footprints and blood", "Человеческие следы и капли крови допускают несколько объяснений.", "Human footprints and drops of blood allow more than one explanation.", "event"),
    node("yard_after", 8, 540, "Следы к лесу", "Tracks toward the woods", "Друзья идут проверять найденный след.", "The friends follow the lead toward the woods.", "event"),
    node("forest_edge", 9, 540, "В этот раз есть план", "A plan this time", "Сначала наблюдать и ничего не трогать. Пасифика помнит вчерашнюю импровизацию с палкой.", "Observe first and touch nothing. Pacifica remembers yesterday’s improvised stick rescue.", "event"),
    node("tracks", 10, 540, "Следы разные", "Different tracks", "Гидеон замечает разную глубину и расстояние между следами. Как проверить улику?", "Gideon notices different depths and spacing. How should they check the evidence?", "choice"),
    node("tracks_bold", 11, 220, "Идти дальше", "Keep following", "Пасифика ускоряет расследование, но маленькая улика остаётся незамеченной. pacifica_bold +1.", "Pacifica presses ahead, missing a small clue. pacifica_bold +1.", "event"),
    node("tracks_journal", 11, 540, "Сравнить с Дневником", "Compare with the journal", "Размер не совпадает: либо не то существо, либо книга ошибается. journal_doubt +1.", "The size does not match: either the creature or the book is wrong. journal_doubt +1.", "event"),
    node("tracks_search", 11, 860, "Осмотреть вокруг", "Search the area", "На ветке обнаружен кусок тёмной ткани. extra_clue_01 = true, предмет cloth_scrap.", "A piece of dark cloth is found on a branch. extra_clue_01 = true, item cloth_scrap.", "event"),
    node("animals", 12, 540, "Ошейник BUSTER", "BUSTER’s collar", "Застёжка цела, ошейник расстёгнут. В Дневнике нет объяснения.", "The buckle is intact and the collar was unfastened. The journal has no explanation.", "event"),
    node("false_alarm", 13, 540, "Ложная тревога", "A false alarm", "Из кустов выходит собака. Шутки заканчиваются, когда она пугается звука в лесу.", "A dog comes out of the bushes. The jokes stop when it fears a sound in the woods.", "event"),
    node("deep_forest", 14, 540, "Узкий склон", "The narrow slope", "Новые следы убедительнее. Кто спустится первым — или стоит обойти склон?", "The new tracks look more convincing. Who goes down first, or should they go around?", "choice"),
    node("descent_pacifica", 15, 220, "Пасифика первая", "Pacifica first", "Пасифика соскальзывает, Гидеон ловит её за руку. Доверие +1.", "Pacifica slips, and Gideon catches her hand. Trust +1.", "event"),
    node("descent_gideon", 15, 540, "Гидеон первый", "Gideon first", "Гидеон осторожно спускается. Пасифика учится не решать за него. pacifica_protective +1.", "Gideon carefully descends. Pacifica learns not to decide for him. pacifica_protective +1.", "event"),
    node("descent_careful", 15, 860, "Другой путь", "Another route", "Обход занимает больше времени и открывает дополнительные следы. careful_route = true.", "The detour takes longer and reveals more tracks. careful_route = true.", "event"),
    node("clearing", 16, 540, "Вещи на поляне", "Objects in the clearing", "Ошейник, верёвка, мешок и старые кости. Следы кажутся слишком удобными.", "A collar, rope, sack, and old bones. The evidence seems almost too convenient.", "event"),
    node("clearing_werewolf", 17, 220, "Четыре когтя", "Four claws", "Царапины совпадают с рисунком выбранного оборотня.", "The scratches match the selected werewolf drawing.", "event"),
    node("clearing_wendigo", 17, 540, "Похожие отметины", "Similar markings", "Пасифика находит похожие отметины на странице вендиго.", "Pacifica finds similar markings on the wendigo page.", "event"),
    node("clearing_vampire", 17, 860, "Пятна на мешке", "Stains on the sack", "Тёмные пятна кажутся подтверждением версии о вампире.", "Dark stains seem to support the vampire theory.", "event"),
    node("clearing_after", 18, 540, "Слишком удобно", "Too convenient", "Гидеон просит не убивать существо только по записи в книге. Пасифика соглашается.", "Gideon asks not to kill a creature just because of a book. Pacifica agrees.", "event"),
    node("watched", 19, 540, "Что-то наблюдает", "Something is watching", "Движение между деревьями. Как завершить расследование сегодня?", "Movement between the trees. How should they finish today’s investigation?", "choice"),
    node("ending_bold", 20, 220, "Идти за звуком", "Follow the sound", "Пасифика и Гидеон решают идти глубже в лес за услышанным звуком.", "Pacifica and Gideon decide to venture deeper into the woods toward the sound.", "event"),
    node("ending_cautious", 20, 540, "Вернуться подготовленными", "Return prepared", "Друзья решают вернуться и подготовиться, прежде чем продолжать поиски.", "The friends decide to return and prepare before continuing their search.", "event"),
    node("ending_observation", 20, 860, "Устроить наблюдение", "Set up an observation", "Пасифика и Гидеон выбирают наблюдение, чтобы лучше понять происходящее в лесу.", "Pacifica and Gideon choose to observe and learn more about what is happening in the woods.", "event"),
    node("blue_glow", 21, 540, "Синее свечение", "The blue glow", "На старой дороге друзья договариваются о завтра. Между деревьями мелькает синий свет.", "On the old road, the friends arrange tomorrow. A blue light flickers between the trees.", "event"),
    node("will", 22, 540, "Любопытно", "Curious", "Уилл наблюдает молча и произносит только одно слово.", "Will watches and speaks just one word.", "ending"),
  ],
  edges: [
    edge("start", "cafe"),
    ...connect("cafe", ["cafe_werewolf", "cafe_wendigo", "cafe_vampire"]),
    ...["cafe_werewolf", "cafe_wendigo", "cafe_vampire"].map(id => edge(id, "reason")),
    ...connect("reason", ["reason_deflect", "reason_curiosity", "reason_openness"]),
    ...["reason_deflect", "reason_curiosity", "reason_openness"].map(id => edge(id, "cafe_after")),
    edge("cafe_after", "yard"),
    ...connect("yard", ["yard_werewolf", "yard_wendigo", "yard_vampire"]),
    ...["yard_werewolf", "yard_wendigo", "yard_vampire"].map(id => edge(id, "yard_after")),
    edge("yard_after", "forest_edge"), edge("forest_edge", "tracks"),
    ...connect("tracks", ["tracks_bold", "tracks_journal", "tracks_search"]),
    ...["tracks_bold", "tracks_journal", "tracks_search"].map(id => edge(id, "animals")),
    edge("animals", "false_alarm"), edge("false_alarm", "deep_forest"),
    ...connect("deep_forest", ["descent_pacifica", "descent_gideon", "descent_careful"]),
    ...["descent_pacifica", "descent_gideon", "descent_careful"].map(id => edge(id, "clearing")),
    ...connect("clearing", ["clearing_werewolf", "clearing_wendigo", "clearing_vampire"]),
    ...["clearing_werewolf", "clearing_wendigo", "clearing_vampire"].map(id => edge(id, "clearing_after")),
    edge("clearing_after", "watched"),
    ...connect("watched", ["ending_bold", "ending_cautious", "ending_observation"]),
    ...["ending_bold", "ending_cautious", "ending_observation"].map(id => edge(id, "blue_glow")),
    edge("blue_glow", "will")
  ]
};

const map0 = {
  "part_1_intro/intro_1": "intro", "part_1_intro/intro_2_werewolf": "werewolf",
  "part_1_intro/intro_2_wendigo": "wendigo", "part_1_intro/intro_2_vampire": "vampire",
  "part_1_intro/intro_3_gideon": "gideon", "part_2_freetime/arcade/first": "arcade",
  "part_2_freetime/hardware_store/first": "hardware", "part_2_freetime/telepathy_tent/first": "tent",
  "part_3_mothman/mothman_1": "forest", "part_3_mothman/mothman_2_werewolf": "moth_paper",
  "part_3_mothman/mothman_2_wendigo": "moth_heat", "part_3_mothman/mothman_2_vampire": "moth_reflection",
  "part_3_mothman/mothman_3": "finale"
};
const map1 = Object.fromEntries(chapter1.nodes.map(node => [node.id, node.id]));

function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
const graphs = [chapter0, chapter1].map(deepFreeze);
const index = graphs.map(graph => ({
  nodes: new Set(graph.nodes.map(item => item.id)),
  edges: new Set(graph.edges.map(item => item.id))
}));
const selectChapter = value => value === 1 || value === "1" || (value === "chapter_1" || value === "chapter_1_v3") ? 1 : 0;
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
function getFlowGraph(chapter) { return graphs[selectChapter(chapter)]; }
function readFlowProgress(value) {
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { value = null; }
  }
  const result = { version: 3, chapters: { 0: { nodes: [], edges: [] }, 1: { nodes: [], edges: [] } } };
  if (!record(value) || ![1, 2, 3].includes(value.version) || !record(value.chapters)) return result;
  for (const chapter of [0, 1]) {
    // Old chapter-one nodes belong to an entirely different story.
    if (chapter === 1 && value.version !== 3) continue;
    const source = value.chapters[chapter];
    if (!record(source)) continue;
    for (const key of ["nodes", "edges"]) {
      if (!Array.isArray(source[key])) continue;
      result.chapters[chapter][key] = [...new Set(source[key].filter(id => typeof id === "string" && index[chapter][key].has(id)))].sort();
    }
    const found = new Set(result.chapters[chapter].nodes);
    result.chapters[chapter].edges = result.chapters[chapter].edges.filter(id => {
      const [from, to] = id.split(">");
      return found.has(from) && found.has(to);
    });
  }
  return result;
}
function parsePath(value) {
  if (typeof value !== "string") return null;
  const path = value.toLowerCase().replace(/\\/g, "/").replace(/^textes\/[a-z]+\//, "");
  const match = path.match(/^(chapter_0|chapter_1_v3)\/(.+)$/);
  if (!match) return null;
  const chapter = match[1] === "chapter_0" ? 0 : 1, id = (chapter === 0 ? map0 : map1)[match[2]];
  return id ? { chapter, id } : null;
}
function route(snapshot, chapter) {
  const result = { nodes: [], edges: [], currentNodeId: null, completed: false };
  if (!record(snapshot) || snapshot.version !== 1 || !Number.isInteger(snapshot.line) || snapshot.line < 0 || !Array.isArray(snapshot.history)) return result;
  const current = parsePath(snapshot.script);
  if (!current || current.chapter !== chapter) return result;
  const steps = [];
  const add = id => { if (steps.at(-1) !== id) steps.push(id); };
  const append = id => {
    if (chapter === 0 && ["arcade", "hardware", "tent", "forest"].includes(id) && steps.at(-1) !== id && ["gideon", "arcade", "hardware", "tent"].includes(steps.at(-1))) add("town");
    add(id);
  };
  for (const row of snapshot.history) {
    if (!record(row)) continue;
    const part = parsePath(row.script);
    if (!part || part.chapter !== chapter) continue;
    append(part.id);
  }
  append(current.id);
  if (chapter === 0 && snapshot.phase === "map" && ["gideon", "arcade", "hardware", "tent"].includes(current.id)) add("town");
  result.nodes = [...new Set(steps)];
  result.edges = [...new Set(steps.slice(1).map((to, i) => `${steps[i]}>${to}`).filter(id => index[chapter].edges.has(id)))];
  result.currentNodeId = steps.at(-1) ?? null;
  result.completed = snapshot.phase === "credits" && (chapter === 0 ? current.id === "finale" : current.id === "will");
  return result;
}
function observeFlow(progress, snapshot) {
  const result = readFlowProgress(progress);
  for (const chapter of [0, 1]) {
    const observed = route(snapshot, chapter), target = result.chapters[chapter];
    target.nodes = [...new Set([...target.nodes, ...observed.nodes])].sort();
    target.edges = [...new Set([...target.edges, ...observed.edges])].sort();
  }
  return result;
}
function flowView(chapter, progress, snapshot) {
  chapter = selectChapter(chapter);
  const graph = getFlowGraph(chapter), discovered = observeFlow(progress, snapshot).chapters[chapter];
  const path = route(snapshot, chapter), found = new Set(discovered.nodes), traversed = new Set(discovered.edges);
  const pathNodes = new Set(path.nodes), pathEdges = new Set(path.edges);
  const discoveredCount = found.size, totalCount = graph.nodes.length;
  return {
    ...graph,
    nodes: graph.nodes.map(item => ({ ...item, discovered: found.has(item.id), visible: true, inPath: pathNodes.has(item.id), current: path.currentNodeId === item.id })),
    edges: graph.edges.map(item => ({ ...item, discovered: traversed.has(item.id), inPath: pathEdges.has(item.id) })),
    discoveredCount, totalCount, percent: Math.round(discoveredCount / totalCount * 100),
    currentNodeId: path.currentNodeId, completed: path.completed
  };
}
export { FLOW_KEY, getFlowGraph, readFlowProgress, observeFlow, flowView };
