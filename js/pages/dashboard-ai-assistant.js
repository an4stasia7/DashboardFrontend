(function () {
  var STORAGE_PREFIX = "dashboard.ai.assistant.rooms.v1";
  var els = {};
  var busy = false;
  var analysis = null;
  var rooms = [];
  var activeRoomId = "";
  var currentRefs = null;
  var pageScrollLock = null;

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function openPanel() {
    if (!els.overlay) return;
    lockPageScroll();
    els.overlay.hidden = false;
    setTimeout(function () {
      if (els.input) els.input.focus();
    }, 60);
  }

  function closePanel() {
    if (!els.overlay) return;
    els.overlay.hidden = true;
    unlockPageScroll();
  }

  function lockPageScroll() {
    if (pageScrollLock || !document.body) return;
    pageScrollLock = {
      y: window.scrollY || document.documentElement.scrollTop || 0,
      bodyOverflow: document.body.style.overflow,
      htmlOverflow: document.documentElement.style.overflow,
    };
    document.documentElement.classList.add("ai-assistant-page-locked");
    document.body.classList.add("ai-assistant-page-locked");
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  }

  function unlockPageScroll() {
    if (!pageScrollLock || !document.body) return;
    var y = pageScrollLock.y || 0;
    document.documentElement.classList.remove("ai-assistant-page-locked");
    document.body.classList.remove("ai-assistant-page-locked");
    document.documentElement.style.overflow = pageScrollLock.htmlOverflow || "";
    document.body.style.overflow = pageScrollLock.bodyOverflow || "";
    pageScrollLock = null;
    window.scrollTo(0, y);
  }

  function scrollToBottom() {
    if (els.stream) els.stream.scrollTop = els.stream.scrollHeight;
  }

  function hideEmpty() {
    if (els.empty) els.empty.hidden = true;
  }

  function setStatus(text, mode) {
    if (!els.statusPill) return;
    els.statusPill.textContent = text || "Готов";
    els.statusPill.classList.toggle("is-busy", mode === "busy");
    els.statusPill.classList.toggle("is-error", mode === "error");
  }

  function setBusy(nextBusy) {
    busy = !!nextBusy;
    if (els.input) els.input.disabled = busy;
    if (els.send) els.send.disabled = !busy && !String((els.input && els.input.value) || "").trim();
    if (els.send) {
      if (busy) {
        els.send.innerHTML = '<img class="ai-assistant-stop-icon" src="temp/iconsside/stop.png" alt="">';
      } else {
        els.send.textContent = "➜";
      }
      els.send.classList.toggle("is-stop", busy);
      els.send.setAttribute("aria-label", busy ? "Остановить генерацию" : "Отправить");
    }
    if (els.open) {
      els.open.classList.toggle("is-working", busy);
      els.open.setAttribute("aria-busy", busy ? "true" : "false");
      els.open.textContent = busy ? "AI думает" : "AI-ассистент";
    }
    setStatus(busy ? "Анализирует..." : "Готов", busy ? "busy" : "");
  }

  function currentDashboardContext() {
    var title = $("dash-role-title");
    var month = $("month-nav-label");
    var user = currentUserContext();
    return [
      user.nickname || user.role || user.department
        ? [
            "Текущий пользователь:",
            user.nickname ? "  - Логин: " + user.nickname : "",
            user.role ? "  - Роль: " + user.role : "",
            user.department ? "  - Подразделение: " + user.department : "",
            user.is_admin != null ? "  - Администратор: " + (user.is_admin ? "да" : "нет") : "",
          ].filter(Boolean).join("\n")
        : "",
      title && title.textContent ? "Текущий дашборд: " + title.textContent.trim() : "",
      month && month.textContent ? "Период: " + month.textContent.trim() : "",
    ].filter(Boolean).join("\n");
  }

  function currentUserContext() {
    var A = window.Auth;
    var session = A && typeof A.getSession === "function" ? A.getSession() : null;
    var user = session && session.user ? session.user : {};
    return {
      id: user && user.id != null ? user.id : null,
      nickname: user && user.nickname != null ? String(user.nickname).trim() : "",
      role: user && user.role != null ? String(user.role).trim() : "",
      department: user && user.department != null ? String(user.department).trim() : "",
      is_admin: !!(user && user.is_admin),
    };
  }

  function isSimpleGreeting(text) {
    var clean = String(text || "")
      .toLowerCase()
      .replace(/[!?,.。]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return /^(привет|здравствуй|здравствуйте|добрый день|доброе утро|добрый вечер|хай|hello|hi)$/.test(clean);
  }

  function currentUserKey() {
    var user = currentUserContext();
    return String((user && (user.nickname || user.id || user.department)) || "anonymous").trim() || "anonymous";
  }

  function storageKey() {
    return STORAGE_PREFIX + "." + currentUserKey();
  }

  function createRoom(title) {
    return {
      id: "room-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      title: title || "Новый чат",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      activeJobId: "",
      jobSeq: -1,
      analysisState: null,
    };
  }

  function activeRoom() {
    return rooms.filter(function (room) { return room.id === activeRoomId; })[0] || rooms[0] || null;
  }

  function findRoom(roomId) {
    return rooms.filter(function (room) { return room.id === roomId; })[0] || null;
  }

  function saveRooms() {
    try {
      localStorage.setItem(storageKey(), JSON.stringify({ activeRoomId: activeRoomId, rooms: rooms }));
    } catch (e) {
      /* ignore */
    }
  }

  function loadRooms() {
    try {
      var parsed = JSON.parse(localStorage.getItem(storageKey()) || "{}");
      rooms = Array.isArray(parsed.rooms) ? parsed.rooms : [];
      activeRoomId = parsed.activeRoomId || "";
    } catch (e) {
      rooms = [];
      activeRoomId = "";
    }
    if (!rooms.length) {
      var room = createRoom("Новый чат");
      rooms = [room];
      activeRoomId = room.id;
      saveRooms();
    }
    if (!activeRoom()) activeRoomId = rooms[0].id;
  }

  function roomTitleFromMessage(text) {
    var clean = String(text || "").replace(/\s+/g, " ").trim();
    return middleEllipsis(clean || "Новый чат", 34);
  }

  function renderRoomTabs() {
    if (!els.roomTabs) return;
    els.roomTabs.innerHTML = rooms
      .map(function (room) {
        return (
          '<button type="button" class="ai-room-tab' +
          (room.id === activeRoomId ? " is-active" : "") +
          (room.activeJobId ? " is-working" : "") +
          '" data-ai-room-id="' +
          escapeHtml(room.id) +
          '" role="tab" title="' +
          escapeHtml(room.title || "Новый чат") +
          '">' +
          '<span class="ai-room-tab-title">' +
          escapeHtml(room.title || "Новый чат") +
          "</span>" +
          (rooms.length > 1
            ? '<span class="ai-room-tab-delete" data-ai-delete-room="' + escapeHtml(room.id) + '" aria-label="Удалить комнату">×</span>'
            : "") +
          "</button>"
        );
      })
      .join("");
  }

  function clearProgress() {
    analysis = null;
    if (els.timeline) els.timeline.innerHTML = "";
    if (els.events) els.events.innerHTML = "";
    if (els.foundDockList) els.foundDockList.innerHTML = "";
    if (els.foundSummary) els.foundSummary.textContent = "0 Files";
    if (els.foundDock) els.foundDock.hidden = true;
    updateProgressSummary("Ход анализа · готов к вопросу");
  }

  function clearPersistedAnalysis(roomId) {
    var room = roomId ? findRoom(roomId) : activeRoom();
    if (!room) return;
    room.analysisState = null;
    saveRooms();
  }

  function cloneAnalysisState() {
    if (!analysis) return null;
    return {
      steps: (analysis.steps || []).slice(-30),
      files: (analysis.files || []).slice(-80),
      readFiles: (analysis.readFiles || []).slice(-80),
      analyzedItems: (analysis.analyzedItems || []).slice(-120),
      tools: (analysis.tools || []).slice(-80),
      technical: (analysis.technical || []).slice(-120),
      currentTool: analysis.currentTool || "",
      completed: !!analysis.completed,
    };
  }

  function persistAnalysisState(roomId) {
    var room = roomId ? findRoom(roomId) : activeRoom();
    if (!room || !analysis) return;
    room.analysisState = cloneAnalysisState();
    room.updatedAt = new Date().toISOString();
    saveRooms();
  }

  function restoreAnalysisState(room) {
    if (!room || !room.analysisState) {
      clearProgress();
      return;
    }
    analysis = Object.assign({
      steps: [],
      files: [],
      readFiles: [],
      analyzedItems: [],
      tools: [],
      technical: [],
      currentTool: "",
      completed: false,
    }, room.analysisState || {});
    if (els.timeline) els.timeline.innerHTML = "";
    if (els.events) els.events.innerHTML = "";
    (analysis.technical || []).slice(-60).forEach(function (item) {
      if (!els.events) return;
      var node = document.createElement("p");
      node.className = "ai-assistant-event";
      node.innerHTML = "<strong>" + escapeHtml(item.label || "Событие") + ":</strong> " + escapeHtml(item.text || "");
      els.events.appendChild(node);
    });
    renderTimeline();
    renderFoundDock();
  }

  function renderActiveRoom() {
    if (!els.stream) return;
    var room = activeRoom();
    els.stream.innerHTML = "";
    if (!room || !room.messages || !room.messages.length) {
      if (els.empty) {
        els.empty.hidden = false;
        els.stream.appendChild(els.empty);
      }
      clearProgress();
      clearPersistedAnalysis(room && room.id);
      return;
    }
    if (els.empty) els.empty.hidden = true;
    room.messages.forEach(function (message) {
      if (message.role === "user") {
        appendUserMessage(message.content, false);
      } else if (message.role === "work") {
        renderPersistedWorkBoard(message.content, false);
      } else if (message.role === "assistant") {
        renderAssistantAnswer(message.content, false);
      } else if (message.role === "error") {
        renderError(message.content, false);
      }
    });
    restoreAnalysisState(room);
    scrollToBottom();
  }

  function addRoomMessage(role, content, roomId) {
    var room = roomId ? findRoom(roomId) : activeRoom();
    if (!room) return;
    room.messages = Array.isArray(room.messages) ? room.messages : [];
    room.messages.push({
      role: role,
      content: content || "",
      createdAt: new Date().toISOString(),
    });
    if (role === "user" && room.messages.filter(function (m) { return m.role === "user"; }).length === 1) {
      room.title = roomTitleFromMessage(content);
    }
    room.updatedAt = new Date().toISOString();
    saveRooms();
    renderRoomTabs();
  }

  function createWorkState(question) {
    return {
      id: "work-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      question: question || "Новый запрос",
      planInitialized: false,
      planSteps: [],
      tools: [],
      currentTool: "Ожидаю первый инструмент…",
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function latestWorkMessage(room) {
    var messages = room && Array.isArray(room.messages) ? room.messages : [];
    for (var i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "work" && messages[i].content) return messages[i];
    }
    return null;
  }

  function findWorkMessage(room, workId) {
    var messages = room && Array.isArray(room.messages) ? room.messages : [];
    return messages.filter(function (message) {
      return message.role === "work" && message.content && message.content.id === workId;
    })[0] || null;
  }

  function addWorkMessage(state, roomId) {
    var room = roomId ? findRoom(roomId) : activeRoom();
    if (!room || !state) return;
    room.messages = Array.isArray(room.messages) ? room.messages : [];
    room.messages.push({ role: "work", content: state, createdAt: new Date().toISOString() });
    room.updatedAt = new Date().toISOString();
    saveRooms();
  }

  function persistWorkStateFromBoard(board, roomId) {
    var room = roomId ? findRoom(roomId) : activeRoom();
    if (!room || !board || !board.__workId) return;
    var message = findWorkMessage(room, board.__workId);
    if (!message) return;
    var current = board.querySelector("[data-ai-agent-current-tool]");
    message.content = {
      id: board.__workId,
      question: board.__question || "",
      planInitialized: !!board.__planInitialized,
      planSteps: (board.__planSteps || []).map(function (step) { return Object.assign({}, step); }),
      tools: (board.__tools || []).slice(),
      currentTool: current ? current.textContent : board.__currentTool || "",
      completed: !!board.__completed,
      createdAt: message.content.createdAt || message.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    room.updatedAt = new Date().toISOString();
    saveRooms();
  }

  function addNewRoom() {
    var room = createRoom("Новый чат");
    rooms.unshift(room);
    activeRoomId = room.id;
    saveRooms();
    renderRoomTabs();
    renderActiveRoom();
    if (els.input) els.input.focus();
  }

  function switchRoom(roomId) {
    if (!rooms.some(function (room) { return room.id === roomId; })) return;
    activeRoomId = roomId;
    saveRooms();
    renderRoomTabs();
    renderActiveRoom();
    resumeActiveJob();
  }

  function deleteRoom(roomId) {
    if (rooms.length <= 1) return;
    rooms = rooms.filter(function (room) { return room.id !== roomId; });
    if (activeRoomId === roomId) activeRoomId = rooms[0].id;
    saveRooms();
    renderRoomTabs();
    renderActiveRoom();
  }

  function resetAnalysis() {
    analysis = {
      steps: [],
      files: [],
      readFiles: [],
      analyzedItems: [],
      tools: [],
      technical: [],
      currentTool: "",
      completed: false,
    };
    if (els.timeline) els.timeline.innerHTML = "";
    if (els.events) els.events.innerHTML = "";
    if (els.foundDockList) els.foundDockList.innerHTML = "";
    if (els.foundSummary) els.foundSummary.textContent = "0 Files";
    if (els.foundDock) els.foundDock.hidden = true;
    updateProgressSummary("Анализирует... · 0 шагов · 0 проанализировано · 0 прочитано");
    persistAnalysisState();
  }

  function markRoomJob(jobId, roomId) {
    var room = roomId ? findRoom(roomId) : activeRoom();
    if (!room || !jobId) return;
    room.activeJobId = String(jobId);
    if (room.jobSeq == null) room.jobSeq = -1;
    room.updatedAt = new Date().toISOString();
    saveRooms();
  }

  function updateRoomSeq(seq, roomId) {
    var room = roomId ? findRoom(roomId) : activeRoom();
    if (!room || seq == null) return;
    var nextSeq = parseInt(String(seq), 10);
    if (isNaN(nextSeq)) return;
    room.jobSeq = Math.max(Number(room.jobSeq || -1), nextSeq);
    room.updatedAt = new Date().toISOString();
    saveRooms();
  }

  function clearRoomJob(roomId) {
    var room = roomId ? findRoom(roomId) : activeRoom();
    if (!room) return;
    room.activeJobId = "";
    room.jobSeq = -1;
    room.updatedAt = new Date().toISOString();
    saveRooms();
  }

  function updateProgressSummary(text) {
    if (els.progressSummary) els.progressSummary.textContent = text;
  }

  function middleEllipsis(value, maxLen) {
    var text = String(value == null ? "" : value);
    var limit = maxLen || 64;
    if (text.length <= limit) return text;
    var head = Math.ceil((limit - 1) * 0.58);
    var tail = Math.floor((limit - 1) * 0.42);
    return text.slice(0, head) + "…" + text.slice(text.length - tail);
  }

  function addTimelineStep(text, status) {
    if (!analysis || !text) return;
    var existing = analysis.steps.filter(function (item) {
      return item.text === text;
    })[0];
    if (existing) {
      existing.status = status || existing.status;
    } else {
      analysis.steps.push({ text: text, status: status || "done" });
    }
    renderTimeline();
    persistAnalysisState();
  }

  function addTechnical(label, text) {
    if (!analysis) resetAnalysis();
    analysis.technical.push({ label: label, text: text });
    persistAnalysisState();
    if (!els.events) return;
    var node = document.createElement("p");
    node.className = "ai-assistant-event";
    node.innerHTML = "<strong>" + escapeHtml(label) + ":</strong> " + escapeHtml(text);
    els.events.appendChild(node);
    els.events.scrollTop = els.events.scrollHeight;
  }

  function rememberFile(path) {
    if (!analysis || !path) return;
    var clean = String(path).replace(/\s+\(сохранён в \.agentTurbo\)$/i, "");
    if (analysis.files.indexOf(clean) === -1) analysis.files.push(clean);
    persistAnalysisState();
  }

  function rememberProgressFile(path) {
    if (!analysis || !path) return;
    var clean = String(path).replace(/\s+\(сохранён в \.agentTurbo\)$/i, "");
    if (!clean) return;
    var readTools = ["read_document", "read_multiple_files", "read_file_with_metadata"];
    var analysisTools = ["analyze_code_structure", "get_dependencies", "get_code_metrics", "validate_syntax", "find_references"];
    if (readTools.indexOf(analysis.currentTool) !== -1 && analysis.readFiles.indexOf(clean) === -1) {
      analysis.readFiles.push(clean);
    }
    if (analysisTools.indexOf(analysis.currentTool) !== -1 && analysis.analyzedItems.indexOf(clean) === -1) {
      analysis.analyzedItems.push(clean);
    }
    persistAnalysisState();
  }

  function renderTimeline() {
    if (!els.timeline || !analysis) return;
    els.timeline.innerHTML = analysis.steps
      .slice(-8)
      .map(function (step) {
        return (
          '<div class="ai-timeline-item ' +
          (step.status === "active" ? "is-active" : "is-done") +
          '">' +
          escapeHtml(step.text) +
          "</div>"
        );
      })
      .join("");
    updateProgressSummary(
      (analysis.completed ? "Анализ завершён" : "Анализирует") +
        " · " +
        analysis.steps.length +
        " шагов · " +
        analysis.analyzedItems.length +
        " проанализировано · " +
        analysis.readFiles.length +
        " прочитано"
    );
  }

  function appendUserMessage(text, shouldScroll) {
    hideEmpty();
    var row = document.createElement("div");
    row.className = "ai-chat-row ai-chat-row--user";
    row.innerHTML = '<div class="ai-user-bubble">' + escapeHtml(text) + "</div>";
    els.stream.appendChild(row);
    if (shouldScroll !== false) scrollToBottom();
  }

  function appendAssistantSpacerIfNeeded() {
    if (!els.stream) return;
    var last = els.stream.lastElementChild;
    while (last && last.hidden) last = last.previousElementSibling;
    if (!last || !last.classList || !last.classList.contains("ai-chat-row--user")) return;
    var spacer = document.createElement("div");
    spacer.className = "ai-message-spacer";
    spacer.setAttribute("aria-hidden", "true");
    els.stream.appendChild(spacer);
  }

  function renderWorkBoard(state, shouldScroll) {
    hideEmpty();
    appendAssistantSpacerIfNeeded();
    state = state || createWorkState("Новый запрос");
    var question = state.question || "Новый запрос";
    var node = document.createElement("section");
    node.className = "ai-agent-board";
    node.setAttribute("data-ai-work-id", state.id || "");
    node.innerHTML =
      '<div class="ai-agent-section ai-agent-task">' +
      '<div class="ai-agent-section-num">1.</div>' +
      '<div class="ai-agent-section-main">' +
      '<div class="ai-agent-section-title">Текущая задача</div>' +
      '<div class="ai-agent-task-card">' + escapeHtml(question) + "</div>" +
      '<div class="ai-agent-scope"><span>Frontend</span><span>Backend</span><span>API</span><span>KPI</span></div>' +
      "</div></div>" +
      '<div class="ai-agent-section ai-agent-plan-section" hidden>' +
      '<div class="ai-agent-section-num">2.</div>' +
      '<div class="ai-agent-section-main">' +
      '<div class="ai-agent-section-title">План выполнения</div>' +
      '<div class="ai-agent-plan" data-ai-agent-plan></div>' +
      "</div></div>" +
      '<div class="ai-agent-section">' +
      '<div class="ai-agent-section-num">3.</div>' +
      '<div class="ai-agent-section-main">' +
      '<div class="ai-agent-section-title">Используемые инструменты</div>' +
      '<div class="ai-agent-tools" data-ai-agent-tools></div>' +
      '<div class="ai-agent-current-tool" data-ai-agent-current-tool>Ожидаю первый инструмент…</div>' +
      "</div></div>";
    node.__workId = state.id || "";
    node.__question = question;
    node.__planInitialized = !!state.planInitialized;
    node.__planSteps = Array.isArray(state.planSteps) ? state.planSteps.map(function (step) { return Object.assign({}, step); }) : [];
    node.__tools = Array.isArray(state.tools) ? state.tools.slice() : [];
    node.__files = [];
    node.__completed = !!state.completed;
    els.stream.appendChild(node);
    renderAgentPlan(node);
    renderAgentTools(node);
    var current = node.querySelector("[data-ai-agent-current-tool]");
    if (current && state.currentTool) current.textContent = state.currentTool;
    if (shouldScroll !== false) scrollToBottom();
    return node;
  }

  function renderPersistedWorkBoard(state, shouldScroll) {
    if (!state) return null;
    return renderWorkBoard(state, shouldScroll);
  }

  function appendLoadingCard() {
    var room = activeRoom();
    var lastUser = room && room.messages ? room.messages.filter(function (m) { return m.role === "user"; }).slice(-1)[0] : null;
    var question = lastUser && lastUser.content ? lastUser.content : "Новый запрос";
    var state = createWorkState(question);
    addWorkMessage(state);
    return renderWorkBoard(state);
  }

  function activeBoard(refs) {
    refs = refs || currentRefs || {};
    var node = refs.loading;
    if (node && node.classList && node.classList.contains("ai-agent-board") && node.parentNode) return node;
    return null;
  }

  function boardNodeByWorkId(workId) {
    if (!els.stream || !workId) return null;
    return els.stream.querySelector('[data-ai-work-id="' + String(workId).replace(/"/g, '\\"') + '"]');
  }

  function parsePlanItems(content) {
    return String(content || "")
      .split(/\r?\n/)
      .map(function (line) {
        var match = line.match(/^\s*(?:\[([x>! ])\])?\s*\d+[.)]\s*(.+?)\s*$/i);
        if (!match) return null;
        var mark = match[1] || "";
        return {
          status: mark.toLowerCase() === "x" ? "done" : mark === ">" ? "active" : "pending",
          text: match[2].trim(),
          startedAt: Date.now(),
        };
      })
      .filter(Boolean);
  }

  function renderAgentPlan(board) {
    if (!board) return;
    var section = board.querySelector(".ai-agent-plan-section");
    var wrap = board.querySelector("[data-ai-agent-plan]");
    if (!wrap) return;
    var steps = board.__planSteps || [];
    if (section) section.hidden = !steps.length;
    if (!steps.length) return;
    wrap.innerHTML = steps.map(function (step) {
      var elapsed = step.doneAt && step.startedAt ? Math.max(1, Math.round((step.doneAt - step.startedAt) / 1000)) : null;
      return (
        '<div class="ai-agent-plan-step is-' + escapeHtml(step.status || "pending") + '">' +
        '<span class="ai-agent-plan-marker"></span>' +
        '<span class="ai-agent-plan-text">' + escapeHtml(step.text || "") + "</span>" +
        '<span class="ai-agent-plan-state">' +
        (step.status === "done" ? "Готово" : step.status === "active" ? "Выполняется" : "Ожидает") +
        "</span>" +
        '<span class="ai-agent-plan-time">' + (elapsed ? elapsed + " сек" : "") + "</span>" +
        "</div>"
      );
    }).join("");
  }

  function renderAgentTools(board) {
    if (!board) return;
    var wrap = board.querySelector("[data-ai-agent-tools]");
    if (!wrap) return;
    wrap.innerHTML = (board.__tools || []).slice(-8).map(function (tool) {
      return '<span class="ai-agent-tool-chip">' + escapeHtml(tool) + "</span>";
    }).join("");
  }

  function updateAgentPlan(content, refs) {
    var board = activeBoard(refs);
    if (!board) return;
    var parsed = parsePlanItems(content);
    if (!parsed.length) return;
    if (!board.__planInitialized) {
      board.__planSteps = parsed;
      board.__planInitialized = true;
    } else {
      board.__planSteps.forEach(function (step, idx) {
        var next = parsed[idx];
        if (!next) return;
        if (step.status !== "done" && next.status === "done") step.doneAt = Date.now();
        step.status = next.status || step.status;
      });
    }
    renderAgentPlan(board);
    persistWorkStateFromBoard(board, refs && refs.roomId);
  }

  function progressAgentPlan(refs) {
    var board = activeBoard(refs);
    if (!board || !board.__planSteps || !board.__planSteps.length) return;
    var steps = board.__planSteps;
    var activeIdx = steps.findIndex(function (step) { return step.status === "active"; });
    if (activeIdx === -1) activeIdx = steps.findIndex(function (step) { return step.status !== "done"; });
    if (activeIdx < 0) return;
    steps[activeIdx].status = "done";
    steps[activeIdx].doneAt = Date.now();
    if (steps[activeIdx + 1] && steps[activeIdx + 1].status !== "done") {
      steps[activeIdx + 1].status = "active";
      steps[activeIdx + 1].startedAt = Date.now();
    }
    renderAgentPlan(board);
    board.__completed = true;
    persistWorkStateFromBoard(board, refs && refs.roomId);
  }

  function fileIconSrc(path) {
    var ext = String(path || "").split(".").pop().toLowerCase();
    var name = "";
    if (ext === "js" || ext === "ts" || ext === "tsx") name = "JS.jpg";
    else if (ext === "py") name = "Python.jpg";
    else if (ext === "html") name = "HTML.jpg";
    else if (ext === "css") name = "css.jpg";
    else if (ext === "xls" || ext === "xlsx") name = "excel.jpg";
    return name ? "temp/files/" + name : "";
  }

  function addAgentTool(name, refs) {
    var board = activeBoard(refs);
    if (!board || !name) return;
    board.__tools = board.__tools || [];
    if (board.__tools.indexOf(name) === -1) board.__tools.push(name);
    var wrap = board.querySelector("[data-ai-agent-tools]");
    var current = board.querySelector("[data-ai-agent-current-tool]");
    renderAgentTools(board);
    if (current) current.textContent = "Сейчас выполняется: " + name;
    board.__currentTool = "Сейчас выполняется: " + name;
    persistWorkStateFromBoard(board, refs && refs.roomId);
  }

  function addAgentProgress(text, refs) {
    var board = activeBoard(refs);
    if (!board || !text) return false;
    var current = board.querySelector("[data-ai-agent-current-tool]");
    if (current) current.textContent = String(text);
    board.__currentTool = String(text);
    persistWorkStateFromBoard(board, refs && refs.roomId);
    return true;
  }

  function renderFoundDock() {
    if (!els.foundDockList || !analysis) return;
    if (els.foundDock) els.foundDock.hidden = !analysis.files.length;
    if (els.foundSummary) els.foundSummary.textContent = analysis.files.length + " Files";
    els.foundDockList.innerHTML = analysis.files.slice(0, 12).map(function (file) {
      var icon = fileIconSrc(file);
      return (
        '<div class="ai-agent-found-file" title="' + escapeHtml(file) + '" data-ai-open-file="' + escapeHtml(file) + '">' +
        '<span class="ai-agent-found-icon">' +
        (icon ? '<img src="' + escapeHtml(icon) + '" alt="">' : escapeHtml(fileKind(file))) +
        "</span>" +
        '<span class="ai-agent-found-main">' +
        '<span class="ai-agent-found-path">' + escapeHtml(middleEllipsis(file, 64)) + "</span>" +
        '<span class="ai-agent-found-desc">' + escapeHtml(fileDescription(file)) + "</span>" +
        "</span>" +
        "</div>"
      );
    }).join("");
  }

  function addAgentFoundFile(path, refs) {
    if (!path) return;
    var clean = String(path).replace(/\s+\(сохранён в \.agentTurbo\)$/i, "");
    if (!analysis) resetAnalysis();
    if (analysis.files.indexOf(clean) === -1) analysis.files.push(clean);
    renderFoundDock();
  }

  function appendWorkCard(refs) {
    hideEmpty();
    appendAssistantSpacerIfNeeded();
    var node = document.createElement("section");
    node.className = "ai-work-card";
    node.innerHTML =
      '<div class="ai-work-card__head">' +
      '<span class="ai-work-dot"></span>' +
      '<span>Ход работы агента</span>' +
      "</div>" +
      '<div class="ai-work-card__items"></div>';
    els.stream.appendChild(node);
    if (refs) refs.work = node;
    scrollToBottom();
    return node;
  }

  function appendWorkItem(text, refs) {
    if (!text) return;
    refs = refs || currentRefs || {};
    var node = refs.work;
    if (!node || !node.parentNode) node = appendWorkCard(refs);
    var list = node.querySelector(".ai-work-card__items");
    if (!list) return;
    var item = document.createElement("div");
    item.className = "ai-work-item";
    item.textContent = text;
    list.appendChild(item);
    while (list.children.length > 8) {
      list.removeChild(list.firstElementChild);
    }
    scrollToBottom();
  }

  function stripMarkdown(text) {
    return String(text || "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/[#>*_`|]/g, "")
      .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function isMarkdownTableSeparator(line) {
    return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(String(line || ""));
  }

  function splitMarkdownTableRow(line) {
    var text = String(line || "").trim();
    if (text.charAt(0) === "|") text = text.slice(1);
    if (text.charAt(text.length - 1) === "|") text = text.slice(0, -1);
    return text.split("|").map(function (cell) {
      return cell.trim();
    });
  }

  function isMarkdownTableStart(lines, index) {
    if (index + 1 >= lines.length) return false;
    var row = String(lines[index] || "");
    return row.indexOf("|") !== -1 && isMarkdownTableSeparator(lines[index + 1]);
  }

  function extractMarkdownTables(text) {
    var lines = String(text || "").split(/\r?\n/);
    var tables = [];
    var rest = [];
    var i = 0;
    while (i < lines.length) {
      if (!isMarkdownTableStart(lines, i)) {
        rest.push(lines[i]);
        i += 1;
        continue;
      }
      var header = splitMarkdownTableRow(lines[i]);
      i += 2;
      var rows = [];
      while (i < lines.length && String(lines[i]).indexOf("|") !== -1 && String(lines[i]).trim()) {
        if (!isMarkdownTableSeparator(lines[i])) {
          var row = splitMarkdownTableRow(lines[i]);
          if (row.length) rows.push(row);
        }
        i += 1;
      }
      tables.push({ header: header, rows: rows });
      rest.push("");
    }
    return { tables: tables, textWithoutTables: rest.join("\n").replace(/\n{3,}/g, "\n\n").trim() };
  }

  function inlineMarkdownToHtml(value) {
    return escapeHtml(value)
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  }

  function renderMarkdownTables(tables) {
    if (!tables || !tables.length) return "";
    return tables
      .map(function (table) {
        var cols = table.header || [];
        return (
          '<div class="ai-table-wrap">' +
          '<table class="ai-md-table">' +
          "<thead><tr>" +
          cols.map(function (cell) { return "<th>" + inlineMarkdownToHtml(cell) + "</th>"; }).join("") +
          "</tr></thead>" +
          "<tbody>" +
          (table.rows || [])
            .map(function (row) {
              var cells = cols.map(function (_cell, idx) {
                return row[idx] != null ? row[idx] : "";
              });
              return "<tr>" + cells.map(function (cell) { return "<td>" + inlineMarkdownToHtml(cell) + "</td>"; }).join("") + "</tr>";
            })
            .join("") +
          "</tbody>" +
          "</table>" +
          "</div>"
        );
      })
      .join("");
  }

  function splitSentences(text, count) {
    var tableInfo = extractMarkdownTables(text);
    var clean = stripMarkdown(tableInfo.textWithoutTables || text);
    var sentences = clean.match(/[^.!?。]+[.!?。]?/g) || [clean];
    return sentences.slice(0, count || 4).join(" ").trim();
  }

  function extractFiles(text) {
    var found = [];
    var re = /(?:DashboardBack|DashboardFrontend|mobile)[A-Za-zА-Яа-я0-9_./\\-]+\.(?:py|js|css|html|json|kt|md|ts|tsx)/g;
    var match;
    while ((match = re.exec(String(text || "")))) {
      var path = match[0].replace(/\\/g, "/").replace(/[.,;:)]+$/g, "");
      if (found.indexOf(path) === -1) found.push(path);
    }
    if (analysis) {
      analysis.files.forEach(function (path) {
        if (found.indexOf(path) === -1) found.push(path);
      });
    }
    return found.slice(0, 8);
  }

  function fileKind(path) {
    var ext = String(path).split(".").pop() || "";
    return ext.slice(0, 3);
  }

  function fileDescription(path) {
    if (/calc_prod_deputy/i.test(path)) return "Основная логика расчёта производственных KPI";
    if (/views\.py$/i.test(path)) return "Формирование API-ответа и плиток дашборда";
    if (/import_.*kpi/i.test(path)) return "Метаданные и импорт определений KPI";
    if (/dashboard.*\.js$/i.test(path)) return "Фронтенд-логика отображения дашборда";
    if (/\.json$/i.test(path)) return "Конфигурация или кэш данных";
    return "Связанный файл проекта";
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    }
  }

  function renderFileRows(files) {
    if (!files.length) {
      return '<p>Точные файлы не выделены в ответе. Откройте технические детали, чтобы посмотреть MCP-поиск.</p>';
    }
    return (
      '<ul class="ai-file-list">' +
      files
        .map(function (path) {
          var icon = fileIconSrc(path);
          return (
            '<li class="ai-file-item">' +
            '<span class="ai-file-icon">' +
            (icon ? '<img src="' + escapeHtml(icon) + '" alt="">' : escapeHtml(fileKind(path))) +
            "</span>" +
            '<span class="ai-file-main">' +
            '<span class="ai-file-path" title="' + escapeHtml(path) + '">' + escapeHtml(middleEllipsis(path, 68)) + "</span>" +
            '<span class="ai-file-desc">' + escapeHtml(fileDescription(path)) + "</span>" +
            "</span>" +
            '<span class="ai-file-actions">' +
            '<button type="button" class="ai-file-action" data-ai-open-file="' + escapeHtml(path) + '">Открыть</button>' +
            '<button type="button" class="ai-file-action" data-ai-copy="' + escapeHtml(path) + '">⧉</button>' +
            "</span>" +
            "</li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function extractSteps(text) {
    var lines = stripMarkdown(text)
      .split(/\n+/)
      .map(function (line) { return line.replace(/^\s*\d+[.)-]\s*/, "").replace(/^\s*[-•]\s*/, "").trim(); })
      .filter(Boolean);
    var good = lines.filter(function (line) {
      return /(бер|счит|рассчит|агрег|план|факт|переда|сравн|источник|период)/i.test(line);
    });
    if (good.length) return good.slice(0, 6);
    return [
      "Берётся плановое значение из источника данных.",
      "Берётся фактическое значение за выбранный период.",
      "Данные агрегируются по нужному периоду: неделя, месяц или итого.",
      "Считается отклонение факта от плана и статус плитки.",
      "Результат передаётся в API и отображается на карточке KPI.",
    ];
  }

  function detectBadges(text) {
    var src = String(text || "").toLowerCase();
    var badges = [];
    [
      ["1C", /1с|1c|document_/],
      ["Django", /django|views\.py|endpoint|api/],
      ["Python", /\.py|python|calc_/],
      ["API", /api|endpoint|json/],
      ["KPI", /kpi|плитк|показател/],
      ["Плитка", /плитк|карточк/],
      ["Frontend", /frontend|dashboard.*js|html/],
    ].forEach(function (item) {
      if (item[1].test(src)) badges.push(item[0]);
    });
    return badges.length ? badges : ["KPI", "Python", "API"];
  }

  function renderCard(title, bodyHtml) {
    return (
      '<section class="ai-card">' +
      '<div class="ai-card__head"><h3 class="ai-card__title">' + escapeHtml(title) + "</h3></div>" +
      '<div class="ai-card__body">' + bodyHtml + "</div>" +
      "</section>"
    );
  }

  function renderRichAnswerHtml(text, tablesHtml) {
    var source = extractMarkdownTables(text).textWithoutTables || String(text || "");
    var lines = source.split(/\r?\n/).map(function (line) { return line.trim(); });
    var html = [];
    var list = [];
    var listKind = "ol";

    function flushList() {
      if (!list.length) return;
      html.push('<' + listKind + ' class="ai-answer-list ai-answer-list--' + listKind + '">' + list.map(function (item) {
        return "<li>" + inlineMarkdownToHtml(item) + "</li>";
      }).join("") + "</" + listKind + ">");
      list = [];
      listKind = "ol";
    }

    lines.forEach(function (line) {
      if (!line) {
        flushList();
        return;
      }
      var listMatch = line.match(/^([-•*]|\d+[.)]|[a-zа-я][.)])\s+(.+)$/i);
      if (listMatch) {
        var nextKind = /^[-•*]$/.test(listMatch[1]) ? "ul" : "ol";
        if (list.length && listKind !== nextKind) flushList();
        listKind = nextKind;
        list.push(listMatch[2]);
        return;
      }
      flushList();
      html.push("<p>" + inlineMarkdownToHtml(line.replace(/^#{1,6}\s+/, "")) + "</p>");
    });
    flushList();
    if (tablesHtml) html.push(tablesHtml);
    return html.join("") || "<p>" + escapeHtml(text || "") + "</p>";
  }

  function renderAssistantAnswer(text, shouldScroll) {
    hideEmpty();
    appendAssistantSpacerIfNeeded();
    var tableInfo = extractMarkdownTables(text);
    var files = extractFiles(text);
    var tablesHtml = renderMarkdownTables(tableInfo.tables);
    if (!analysis) resetAnalysis();
    files.forEach(function (path) {
      if (analysis.files.indexOf(path) === -1) analysis.files.push(path);
    });
    renderFoundDock();
    persistAnalysisState();
    var node = document.createElement("article");
    node.className = "ai-assistant-answer";
    node.innerHTML =
      renderCard("Краткий ответ", renderRichAnswerHtml(text, tablesHtml));
    node.setAttribute("data-answer-text", text || "");
    els.stream.appendChild(node);
    if (shouldScroll !== false) scrollToBottom();
    return node;
  }

  function renderError(message, shouldScroll) {
    hideEmpty();
    appendAssistantSpacerIfNeeded();
    var node = document.createElement("div");
    node.className = "ai-error-card";
    node.innerHTML =
      "<strong>Не удалось завершить анализ.</strong><br>" +
      escapeHtml(message || "Попробуйте уточнить вопрос или повторить запрос.") +
      '<div class="ai-error-actions">' +
      '<button type="button" data-ai-prompt="Искать по похожим названиям">Искать по похожим названиям</button>' +
      '<button type="button" data-ai-show-tech>Открыть техническую ошибку</button>' +
      '<button type="button" data-ai-prompt="Покажи найденные совпадения">Показать найденные совпадения</button>' +
      "</div>";
    els.stream.appendChild(node);
    if (shouldScroll !== false) scrollToBottom();
  }

  function handleEvent(event, refs) {
    var type = event && event.type ? String(event.type) : "raw";
    var roomId = refs && refs.roomId ? refs.roomId : activeRoomId;
    var isVisibleRoom = !roomId || roomId === activeRoomId;
    if (event && event.seq != null) updateRoomSeq(event.seq, roomId);
    if (type === "job" && event.job_id) {
      markRoomJob(event.job_id, roomId);
      if (isVisibleRoom) addTechnical("Задача", "AI job " + event.job_id + " запущен на сервере");
      return;
    }
    if (!isVisibleRoom && ["answer", "error", "cancelled", "done"].indexOf(type) === -1) return;
    if (type === "progress") {
      if (!addAgentProgress(event.message || event.content || "", refs)) {
        appendWorkItem(event.message || event.content || "", refs);
      }
      addTechnical("Ход работы", event.message || event.content || "");
      return;
    }
    if (type === "status") {
      var msg = event.message || "";
      addTimelineStep(msg, "active");
      addTechnical("Этап", msg);
      return;
    }
    if (type === "plan") {
      updateAgentPlan(event.content || "", refs);
      addTechnical("План", event.content || "");
      return;
    }
    if (type === "tool") {
      if (analysis && analysis.tools.indexOf(event.name) === -1) analysis.tools.push(event.name);
      if (analysis) analysis.currentTool = event.name || "";
      if (analysis && ["search_files", "search_in_files", "filter_by_extension", "list_directory_tree", "get_project_context"].indexOf(analysis.currentTool) !== -1) {
        var analyzedKey = "tool:" + analysis.currentTool + ":" + analysis.tools.length;
        if (analysis.analyzedItems.indexOf(analyzedKey) === -1) analysis.analyzedItems.push(analyzedKey);
      }
      persistAnalysisState(roomId);
      addAgentTool(event.name || "tool", refs);
      addTimelineStep("MCP: " + (event.name || "tool"), "done");
      addTechnical("MCP", event.name || "tool");
      renderTimeline();
      return;
    }
    if (type === "file") {
      rememberFile(event.path || "");
      rememberProgressFile(event.path || "");
      addAgentFoundFile(event.path || "", refs);
      addTechnical("Файл", event.path || "");
      renderTimeline();
      return;
    }
    if (type === "answer") {
      progressAgentPlan(refs);
      if (analysis) analysis.completed = true;
      persistAnalysisState(roomId);
      addTimelineStep("Сформировал ответ", "done");
      renderTimeline();
      if (isVisibleRoom) refs.answer = renderAssistantAnswer(event.content || "");
      addRoomMessage("assistant", event.content || "", roomId);
      clearRoomJob(roomId);
      setStatus("Готов", "");
      return;
    }
    if (type === "error") {
      if (refs.loading && refs.loading.parentNode && !refs.loading.classList.contains("ai-agent-board")) refs.loading.remove();
      if (refs.loading && refs.loading.classList && refs.loading.classList.contains("ai-agent-board")) {
        refs.loading.__completed = true;
        refs.loading.__currentTool = "Завершено с ошибкой";
        persistWorkStateFromBoard(refs.loading, roomId);
      }
      if (isVisibleRoom) renderError(event.message || "Ошибка AI-ассистента");
      addRoomMessage("error", event.message || "Ошибка AI-ассистента", roomId);
      addTechnical("Ошибка", event.message || "");
      clearRoomJob(roomId);
      setStatus("Ошибка", "error");
      return;
    }
    if (type === "cancelled") {
      if (refs.loading && refs.loading.parentNode && !refs.loading.classList.contains("ai-agent-board")) refs.loading.remove();
      var cancelText = event.message || "Запрос остановлен пользователем";
      if (refs.loading && refs.loading.classList && refs.loading.classList.contains("ai-agent-board")) {
        refs.loading.__completed = true;
        refs.loading.__currentTool = cancelText;
        persistWorkStateFromBoard(refs.loading, roomId);
      }
      if (isVisibleRoom) renderError(cancelText);
      addRoomMessage("error", cancelText, roomId);
      addTechnical("Остановлено", cancelText);
      clearRoomJob(roomId);
      setStatus("Остановлено", "");
      return;
    }
    if (type === "ready") {
      addTechnical("Соединение", event.message || "готово");
      return;
    }
    if (type === "done") {
      clearRoomJob(roomId);
      return;
    }
    if (type === "stream_timeout") {
      scheduleJobReconnect(refs, "stream timeout");
      return;
    }
    if (type !== "done") {
      addTechnical(type, event.content || event.message || JSON.stringify(event));
    }
  }

  function scheduleJobReconnect(refs, reason) {
    refs = refs || currentRefs || {};
    var room = refs.roomId ? findRoom(refs.roomId) : activeRoom();
    if (!room || !room.activeJobId || !window.Api || typeof window.Api.streamAssistantJob !== "function") {
      return false;
    }
    if (refs.reconnectTimer) return true;
    refs.reconnectAttempts = (refs.reconnectAttempts || 0) + 1;
    if (refs.reconnectAttempts > 8) {
      return false;
    }
    setStatus("Дочитываю ответ фоновой задачи...", "busy");
    addTechnical("Соединение", (reason || "stream завершился") + ", подключаюсь к job " + room.activeJobId);
    refs.reconnectTimer = setTimeout(function () {
      refs.reconnectTimer = null;
      startJobStream(room.activeJobId, room.jobSeq == null ? -1 : room.jobSeq, refs);
    }, Math.min(5000, 700 * refs.reconnectAttempts));
    return true;
  }

  function finishStreaming(result, refs) {
    if (!result || !result.ok) {
      if (!(result && result.unauthorized) && scheduleJobReconnect(refs, "network error")) {
        return;
      }
      if (refs.loading && refs.loading.parentNode && !refs.loading.classList.contains("ai-agent-board")) refs.loading.remove();
      var errorText = (result && result.error) || "Не удалось получить ответ AI-ассистента";
      if (!refs.roomId || refs.roomId === activeRoomId) renderError(errorText);
      addRoomMessage("error", errorText, refs.roomId);
      clearRoomJob(refs.roomId);
      setStatus("Ошибка", "error");
    }
  }

  function startJobStream(jobId, after, refs) {
    if (!jobId || !window.Api || typeof window.Api.streamAssistantJob !== "function") return;
    currentRefs = refs || currentRefs || { loading: appendLoadingCard(), answer: null, roomId: activeRoomId };
    setBusy(true);
    window.Api.streamAssistantJob(jobId, after, {
      onEvent: function (event) {
        handleEvent(event, currentRefs);
      },
    }).then(function (result) {
      finishStreaming(result, currentRefs);
    }).finally(function () {
      var room = activeRoom();
      if (room && room.activeJobId && currentRefs && currentRefs.roomId === room.id) {
        scheduleJobReconnect(currentRefs, "stream закрыт до финального ответа");
      }
      setBusy(!!(room && room.activeJobId));
      if (els.input) els.input.focus();
    });
  }

  function resumeActiveJob() {
    var room = activeRoom();
    if (!room || !room.activeJobId || !window.Api || typeof window.Api.streamAssistantJob !== "function") {
      return;
    }
    resetAnalysis();
    var workMessage = latestWorkMessage(room);
    var board = workMessage && workMessage.content ? boardNodeByWorkId(workMessage.content.id) : null;
    if (!board) {
      board = workMessage && workMessage.content ? renderPersistedWorkBoard(workMessage.content, false) : appendLoadingCard();
    }
    currentRefs = { loading: board, answer: null, roomId: room.id };
    startJobStream(room.activeJobId, room.jobSeq == null ? -1 : room.jobSeq, currentRefs);
  }

  function submitMessage(evt) {
    evt.preventDefault();
    if (busy) {
      stopActiveJob();
      return;
    }
    if (!els.input || !window.Api || typeof window.Api.sendAssistantMessageStream !== "function") return;
    var message = String(els.input.value || "").trim();
    if (!message) return;
    els.input.value = "";
    autosizeInput();
    appendUserMessage(message);
    addRoomMessage("user", message);
    resetAnalysis();
    var casualMessage = isSimpleGreeting(message);
    var refs = { loading: casualMessage ? null : appendLoadingCard(), answer: null, roomId: activeRoomId };
    currentRefs = refs;
    setBusy(true);
    var context = currentDashboardContext();
    var userContext = currentUserContext();
    var payload = {
      message: !casualMessage && context ? message + "\n\nКонтекст страницы:\n" + context : message,
      room_id: activeRoomId,
      user_context: userContext,
    };
    window.Api.sendAssistantMessageStream(payload, {
      onEvent: function (event) {
        handleEvent(event, refs);
      },
    }).then(function (result) {
      finishStreaming(result, refs);
    }).finally(function () {
      var room = activeRoom();
      setBusy(!!(room && room.activeJobId));
      if (els.input) els.input.focus();
    });
  }

  function stopActiveJob() {
    var room = activeRoom();
    if (!room || !room.activeJobId || !window.Api || typeof window.Api.stopAssistantJob !== "function") return;
    setStatus("Останавливаю...", "busy");
    window.Api.stopAssistantJob(room.activeJobId).then(function (result) {
      if (!result || !result.ok) {
        renderError((result && result.error) || "Не удалось остановить запрос");
        setStatus("Ошибка остановки", "error");
      }
    });
  }

  function autosizeInput() {
    if (!els.input) return;
    els.input.style.height = "auto";
    els.input.style.height = Math.min(120, Math.max(44, els.input.scrollHeight)) + "px";
    if (els.send) els.send.disabled = !busy && !String(els.input.value || "").trim();
  }

  function fillSuggestion(text) {
    if (!els.input) return;
    els.input.value = text || "";
    autosizeInput();
    els.input.focus();
  }

  function handlePanelClick(evt) {
    var deleteRoomBtn = evt.target.closest("[data-ai-delete-room]");
    if (deleteRoomBtn) {
      evt.preventDefault();
      evt.stopPropagation();
      deleteRoom(deleteRoomBtn.getAttribute("data-ai-delete-room") || "");
      return;
    }
    var roomTab = evt.target.closest("[data-ai-room-id]");
    if (roomTab) {
      switchRoom(roomTab.getAttribute("data-ai-room-id") || "");
      return;
    }
    var copyPath = evt.target.closest("[data-ai-copy]");
    if (copyPath) {
      copyText(copyPath.getAttribute("data-ai-copy") || "");
      return;
    }
    var copyAnswer = evt.target.closest("[data-ai-copy-answer]");
    if (copyAnswer) {
      var answer = copyAnswer.closest(".ai-assistant-answer");
      copyText((answer && answer.getAttribute("data-answer-text")) || "");
      return;
    }
    var prompt = evt.target.closest("[data-ai-prompt]");
    if (prompt) {
      fillSuggestion(prompt.getAttribute("data-ai-prompt") || "");
      return;
    }
    var showTech = evt.target.closest("[data-ai-show-tech]");
    if (showTech && els.tech) {
      els.progress.open = true;
      els.tech.open = true;
      return;
    }
    var openFiles = evt.target.closest("[data-ai-open-files]");
    if (openFiles && analysis && analysis.files.length) {
      analysis.files.slice(0, 6).forEach(function (path) {
        if (window.electronAPI && typeof window.electronAPI.openFile === "function") {
          window.electronAPI.openFile(path);
        }
      });
      if (!window.electronAPI || typeof window.electronAPI.openFile !== "function") {
        copyText(analysis.files.join("\n"));
      }
      return;
    }
    var suggestion = evt.target.closest("[data-ai-suggestion]");
    if (suggestion) {
      fillSuggestion(suggestion.getAttribute("data-ai-suggestion") || "");
      return;
    }
    var openFile = evt.target.closest("[data-ai-open-file]");
    if (openFile) {
      var path = openFile.getAttribute("data-ai-open-file") || "";
      if (window.electronAPI && typeof window.electronAPI.openFile === "function") {
        window.electronAPI.openFile(path);
      } else {
        copyText(path);
      }
    }
  }

  function bind() {
    els.open = $("ai-assistant-open");
    els.overlay = $("ai-assistant-overlay");
    els.close = $("ai-assistant-close");
    els.form = $("ai-assistant-form");
    els.input = $("ai-assistant-input");
    els.send = $("ai-assistant-send");
    els.stream = $("ai-assistant-stream");
    els.events = $("ai-assistant-events");
    els.empty = $("ai-assistant-empty");
    els.progress = $("ai-assistant-progress");
    els.progressSummary = $("ai-assistant-progress-summary");
    els.timeline = $("ai-assistant-timeline");
    els.statusPill = $("ai-assistant-status-pill");
    els.wide = $("ai-assistant-wide");
    els.tech = $("ai-assistant-tech");
    els.roomTabs = $("ai-assistant-room-tabs");
    els.roomAdd = $("ai-assistant-room-add");
    els.foundDock = $("ai-agent-found-dock");
    els.foundSummary = $("ai-agent-found-summary");
    els.foundDockList = $("ai-agent-found-dock-list");
    if (!els.open || !els.overlay) return;
    loadRooms();
    renderRoomTabs();
    renderActiveRoom();
    resumeActiveJob();
    els.open.addEventListener("click", openPanel);
    if (els.roomAdd) els.roomAdd.addEventListener("click", addNewRoom);
    if (els.close) els.close.addEventListener("click", closePanel);
    if (els.wide) {
      els.wide.addEventListener("click", function () {
        $("ai-assistant-panel").classList.toggle("is-wide");
      });
    }
    els.overlay.addEventListener("click", handlePanelClick);
    els.overlay.addEventListener("click", function (evt) {
      if (evt.target === els.overlay) closePanel();
    });
    if (els.form) els.form.addEventListener("submit", submitMessage);
    if (els.input) {
      els.input.addEventListener("keydown", function (evt) {
        if ((evt.ctrlKey || evt.metaKey) && evt.key === "Enter") {
          submitMessage(evt);
        }
      });
      els.input.addEventListener("input", autosizeInput);
      autosizeInput();
    }
    document.addEventListener("keydown", function (evt) {
      if (evt.key === "Escape" && !els.overlay.hidden) closePanel();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
