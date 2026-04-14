/**
 * @fileoverview Дашборд: вкладки иерархии, KPI-плитки, drilldown по отделам, графики Highcharts, таблица план/факт.
 * Данные: `Api.fetchKpis` / `fetchKpiAll` / `fetchImmediateSubordinates`; при недоступности API — `MockData`.
 * Утилиты «листьев»: `DashUi`, `DashLatex`, `DashDebug` (скрипты в `dashboard.html` до этого файла).
 * В файле блоки сгруппированы горизонтальными разделителями в комментариях сверху вниз по потоку выполнения.
 */
(function () {
  if (!Auth.requireAuth("login.html")) {
    return;
  }

  const session = Auth.getSession();
  const sessionUser = session.user;

  /* ---------- Отладка: журнал JSON-ответов API (рендер в dash-debug-log.js) ---------- */

  /** Ручная запись в общий журнал отладки (mock, отсутствие Api и т.п.). */
  function pushDashboardDebugNote(source, message) {
    if (!window.__apiDebugJsonLog) window.__apiDebugJsonLog = [];
    window.__apiDebugJsonLog.push({
      at: new Date().toISOString(),
      source: source || "dashboard",
      method: "",
      url: "",
      status: "",
      body: { _note: message },
    });
    DashDebug.renderDebugJsonLogPanel();
  }

  /** Пользователь, чей дашборд сейчас на экране (может отличаться от sessionUser при просмотре подчинённого) */
  var viewContextUser = sessionUser;
  /** Вкладки иерархии: { id, label, user, department? }[] — в live из immediate-subordinates; в mock из MockData */
  var viewTargets = [];
  var selectedViewId = "self";
  /** Путь от подразделения пользователя вниз по дереву (для запроса детей и хлебных крошек) */
  var hierarchyStack = [];
  /** Экземпляр Highcharts левого (линейного) графика — пересоздаём при смене показателя */
  var lineChartInstance = null;
  var lineChartIndicators = [];

  var waterfallChartInstance = null;
  var waterfallChartIndicators = [];

  var donutChartInstances = [];

  /** Плитки KPI последней отрисовки — для синхронизации круговых с 6 плитками */
  var lastKpiTiles = null;

  /** Индикаторы для графиков, полученные от API (null = данных нет, использовать MockData) */
  var lastApiChartIndicators = null;
  /** Строки таблицы из API */
  var lastApiTableRows = null;
  /** Подпись в шапке из поля department последнего успешного ответа KPI (json) */
  var lastKpiResponseDepartment = null;

  /** Плитка, для которой последний раз открывали drilldown (резерв; при переходе по детям берётся плитка клика) */
  var drilldownContextTile = null;
  /** Индексы перевёрнутых KPI-карточек (можно держать открытыми несколько) */
  var flippedTileIndices = new Set();
  /** Состояние загрузки дочерних отделов на обороте карточек */
  var kpiTileDetailsState = Object.create(null);
  /** После перехода из drilldown — подсветить соответствующую плитку на новом виде */
  var pendingKpiTileFocus = null;
  /** Hover/focus popover для кнопки `?` */
  var kpiHelpPopoverEl = document.getElementById("kpi-help-popover");

  /* ---------- Навигация по месяцам ---------- */

  var MONTH_NAMES_RU = [
    "", "январь", "февраль", "март", "апрель", "май", "июнь",
    "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"
  ];
  var currentPeriodMonth = null;
  var currentPeriodYear = null;
  var availableMonths = [];

  /** Для навигации по месяцам: значение плана/факта считается заданным (как в api.js). */
  function navPlanFactValuePresent(v) {
    if (v === undefined || v === null) return false;
    if (typeof v === "number") return !isNaN(v);
    if (typeof v === "string") return String(v).trim() !== "";
    return true;
  }

  /** Точка линейного графика годится для переключателя, только если есть и plan, и fact. */
  function navPointHasPlanAndFact(pt) {
    return pt && navPlanFactValuePresent(pt.plan) && navPlanFactValuePresent(pt.fact);
  }

  function monthYearKey(year, month) {
    var y = parseInt(String(year), 10);
    var m = parseInt(String(month), 10);
    if (isNaN(y) || isNaN(m) || m < 1 || m > 12) return -1;
    return y * 100 + m;
  }

  function periodKeyInAvailableMonths(y, m, slots) {
    var k = monthYearKey(y, m);
    if (k < 0) return false;
    for (var i = 0; i < slots.length; i++) {
      if (slots[i].key === k) return true;
    }
    return false;
  }

  /**
   * Месяцы для стрелок навигатора: уникальные (год, месяц) из линейных графиков,
   * где у точки одновременно заданы plan и fact (последний такой месяц — типичный «актуальный» период).
   */
  function setAvailableMonthsFromChartPoints(chartIndicators) {
    availableMonths = [];
    if (!chartIndicators) return;
    var lines = chartIndicators.line || [];
    for (var li = 0; li < lines.length; li++) {
      var pts = lines[li].points;
      if (!pts) continue;
      for (var pi = 0; pi < pts.length; pi++) {
        var pt = pts[pi];
        if (!navPointHasPlanAndFact(pt)) continue;
        var key = monthYearKey(pt.year, pt.month);
        if (key < 0) continue;
        var exists = false;
        for (var ei = 0; ei < availableMonths.length; ei++) {
          if (availableMonths[ei].key === key) {
            exists = true;
            break;
          }
        }
        if (!exists) {
          availableMonths.push({
            month: parseInt(String(pt.month), 10),
            year: parseInt(String(pt.year), 10),
            key: key,
          });
        }
      }
    }
    availableMonths.sort(function (a, b) {
      return a.key - b.key;
    });
  }

  function getCurrentMonthIndex() {
    if (currentPeriodMonth == null || currentPeriodYear == null) return -1;
    var key = currentPeriodYear * 100 + currentPeriodMonth;
    for (var i = 0; i < availableMonths.length; i++) {
      if (availableMonths[i].key === key) return i;
    }
    return -1;
  }

  function updateMonthNavigatorUI() {
    var nav = document.getElementById("month-navigator");
    var label = document.getElementById("month-nav-label");
    var prevBtn = document.getElementById("month-nav-prev");
    var nextBtn = document.getElementById("month-nav-next");
    if (!nav) return;

    if (currentPeriodMonth == null || currentPeriodYear == null) {
      nav.hidden = true;
      return;
    }

    nav.hidden = false;
    var monthName = MONTH_NAMES_RU[currentPeriodMonth] || String(currentPeriodMonth);
    if (label) label.textContent = monthName + " " + currentPeriodYear;

    var idx = getCurrentMonthIndex();
    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) nextBtn.disabled = idx < 0 || idx >= availableMonths.length - 1;
  }

  function navigateToMonth(month, year) {
    currentPeriodMonth = month;
    currentPeriodYear = year;
    updateMonthNavigatorUI();
    loadKpiTilesAndChartsForView();
  }

  function navigateToQuarter(quarter, year) {
    var lastMonth = quarter * 3;
    navigateToMonth(lastMonth, year);
  }

  (function initMonthNavigator() {
    var prevBtn = document.getElementById("month-nav-prev");
    var nextBtn = document.getElementById("month-nav-next");
    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        var idx = getCurrentMonthIndex();
        if (idx > 0) {
          var prev = availableMonths[idx - 1];
          navigateToMonth(prev.month, prev.year);
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        var idx = getCurrentMonthIndex();
        if (idx >= 0 && idx < availableMonths.length - 1) {
          var next = availableMonths[idx + 1];
          navigateToMonth(next.month, next.year);
        }
      });
    }
  })();

  /** Кэш плиток KPI по названию отдела — меньше повторных GET при drilldown */
  var drilldownKpiTilesCache = Object.create(null);
  var DRILLDOWN_KPI_CACHE_MAX = 32;
  var DRILLDOWN_FETCH_CONCURRENCY = 6;

  /* ---------- Кэш KPI при drilldown (меньше повторных GET) ---------- */

  /** Сохраняет плитки отдела в LRU-кэш для повторного открытия drilldown. */
  function rememberDrilldownKpiTiles(dept, tiles) {
    var d = dept != null ? String(dept).trim() : "";
    if (!d || !tiles || !tiles.length) return;
    drilldownKpiTilesCache[d] = tiles;
    var keys = Object.keys(drilldownKpiTilesCache);
    while (keys.length > DRILLDOWN_KPI_CACHE_MAX) {
      delete drilldownKpiTilesCache[keys[0]];
      keys = Object.keys(drilldownKpiTilesCache);
    }
  }

  /** Загрузка плиток KPI для одного отдела (`Api.fetchKpis`) с использованием кэша. */
  function loadDrilldownTilesForDept(deptName) {
    var cn = deptName != null ? String(deptName).trim() : "";
    if (!cn) return Promise.resolve({ name: cn, tiles: [] });
    var cached = drilldownKpiTilesCache[cn];
    if (cached && cached.length) {
      return Promise.resolve({ name: cn, tiles: cached });
    }
    if (typeof Api === "undefined" || typeof Api.fetchKpis !== "function") {
      return Promise.resolve({ name: cn, tiles: [] });
    }
    return Api.fetchKpis({ department: cn })
      .then(function (res) {
        var t = res.ok && res.tiles ? res.tiles.slice() : [];
        if (t.length) rememberDrilldownKpiTiles(cn, t);
        return { name: cn, tiles: t };
      })
      .catch(function () {
        return { name: cn, tiles: [] };
      });
  }

  /**
   * Выполняет `mapper(item, index)` с ограничением числа одновременных промисов.
   * @template T, R
   * @param {T[]} items
   * @param {number} limit
   * @param {function(T, number): Promise<R>|R} mapper
   * @returns {Promise<(R|null)[]>}
   */
  function mapWithConcurrencyLimit(items, limit, mapper) {
    if (!items || !items.length) return Promise.resolve([]);
    var results = new Array(items.length);
    var nextIndex = 0;
    var active = 0;
    var settled = false;
    return new Promise(function (resolve) {
      function finish() {
        if (settled) return;
        settled = true;
        resolve(results);
      }
      function onOneDone(idx, val) {
        results[idx] = val;
        active--;
        pump();
        if (active === 0 && nextIndex >= items.length) finish();
      }
      function pump() {
        while (active < limit && nextIndex < items.length) {
          var idx = nextIndex++;
          active++;
          (function (i) {
            Promise.resolve(mapper(items[i], i))
              .then(function (val) {
                onOneDone(i, val);
              })
              .catch(function () {
                onOneDone(i, null);
              });
          })(idx);
        }
      }
      pump();
      if (active === 0 && nextIndex >= items.length) finish();
    });
  }

  /* ---------- Вкладки вида и контекст подразделения ---------- */

  /** Активная вкладка из `viewTargets` по `selectedViewId`, иначе первая. */
  function getCurrentViewTarget() {
    if (!viewTargets || !viewTargets.length) return null;
    for (var i = 0; i < viewTargets.length; i++) {
      if (viewTargets[i].id === selectedViewId) return viewTargets[i];
    }
    return viewTargets[0];
  }

  /**
   * Подразделение для `?department=` в KPI: последний сегмент крошек или `department` из сессии.
   * @returns {string}
   */
  function getDepartmentForCurrentKpiContext() {
    if (hierarchyStack.length > 0) {
      var last = hierarchyStack[hierarchyStack.length - 1];
      if (last != null && String(last).trim()) return String(last).trim();
    }
    if (sessionUser.department != null && String(sessionUser.department).trim()) {
      return String(sessionUser.department).trim();
    }
    return "";
  }

  /** Заголовок страницы и подсказка пользователя в зависимости от выбранной вкладки / крошек. */
  function updateTopBarForView() {
    var vu = viewContextUser;
    var t = getCurrentViewTarget();
    var titleEl = document.getElementById("dash-role-title");
    if (titleEl) {
      var raw =
        lastKpiResponseDepartment && String(lastKpiResponseDepartment).trim()
          ? String(lastKpiResponseDepartment).trim()
          : vu.role || "—";
      titleEl.textContent = DashUi.capitalizeHeaderTitle(raw);
    }
    var elHint = document.getElementById("dash-user-hint");
    if (!elHint) return;
    elHint.removeAttribute("title");
    if (selectedViewId === "self") {
      var hint = sessionUser.nickname || "";
      if (sessionUser.department) {
        var depSelf = DashUi.capitalizeHeaderTitle(String(sessionUser.department).trim());
        hint = hint ? hint + " · " + depSelf : depSelf;
      }
      elHint.textContent = hint || "—";
    } else {
      /* Список вкладок — дети текущего узла; выбранный dept часто не в списке, getCurrentViewTarget() тогда неверен. Контекст просмотра = последний сегмент крошек. */
      var viewLabel = "";
      if (hierarchyStack.length > 0) {
        viewLabel = String(hierarchyStack[hierarchyStack.length - 1]).trim();
      }
      if (!viewLabel && t) {
        if (t.viewDepartment != null && String(t.viewDepartment).trim()) {
          viewLabel = String(t.viewDepartment).trim();
        } else if (t.label) {
          viewLabel = String(t.label).trim();
        }
      }
      if (!viewLabel) {
        viewLabel = vu.nickname || "—";
      }
      elHint.textContent =
        "Вы: " +
        (sessionUser.nickname || "—") +
        " · просмотр: " +
        DashUi.capitalizeHeaderTitle(viewLabel);
    }
  }

  document.getElementById("btn-logout").addEventListener("click", function () {
    Auth.logout();
    window.location.href = "login.html";
  });

  /** Контейнер плиток KPI: `?` на обороте карточки (hover/focus), клик по карточке — flip, по дочернему отделу — переход. */
  var kpiContainerEl = document.getElementById("kpi-container");
  if (kpiContainerEl) {
    kpiContainerEl.addEventListener("click", function (e) {
      var childBtn = e.target.closest(".kpi-tile-child-link");
      if (childBtn && kpiContainerEl.contains(childBtn)) {
        e.preventDefault();
        e.stopPropagation();
        var childDept = childBtn.getAttribute("data-department");
        if (childDept) {
          var artFromChild = childBtn.closest("article.kpi-tile");
          var ixChild = artFromChild && artFromChild.getAttribute("data-kpi-tile-index");
          var tileFromChild =
            ixChild != null && lastKpiTiles ? lastKpiTiles[+ixChild] : null;
          navigateDashboardToDepartmentFromDrill(childDept, tileFromChild);
        }
        return;
      }
      var flipBtn = e.target.closest(".kpi-tile-flip-action");
      if (flipBtn && kpiContainerEl.contains(flipBtn)) {
        e.preventDefault();
        e.stopPropagation();
        var artFlip = flipBtn.closest("article.kpi-tile");
        if (!artFlip) return;
        var ixFlip = artFlip.getAttribute("data-kpi-tile-index");
        if (ixFlip == null) return;
        openKpiTileDrilldown(+ixFlip);
        return;
      }
      var btn = e.target.closest(".kpi-tile-help");
      if (btn && kpiContainerEl.contains(btn)) {
        e.preventDefault();
        e.stopPropagation();
        hideKpiHelpPopover();
        var artHelp = btn.closest("article.kpi-tile");
        if (!artHelp) return;
        var ixH = artHelp.getAttribute("data-kpi-tile-index");
        if (ixH == null || !lastKpiTiles || lastKpiTiles[+ixH] == null) return;
        openKpiThresholdsDialog(lastKpiTiles[+ixH]);
        return;
      }
      var art = e.target.closest("article.kpi-tile");
      if (!art || !kpiContainerEl.contains(art)) return;
      if (e.target.closest("button, a, input, select, textarea")) return;
      hideKpiHelpPopover();
      var ix = art.getAttribute("data-kpi-tile-index");
      if (ix == null || !lastKpiTiles || lastKpiTiles[+ix] == null) return;
      openKpiTileDrilldown(+ix);
    });
    kpiContainerEl.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var art = e.target.closest("article.kpi-tile");
      if (!art || !kpiContainerEl.contains(art)) return;
      if (e.target.closest(".kpi-tile-child-link, .kpi-tile-help, .kpi-tile-flip-action")) return;
      e.preventDefault();
      var ix = art.getAttribute("data-kpi-tile-index");
      if (ix == null || !lastKpiTiles || lastKpiTiles[+ix] == null) return;
      openKpiTileDrilldown(+ix);
    });
    kpiContainerEl.addEventListener("mouseover", function (e) {
      var btn = e.target.closest(".kpi-tile-help");
      if (!btn || !kpiContainerEl.contains(btn)) return;
      var art = btn.closest("article.kpi-tile");
      if (!art) return;
      var ix = art.getAttribute("data-kpi-tile-index");
      if (ix == null || !lastKpiTiles || lastKpiTiles[+ix] == null) return;
      showKpiHelpPopover(btn, lastKpiTiles[+ix]);
    });
    kpiContainerEl.addEventListener("mouseout", function (e) {
      var btn = e.target.closest(".kpi-tile-help");
      if (!btn || !kpiContainerEl.contains(btn)) return;
      if (btn.contains(e.relatedTarget)) return;
      hideKpiHelpPopover();
    });
    kpiContainerEl.addEventListener("focusin", function (e) {
      var btn = e.target.closest(".kpi-tile-help");
      if (!btn || !kpiContainerEl.contains(btn)) return;
      var art = btn.closest("article.kpi-tile");
      if (!art) return;
      var ix = art.getAttribute("data-kpi-tile-index");
      if (ix == null || !lastKpiTiles || lastKpiTiles[+ix] == null) return;
      showKpiHelpPopover(btn, lastKpiTiles[+ix]);
    });
    kpiContainerEl.addEventListener("focusout", function (e) {
      var btn = e.target.closest(".kpi-tile-help");
      if (!btn || !kpiContainerEl.contains(btn)) return;
      hideKpiHelpPopover();
    });
    kpiContainerEl.addEventListener(
      "wheel",
      function (e) {
        var tile = e.target.closest("article.kpi-tile.is-flipped");
        if (!tile || !kpiContainerEl.contains(tile)) return;
        var backFace = tile.querySelector(".kpi-tile-face--back");
        if (!backFace) return;
        e.preventDefault();
        e.stopPropagation();
        var canScroll = backFace.scrollHeight > backFace.clientHeight + 1;
        if (!canScroll) return;
        var delta = e.deltaY;
        var top = backFace.scrollTop;
        var maxTop = backFace.scrollHeight - backFace.clientHeight;
        if (delta < 0 && top <= 0) return;
        if (delta > 0 && top >= maxTop - 1) return;
        backFace.scrollTop = Math.max(0, Math.min(maxTop, top + delta));
      },
      { passive: false }
    );
  }

  /* ---------- KPI: синонимы названий и сопоставление плиток (drilldown) ---------- */

  /**
   * Группы синонимов из `js/const/arraykpi.js` (`window.KPI_NAME_SYNONYM_GROUPS`).
   * @returns {string[][]}
   */
  function getKpiSynonymGroups() {
    return window.KPI_NAME_SYNONYM_GROUPS && Array.isArray(window.KPI_NAME_SYNONYM_GROUPS)
      ? window.KPI_NAME_SYNONYM_GROUPS
      : [];
  }

  /** Нормализация заголовка KPI для сравнения (регистр, кавычки, пробелы). */
  function normalizeKpiTitleForMatch(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[«»""]/g, "")
      .trim();
  }

  /** Совпадение двух названий KPI с учётом нормализации и вхождения подстроки. */
  function titlesMatchForKpi(a, b) {
    var na = normalizeKpiTitleForMatch(a);
    var nb = normalizeKpiTitleForMatch(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    if (na.indexOf(nb) !== -1 || nb.indexOf(na) !== -1) return true;
    return false;
  }

  /** Первая группа синонимов, в которой встречается название плитки, иначе `null`. */
  function findSynonymGroupForTileTitle(title) {
    var groups = getKpiSynonymGroups();
    if (!normalizeKpiTitleForMatch(title)) return null;
    for (var g = 0; g < groups.length; g++) {
      var grp = groups[g];
      if (!grp || !grp.length) continue;
      for (var i = 0; i < grp.length; i++) {
        if (titlesMatchForKpi(title, grp[i])) return grp;
      }
    }
    return null;
  }

  /**
   * Совпадает ли плитка с целью подсветки после навигации (kpi_id или синонимы / заголовок).
   * @param {object} tile
   * @param {{ kpi_id?: string, title?: string }} focus
   */
  function tileMatchesFocusTarget(tile, focus) {
    if (!tile || !focus) return false;
    if (focus.kpi_id && tile.kpi_id && String(focus.kpi_id) === String(tile.kpi_id)) return true;
    var group = findSynonymGroupForTileTitle(focus.title);
    if (group) {
      for (var j = 0; j < group.length; j++) {
        if (titlesMatchForKpi(tile.title, group[j])) return true;
      }
    }
    return titlesMatchForKpi(tile.title, focus.title);
  }

  /**
   * Ищет плитку дочернего отдела, соответствующую выбранной (по kpi_id или группе синонимов).
   * @param {object[]|null|undefined} childTiles
   * @param {object} clickedTile
   * @param {string[]|null} synonymGroup
   */
  function findMatchingTileAmongChildren(childTiles, clickedTile, synonymGroup) {
    if (!childTiles || !clickedTile) return null;
    for (var i = 0; i < childTiles.length; i++) {
      var t = childTiles[i];
      if (!t) continue;
      if (clickedTile.kpi_id && t.kpi_id && String(clickedTile.kpi_id) === String(t.kpi_id)) return t;
      if (synonymGroup) {
        for (var j = 0; j < synonymGroup.length; j++) {
          if (titlesMatchForKpi(t.title, synonymGroup[j])) return t;
        }
      } else if (titlesMatchForKpi(t.title, clickedTile.title)) {
        return t;
      }
    }
    return null;
  }

  /**
   * Строка таблицы drilldown: отдел, подпись %, RAG; `isCurrentContext` — текущий узел иерархии.
   * @param {string} deptName
   * @param {object|null} tile
   * @param {boolean} isCurrentContext
   */
  function drillRowFromTile(deptName, tile, isCurrentContext) {
    var label = deptName != null ? String(deptName).trim() : "—";
    if (!tile) {
      return {
        department: label,
        kpiPct: "—",
        rag: "blue",
        isCurrentContext: !!isCurrentContext,
      };
    }
    var pres = MockData.getKpiTilePresentation(tile);
    var pct =
      tile.kpi_pct != null && typeof tile.kpi_pct === "number" && !isNaN(tile.kpi_pct)
        ? tile.kpi_pct
        : tile.kpi_pst != null && typeof tile.kpi_pst === "number" && !isNaN(tile.kpi_pst)
          ? tile.kpi_pst
          : pres.percent;
    var pctLabel = MockData.formatKpiPercentLabel(pct) + "%";
    return {
      department: label,
      kpiPct: pctLabel,
      rag: pres.rag || "blue",
      isCurrentContext: !!isCurrentContext,
    };
  }

  /** Строка дочернего отдела без реального KPI (прочерк) — не показываем в списке. */
  function drillRowHasNoKpiValue(row) {
    if (!row || row.kpiPct == null) return true;
    return String(row.kpiPct).indexOf("—") !== -1;
  }

  /**
   * Собирает строки drilldown только по дочерним отделам (без пустых / без KPI).
   * @param {{ name: string, tiles: object[] }[]} results
   * @param {object} clicked
   * @param {string[]|null} synonymGroup
   */
  function buildDrilldownRowsForChildrenOnly(results, clicked, synonymGroup) {
    var rows = [];
    (results || []).forEach(function (item) {
      if (!item || !item.name) return;
      var matched = findMatchingTileAmongChildren(item.tiles || [], clicked, synonymGroup);
      if (!matched) return;
      var childRow = drillRowFromTile(item.name, matched, false);
      if (drillRowHasNoKpiValue(childRow)) return;
      rows.push(childRow);
    });
    return rows;
  }

  /* ---------- KPI-card drilldown: hover help + flip-card с детьми ---------- */

  function drilldownRagSortWeight(rag) {
    var key = rag != null ? String(rag).toLowerCase().trim() : "";
    if (key === "red") return 0;
    if (key === "yellow") return 1;
    if (key === "green") return 2;
    if (key === "blue") return 3;
    return 4;
  }

  function sortDrilldownRows(rows) {
    return (rows || []).slice().sort(function (a, b) {
      var ragDiff = drilldownRagSortWeight(a && a.rag) - drilldownRagSortWeight(b && b.rag);
      if (ragDiff !== 0) return ragDiff;
      var aName = a && a.department ? String(a.department).toLowerCase() : "";
      var bName = b && b.department ? String(b.department).toLowerCase() : "";
      return aName.localeCompare(bName, "ru");
    });
  }

  function getKpiTileDetailsState(tileIndex) {
    if (!kpiTileDetailsState[tileIndex]) {
      kpiTileDetailsState[tileIndex] = {
        loading: false,
        loaded: false,
        rows: [],
        hint: "",
      };
    }
    return kpiTileDetailsState[tileIndex];
  }

  function buildKpiHelpPopoverHtml(tile) {
    var hint = tile && tile.hint != null ? String(tile.hint).trim() : "";
    var fallback = "Нажмите, чтобы открыть подробную информацию и цветовые пороги KPI.";
    var formulaRaw = tile && tile.formula != null ? String(tile.formula).trim() : "";
    var html =
      '<div class="kpi-help-popover-title">' +
      DashUi.escapeHtml(tile && tile.title ? tile.title : "Показатель") +
      "</div>" +
      '<div class="kpi-help-popover-body">' +
      DashUi.escapeHtml(hint || fallback) +
      "</div>";
    if (formulaRaw) {
      html +=
        '<div class="kpi-help-popover-formula-section">' +
        '<div class="kpi-help-popover-formula-label">Формула</div>' +
        '<div class="kpi-help-popover-formula" data-popover-formula></div>' +
        "</div>";
    }
    return html;
  }

  function showKpiHelpPopover(anchorEl, tile) {
    if (!kpiHelpPopoverEl || !anchorEl || !tile) return;
    kpiHelpPopoverEl.innerHTML = buildKpiHelpPopoverHtml(tile);
    var formulaSlot = kpiHelpPopoverEl.querySelector("[data-popover-formula]");
    if (formulaSlot && tile.formula != null && String(tile.formula).trim()) {
      DashLatex.renderKpiThresholdsDialogFormula(formulaSlot, String(tile.formula).trim());
      formulaSlot.classList.add("kpi-help-popover-formula");
    }
    kpiHelpPopoverEl.hidden = false;
    kpiHelpPopoverEl.style.left = "0px";
    kpiHelpPopoverEl.style.top = "0px";
    var anchorRect = anchorEl.getBoundingClientRect();
    var popRect = kpiHelpPopoverEl.getBoundingClientRect();
    var left = Math.min(
      window.innerWidth - popRect.width - 12,
      Math.max(12, anchorRect.right - popRect.width)
    );
    var top = anchorRect.bottom + 12;
    if (top + popRect.height > window.innerHeight - 12) {
      top = Math.max(12, anchorRect.top - popRect.height - 12);
    }
    kpiHelpPopoverEl.style.left = left + "px";
    kpiHelpPopoverEl.style.top = top + "px";
  }

  function hideKpiHelpPopover() {
    if (!kpiHelpPopoverEl) return;
    kpiHelpPopoverEl.hidden = true;
  }

  function buildKpiTileThresholdSummaryHtml(tile) {
    var defs = [
      { rag: "red", key: "red_threshold", label: "Красный" },
      { rag: "yellow", key: "yellow_threshold", label: "Жёлтый" },
      { rag: "green", key: "green_threshold", label: "Зелёный" },
    ];
    if (tile && tile.blue_threshold != null && String(tile.blue_threshold).trim()) {
      defs.push({ rag: "blue", key: "blue_threshold", label: "Синий" });
    }
    var items = defs
      .map(function (item) {
        var value = tile && tile[item.key] != null ? String(tile[item.key]).trim() : "";
        if (!value) return "";
        return (
          '<span class="kpi-tile-threshold-chip">' +
          '<span class="rag-dot rag-' +
          item.rag +
          '" aria-hidden="true"></span>' +
          '<span class="kpi-tile-threshold-chip-label">' +
          item.label +
          ':</span><span class="kpi-tile-threshold-chip-value">' +
          DashUi.escapeHtml(value) +
          "</span></span>"
        );
      })
      .filter(Boolean);
    return items.length
      ? items.join("")
      : '<span class="kpi-tile-back-message">Пороги для этого показателя не переданы.</span>';
  }

  function buildKpiTileChildrenHtml(state) {
    if (!state) return '<div class="kpi-tile-back-message">Нет данных.</div>';
    if (state.loading) {
      return (
        '<div class="kpi-tile-back-loading">' +
        '<span class="kpi-tile-back-loading-spinner" aria-hidden="true"></span>' +
        "<span>Загрузка дочерних отделов…</span>" +
        "</div>"
      );
    }
    if (state.rows && state.rows.length) {
      return (
        '<div class="kpi-tile-children-list">' +
        state.rows
          .map(function (row) {
            var ragClass = row.rag || "blue";
            return (
              '<a class="kpi-tile-child-item kpi-tile-child-link" tabindex="0" data-department="' +
              DashUi.escapeHtml(row.department) +
              '">' +
              '<span class="kpi-tile-child-dot rag-dot rag-' + ragClass + '"></span>' +
              '<span class="kpi-tile-child-name">' +
              DashUi.escapeHtml(DashUi.capitalizeHeaderTitle(row.department)) +
              "</span>" +
              '<span class="kpi-tile-child-value">' +
              DashUi.escapeHtml(row.kpiPct) +
              '</span>' +
              '<svg class="kpi-tile-child-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
              "</a>"
            );
          })
          .join("") +
        "</div>"
      );
    }
    return (
      '<div class="kpi-tile-back-message">' +
      DashUi.escapeHtml(state.hint || "Для этого показателя пока нет доступных дочерних отделов.") +
      "</div>"
    );
  }

  function buildKpiTileBackFaceHtml(tile, tileIndex) {
    var state = getKpiTileDetailsState(tileIndex);
    var pres = MockData.getKpiTilePresentation(tile);
    var percentLabel = MockData.formatKpiPercentLabel(pres.percent) + "%";
    var hint = tile && tile.hint != null ? String(tile.hint).trim() : "";
    var formulaRaw = tile && tile.formula != null ? String(tile.formula).trim() : "";
    var period = tile && tile.period != null ? String(tile.period).trim() : "";
    var code = tile && (tile.badge || tile.kpi_id) ? String(tile.badge || tile.kpi_id).trim() : "";
    var hasPf = DashUi.kpiTileHasPlanAndFact(tile);
    return (
      '<div class="kpi-tile-back-head">' +
      '<div class="kpi-tile-back-head-copy">' +
      (code ? '<span class="kpi-tile-back-badge">' + DashUi.escapeHtml(code) + "</span>" : "") +
      '<h3 class="kpi-tile-back-title">' +
      DashUi.escapeHtml(tile && tile.title ? tile.title : "Показатель") +
      "</h3>" +
      (period ? '<p class="kpi-tile-back-period">' + DashUi.escapeHtml(period) + "</p>" : "") +
      "</div>" +
      '<div class="kpi-tile-back-head-actions">' +
      buildKpiTileHelpButtonHtml() +
      '<button type="button" class="kpi-tile-flip-action" aria-label="Вернуться к карточке">Назад</button>' +
      "</div></div>" +
      '<div class="kpi-tile-back-summary">' +
      '<div class="kpi-tile-back-summary-item"><span class="kpi-tile-back-summary-label">KPI</span><strong>' +
      DashUi.escapeHtml(percentLabel) +
      "</strong></div>" +
      (hasPf
        ? '<div class="kpi-tile-back-summary-item"><span class="kpi-tile-back-summary-label">План / факт</span><strong>' +
          DashUi.escapeHtml(DashUi.formatKpiTilePlanFactValue(tile.plan)) +
          " / " +
          DashUi.escapeHtml(DashUi.formatKpiTilePlanFactValue(tile.fact)) +
          "</strong></div>"
        : "") +
      "</div>" +
      (hint ? '<p class="kpi-tile-back-hint">' + DashUi.escapeHtml(hint) + "</p>" : "") +
      '<div class="kpi-tile-back-section">' +
      '<div class="kpi-tile-back-section-title">Пороговые значения</div>' +
      '<div class="kpi-tile-threshold-chips">' +
      buildKpiTileThresholdSummaryHtml(tile) +
      "</div></div>" +
      (formulaRaw
        ? '<div class="kpi-tile-back-section"><div class="kpi-tile-back-section-title">Формула</div><div class="kpi-tile-back-formula" data-kpi-tile-formula="' +
          String(tileIndex) +
          '"></div></div>'
        : "") +
      '<div class="kpi-tile-back-section">' +
      '<div class="kpi-tile-back-section-title">Дочерние отделы</div>' +
      buildKpiTileChildrenHtml(state) +
      "</div>"
    );
  }

  function renderKpiTileBackFace(articleEl, tileIndex) {
    if (!articleEl || !lastKpiTiles || !lastKpiTiles[tileIndex]) return;
    var backFace = articleEl.querySelector(".kpi-tile-face--back");
    if (!backFace) return;
    var tile = lastKpiTiles[tileIndex];
    backFace.innerHTML = buildKpiTileBackFaceHtml(tile, tileIndex);
    var formulaEl = backFace.querySelector('[data-kpi-tile-formula="' + String(tileIndex) + '"]');
    if (formulaEl && tile.formula != null && String(tile.formula).trim()) {
      DashLatex.renderKpiThresholdsDialogFormula(formulaEl, String(tile.formula).trim());
    }
  }

  function syncKpiTileFlipState() {
    var articles = document.querySelectorAll("#kpi-container article.kpi-tile");
    articles.forEach(function (articleEl) {
      var idx = articleEl.getAttribute("data-kpi-tile-index");
      var i = idx != null ? +idx : NaN;
      var isActive = !isNaN(i) && flippedTileIndices.has(i);
      articleEl.classList.toggle("is-flipped", isActive);
      articleEl.setAttribute("aria-expanded", isActive ? "true" : "false");
      if (isActive) {
        renderKpiTileBackFace(articleEl, i);
      }
    });
  }

  /** Скрывает drilldown на карточке и legacy-панель, если она ещё есть в DOM. */
  function closeKpiTileDrilldown() {
    drilldownContextTile = null;
    flippedTileIndices.clear();
    hideKpiHelpPopover();
    var panel = document.getElementById("kpi-tile-drilldown");
    if (panel) panel.hidden = true;
    syncKpiTileFlipState();
  }

  function positionKpiDrilldownPanel() {}

  /**
   * Переход на дашборд выбранного дочернего отдела: крошки, вкладки, повторная загрузка KPI.
   * @param {string} deptName
   */
  /**
   * @param {string} deptName
   * @param {object|null|undefined} contextTile — плитка, с оборота которой кликнули дочерний отдел (если несколько открыты)
   */
  function navigateDashboardToDepartmentFromDrill(deptName, contextTile) {
    var d = deptName != null ? String(deptName).trim() : "";
    if (!d) return;
    var ctx = getDepartmentForCurrentKpiContext();
    if (d === ctx) {
      closeKpiTileDrilldown();
      return;
    }
    var focusTile = contextTile || drilldownContextTile;
    if (focusTile) {
      pendingKpiTileFocus = {
        kpi_id: focusTile.kpi_id != null ? String(focusTile.kpi_id) : "",
        title: focusTile.title != null ? String(focusTile.title) : "",
      };
    }
    hierarchyStack = hierarchyStack.concat([d]);
    selectedViewId = "dept:" + encodeURIComponent(d);
    viewContextUser = sessionUser;
    closeKpiTileDrilldown();
    if (session.apiMode === "mock") {
      renderViewTabs();
      updateTopBarForView();
      loadKpiTilesAndChartsForView();
      return;
    }
    refreshSubordinateTabsFromApi().then(function () {
      updateTopBarForView();
      loadKpiTilesAndChartsForView();
    });
  }

  function loadKpiTileDrilldownData(tileIndex) {
    if (!lastKpiTiles || !lastKpiTiles[tileIndex]) return;
    var clicked = lastKpiTiles[tileIndex];
    var state = getKpiTileDetailsState(tileIndex);
    if (state.loading || state.loaded) return;
    var parentDept = getDepartmentForCurrentKpiContext();
    var synonymGroup = findSynonymGroupForTileTitle(clicked.title || "");
    state.loading = true;
    state.loaded = false;
    state.rows = [];
    state.hint = "";
    renderKpiTileBackFace(
      document.querySelector(
        '#kpi-container article.kpi-tile[data-kpi-tile-index="' + String(tileIndex) + '"]'
      ),
      tileIndex
    );
    if (session.apiMode === "mock" || typeof Api === "undefined" || !Api.fetchImmediateSubordinates) {
      state.loading = false;
      state.loaded = true;
      state.hint =
        "Список дочерних отделов доступен в режиме API. В mock-режиме показана только информация по самой карточке.";
      renderKpiTileBackFace(
        document.querySelector(
          '#kpi-container article.kpi-tile[data-kpi-tile-index="' + String(tileIndex) + '"]'
        ),
        tileIndex
      );
      return;
    }
    if (!parentDept) {
      state.loading = false;
      state.loaded = true;
      state.hint = "В профиле не указано подразделение, поэтому список дочерних отделов недоступен.";
      renderKpiTileBackFace(
        document.querySelector(
          '#kpi-container article.kpi-tile[data-kpi-tile-index="' + String(tileIndex) + '"]'
        ),
        tileIndex
      );
      return;
    }
    Api.fetchImmediateSubordinates({ department: parentDept })
      .then(function (r) {
        if (r.unauthorized) {
          Auth.logout();
          window.location.href = "login.html";
          return;
        }
        var parentDeptNorm = String(parentDept).trim();
        var selfDeptNorm =
          sessionUser.department != null ? String(sessionUser.department).trim() : "";
        var childrenRaw = r.ok && Array.isArray(r.immediate_children) ? r.immediate_children : [];
        var children = childrenRaw
          .map(function (c) {
            return c != null ? String(c).trim() : "";
          })
          .filter(function (n) {
            return n && n !== parentDeptNorm && n !== selfDeptNorm;
          });
        if (!children.length) {
          state.loading = false;
          state.loaded = true;
          state.rows = [];
          state.hint = childrenRaw.length
            ? "В ответе API нет других дочерних отделов кроме текущего контекста."
            : "У этого подразделения нет дочерних отделов в ответе API.";
          renderKpiTileBackFace(
            document.querySelector(
              '#kpi-container article.kpi-tile[data-kpi-tile-index="' + String(tileIndex) + '"]'
            ),
            tileIndex
          );
          return;
        }
        return mapWithConcurrencyLimit(children, DRILLDOWN_FETCH_CONCURRENCY, function (childName) {
          return loadDrilldownTilesForDept(childName);
        }).then(function (results) {
          state.loading = false;
          state.loaded = true;
          state.rows = sortDrilldownRows(buildDrilldownRowsForChildrenOnly(results, clicked, synonymGroup));
          state.hint = children.length && state.rows.length === 0
            ? "Среди дочерних отделов нет данных по этому показателю или KPI не заполнен."
            : "";
          renderKpiTileBackFace(
            document.querySelector(
              '#kpi-container article.kpi-tile[data-kpi-tile-index="' + String(tileIndex) + '"]'
            ),
            tileIndex
          );
        });
      })
      .catch(function () {
        state.loading = false;
        state.loaded = true;
        state.rows = [];
        state.hint = "Не удалось загрузить список дочерних отделов.";
        renderKpiTileBackFace(
          document.querySelector(
            '#kpi-container article.kpi-tile[data-kpi-tile-index="' + String(tileIndex) + '"]'
          ),
          tileIndex
        );
      });
  }

  /**
   * Переворачивает KPI-карточку и загружает список дочерних отделов на обратную сторону.
   * @param {number} tileIndex — индекс в `lastKpiTiles` / `data-kpi-tile-index`
   */
  function openKpiTileDrilldown(tileIndex) {
    if (!lastKpiTiles || !lastKpiTiles[tileIndex]) return;
    if (flippedTileIndices.has(tileIndex)) {
      flippedTileIndices.delete(tileIndex);
      if (drilldownContextTile === lastKpiTiles[tileIndex]) {
        drilldownContextTile = null;
      }
      syncKpiTileFlipState();
      return;
    }
    drilldownContextTile = lastKpiTiles[tileIndex];
    flippedTileIndices.add(tileIndex);
    syncKpiTileFlipState();
    loadKpiTileDrilldownData(tileIndex);
    DashUi.scrollElementIntoViewCentered(
      document.querySelector(
        '#kpi-container article.kpi-tile[data-kpi-tile-index="' + String(tileIndex) + '"]'
      )
    );
  }

  /**
   * Заполняет tbody drilldown; навигационные строки получают `data-department` и role=link.
   * @param {object[]} rows
   * @param {HTMLTableSectionElement} tbody
   * @param {HTMLTableElement} table
   */
  function renderKpiDrilldownTableRows(rows, tbody, table) {
    tbody.innerHTML = "";
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      tr.className = "kpi-tile-drilldown-row";
      if (r.department) tr.setAttribute("data-department", r.department);
      if (r.isCurrentContext) tr.setAttribute("data-no-nav", "1");
      var td1 = document.createElement("td");
      td1.textContent = DashUi.capitalizeHeaderTitle(r.department);
      var td2 = document.createElement("td");
      td2.textContent = r.kpiPct;
      td2.className = "kpi-tile-drilldown-pct";
      var td3 = document.createElement("td");
      var dot = document.createElement("span");
      dot.className = "rag-dot rag-" + (r.rag || "blue");
      dot.title = r.rag || "";
      td3.appendChild(dot);
      tr.appendChild(td1);
      tr.appendChild(td2);
      tr.appendChild(td3);
      if (!r.isCurrentContext && r.department && r.department !== "—") {
        tr.classList.add("kpi-tile-drilldown-row--nav");
        tr.setAttribute("tabindex", "0");
        tr.setAttribute("role", "link");
        tr.setAttribute(
          "aria-label",
          "Открыть дашборд отдела «" + r.department + "»"
        );
      } else {
        tr.classList.add("kpi-tile-drilldown-row--static");
      }
      tbody.appendChild(tr);
    });
    table.hidden = rows.length === 0;
    positionKpiDrilldownPanel();
  }

  /* Однократная привязка: закрытие drilldown и переход по клику/Enter на строке отдела */
  var drillTbodyEl = document.getElementById("kpi-tile-drilldown-tbody");
  var drillCloseEl = document.getElementById("kpi-tile-drilldown-close");
  if (drillCloseEl) drillCloseEl.addEventListener("click", closeKpiTileDrilldown);
  if (drillTbodyEl) {
    drillTbodyEl.addEventListener("click", function (e) {
      var tr = e.target.closest("tr.kpi-tile-drilldown-row--nav");
      if (!tr || !drillTbodyEl.contains(tr)) return;
      var dept = tr.getAttribute("data-department");
      if (!dept) return;
      navigateDashboardToDepartmentFromDrill(dept);
    });
    drillTbodyEl.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var tr = e.target.closest("tr.kpi-tile-drilldown-row--nav");
      if (!tr || !drillTbodyEl.contains(tr)) return;
      e.preventDefault();
      var dept = tr.getAttribute("data-department");
      if (dept) navigateDashboardToDepartmentFromDrill(dept);
    });
  }

  /* ---------- Диалог порогов KPI (KaTeX: DashLatex) ---------- */

  /** Модальное окно: название KPI, формула, пороги green/yellow/red/blue. */
  function openKpiThresholdsDialog(tile) {
    var dlg = document.getElementById("kpi-thresholds-dialog");
    if (!dlg || !tile) return;
    var titleEl = document.getElementById("kpi-thresholds-dialog-title");
    var codeEl = document.getElementById("kpi-thresholds-dialog-code");
    var hintEl = document.getElementById("kpi-thresholds-dialog-hint");
    var formulaWrap = document.getElementById("kpi-thresholds-dialog-formula-wrap");
    var formulaEl = document.getElementById("kpi-thresholds-dialog-formula");
    var listEl = document.getElementById("kpi-thresholds-dialog-list");
    var emptyEl = document.getElementById("kpi-thresholds-dialog-empty");
    if (!titleEl || !listEl || !emptyEl) return;
    titleEl.textContent = tile.title || "Показатель";
    var code = (tile.badge || tile.kpi_id || "").trim();
    if (codeEl) {
      if (code) {
        codeEl.textContent = code;
        codeEl.hidden = false;
      } else {
        codeEl.hidden = true;
      }
    }
    if (hintEl) {
      var hint = tile.hint != null ? String(tile.hint).trim() : "";
      if (hint) {
        hintEl.textContent = hint;
        hintEl.hidden = false;
      } else {
        hintEl.hidden = true;
      }
    }
    var formulaRaw = tile.formula != null ? String(tile.formula).trim() : "";
    if (formulaWrap && formulaEl) {
      if (formulaRaw) {
        formulaWrap.hidden = false;
        DashLatex.renderKpiThresholdsDialogFormula(formulaEl, formulaRaw);
      } else {
        formulaWrap.hidden = true;
        formulaEl.textContent = "";
        formulaEl.className = "kpi-thresholds-dialog-formula";
      }
    }
    var defs = [
      { rag: "green", key: "green_threshold" },
      { rag: "yellow", key: "yellow_threshold" },
      { rag: "red", key: "red_threshold" },
    ];
    if (tile.blue_threshold != null && String(tile.blue_threshold).trim()) {
      defs.push({ rag: "blue", key: "blue_threshold" });
    }
    listEl.innerHTML = "";
    var any = false;
    var ariaRag = { green: "Зелёный", yellow: "Жёлтый", red: "Красный", blue: "Синий" };
    defs.forEach(function (d) {
      var v = tile[d.key];
      if (v == null || String(v).trim() === "") return;
      any = true;
      var li = document.createElement("li");
      li.className = "kpi-thresholds-dialog-row";
      li.setAttribute("aria-label", (ariaRag[d.rag] || d.rag) + ": " + String(v));
      var dot = document.createElement("span");
      dot.className = "rag-dot rag-" + d.rag;
      dot.setAttribute("aria-hidden", "true");
      var val = document.createElement("span");
      val.className = "kpi-thresholds-dialog-row-value";
      val.textContent = String(v);
      li.appendChild(dot);
      li.appendChild(val);
      listEl.appendChild(li);
    });
    var hasFormula = formulaRaw.length > 0;
    emptyEl.hidden = any || hasFormula;
    listEl.hidden = !any;
    if (typeof dlg.showModal === "function") {
      dlg.showModal();
    }
  }

  /* ---------- Разметка HTML KPI-плиток ---------- */

  var KPI_TILE_MSG_GENERATED_DATA = "Данные были сгенерированы";
  var KPI_TILE_TITLE_PLAN_FACT_PERIOD = "Период, за который показаны план и факт";
  var KPI_TILE_ARIA_METRICS_PF = "План и факт";

  /** Кнопка «?» — только на обороте плитки. */
  function buildKpiTileHelpButtonHtml() {
    return (
      '<button type="button" class="kpi-tile-help" aria-label="Справка: формула и цветовые пороги показателя" aria-haspopup="dialog" aria-controls="kpi-thresholds-dialog">' +
      '<span class="kpi-tile-help-icon" aria-hidden="true">?</span>' +
      "</button>"
    );
  }

  /** Верхняя строка плитки: бейдж kpi_id. */
  function buildKpiTileBadgeRowHtml(tile) {
    return (
      '<div class="kpi-tile-badge-row">' +
      '<span class="badge">' +
      DashUi.escapeHtml(tile.badge) +
      "</span></div>"
    );
  }

  /** Заголовок плитки, период и опционально подпись периода план/факт. */
  function buildKpiTileBodyHtml(tile, hasPf, pfPeriod) {
    var periodExtra =
      hasPf && pfPeriod
        ? '<span class="kpi-tile-plan-fact-period" title="' +
          DashUi.escapeHtml(KPI_TILE_TITLE_PLAN_FACT_PERIOD) +
          '">План/факт: ' +
          DashUi.escapeHtml(pfPeriod) +
          "</span>"
        : "";
    return (
      '<div class="tile-body">' +
      "<h3>" +
      DashUi.escapeHtml(tile.title) +
      "</h3>" +
      '<p class="period">' +
      DashUi.escapeHtml(tile.period) +
      periodExtra +
      "</p></div>"
    );
  }

  /** Две строки план/факт и при необходимости значок сгенерированных данных. */
  function buildKpiTilePlanFactStackHtml(planShown, factShown, planFactGenerated) {
    var pfStackClass = "kpi-tile-pf-stack" + (planFactGenerated ? " kpi-tile-pf-stack--generated" : "");
    var generatedFlag = planFactGenerated
      ? '<span class="kpi-tile-generated-flag" title="' +
        DashUi.escapeHtml(KPI_TILE_MSG_GENERATED_DATA) +
        '" role="img" aria-label="' +
        DashUi.escapeHtml(KPI_TILE_MSG_GENERATED_DATA) +
        '">!</span>'
      : "";
    return (
      '<div class="' +
      pfStackClass +
      '">' +
      generatedFlag +
      '<div class="kpi-tile-pf-line">' +
      '<span class="kpi-tile-pf-lbl">План</span>' +
      '<span class="kpi-tile-pf-val">' +
      DashUi.escapeHtml(planShown) +
      "</span></div>" +
      '<div class="kpi-tile-pf-line">' +
      '<span class="kpi-tile-pf-lbl">Факт</span>' +
      '<span class="kpi-tile-pf-val kpi-tile-pf-val-fact">' +
      DashUi.escapeHtml(factShown) +
      "</span></div></div>"
    );
  }

  /** Нижняя зона лицевой стороны: только план/факт (kpi_pct на лице не показываем). */
  function buildKpiTileMetricsSectionHtml(tile, hasPf, planShown, factShown) {
    if (!hasPf) return "";
    var planFactGenerated = tile.has_data === false;
    var inner = buildKpiTilePlanFactStackHtml(planShown, factShown, planFactGenerated);
    return (
      '<div class="kpi-tile-metrics kpi-tile-metrics--pf-only" aria-label="' +
      DashUi.escapeHtml(KPI_TILE_ARIA_METRICS_PF) +
      '">' +
      inner +
      "</div>"
    );
  }

  function buildKpiTileFrontFaceHtml(tile, hasPf, planShown, factShown, pfPeriod) {
    return (
      '<section class="kpi-tile-face kpi-tile-face--front">' +
      buildKpiTileBadgeRowHtml(tile) +
      buildKpiTileBodyHtml(tile, hasPf, pfPeriod) +
      buildKpiTileMetricsSectionHtml(tile, hasPf, planShown, factShown) +
      "</section>"
    );
  }

  /**
   * Рендерит KPI-плитки единой адаптивной сеткой; оборот карточки строится отдельно при flip.
   * @param {object[]} tiles
   */
  function renderKpiTiles(tiles) {
    lastKpiTiles = tiles && tiles.length ? tiles : null;
    const container = document.getElementById("kpi-container");
    container.innerHTML = "";
    flippedTileIndices.clear();
    kpiTileDetailsState = Object.create(null);
    var focusRef = pendingKpiTileFocus;
    var focusApplied = false;
    tiles.forEach(function (tile, i) {
      const el = document.createElement("article");
      var pres = MockData.getKpiTilePresentation(tile);
      el.className = "kpi-tile";
      el.style.setProperty("--tile-rag-color", pres.fillColor);
      el.setAttribute("tabindex", "0");
      el.setAttribute("aria-expanded", "false");
      if (focusRef && !focusApplied && tileMatchesFocusTarget(tile, focusRef)) {
        el.classList.add("kpi-tile--focus");
        el.setAttribute("aria-current", "true");
        focusApplied = true;
      }
      var hasPf = DashUi.kpiTileHasPlanAndFact(tile);
      var planShown = DashUi.formatKpiTilePlanFactValue(tile.plan);
      var factShown = DashUi.formatKpiTilePlanFactValue(tile.fact);
      var pfPeriod =
        tile.plan_fact_period_label != null
          ? String(tile.plan_fact_period_label).trim()
          : "";
      el.setAttribute("data-kpi-tile-index", String(i));
      if (!hasPf) {
        el.classList.add("kpi-tile--pct-only");
      }
      el.innerHTML =
        '<div class="kpi-tile-inner">' +
        buildKpiTileFrontFaceHtml(tile, hasPf, planShown, factShown, pfPeriod) +
        '<section class="kpi-tile-face kpi-tile-face--back"></section>' +
        "</div>";
      container.appendChild(el);
    });
    if (focusRef) {
      pendingKpiTileFocus = null;
      if (focusApplied) {
        var focusedEl = container.querySelector("article.kpi-tile--focus");
        DashUi.scrollElementIntoViewCentered(focusedEl);
        if (focusedEl) {
          setTimeout(function () {
            focusedEl.classList.remove("kpi-tile--focus");
            focusedEl.removeAttribute("aria-current");
          }, 4000);
        }
      }
    }
  }

  /* ---------- Таблица «План / факт» ---------- */

  /** Заголовки колонок таблицы план/факт (классический набор). */
  function setPlanFactTableHeaderClassic() {
    var title = document.getElementById("table-plan-fact-title");
    var head = document.getElementById("table-plan-fact-head");
    if (title) title.textContent = "План / факт / отклонения";
    if (head) {
      head.innerHTML =
        "<tr>" +
        "<th>KPI</th>" +
        "<th>Факт</th>" +
        "<th>План</th>" +
        "<th>RAG</th>" +
        "<th>Отклонение, %</th>" +
        "</tr>";
    }
  }

  /** DataTables для `#table-plan-fact`: данные из `lastApiTableRows` или MockData. */
  function initTables() {
    var role = viewContextUser.role;
    var rows = lastApiTableRows && lastApiTableRows.length
      ? lastApiTableRows
      : MockData.getPlanFactTable(role);
    setPlanFactTableHeaderClassic();
    var planRows = rows.map(function (r) {
      var dev = r.deviation != null ? r.deviation : DashUi.calcDeviation(r.fact, r.plan);
      return [
        DashUi.escapeHtml(r.kpi),
        DashUi.escapeHtml(DashUi.formatNumber(r.fact)),
        DashUi.escapeHtml(DashUi.formatNumber(r.plan)),
        DashUi.ragCell(r.rag),
        DashUi.escapeHtml(dev),
      ];
    });
    if ($.fn.DataTable.isDataTable("#table-plan-fact")) {
      $("#table-plan-fact").DataTable().destroy();
    }
    $("#table-plan-fact tbody").empty();
    planRows.forEach(function (row) {
      $("#table-plan-fact tbody").append("<tr><td>" + row.join("</td><td>") + "</td></tr>");
    });

    var dtRu = {
      decimal: ",",
      thousands: " ",
      processing: "Подождите…",
      search: "Поиск:",
      lengthMenu: "Показать _MENU_ записей",
      info: "Записи с _START_ по _END_ из _TOTAL_",
      infoEmpty: "Записи с 0 по 0 из 0",
      infoFiltered: "(отфильтровано из _MAX_)",
      loadingRecords: "Загрузка…",
      zeroRecords: "Нет данных",
      emptyTable: "Нет данных в таблице",
      paginate: { first: "«", previous: "‹", next: "›", last: "»" },
    };

    $("#table-plan-fact").DataTable({
      language: dtRu,
      pageLength: 8,
      ordering: true,
      order: [],
    });
  }

  /* ---------- Highcharts: линия, столбцы, пончики ---------- */

  function destroyAllDashboardCharts() {
    if (lineChartInstance) {
      lineChartInstance.destroy();
      lineChartInstance = null;
    }
    if (waterfallChartInstance) {
      waterfallChartInstance.destroy();
      waterfallChartInstance = null;
    }
    destroyDonutCharts();
  }

  /** Сообщение об отсутствии Highcharts во всех контейнерах графиков. */
  function showChartLoadError() {
    var msg =
      '<p class="chart-load-error" style="margin:0;padding:20px;color:#64748b;font-size:14px;">Графики недоступны: не загрузилась библиотека Highcharts (проверьте интернет или блокировку CDN).</p>';
    var ids = ["chart-line", "chart-bar", "donuts-grid"];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = msg;
    });
  }

  /** Плитка KPI по `indicator.id` === `kpi_id` (цвет маркеров линии). */
  function findTileForLineIndicator(indicator) {
    var tiles = lastKpiTiles;
    if (!tiles || !indicator) return null;
    var id = indicator.id != null ? String(indicator.id) : "";
    if (!id) return null;
    for (var i = 0; i < tiles.length; i++) {
      if (tiles[i].kpi_id != null && String(tiles[i].kpi_id) === id) return tiles[i];
    }
    return null;
  }

  /** Индекс ряда «план» по подписи (план / цель / норма). */
  function findPlanSeriesIndexForRag(series) {
    for (var i = 0; i < series.length; i++) {
      var n = String(series[i].name || "").toLowerCase();
      if (/\u043f\u043b\u0430\u043d|\u0446\u0435\u043b\u044c|\u043d\u043e\u0440\u043c\u0430/.test(n)) return i;
    }
    return -1;
  }

  /** Индекс ряда «факт» (по имени или как единственный не-план). */
  function findFactSeriesIndexForRag(series) {
    for (var i = 0; i < series.length; i++) {
      if (/факт/i.test(String(series[i].name || ""))) return i;
    }
    if (series.length === 1) return 0;
    var planIdx = findPlanSeriesIndexForRag(series);
    for (var j = 0; j < series.length; j++) {
      if (j === planIdx) continue;
      var n2 = String(series[j].name || "").toLowerCase();
      if (!/\u043f\u043b\u0430\u043d|\u0446\u0435\u043b\u044c|\u043d\u043e\u0440\u043c\u0430/.test(n2)) return j;
    }
    return 0;
  }

  /** Доля факта от плана в процентах для окраски маркера (или само factY). */
  function computeLinePointRagPercent(factY, planY) {
    if (typeof factY !== "number" || isNaN(factY)) return null;
    if (typeof planY === "number" && !isNaN(planY) && Math.abs(planY) > 1e-9) {
      return (factY / planY) * 100;
    }
    return factY;
  }

  /** Серии Highcharts для линии: на ряду «факт» — маркеры по порогам плитки. */
  function buildLineChartSeriesWithRagMarkers(indicator) {
    var series = indicator.series;
    if (!series || !series.length) return [];
    var tile = findTileForLineIndicator(indicator);
    var factIdx = findFactSeriesIndexForRag(series);
    var planIdx = findPlanSeriesIndexForRag(series);
    var planData = planIdx >= 0 ? series[planIdx].data : null;

    return series.map(function (s, idx) {
      var item = {
        type: "line",
        name: s.name,
        color: s.color,
        data: s.data.slice(),
      };
      if (s.dashStyle) item.dashStyle = s.dashStyle;

      if (idx !== factIdx) {
        item.marker = {
          enabled: true,
          radius: 3,
          lineWidth: 1,
          lineColor: s.color,
          fillColor: "#ffffff",
        };
        return item;
      }

      item.data = s.data.map(function (y, i) {
        var planVal = planData && planData[i] != null ? planData[i] : null;
        var pct = computeLinePointRagPercent(y, planVal);
        var fill = MockData.lineMarkerFillForPercent(tile, pct, s.color);
        return {
          y: y,
          marker: {
            enabled: true,
            radius: 5,
            lineWidth: 1,
            lineColor: "#ffffff",
            fillColor: fill,
          },
        };
      });
      item.marker = { enabled: true, radius: 5 };
      return item;
    });
  }

  /** Пересоздаёт линейный график для выбранного индикатора. */
  function renderLineChartForIndicator(indicator) {
    var titleEl = document.getElementById("line-chart-title");
    if (titleEl) titleEl.textContent = "Тренд: " + indicator.title;

    var elLine = document.getElementById("chart-line");
    if (!elLine || typeof Highcharts === "undefined") return;

    if (lineChartInstance) {
      lineChartInstance.destroy();
      lineChartInstance = null;
    }

    var pointsData = indicator.points || [];
    var chartClickHandler = function (e) {
      var pointIndex = e.point ? e.point.index : -1;
      if (pointIndex < 0 || !pointsData.length) return;
      var pt = pointsData[pointIndex];
      if (pt && pt.month && pt.year) {
        navigateToMonth(pt.month, pt.year);
      }
    };

    lineChartInstance = Highcharts.chart(elLine, {
      chart: { type: "line", backgroundColor: "transparent", height: 300 },
      title: { text: null },
      credits: { enabled: false },
      xAxis: {
        categories: indicator.categories.slice(),
        title: { text: indicator.xAxisTitle || "Период" },
        lineColor: "#cbd5e1",
      },
      yAxis: {
        title: { text: indicator.yAxisTitle || "Значение" },
        gridLineColor: "#f1f5f9",
      },
      legend: { align: "center", verticalAlign: "bottom" },
      tooltip: { shared: true },
      plotOptions: {
        line: {
          marker: { enabled: true, radius: 4 },
          lineWidth: 2,
          cursor: "pointer",
          point: { events: { click: chartClickHandler } },
        },
      },
      series: buildLineChartSeriesWithRagMarkers(indicator),
    });
  }

  /** Заполняет `#line-chart-metric`, первый показатель — по умолчанию. */
  function initLineChartMetricSelect(elLine) {
    var sel = document.getElementById("line-chart-metric");
    var label = document.querySelector(".line-chart-metric-label");
    if (!sel) return;

    sel.innerHTML = "";
    if (!lineChartIndicators.length) {
      sel.disabled = true;
      if (label) label.style.display = "none";
      if (elLine)
        elLine.innerHTML =
          '<p class="chart-load-error" style="margin:0;padding:20px;color:#64748b;font-size:14px;">Нет показателей для графика.</p>';
      return;
    }

    sel.disabled = false;
    if (label) label.style.display = "";

    lineChartIndicators.forEach(function (ind, idx) {
      var opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = ind.optionLabel || ind.title;
      sel.appendChild(opt);
    });

    sel.onchange = function () {
      var i = parseInt(sel.value, 10);
      if (!isNaN(i) && lineChartIndicators[i]) renderLineChartForIndicator(lineChartIndicators[i]);
    };

    renderLineChartForIndicator(lineChartIndicators[0]);
  }

  /** Столбчатый график план vs факт по кварталам/категориям индикатора. */
  function renderBarChartForIndicator(indicator) {
    var titleEl = document.getElementById("bar-chart-title");
    if (titleEl) titleEl.textContent = "План / факт: " + indicator.title;

    var elBar = document.getElementById("chart-bar");
    if (!elBar || typeof Highcharts === "undefined") return;

    var cats = indicator.categories;
    var plan = indicator.plan;
    var fact = indicator.fact;
    var n = cats ? cats.length : 0;
    if (!n || !plan || !fact || plan.length !== n || fact.length !== n) {
      elBar.innerHTML =
        '<p class="chart-load-error" style="margin:0;padding:20px;color:#64748b;font-size:14px;">Некорректные данные для графика.</p>';
      return;
    }

    if (waterfallChartInstance) {
      waterfallChartInstance.destroy();
      waterfallChartInstance = null;
    }

    var barPoints = indicator.points || [];
    var barClickHandler = function (e) {
      var pointIndex = e.point ? e.point.index : -1;
      if (pointIndex < 0 || !barPoints.length) return;
      var pt = barPoints[pointIndex];
      if (pt && pt.quarter && pt.year) {
        navigateToQuarter(pt.quarter, pt.year);
      }
    };

    waterfallChartInstance = Highcharts.chart(elBar, {
      chart: { type: "column", backgroundColor: "transparent", height: 300 },
      title: { text: null },
      credits: { enabled: false },
      xAxis: {
        categories: cats.slice(),
        title: { text: indicator.xAxisTitle || "Показатель" },
        lineColor: "#cbd5e1",
      },
      yAxis: {
        title: { text: indicator.yAxisTitle || "Значение" },
        gridLineColor: "#f1f5f9",
      },
      legend: { align: "center", verticalAlign: "bottom" },
      tooltip: { shared: true },
      plotOptions: {
        column: {
          grouping: true,
          borderRadius: 3,
          borderWidth: 0,
          cursor: "pointer",
          point: { events: { click: barClickHandler } },
        },
      },
      series: [
        {
          name: "План",
          data: plan.map(Number),
          color: "#c8d6ee",
        },
        {
          name: "Факт",
          data: fact.map(Number),
          color: "#2b5ca6",
        },
      ],
    });
  }

  /** Заполняет `#waterfall-chart-metric` для столбчатого графика. */
  function initBarMetricSelect(elBar) {
    var sel = document.getElementById("waterfall-chart-metric");
    var label = document.querySelector('label[for="waterfall-chart-metric"]');
    if (!sel) return;

    sel.innerHTML = "";
    if (!waterfallChartIndicators.length) {
      sel.disabled = true;
      if (label) label.style.display = "none";
      if (elBar)
        elBar.innerHTML =
          '<p class="chart-load-error" style="margin:0;padding:20px;color:#64748b;font-size:14px;">Нет показателей для графика.</p>';
      return;
    }

    sel.disabled = false;
    if (label) label.style.display = "";

    waterfallChartIndicators.forEach(function (ind, idx) {
      var opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = ind.optionLabel || ind.title;
      sel.appendChild(opt);
    });

    sel.onchange = function () {
      var i = parseInt(sel.value, 10);
      if (!isNaN(i) && waterfallChartIndicators[i]) renderBarChartForIndicator(waterfallChartIndicators[i]);
    };

    renderBarChartForIndicator(waterfallChartIndicators[0]);
  }

  /** Уничтожает все экземпляры pie/donut в сетке под плитками. */
  function destroyDonutCharts() {
    donutChartInstances.forEach(function (c) {
      if (c && typeof c.destroy === "function") c.destroy();
    });
    donutChartInstances = [];
  }

  /** По одному кольцевому графику на каждую текущую KPI-плитку (`lastKpiTiles`). */
  function renderDonutCharts() {
    var grid = document.getElementById("donuts-grid");
    if (!grid) return;
    grid.innerHTML = "";
    destroyDonutCharts();

    var tiles = lastKpiTiles;
    if (!tiles || !tiles.length || typeof Highcharts === "undefined") {
      grid.innerHTML =
        '<p style="margin:0;padding:20px;color:#64748b;font-size:14px;">Нет данных для диаграмм.</p>';
      return;
    }

    tiles.forEach(function (tile, idx) {
      var pres = MockData.getKpiTilePresentation(tile);
      var pct = pres.percent;
      var fill = pres.fillColor;
      var track = "#e2e8f0";

      var cell = document.createElement("div");
      cell.className = "donut-cell";
      var chartDiv = document.createElement("div");
      chartDiv.className = "donut-chart-container";
      chartDiv.id = "donut-chart-" + idx;
      var label = document.createElement("div");
      label.className = "donut-label";
      label.textContent = tile.title || tile.badge || "";
      label.title = tile.title || "";
      cell.appendChild(chartDiv);
      cell.appendChild(label);
      grid.appendChild(cell);

      var displayPct = Math.max(0, pct);
      var seriesData;
      if (displayPct >= 100) {
        var over = displayPct - 100;
        seriesData = [
          { name: "100%", y: 100, color: fill },
          { name: "Сверх 100%", y: over, color: Highcharts.color(fill).brighten(0.25).get() },
        ];
      } else {
        seriesData = [
          { name: "Показатель", y: displayPct, color: fill },
          { name: "До 100%", y: 100 - displayPct, color: track },
        ];
      }

      var pctLabel = MockData.formatKpiPercentLabel(pct) + "%";

      var chart = Highcharts.chart(chartDiv, {
        chart: { type: "pie", backgroundColor: "transparent", height: 120, margin: [0, 0, 0, 0], animation: false },
        title: {
          text: pctLabel,
          align: "center",
          verticalAlign: "middle",
          y: 2,
          style: { fontSize: "13px", fontWeight: "700", color: fill },
        },
        credits: { enabled: false },
        tooltip: { enabled: false },
        plotOptions: {
          pie: {
            innerSize: "70%",
            dataLabels: { enabled: false },
            states: { hover: { enabled: false } },
            borderWidth: 0,
            startAngle: 0,
            animation: false,
          },
        },
        series: [{ data: seriesData }],
      });
      donutChartInstances.push(chart);
    });
  }

  /**
   * Инициализация всех графиков: ru-локаль Highcharts, линия/бар из API или MockData, пончики.
   */
  function initCharts() {
    destroyAllDashboardCharts();

    if (typeof Highcharts === "undefined") {
      showChartLoadError();
      return;
    }

    var role = viewContextUser.role;

    Highcharts.setOptions({
      lang: {
        months: [
          "Январь",
          "Февраль",
          "Март",
          "Апрель",
          "Май",
          "Июнь",
          "Июль",
          "Август",
          "Сентябрь",
          "Октябрь",
          "Ноябрь",
          "Декабрь",
        ],
        shortMonths: ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"],
      },
      chart: {
        style: { fontFamily: "Segoe UI, system-ui, sans-serif" },
      },
    });

    var elLine = document.getElementById("chart-line");
    var elBar = document.getElementById("chart-bar");

    var ci = lastApiChartIndicators;
    var hasApiLine = ci && ci.line && ci.line.length > 0;
    var hasApiBar = ci && ci.bar && ci.bar.length > 0;

    lineChartIndicators = hasApiLine ? ci.line : MockData.getLineChartIndicators(role);
    initLineChartMetricSelect(elLine);

    waterfallChartIndicators = hasApiBar ? ci.bar : MockData.getWaterfallChartIndicators(role);
    initBarMetricSelect(elBar);

    renderDonutCharts();

    setTimeout(function () {
      if (!Highcharts.charts) return;
      Highcharts.charts.forEach(function (c) {
        if (c && typeof c.reflow === "function") c.reflow();
      });
    }, 100);
  }

  /** Два rAF: отрисовка графиков и таблицы после layout, чтобы ширины контейнеров были верны. */
  function bootChartsAndTables() {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        initCharts();
        initTables();
      });
    });
  }

  /**
   * @param {boolean} [includeSelf=true] — на корне иерархии добавляем «Мой дашборд»; во вложенных подразделениях — только дочерние вкладки.
   */
  function buildTargetsFromChildren(children, includeSelf) {
    var rest = (children || []).map(function (name) {
      var n = name != null ? String(name).trim() : "";
      var id = "dept:" + encodeURIComponent(n || "unknown");
      return {
        id: id,
        label: n.length ? n : "—",
        department: n,
        viewDepartment: n,
        user: sessionUser,
      };
    });
    if (includeSelf === false) return rest;
    var selfEntry = { id: "self", label: "Мой дашборд", user: sessionUser };
    return [selfEntry].concat(rest);
  }

  /** Хлебные крошки по `hierarchyStack` (скрыты в mock или на корне). */
  function renderHierarchyBreadcrumb() {
    var el = document.getElementById("dashboard-hierarchy-breadcrumb");
    if (!el) return;
    if (session.apiMode === "mock" || hierarchyStack.length <= 1) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    el.hidden = false;
    el.innerHTML = "";
    hierarchyStack.forEach(function (seg, i) {
      if (i > 0) {
        var sep = document.createElement("span");
        sep.className = "dash-hierarchy-sep";
        sep.textContent = " / ";
        sep.setAttribute("aria-hidden", "true");
        el.appendChild(sep);
      }
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dash-hierarchy-crumb";
      btn.textContent = DashUi.capitalizeHeaderTitle(String(seg));
      (function (idx) {
        btn.addEventListener("click", function () {
          hierarchyStack = hierarchyStack.slice(0, idx + 1);
          if (idx === 0) {
            selectedViewId = "self";
          } else {
            var parent = hierarchyStack[hierarchyStack.length - 1];
            selectedViewId = "dept:" + encodeURIComponent(parent);
          }
          viewContextUser = sessionUser;
          refreshSubordinateTabsFromApi().then(function () {
            updateTopBarForView();
            loadKpiTilesAndChartsForView();
          });
        });
      })(i);
      el.appendChild(btn);
    });
  }

  /** Перезагружает `viewTargets` по `Api.fetchImmediateSubordinates` для текущего родителя в стеке. */
  function refreshSubordinateTabsFromApi() {
    return new Promise(function (resolve) {
      if (session.apiMode === "mock") {
        resolve();
        return;
      }
      if (!hierarchyStack.length || typeof Api === "undefined" || typeof Api.fetchImmediateSubordinates !== "function") {
        viewTargets = [{ id: "self", label: "Мой дашборд", user: sessionUser }];
        renderViewTabs();
        renderHierarchyBreadcrumb();
        resolve();
        return;
      }
      var parent = hierarchyStack[hierarchyStack.length - 1];
      Api.fetchImmediateSubordinates({ department: parent })
        .then(function (r) {
          if (r.unauthorized) {
            Auth.logout();
            window.location.href = "login.html";
            return;
          }
          var atRoot = hierarchyStack.length <= 1;
          if (r.ok && r.immediate_children && r.immediate_children.length) {
            viewTargets = buildTargetsFromChildren(r.immediate_children, atRoot);
          } else {
            viewTargets = atRoot
              ? [{ id: "self", label: "Мой дашборд", user: sessionUser }]
              : [];
          }
          renderViewTabs();
          renderHierarchyBreadcrumb();
          resolve();
        })
        .catch(function () {
          viewTargets =
            hierarchyStack.length <= 1
              ? [{ id: "self", label: "Мой дашборд", user: sessionUser }]
              : [];
          renderViewTabs();
          renderHierarchyBreadcrumb();
          resolve();
        });
    });
  }

  /**
   * Первичная загрузка вкладок: mock — из MockData; live — дети отдела пользователя.
   * @returns {Promise<Array<{id:string,label:string,user:object,department?:string}>>}
   */
  function loadViewTargets() {
    return new Promise(function (resolve) {
      hierarchyStack = [];
      if (session.apiMode === "mock") {
        resolve(MockData.getViewableDashboardTargets(sessionUser));
        return;
      }
      var rootDept = sessionUser.department != null ? String(sessionUser.department).trim() : "";
      if (!rootDept) {
        resolve([{ id: "self", label: "Мой дашборд", user: sessionUser }]);
        return;
      }
      if (typeof Api === "undefined" || typeof Api.fetchImmediateSubordinates !== "function") {
        resolve([{ id: "self", label: "Мой дашборд", user: sessionUser }]);
        return;
      }
      Api.fetchImmediateSubordinates({ department: rootDept })
        .then(function (r) {
          if (r.unauthorized) {
            Auth.logout();
            window.location.href = "login.html";
            return;
          }
          if (r.ok && r.immediate_children && r.immediate_children.length) {
            hierarchyStack = [rootDept];
            resolve(buildTargetsFromChildren(r.immediate_children));
          } else {
            resolve([{ id: "self", label: "Мой дашборд", user: sessionUser }]);
          }
        })
        .catch(function () {
          resolve([{ id: "self", label: "Мой дашборд", user: sessionUser }]);
        });
    });
  }

  /** Вкладки `viewTargets` + переключение вида и перезагрузка KPI. */
  function renderViewTabs() {
    var nav = document.getElementById("dashboard-view-tabs");
    if (!nav) return;
    nav.innerHTML = "";
    var onlySelf =
      viewTargets &&
      viewTargets.length === 1 &&
      viewTargets[0].id === "self";
    if (!viewTargets || viewTargets.length === 0 || onlySelf) {
      nav.hidden = true;
      renderHierarchyBreadcrumb();
      return;
    }
    nav.hidden = false;
    var inner = document.createElement("div");
    inner.className = "dash-view-tabs-inner";
    viewTargets.forEach(function (t) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dash-view-tab";
      btn.setAttribute("role", "tab");
      btn.setAttribute("data-target-id", t.id);
      btn.setAttribute("aria-selected", t.id === selectedViewId ? "true" : "false");
      var span = document.createElement("span");
      span.className = "dash-view-tab-text";
      span.textContent =
        t.label != null && String(t.label).trim()
          ? DashUi.capitalizeHeaderTitle(String(t.label).trim())
          : t.label || t.id;
      btn.appendChild(span);
      btn.addEventListener("click", function () {
        if (selectedViewId === t.id) return;
        selectedViewId = t.id;
        viewContextUser = t.user;
        if (t.id === "self") {
          if (sessionUser.department) {
            hierarchyStack = [String(sessionUser.department).trim()];
          } else {
            hierarchyStack = [];
          }
        } else {
          hierarchyStack.push(t.department);
        }
        if (session.apiMode === "mock") {
          inner.querySelectorAll(".dash-view-tab").forEach(function (b) {
            b.setAttribute("aria-selected", b.getAttribute("data-target-id") === selectedViewId ? "true" : "false");
          });
          updateTopBarForView();
          loadKpiTilesAndChartsForView();
          return;
        }
        refreshSubordinateTabsFromApi().then(function () {
          updateTopBarForView();
          loadKpiTilesAndChartsForView();
        });
      });
      inner.appendChild(btn);
    });
    nav.appendChild(inner);
    renderHierarchyBreadcrumb();
  }

  /** Показ спиннера, скрытие основного контента. */
  function showLoading() {
    var loader = document.getElementById("dash-loading");
    var content = document.getElementById("dash-content");
    if (loader) loader.hidden = false;
    if (content) content.hidden = true;
  }

  /** Скрытие спиннера, показ контента. */
  function hideLoading() {
    var loader = document.getElementById("dash-loading");
    var content = document.getElementById("dash-content");
    if (loader) loader.hidden = true;
    if (content) content.hidden = false;
  }

  /**
   * Общий разбор успешного/ошибочного ответа KPI: плитки, кэш drilldown, графики, шапка.
   * @param {object} result — как от `Api.fetchKpis` / `fetchKpiAll`
   * @param {string} [_source] — зарезервировано для логирования источника вызова
   */
  function applyApiResult(result, _source) {
    closeKpiTileDrilldown();
    var elHint = document.getElementById("dash-user-hint");
    if (elHint) elHint.removeAttribute("title");
    if (result.unauthorized) {
      Auth.logout();
      window.location.href = "login.html";
      return;
    }
    if (result.ok && result.data) {
      var dep = result.data.department;
      lastKpiResponseDepartment =
        dep != null && String(dep).trim() ? String(dep).trim() : null;
    }
    lastApiChartIndicators = result.chartIndicators || null;
    lastApiTableRows = result.tableRows || null;

    setAvailableMonthsFromChartPoints(lastApiChartIndicators);

    var data = result.ok && result.data ? result.data : null;
    var respMonth = data && data.month != null ? Number(data.month) : null;
    var respYear = data && data.year != null ? Number(data.year) : null;
    if (respMonth != null && isNaN(respMonth)) respMonth = null;
    if (respYear != null && isNaN(respYear)) respYear = null;

    var respInSlots =
      respMonth != null &&
      respYear != null &&
      respMonth >= 1 &&
      respMonth <= 12 &&
      periodKeyInAvailableMonths(respYear, respMonth, availableMonths);

    var curInSlots =
      currentPeriodMonth != null &&
      currentPeriodYear != null &&
      periodKeyInAvailableMonths(currentPeriodYear, currentPeriodMonth, availableMonths);

    if (curInSlots) {
      /* оставляем выбор пользователя после смены месяца стрелками */
    } else if (respInSlots) {
      currentPeriodMonth = respMonth;
      currentPeriodYear = respYear;
    } else if (availableMonths.length) {
      var lastSlot = availableMonths[availableMonths.length - 1];
      currentPeriodMonth = lastSlot.month;
      currentPeriodYear = lastSlot.year;
    } else if (respMonth != null && respYear != null) {
      currentPeriodMonth = respMonth;
      currentPeriodYear = respYear;
    } else {
      currentPeriodMonth = null;
      currentPeriodYear = null;
    }

    updateMonthNavigatorUI();

    var role = viewContextUser.role;
    if (result.ok && result.tiles && result.tiles.length > 0) {
      var cacheKey =
        result.data &&
        result.data.department != null &&
        String(result.data.department).trim()
          ? String(result.data.department).trim()
          : getDepartmentForCurrentKpiContext();
      if (cacheKey) rememberDrilldownKpiTiles(cacheKey, result.tiles.slice());
      renderKpiTiles(result.tiles);
    } else {
      renderKpiTiles(MockData.getKpiTilesForRole(role));
    }
    bootChartsAndTables();
    hideLoading();
    updateTopBarForView();
  }

  /**
   * Главная загрузка данных экрана: «свой» дашборд (`fetchKpis`) или подразделение (`fetchKpiAll`).
   * При ошибке или mock — fallback на `MockData`.
   */
  function loadKpiTilesAndChartsForView() {
    closeKpiTileDrilldown();
    showLoading();
    var isSelf = selectedViewId === "self";
    var role = viewContextUser.role;
    var elHint = document.getElementById("dash-user-hint");
    var fallback = function () {
      lastApiChartIndicators = null;
      lastApiTableRows = null;
      lastKpiResponseDepartment = null;
      setAvailableMonthsFromChartPoints(null);
      currentPeriodMonth = null;
      currentPeriodYear = null;
      updateMonthNavigatorUI();
      renderKpiTiles(MockData.getKpiTilesForRole(role));
      bootChartsAndTables();
      hideLoading();
      updateTopBarForView();
    };
    var periodOpts = {};
    if (currentPeriodMonth != null) periodOpts.month = currentPeriodMonth;
    if (currentPeriodYear != null) periodOpts.year = currentPeriodYear;

    if (!isSelf) {
      if (session.apiMode === "mock") {
        pushDashboardDebugNote("UI (mock)", "Подчинённый вид — запросы KPI не выполняются");
        fallback();
        return;
      }
      var subDept = getDepartmentForCurrentKpiContext();
      if (subDept && typeof Api !== "undefined" && typeof Api.fetchKpiAll === "function") {
        var allOpts = { department: subDept };
        if (periodOpts.month != null) allOpts.month = periodOpts.month;
        if (periodOpts.year != null) allOpts.year = periodOpts.year;
        Api.fetchKpiAll(allOpts)
          .then(function (result) {
            if (result.unauthorized) {
              applyApiResult(result, "Api.fetchKpiAll({department})");
              return;
            }
            if (!result.ok) {
              var msg =
                result.status === 403
                  ? "Нет доступа к этому подразделению (403)."
                  : result.status === 404
                    ? "Подразделение не найдено (404)."
                    : result.error || "Ошибка загрузки KPI подразделения.";
              if (elHint) elHint.setAttribute("title", msg);
              fallback();
              return;
            }
            applyApiResult(result, "Api.fetchKpiAll({department: \"" + subDept + "\"})");
          })
          .catch(function () {
            fallback();
          });
        return;
      }
      fallback();
      return;
    }
    if (session.apiMode === "mock" || typeof Api === "undefined" || typeof Api.fetchKpis !== "function") {
      pushDashboardDebugNote("UI (mock)", "mock или Api недоступен — KPI не запрашивались");
      fallback();
      return;
    }
    var selfDept = getDepartmentForCurrentKpiContext();
    var fetchSelf =
      selfDept && typeof Api.fetchKpis === "function"
        ? function () {
            var opts = { department: selfDept };
            if (periodOpts.month != null) opts.month = periodOpts.month;
            if (periodOpts.year != null) opts.year = periodOpts.year;
            return Api.fetchKpis(opts);
          }
        : function () {
            return Api.fetchKpis(periodOpts);
          };
    fetchSelf()
      .then(function (result) {
        applyApiResult(
          result,
          selfDept ? "Api.fetchKpis({department: \"" + selfDept + "\"})" : "Api.fetchKpis()"
        );
      })
      .catch(function () {
        fallback();
      });
  }

  loadViewTargets().then(function (targets) {
    viewTargets = targets && targets.length ? targets : [{ id: "self", label: "Мой дашборд", user: sessionUser }];
    selectedViewId = viewTargets[0].id;
    viewContextUser = viewTargets[0].user;
    renderViewTabs();
    updateTopBarForView();
    DashDebug.renderDebugJsonLogPanel();
    loadKpiTilesAndChartsForView();
  });
})();
