import { CHAPTERS, CHAPTER_IDS, normalizeChapter } from "./campaign.js";
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


const chapter2 = {
  chapter: 2, width: 7570, height: 1280,
  nodes: [
    node('start', 0, 540, 'Утро, 10:30', 'Morning, 10:30', 'Друзья встречаются в кафе и решают проверить факты, а не подтверждать готовую версию.', 'The friends meet at the café and decide to test the evidence instead of confirming a theory.', 'start'),
    node('two_tracks', 1, 540, 'Два следа', 'Two tracks', 'Большие и маленькие следы могут принадлежать разным существам. Что проверить?', 'The large and small tracks may belong to different creatures. What should they inspect?', 'choice'),
    node('trail_largetracks', 2, 220, 'Большие следы', 'Large tracks', 'На коре найдена светлая грубая нить.', 'A pale coarse fibre is caught on the bark.'),
    node('trail_journal', 2, 540, 'Сравнить с Дневником', 'Compare with the journal', 'Распределение веса не совпадает с рисунком в Дневнике.', 'The weight distribution does not match the drawing in the journal.'),
    node('trail_perimeter', 2, 860, 'Осмотреть периметр', 'Inspect the perimeter', 'Маленькие следы огибают большие.', 'The smaller tracks curve around the larger ones.'),
    node('watch_hut', 3, 540, 'Слишком удобно', 'Too convenient', 'Старая сторожка: царапины, разная шерсть и чистая вода. Следы выглядят слишком подходящими.', 'An old watch hut: scratches, different fur and clean water. The evidence seems too convenient.'),
    node('rock_hollow', 4, 540, 'Нашли', 'Found', 'Неизвестное Существо говорит, что животные живы.', 'An unfamiliar creature says the animals are alive.'),
    node('hidden_shelter', 5, 540, 'Не он', 'Not him', 'Бастер и другие животные живы. Из леса доносится странный человеческий зов.', 'Buster and the other animals are alive. An odd human call comes from the woods.'),
    node('real_picture', 6, 540, 'Настоящая картина', 'The real picture', 'Гидеон связывает следы и сломанный забор. У входа в водосток звучит голос Пасифики.', 'Gideon connects the tracks and broken fence. Pacifica’s voice comes from the drainage entrance.'),
    node('real_threat', 7, 540, 'Настоящая угроза', 'The real threat', 'В тоннеле заперта живая собака. Как действовать вместе?', 'A living dog is trapped in the tunnel. How should the friends act together?', 'choice'),
    node('plan_distract', 8, 220, 'Отвлечь', 'Distract', 'Пасифика отвлекает Хищника, пока Гидеон освобождает собаку.', 'Pacifica distracts the predator while Gideon frees the dog.'),
    node('plan_block', 8, 540, 'Перекрыть путь', 'Block the passage', 'Гидеон замечает решётку; герои используют её, чтобы задержать преследователя.', 'Gideon notices a gate; the friends use it to delay their pursuer.'),
    node('plan_protect', 8, 860, 'Держаться вместе', 'Stay together', 'Герои не разделяются и вместе выводят собаку.', 'The friends stay together and lead the dog out.'),
    node('water_climax', 9, 540, 'Вода в тоннеле', 'Water in the tunnel', 'Гидеон замечает избегание воды. Пасифика помогает открыть старый вентиль.', 'Gideon notices it avoids the water. Pacifica helps open an old valve.'),
    node('creature_question', 10, 540, 'Что делать с монстром', 'What to do with the monster', 'Существо помогло животным, но решало за них. Какие границы установить?', 'The creature helped the animals, but made decisions for them. What boundaries should be set?', 'choice'),
    node('fate_help', 11, 220, 'Помочь', 'Help', 'Животные возвращаются домой; Существо может уйти глубже в лес без огласки.', 'The animals return home; the creature may move deeper into the forest without exposure.'),
    node('fate_expel', 11, 540, 'Попросить уйти', 'Ask it to leave', 'Животные возвращаются к хозяевам; Существо должно покинуть окрестности города.', 'The animals return to their owners; the creature must leave the area around town.'),
    node('fate_neutralize', 11, 860, 'Установить границы', 'Set firm boundaries', 'Не приближаться к домам и больше не забирать животных. Герои выбирают сдерживание, не жестокость.', 'Stay away from homes and stop taking animals. The friends choose containment, without cruelty.'),
    node('symbol', 12, 540, 'Символ', 'Symbol', 'На старой дороге найден знак, которого нет в Дневнике. Его смысл неизвестен.', 'A mark is found on the old road, with no match in the journal. Its meaning is unknown.', 'ending')
  ],
  edges: [
    edge('start','two_tracks'),
    ...connect('two_tracks',['trail_largetracks','trail_journal','trail_perimeter']),
    ...['trail_largetracks','trail_journal','trail_perimeter'].map(id=>edge(id,'watch_hut')),
    edge('watch_hut','rock_hollow'),edge('rock_hollow','hidden_shelter'),edge('hidden_shelter','real_picture'),edge('real_picture','real_threat'),
    ...connect('real_threat',['plan_distract','plan_block','plan_protect']),
    ...['plan_distract','plan_block','plan_protect'].map(id=>edge(id,'water_climax')),
    edge('water_climax','creature_question'),
    ...connect('creature_question',['fate_help','fate_expel','fate_neutralize']),
    ...['fate_help','fate_expel','fate_neutralize'].map(id=>edge(id,'symbol'))
  ]
};

