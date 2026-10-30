import { STORY_REGISTRY } from './story-bridge.js';

// Registration describes existing story graphs, not a second save. New chapters
// supply the same entry/exit, scene and requirement metadata to this projection.
const originalScenes = {
  intro: 'part_1_intro/intro_1', werewolf: 'part_1_intro/intro_2_werewolf',
  wendigo: 'part_1_intro/intro_2_wendigo', vampire: 'part_1_intro/intro_2_vampire',
  gideon: 'part_1_intro/intro_3_gideon', arcade: 'part_2_freetime/arcade/first',
  hardware: 'part_2_freetime/hardware_store/first', tent: 'part_2_freetime/telepathy_tent/first',
  forest: 'part_3_mothman/mothman_1', moth_paper: 'part_3_mothman/mothman_2_werewolf',
  moth_heat: 'part_3_mothman/mothman_2_wendigo', moth_reflection: 'part_3_mothman/mothman_2_vampire',
  finale: 'part_3_mothman/mothman_3'
};
const registrations = STORY_REGISTRY.chapters.map(chapter => chapter.chapterId === 0
  ? { chapterId: 0, entry: 'intro', exit: 'finale', prefix: 'chapter_0/', scenes: originalScenes,
      phaseNodes: { map: 'town' }, visits: { arcade: 'arcade', hardware: 'hardware_store', tent: 'telepathy_tent' },
      label: { russian: 'Глава 0', english: 'Chapter 0' } }
  : { chapterId: chapter.chapterId, entry: chapter.entry, exit: chapter.exit, prefix: chapter.namespace + '/',
      label: { russian: `Глава ${chapter.chapterId}`, english: `Chapter ${chapter.chapterId}` } });

export const CANON_TIMELINE_CHAPTERS = registrations.map(registration => {
  const graph = STORY_REGISTRY.graphs.find(item => item.chapter === registration.chapterId);
  return {
    ...registration, available: true,
    nodes: graph.nodes.map(node => ({ ...node,
      sceneId: registration.scenes ? registration.scenes[node.id] && registration.prefix + registration.scenes[node.id] : registration.prefix + node.id,
      visitKey: registration.visits?.[node.id] })),
    edges: graph.edges
  };
});

const normalizeScene = value => String(value ?? '').toLowerCase().replace(/\\/g, '/').replace(/^textes\/[a-z]+\//, '');
const requirementsMet = (requirements = [], choices = {}) => requirements.every(requirement => {
  const selected = choices[requirement.choiceId];
  if (Object.hasOwn(requirement, 'optionId')) return selected === requirement.optionId;
  if (Array.isArray(requirement.optionIds)) return requirement.optionIds.includes(selected);
  if (Object.hasOwn(requirement, 'notOptionId')) return selected !== undefined && selected !== requirement.notOptionId;
  return selected !== undefined;
});

/** Follow registered graph edges using official choices and compact progress only.
 * Discovery, engine caches, alternative sessions and portable saves are not read.
 */
function chapterRoute(chapter, canon, progress) {
  const nodes = new Map(chapter.nodes.map(node => [node.id, node]));
  const visits = Array.isArray(progress.visited) ? progress.visited : [];
  const allowed = node => node && requirementsMet(node.requirements, canon.choices)
    && (!node.visitKey || visits.includes(node.visitKey));
  const scene = normalizeScene(progress.sceneId);
  const target = progress.completed ? chapter.exit
    : chapter.phaseNodes?.[progress.phase] ?? progress.nodeId
      ?? chapter.nodes.find(node => node.sceneId && normalizeScene(node.sceneId) === scene)?.id;
  // An unknown auxiliary scene can only establish the registered chapter entry;
  // never infer an unseen ending from a choice or a discovery.
  const cursor = nodes.has(target) ? target : chapter.entry;
  const result = [], consumed = new Set(), usedEdges = new Set();
  let node = nodes.get(chapter.entry);
  for (let step = 0; node && step < chapter.nodes.length * 4; step++) {
    if (!allowed(node)) break;
    result.push(node);
    if (node.visitKey) consumed.add(node.visitKey);
    const outgoing = chapter.edges.filter(edge => edge.from === node.id && !usedEdges.has(edge.id || `${edge.from}>${edge.to}`))
      .map(edge => ({ edge, node: nodes.get(edge.to) })).filter(item => allowed(item.node));
    const pendingVisits = outgoing.filter(item => item.node.visitKey && !consumed.has(item.node.visitKey))
      .sort((a, b) => visits.indexOf(a.node.visitKey) - visits.indexOf(b.node.visitKey));
    if (node.id === cursor && !pendingVisits.length) break;
    if (node.id === chapter.exit) break;
    const next = pendingVisits[0] || outgoing.find(item => !item.node.visitKey);
    if (!next) break;
    usedEdges.add(next.edge.id || `${next.edge.from}>${next.edge.to}`);
    node = next.node;
  }
  return result;
}

/** Read-only continuous official timeline, rebuilt on every request. Chapter
 * registrations are ordered, data driven and may include future installed graphs.
 */
export function buildCanonTimeline(canon, { chapters = CANON_TIMELINE_CHAPTERS } = {}) {
  const nodes = [], edges = [];
  for (const chapter of chapters) {
    const progress = canon?.progress?.[chapter.chapterId];
    if (chapter.available === false || !progress) continue;
    const route = chapterRoute(chapter, canon, progress), occurrences = new Map();
    for (const source of route) {
      const occurrence = occurrences.get(source.id) || 0;
      occurrences.set(source.id, occurrence + 1);
      const id = `${chapter.chapterId}:${source.id}${occurrence ? `:${occurrence}` : ''}`;
      const node = { ...source, id, nodeId: source.id, chapterId: chapter.chapterId, chapterLabel: chapter.label,
        x: 100 + nodes.length * 570, y: 160, width: 420, height: 155,
        visible: true, discovered: false, inPath: true, inAlternative: false, current: false };
      const previous = nodes.at(-1);
      if (previous) edges.push({ id: `${previous.id}>${id}`, from: previous.id, to: id,
        inPath: true, inAlternative: false, discovered: false, chapterTransition: previous.chapterId !== chapter.chapterId });
      nodes.push(node);
    }
  }
  const current = nodes.filter(node => node.chapterId === canon?.currentChapter).at(-1) || nodes.at(-1);
  if (current) current.current = true;
  return { chapter: 'true-story', nodes, edges, width: Math.max(1000, nodes.length * 570 + 100), height: 480,
    currentNodeId: current?.id ?? null, discoveredCount: nodes.length, totalCount: nodes.length,
    percent: nodes.length ? 100 : 0, completed: false, readOnly: true };
}

export function projectCanonTimeline(canon, options) {
  return buildCanonTimeline(canon, options);
}
