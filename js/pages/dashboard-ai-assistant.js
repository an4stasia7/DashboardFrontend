(function () {
  var STORAGE_PREFIX = "dashboard.ai.assistant.rooms.v1";
  var els = {};
  var busy = false;
  var analysis = null;
  var rooms = [];
  var activeRoomId = "";
  var currentRefs = null;

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
    els.overlay.hidden = false;
    setTimeout(function () {
      if (els.input) els.input.focus();
    }, 60);
  }

  function closePanel() {
    if (!els.overlay) return;
    els.overlay.hidden = true;
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
      els.send.textContent = busy ? "■" : "➜";
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
    return [
      title && title.textContent ? "Текущий дашборд: " + title.textContent.trim() : "",
      month && month.textContent ? "Период: " + month.textContent.trim() : "",
    ].filter(Boolean).join("\n");
  }

  function currentUserKey() {
    var A = window.Auth;
    var session = A && typeof A.getSession === "function" ? A.getSession() : null;
    var user = session && session.user ? session.user : null;
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
    updateProgressSummary("Ход анализа · готов к вопросу");
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
      return;
    }
    if (els.empty) els.empty.hidden = true;
    room.messages.forEach(function (message) {
      if (message.role === "user") {
        appendUserMessage(message.content, false);
      } else if (message.role === "assistant") {
        renderAssistantAnswer(message.content, false);
      } else if (message.role === "error") {
        renderError(message.content, false);
      }
    });
    clearProgress();
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
    updateProgressSummary("Анализирует... · 0 шагов · 0 проанализировано · 0 прочитано");
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
  }

  function addTechnical(label, text) {
    if (!analysis) resetAnalysis();
    analysis.technical.push({ label: label, text: text });
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

  function appendLoadingCard() {
    hideEmpty();
    var node = document.createElement("div");
    node.className = "ai-loading-card";
    node.innerHTML =
      '<p class="ai-loading-title">Анализирую репозиторий…</p>' +
      '<p class="ai-loading-subtitle">Ищу KPI, связанные файлы и источники данных</p>' +
      '<div class="ai-loading-steps">' +
      '<span class="is-active">◌ Поиск по названию плитки</span>' +
      "<span>◌ Анализ backend</span>" +
      "<span>◌ Анализ источников</span>" +
      "<span>◌ Подготовка ответа</span>" +
      "</div>";
    els.stream.appendChild(node);
    scrollToBottom();
    return node;
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
          return (
            '<li class="ai-file-item">' +
            '<span class="ai-file-icon">' + escapeHtml(fileKind(path)) + "</span>" +
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

  function renderAssistantAnswer(text, shouldScroll) {
    hideEmpty();
    var tableInfo = extractMarkdownTables(text);
    var files = extractFiles(text);
    var summary = splitSentences(tableInfo.textWithoutTables || text, 4) || "Агент проанализировал проект и подготовил ответ по найденной логике.";
    var steps = extractSteps(tableInfo.textWithoutTables || text);
    var badges = detectBadges(text);
    var tablesHtml = renderMarkdownTables(tableInfo.tables);
    var node = document.createElement("article");
    node.className = "ai-assistant-answer";
    node.innerHTML =
      renderCard("Краткий ответ", "<p>" + escapeHtml(summary) + "</p>") +
      (tablesHtml ? renderCard("Таблицы из ответа", tablesHtml) : "") +
      renderCard("Где находится логика", renderFileRows(files)) +
      renderCard(
        "Как считается показатель",
        '<ul class="ai-step-list">' +
          steps.map(function (step) { return "<li>" + escapeHtml(step) + "</li>"; }).join("") +
          "</ul>" +
          '<div class="ai-formula">KPI = факт / план × 100%, если в конкретном модуле не задана другая формула.</div>'
      ) +
      renderCard(
        "Источники данных",
        '<div class="ai-badges">' +
          badges.map(function (badge) { return '<span class="ai-badge">' + escapeHtml(badge) + "</span>"; }).join("") +
          "</div>"
      ) +
      renderCard(
        "Что можно проверить",
        '<ul class="ai-check-list">' +
          "<li>Проверить исходный документ или регистр 1C.</li>" +
          "<li>Проверить идентификатор KPI и фильтр по роли.</li>" +
          "<li>Проверить период: неделя, месяц или итого.</li>" +
          "<li>Проверить API-ответ и данные на фронтенде.</li>" +
          "</ul>"
      ) +
      renderCard("Использованные источники", renderFileRows(files)) +
      '<div class="ai-quick-actions">' +
      '<button type="button" data-ai-copy-answer>Скопировать ответ</button>' +
      '<button type="button" data-ai-open-files>Открыть файлы</button>' +
      '<button type="button" data-ai-prompt="Сформируй ТЗ на изменение расчёта">Сформировать ТЗ</button>' +
      '<button type="button" data-ai-prompt="Объясни проще">Объяснить проще</button>' +
      '<button type="button" data-ai-show-tech>Показать технически</button>' +
      '<button type="button" data-ai-prompt="Создай задачу разработчику">Создать задачу разработчику</button>' +
      "</div>";
    node.setAttribute("data-answer-text", text || "");
    els.stream.appendChild(node);
    if (shouldScroll !== false) scrollToBottom();
    return node;
  }

  function renderError(message, shouldScroll) {
    hideEmpty();
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
    if (type === "status") {
      var msg = event.message || "";
      addTimelineStep(msg, "active");
      addTechnical("Этап", msg);
      return;
    }
    if (type === "plan") {
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
      addTimelineStep("MCP: " + (event.name || "tool"), "done");
      addTechnical("MCP", event.name || "tool");
      renderTimeline();
      return;
    }
    if (type === "file") {
      rememberFile(event.path || "");
      rememberProgressFile(event.path || "");
      addTechnical("Файл", event.path || "");
      renderTimeline();
      return;
    }
    if (type === "answer") {
      if (refs.loading && refs.loading.parentNode) refs.loading.remove();
      if (analysis) analysis.completed = true;
      addTimelineStep("Сформировал ответ", "done");
      renderTimeline();
      if (isVisibleRoom) refs.answer = renderAssistantAnswer(event.content || "");
      addRoomMessage("assistant", event.content || "", roomId);
      clearRoomJob(roomId);
      setStatus("Готов", "");
      return;
    }
    if (type === "error") {
      if (refs.loading && refs.loading.parentNode) refs.loading.remove();
      if (isVisibleRoom) renderError(event.message || "Ошибка AI-ассистента");
      addRoomMessage("error", event.message || "Ошибка AI-ассистента", roomId);
      addTechnical("Ошибка", event.message || "");
      clearRoomJob(roomId);
      setStatus("Ошибка", "error");
      return;
    }
    if (type === "cancelled") {
      if (refs.loading && refs.loading.parentNode) refs.loading.remove();
      var cancelText = event.message || "Запрос остановлен пользователем";
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
      setStatus("Фоновая задача ещё работает", "busy");
      return;
    }
    if (type !== "done") {
      addTechnical(type, event.content || event.message || JSON.stringify(event));
    }
  }

  function finishStreaming(result, refs) {
    if (!result || !result.ok) {
      if (refs.loading && refs.loading.parentNode) refs.loading.remove();
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
    currentRefs = { loading: appendLoadingCard(), answer: null, roomId: room.id };
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
    var refs = { loading: appendLoadingCard(), answer: null, roomId: activeRoomId };
    currentRefs = refs;
    setBusy(true);
    var context = currentDashboardContext();
    var payload = {
      message: context ? message + "\n\nКонтекст страницы:\n" + context : message,
      room_id: activeRoomId,
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