// Only the installed chapter-three investigation is described here. Its mystery
// remains open; no future chapter outcome or assumed alliance appears on the map.
const chapter3 = {
  chapter: 3, width: 6900, height: 1280,
  nodes: [
    node('start', 0, 540, 'То, чего нет в Дневнике', 'What the journal does not say', 'Герои коротко вспоминают неизвестный знак. Ответа пока нет; впереди новое происшествие.', 'The friends briefly revisit the unknown mark. There is still no answer; a new incident needs attention.', 'start'),
    node('yard', 1, 540, 'За воротами', 'Beyond the gate', 'У лесопилки не сходятся расстояния и привычные ориентиры.', 'Distances and familiar landmarks do not agree near the lumber yard.'),
    node('first_talk', 2, 540, 'Ничего не видела', 'Saw nothing', 'Венди избегает расспросов. Как начать разговор, не выдавая догадку за факт?', 'Wendy avoids questions. How should they approach her without treating a guess as a fact?', 'choice'),
    node('approach_direct', 3, 220, 'Спросить прямо', 'Ask directly', 'Пасифика настаивает на прямом ответе. Венди становится настороженнее.', 'Pacifica insists on a straight answer. Wendy becomes more guarded.'),
    node('approach_bargain', 3, 540, 'Предложить обмен', 'Offer a trade', 'Герои предлагают обменяться проверяемыми сведениями, а не обещаниями дружбы.', 'The friends offer verifiable information in exchange, not a promise of friendship.'),
    node('approach_wait', 3, 860, 'Не торопить', 'Wait and watch', 'Гидеон замечает, как Венди выбирает место и старается не подходить к воротам.', 'Gideon notices where Wendy stands and how she avoids the gate.'),
    node('waymarks', 4, 540, 'Неверные ориентиры', 'Unreliable landmarks', 'Нужно проверить происходящее независимо от уверенности Венди.', 'They need to test what is happening without relying on Wendy’s confidence.', 'choice'),
    node('test_mark', 5, 220, 'Оставить метки', 'Leave marks', 'Собственные отметки позволяют заметить изменение расположения ориентиров.', 'Their own marks reveal that the positions of landmarks have changed.'),
    node('test_listen', 5, 540, 'Прислушаться', 'Listen carefully', 'Звуки шагов помогают сравнить путь с тем, что герои видят.', 'Footsteps help compare the route with what the friends can see.'),
    node('test_checkplans', 5, 860, 'Сверить план', 'Check the plans', 'План участка и реальные расстояния противоречат друг другу.', 'The site plan and the actual distances contradict one another.'),
    node('cutting_floor', 6, 540, 'Пустой цех', 'The empty cutting shed', 'Внутри лесопилки странность становится опасной. Шутки прекращаются.', 'Inside the lumber yard, the anomaly turns dangerous. The jokes stop.'),
    node('service_walk', 7, 540, 'Служебный проход', 'The service passage', 'Пасифика и Гидеон проверяют путь к выходу. Венди знает больше, чем говорила.', 'Pacifica and Gideon test a way out. Wendy knows more than she admitted.'),
    node('bag', 8, 540, 'Чужая находка', 'Someone else’s find', 'Венди показывает предмет, который забрала из леса. Его связь с нынешним происшествием становится очевидной.', 'Wendy reveals the object she took from the forest. Its involvement in the present incident becomes clear.'),
    node('crossing', 9, 540, 'Узкий выход', 'The narrow exit', 'Чтобы выбраться, нужно согласовать действия. Доверие ещё не заменяет проверку.', 'To get out, they must coordinate their actions. Trust still does not replace checking.', 'choice'),
    node('exit_holdgate', 10, 220, 'Удержать проход', 'Hold the passage', 'Пасифика и Гидеон вместе удерживают проход, пока Венди выбирается.', 'Pacifica and Gideon hold the passage together while Wendy gets out.'),
    node('exit_guide', 10, 540, 'Провести по меткам', 'Guide by landmarks', 'Герои сверяют каждый шаг, а Венди приходится слушать их указания.', 'The friends check each step, and Wendy has to follow their directions.'),
    node('exit_securebag', 10, 860, 'Закрепить сумку', 'Secure the bag', 'Они удерживают сумку с находкой неподвижно, не присваивая предмет.', 'They keep the bag and its object still without taking ownership of it.'),
    node('night_gate', 11, 540, 'До темноты', 'Before dark', 'Из цеха удалось выбраться. Венди всё ещё хранит находку, а происшествие не закончилось.', 'They have escaped the shed. Wendy still keeps the object, and the incident is not over.', 'ending')
  ],
  edges: [
    edge('start', 'yard'), edge('yard', 'first_talk'),
    ...connect('first_talk', ['approach_direct', 'approach_bargain', 'approach_wait']),
    ...['approach_direct', 'approach_bargain', 'approach_wait'].map(id => edge(id, 'waymarks')),
    ...connect('waymarks', ['test_mark', 'test_listen', 'test_checkplans']),
    ...['test_mark', 'test_listen', 'test_checkplans'].map(id => edge(id, 'cutting_floor')),
    edge('cutting_floor', 'service_walk'), edge('service_walk', 'bag'), edge('bag', 'crossing'),
    ...connect('crossing', ['exit_holdgate', 'exit_guide', 'exit_securebag']),
    ...['exit_holdgate', 'exit_guide', 'exit_securebag'].map(id => edge(id, 'night_gate'))
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
const nodeMaps = { 0: map0, ...Object.fromEntries([chapter1, chapter2, chapter3].map(graph => [graph.chapter, Object.fromEntries(graph.nodes.map(node => [node.id, node.id]))])) };

function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
const graphs = [chapter0, chapter1, chapter2, chapter3].map(deepFreeze);
const index = graphs.map(graph => ({
  nodes: new Set(graph.nodes.map(item => item.id)),
  edges: new Set(graph.edges.map(item => item.id))
}));
const selectChapter = normalizeChapter;
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
function getFlowGraph(chapter) { return graphs[selectChapter(chapter)]; }
function readFlowProgress(value) {
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { value = null; }
  }
  const result = { version: 3, chapters: Object.fromEntries(CHAPTER_IDS.map(id => [id, { nodes: [], edges: [] }])) };
  if (!record(value) || ![1, 2, 3].includes(value.version) || !record(value.chapters)) return result;
  for (const chapter of CHAPTER_IDS) {
    // Old chapter-one nodes belong to an entirely different story.
    if (chapter > 0 && value.version !== 3) continue;
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
  const chapter = CHAPTER_IDS.find(id => path.startsWith(CHAPTERS[id].namespace + '/'));
  if (chapter === undefined) return null;
  const id = nodeMaps[chapter][path.slice(CHAPTERS[chapter].namespace.length + 1)];
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
  result.completed = snapshot.phase === "credits" && getFlowGraph(chapter).nodes.some(node => node.id === current.id && node.kind === "ending");
  return result;
}
function observeFlow(progress, snapshot) {
  const result = readFlowProgress(progress);
  for (const chapter of CHAPTER_IDS) {
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
