import { flowView } from "./flowchart.js";
import { buildCanonTimeline } from "./canon-timeline.js";

const copy = {
  russian: {
    title: "Карта решений", kicker: "REVERSE FALLS / ТВОЯ ИСТОРИЯ",
    chapters: ["Глава 0", "Глава 1"], subtitles: ["Первая охота", "Следы в лесу"],
    close: "Вернуться", all: "Вся схема", full: "Полный режим", pathMode: "Мой путь",
    trueStory: "Настоящая история", timelineSubtitle: "Одна официальная история · Только просмотр", exportSave: "Сохранить путь", importSave: "Import Save", importTitle: "Загрузить сохранённый путь?", importText: "Текущая основная история будет заменена импортированным сохранением.", importAccept: "Загрузить", path: "Основной путь", alternative: "Альтернатива", discovered: "Открыто ранее", now: "Сейчас", locked: "Не открыто",
    progress: (count, total, percent) => `Открыто ${count} из ${total} · ${percent}%`,
    help: "Клик: сведения · Полный режим: альтернативы и изменение пути · Перетаскивай схему · Колесо: масштаб · Esc: вернуться",
    select: "Выбери сцену на схеме", hint: "Просмотр карты не меняет историю. Для работы с решениями выбери «Полный режим».",
    mainChoice: "Ваш основной выбор", opened: "Доступные варианты", noChoice: "Ещё не выбран", none: "Нет", yes: "Да", no: "Нет",
    rewritePossible: "Можно изменить основной путь", preview: "Посмотреть альтернативу", rewrite: "Изменить основной путь",
    confirmTitle: "Изменить историю?",
    confirmText: "Вы собираетесь изменить решение в предыдущей части истории. Решения и состояния после этой точки, зависящие от старого пути, будут пересчитаны или сброшены. Новое решение станет частью вашей основной истории.",
    cancel: "Отмена", confirm: "Изменить путь", failed: "Не удалось изменить историю. Ваше сохранение не было изменено.",
    fullHint: "Откройте «Полный режим», чтобы посмотреть альтернативу или изменить основной путь.",
    currentChoice: "Это ваш основной выбор.", unseenChoice: "Этот узел не содержит доступного решения.",
    emptyPath: "Основной путь этой главы ещё не начат.",
    kinds: { start: "НАЧАЛО", event: "СОБЫТИЕ", choice: "РЕШЕНИЕ", ending: "КОНЦОВКА" },
    statuses: { locked: "Не открыто", unlocked: "Открыто ранее", path: "Основной путь", alternative: "Альтернативный путь", current: "Текущее событие" }
  },
  english: {
    title: "Choices map", kicker: "REVERSE FALLS / YOUR STORY",
    chapters: ["Chapter 0", "Chapter 1"], subtitles: ["The first hunt", "Tracks in the Forest"],
    close: "Return", all: "Whole map", full: "Full mode", pathMode: "My path",
    trueStory: "True Story", timelineSubtitle: "One official timeline · Read only", exportSave: "Export Save", importSave: "Import Save", importTitle: "Load the saved path?", importText: "Your current main story will be replaced by the imported save.", importAccept: "Load", path: "Main path", alternative: "Alternative", discovered: "Previously discovered", now: "You are here", locked: "Undiscovered",
    progress: (count, total, percent) => `${count} of ${total} discovered · ${percent}%`,
    help: "Click: details · Full mode: alternatives and rewrites · Drag to pan · Scroll to zoom · Esc to return",
    select: "Select a scene on the map", hint: "Viewing the map never changes your story. Choose Full mode to interact with decisions.",
    mainChoice: "Your main choice", opened: "Available options", noChoice: "Not selected yet", none: "None", yes: "Yes", no: "No",
    rewritePossible: "Can change the main path", preview: "View alternative", rewrite: "Change main path",
    confirmTitle: "Change your story?",
    confirmText: "You are about to change an earlier decision. Later decisions and states that depend on the old path will be recalculated or reset. The new decision will become part of your main story.",
    cancel: "Cancel", confirm: "Change path", failed: "Could not change your story. Your save has not been changed.",
    fullHint: "Choose Full mode to view an alternative or change the main path.",
    currentChoice: "This is your main choice.", unseenChoice: "This node has no available decision.",
    emptyPath: "The main path has not reached this chapter yet.",
    kinds: { start: "START", event: "EVENT", choice: "CHOICE", ending: "ENDING" },
    statuses: { locked: "Undiscovered", unlocked: "Previously discovered", path: "Main path", alternative: "Alternative path", current: "Current event" }
  }
};

/** Visibility is independent of discovery; only registered decisions expose actions. */
export function flowActionContext(mode, node, decision) {
  const option = decision?.options?.find(item => item.id === decision.optionId);
  const available = !!node && !!option;
  return {
    canPreview: mode === "full" && available && !!decision?.choiceId && !!decision?.optionId,
    canRewrite: mode === "full" && available && !!decision?.choiceId && !!decision?.optionId && decision.optionId !== decision.currentOption
  };
}

/** Display routes received from the story service; discovery never selects canon. */
export function projectFlowMap(chapter, progress, canonicalSnapshot, alternativeSnapshot, { mode = "all" } = {}) {
  const graph = flowView(chapter, progress, canonicalSnapshot);
  const alternative = alternativeSnapshot ? flowView(chapter, progress, alternativeSnapshot) : null;
  const altNodes = new Set(alternative?.nodes.filter(node => node.inPath).map(node => node.id));
  const altEdges = new Set(alternative?.edges.filter(edge => edge.inPath).map(edge => edge.id));
  const nodes = graph.nodes.filter(node => mode !== "path" || node.inPath)
    .map(node => ({ ...node, inAlternative: altNodes.has(node.id) }));
  const kept = new Set(nodes.map(node => node.id));
  return { ...graph, nodes, edges: graph.edges.filter(edge => kept.has(edge.from) && kept.has(edge.to))
    .map(edge => ({ ...edge, inAlternative: altEdges.has(edge.id) })) };
}

export function createFlowchart({
  getProgress, getSnapshot, getCanonSnapshot = getSnapshot, getAlternativeSnapshot = () => null,
  getCanonState = () => null, getLanguage, getNodeDecision = () => null, onAlternative, onRewrite, onClose = () => {}
}) {
  const $ = id => document.getElementById(id);
  const overlay = $("flowchart"), viewport = $("flow-viewport"), canvas = $("flow-canvas");
  const transforms = new Map();
  let chapter = 0, mapMode = "full", graph, selected = null, zoom = 1, x = 0, y = 0, drag = null;
  let moved = false, returnFocus = null, openedAt = 0, confirmation = null, pending = false;
  const language = () => getLanguage() === "russian" ? "russian" : "english";
  const t = () => copy[language()];
  const text = value => typeof value === "string" ? value : value?.[language()] || value?.english || "";
  const dimensions = () => ({ width: viewport.clientWidth, height: viewport.clientHeight });
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const isTimeline = () => chapter === "true-story";
  const chapterLabel = id => t().chapters[id] || `${language() === "russian" ? "Глава" : "Chapter"} ${id}`;
  const transformKey = () => `${chapter}:${mapMode}`;
  const remember = () => transforms.set(transformKey(), { zoom, x, y });
  const nodeStatus = node => node.current ? "current" : node.inAlternative ? "alternative" : node.inPath ? "path" : node.discovered ? "unlocked" : "locked";

  function position() {
    if (!graph) return;
    const { width, height } = dimensions();
    const w = graph.width * zoom, h = graph.height * zoom;
    x = w < width - 120 ? (width - w) / 2 : clamp(x, width - w - 100, 100);
    y = h < height - 100 ? (height - h) / 2 : clamp(y, height - h - 80, 80);
    canvas.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
    $("flow-zoom").textContent = `${Math.round(zoom * 100)}%`;
  }
  function zoomAt(value, anchor = null) {
    const { width, height } = dimensions();
    const point = anchor || { x: width / 2, y: height / 2 };
    const next = clamp(value, .18, 1.6), factor = next / zoom;
    x = point.x - (point.x - x) * factor;
    y = point.y - (point.y - y) * factor;
    zoom = next;
    position();
    remember();
  }
  function fit() {
    const { width, height } = dimensions();
    zoom = clamp(Math.min((width - 160) / graph.width, (height - 120) / graph.height), .18, 1.1);
    x = (width - graph.width * zoom) / 2;
    y = (height - graph.height * zoom) / 2;
    position();
    remember();
  }
  function focusCurrent() {
    const node = graph.nodes.find(n => n.current) || graph.nodes.filter(n => n.inPath).at(-1) || graph.nodes[0];
    if (!node) { fit(); inspect(null); return; }
    const { width, height } = dimensions();
    zoom = Math.min(1, (height - 100) / Math.min(graph.height, 1300));
    x = width / 2 - (node.x + node.width / 2) * zoom;
    y = height / 2 - (node.y + node.height / 2) * zoom;
    position();
    remember();
    inspect(node.id);
  }
  function restorePosition() {
    const cached = transforms.get(transformKey());
    if (cached) { ({ zoom, x, y } = cached); position(); }
    else if (mapMode !== "all") focusCurrent();
    else fit();
  }
  function sceneDetail(node) {
    // Existing descriptions contain implementation counters and future callbacks.
    // The inspector reports only this scene, without exposing Chapter 2 benefits.
    return text(node.detail)
      .replace(/(?:В главе|Chapter)\s*\d+[^.!]*(?:[.!]|$)/gi, "")
      .replace(/(?:Небольшой бонус к уликам|A small evidence bonus)[^.!]*(?:[.!]|$)/gi, "")
      .replace(/[a-z][a-z0-9_]*(?:\s*=\s*(?:true|false)|\s*\+\d+)[,.]?/g, "")
      .replace(/,?\s*(?:предмет|item)\s+[a-z_]+\.?/g, "")
      .replace(/(?:^|[.!])\s*[.,]+/g, "").replace(/\s+/g, " ").trim();
  }
  function inspect(id) {
    selected = id;
    const node = graph.nodes.find(n => n.id === id);
    for (const button of $("flow-nodes").children) button.setAttribute("aria-pressed", String(button.dataset.node === id));
    $("flow-node-title").textContent = node ? text(node.label) : t().select;
    $("flow-node-detail").textContent = node ? sceneDetail(node) : graph.nodes.length ? isTimeline() ? t().timelineSubtitle : t().hint : t().emptyPath;
    $("flow-node-chapter").textContent = node ? text(node.chapterLabel) || chapterLabel(node.chapterId ?? chapter) : "";
    const decision = node && !isTimeline() ? getNodeDecision(chapter, node.id) : null;
    const current = decision?.options?.find(option => option.id === decision.currentOption);
    const opened = decision?.options;
    const actions = flowActionContext(mapMode, node, decision);
    const rewriteAvailable = actions.canRewrite && typeof onRewrite === "function";
    $("flow-choice-summary").hidden = !decision;
    $("flow-main-choice").textContent = decision ? `${t().mainChoice}: ${current ? text(current.label) || current.id : t().noChoice}` : "";
    $("flow-open-options").textContent = decision ? `${t().opened}: ${opened?.length ? opened.map(option => text(option.label) || option.id).join(" · ") : t().none}` : "";
    $("flow-rewrite-possible").textContent = decision ? `${t().rewritePossible}: ${rewriteAvailable ? t().yes : t().no}` : "";
    $("flow-alternative").hidden = !(actions.canPreview && typeof onAlternative === "function");
    $("flow-rewrite").hidden = !rewriteAvailable;
    $("flow-action-hint").textContent = !decision ? "" : mapMode !== "full" ? t().fullHint : !actions.canPreview ? t().unseenChoice : !actions.canRewrite ? t().currentChoice : "";
    $("flow-action-error").textContent = "";
  }
  function render() {
    if (isTimeline()) {
      const state = getCanonState();
      const timeline = buildCanonTimeline(state?.canon || state);
      graph = { ...timeline, nodes: timeline.nodes.map(node => ({ ...node, visible: true, inPath: true, inAlternative: false })),
        edges: timeline.edges.map(edge => ({ ...edge, inPath: true, inAlternative: false })),
        discoveredCount: timeline.nodes.length, totalCount: timeline.nodes.length, percent: 100 };
    } else graph = projectFlowMap(chapter, getProgress(), getCanonSnapshot(chapter), getAlternativeSnapshot(chapter), { mode: mapMode });
    const labels = t();
    overlay.dataset.mode = isTimeline() ? "timeline" : mapMode;
    $("flow-modes").hidden = isTimeline();
    for (const [id, value] of Object.entries({
      "flow-title": labels.title, "flow-kicker": labels.kicker, "flow-subtitle": isTimeline() ? labels.timelineSubtitle : labels.subtitles[chapter], "flow-close": labels.close,
      "flow-fit": labels.all, "flow-full": labels.full, "flow-current": labels.pathMode,
      "flow-legend-path": labels.path, "flow-legend-alternative": labels.alternative,
      "flow-legend-discovered": labels.discovered, "flow-legend-current": labels.now, "flow-legend-locked": labels.locked,
      "flow-help": labels.help, "flow-alternative": labels.preview, "flow-rewrite": labels.rewrite,
      "flow-confirm-title": labels.confirmTitle, "flow-confirm-text": labels.confirmText, "flow-confirm-cancel": labels.cancel,
      "flow-confirm-accept": labels.confirm, "flow-true-story": labels.trueStory,
      "flow-export-save": labels.exportSave, "flow-import-save": labels.importSave,
      "flow-import-confirm-title": labels.importTitle, "flow-import-confirm-text": labels.importText,
      "flow-import-confirm-cancel": labels.cancel, "flow-import-confirm-accept": labels.importAccept
    })) $(id).textContent = value;
    for (const [id, value] of [["flow-current", "path"], ["flow-full", "full"], ["flow-fit", "all"]]) $(id).setAttribute("aria-pressed", String(mapMode === value));
    for (let id = 0; id <= 1; id++) {
      $("flow-chapter" + id).textContent = labels.chapters[id];
      $("flow-chapter" + id).setAttribute("aria-pressed", String(chapter === id));
    }
    $("flow-true-story").setAttribute("aria-pressed", String(isTimeline()));
    $("flow-minus").setAttribute("aria-label", language() === "russian" ? "Уменьшить масштаб" : "Zoom out");
    $("flow-plus").setAttribute("aria-label", language() === "russian" ? "Увеличить масштаб" : "Zoom in");
    viewport.setAttribute("aria-label", labels.title);
    $("flow-progress").textContent = isTimeline() ? `${graph.nodes.length} ${language() === "russian" ? "событий основной истории" : "canonical events"}` : labels.progress(graph.discoveredCount, graph.totalCount, graph.percent);
    $("flow-progress-bar").style.width = `${graph.percent}%`;
    canvas.style.width = `${graph.width}px`;
    canvas.style.height = `${graph.height}px`;
    const svg = $("flow-edges");
    svg.setAttribute("width", graph.width); svg.setAttribute("height", graph.height); svg.setAttribute("viewBox", `0 0 ${graph.width} ${graph.height}`);
    svg.replaceChildren();
    const defs = document.createElementNS(svg.namespaceURI, "defs");
    for (const [status, color] of Object.entries({ locked: "#354e64", unlocked: "#71818c", path: "#81d9ff", alternative: "#e9bd64" })) {
      const marker = document.createElementNS(svg.namespaceURI, "marker"); marker.id = `flow-arrow-${status}`;
      for (const [name, value] of Object.entries({ viewBox: "0 0 16 16", refX: "15", refY: "8", markerWidth: "20", markerHeight: "20", markerUnits: "userSpaceOnUse", orient: "auto" })) marker.setAttribute(name, value);
      const tip = document.createElementNS(svg.namespaceURI, "path"); tip.setAttribute("d", "M 0 0 L 16 8 L 0 16 Z"); tip.style.fill = color; tip.style.stroke = "none";
      marker.append(tip); defs.append(marker);
    }
    svg.append(defs);
    const byId = new Map(graph.nodes.map(n => [n.id, n]));
    for (const edge of [...graph.edges].sort((a, b) => Number(a.inPath || a.inAlternative) - Number(b.inPath || b.inAlternative))) {
      const from = byId.get(edge.from), to = byId.get(edge.to);
      const sx = from.x + from.width, sy = from.y + from.height / 2, ex = to.x, ey = to.y + to.height / 2;
      const path = document.createElementNS(svg.namespaceURI, "path"), bend = Math.max(100, Math.abs(ex - sx) * .5);
      path.setAttribute("d", ex > sx ? `M ${sx} ${sy} C ${sx + bend} ${sy}, ${ex - bend} ${ey}, ${ex} ${ey}` : `M ${sx} ${sy} C ${sx + 180} ${sy - 280}, ${ex - 180} ${ey - 280}, ${ex} ${ey}`);
      path.dataset.status = edge.inAlternative ? "alternative" : edge.inPath ? "path" : edge.discovered ? "unlocked" : "locked";
      path.setAttribute("marker-end", `url(#flow-arrow-${path.dataset.status})`); path.dataset.edge = edge.id; svg.append(path);
    }
    $("flow-nodes").replaceChildren(...graph.nodes.map(node => {
      const button = document.createElement("button"); button.className = "flow-node";
      button.dataset.node = node.id; button.dataset.status = nodeStatus(node); button.dataset.current = String(node.current); button.dataset.kind = node.kind;
      button.dataset.playable = "false";
      Object.assign(button.style, { left: `${node.x}px`, top: `${node.y}px`, width: `${node.width}px`, height: `${node.height}px` });
      const kind = document.createElement("span"), label = document.createElement("span"); kind.className = "flow-node-kind"; label.className = "flow-node-label";
      kind.textContent = labels.kinds[node.kind] || labels.kinds.event; label.textContent = text(node.label);
      button.setAttribute("aria-label", `${label.textContent}. ${labels.statuses[nodeStatus(node)]}`); button.title = text(node.label);
      if (node.current) button.setAttribute("aria-current", "step");
      button.addEventListener("click", () => inspect(node.id));
      button.addEventListener("focus", () => {
        inspect(node.id);
        const { width, height } = dimensions();
        if (node.x * zoom + x < 0 || (node.x + node.width) * zoom + x > width || node.y * zoom + y < 0 || (node.y + node.height) * zoom + y > height) {
          x = width / 2 - (node.x + node.width / 2) * zoom; y = height / 2 - (node.y + node.height / 2) * zoom; position(); remember();
        }
      });
      button.append(kind, label); return button;
    }));
    inspect(selected);
  }
  function cancelConfirmation() {
    confirmation = null; $("flow-confirm").hidden = true; $("flow-rewrite").focus({ preventScroll: true });
  }
  function close() {
    if (overlay.hidden) return;
    remember(); confirmation = null; $("flow-confirm").hidden = true; overlay.hidden = true;
    onClose(performance.now() - openedAt);
    if (returnFocus?.isConnected && !returnFocus.closest("[hidden]")) returnFocus.focus({ preventScroll: true });
  }
  function open(selectedChapter = 0) {
    returnFocus = document.activeElement; openedAt = performance.now(); chapter = selectedChapter === "true-story" ? "true-story" : selectedChapter === 1 ? 1 : 0; selected = null;
    overlay.hidden = false; render(); restorePosition(); $("flow-close").focus({ preventScroll: true });
  }
  function changeMode(next) {
    if (pending || confirmation || isTimeline()) return;
    remember(); mapMode = next; render(); restorePosition();
  }
  function selectedAction() {
    const node = graph.nodes.find(item => item.id === selected), decision = node && !isTimeline() ? getNodeDecision(chapter, node.id) : null;
    return { node, decision, ...flowActionContext(mapMode, node, decision) };
  }
  async function runAction(callback, context) {
    pending = true;
    $("flow-confirm-accept").disabled = true; $("flow-alternative").disabled = true; $("flow-rewrite").disabled = true;
    try {
      const result = await callback(context);
      if (result === false) throw new Error(t().failed);
      confirmation = null; $("flow-confirm").hidden = true;
      render(); position();
    } catch (error) {
      $("flow-confirm-error").textContent = t().failed;
      $("flow-action-error").textContent = t().failed;
    } finally {
      pending = false; $("flow-confirm-accept").disabled = false; $("flow-alternative").disabled = false; $("flow-rewrite").disabled = false;
    }
  }
  $("flow-alternative").addEventListener("click", () => {
    const { decision, canPreview } = selectedAction();
    if (!pending && canPreview && typeof onAlternative === "function") runAction(onAlternative, { chapter, nodeId: selected, choiceId: decision.choiceId, optionId: decision.optionId });
  });
  $("flow-rewrite").addEventListener("click", () => {
    const { decision, canRewrite } = selectedAction();
    if (pending || !canRewrite || typeof onRewrite !== "function") return;
    confirmation = { chapter, nodeId: selected, choiceId: decision.choiceId, optionId: decision.optionId };
    $("flow-confirm-text").textContent = t().confirmText + (decision.requiresPrefix
      ? language() === "russian" ? " Для ещё не пройденных решений до этой сцены будут выбраны первые варианты." : " Earlier unanswered decisions before this scene will use their first options."
      : "");
    $("flow-confirm-error").textContent = ""; $("flow-confirm").hidden = false; $("flow-confirm-cancel").focus();
  });
  $("flow-confirm-cancel").addEventListener("click", () => { if (!pending) cancelConfirmation(); });
  $("flow-confirm-accept").addEventListener("click", () => { if (confirmation && !pending) runAction(onRewrite, { ...confirmation }); });
  $("flow-close").addEventListener("click", close);
  for (let id = 0; id <= 1; id++) $("flow-chapter" + id).addEventListener("click", () => {
    if (pending || confirmation) return;
    remember(); chapter = id; selected = null; render(); restorePosition();
  });
  $("flow-true-story").addEventListener("click", () => {
    if (pending || confirmation) return;
    remember(); chapter = "true-story"; selected = null; render(); restorePosition();
  });
  $("flow-fit").addEventListener("click", () => changeMode("all"));
  $("flow-full").addEventListener("click", () => changeMode("full"));
  $("flow-current").addEventListener("click", () => changeMode("path"));
  $("flow-plus").addEventListener("click", () => zoomAt(zoom * 1.25));
  $("flow-minus").addEventListener("click", () => zoomAt(zoom / 1.25));
  viewport.addEventListener("wheel", event => {
    event.preventDefault(); if (confirmation) return;
    const rect = viewport.getBoundingClientRect();
    zoomAt(zoom * Math.exp(-event.deltaY * .002), { x: (event.clientX - rect.left) * viewport.clientWidth / rect.width, y: (event.clientY - rect.top) * viewport.clientHeight / rect.height });
  }, { passive: false });
  viewport.addEventListener("pointerdown", event => {
    if (event.button !== 0 || confirmation) return;
    moved = false; drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x, y };
    if (!event.target.closest("button")) event.preventDefault();
  });
  viewport.addEventListener("pointermove", event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
    if (Math.hypot(dx, dy) < 4 && !moved) return;
    moved = true; viewport.setPointerCapture(event.pointerId); viewport.classList.add("is-dragging");
    const rect = viewport.getBoundingClientRect(); x = drag.x + dx * viewport.clientWidth / rect.width; y = drag.y + dy * viewport.clientHeight / rect.height; position(); remember();
  });
  function endDrag() { drag = null; viewport.classList.remove("is-dragging"); }
  viewport.addEventListener("pointerup", endDrag); viewport.addEventListener("pointercancel", endDrag);
  viewport.addEventListener("click", event => { if (moved) { event.preventDefault(); event.stopPropagation(); moved = false; } }, true);
  viewport.addEventListener("keydown", event => {
    if (confirmation || !$("flow-import-confirm").hidden) return;
    const movement = { ArrowLeft: [180, 0], ArrowRight: [-180, 0], ArrowUp: [0, 180], ArrowDown: [0, -180] }[event.key];
    if (movement) { event.preventDefault(); x += movement[0]; y += movement[1]; position(); remember(); }
    if (["+", "=", "-", "Home", "0"].includes(event.key)) {
      event.preventDefault(); if (event.key === "Home") fit(); else if (event.key === "0") focusCurrent(); else zoomAt(zoom * (event.key === "-" ? .8 : 1.25));
    }
  });
  overlay.addEventListener("keydown", event => {
    if (!$("flow-import-confirm").hidden) return;
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation();
      if (confirmation) { if (!pending) cancelConfirmation(); } else close();
    }
    if (event.key !== "Tab") return;
    const scope = confirmation ? $("flow-confirm") : overlay;
    const targets = [...scope.querySelectorAll("button,input,[tabindex='0']")].filter(el => !el.disabled && !el.closest("[hidden]"));
    const first = targets[0], last = targets.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  return { open, close, isOpen: () => !overlay.hidden, refresh: () => { if (!overlay.hidden) { render(); position(); } }, getMode: () => mapMode };
}
