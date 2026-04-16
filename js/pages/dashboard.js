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
    if (DashDebug && typeof DashDebug.scheduleRenderDebugJsonLogPanel === "function") {
      DashDebug.scheduleRenderDebugJsonLogPanel();
    } else {
      DashDebug.renderDebugJsonLogPanel();
    }
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
  var CHART_SELECT_ALL_VALUE = "__all__";

  var waterfallChartInstance = null;
  var waterfallChartIndicators = [];

  var donutChartInstances = [];
  var deferredChartsAndTablesBootToken = 0;

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
  var claimsTableHelpBtnEl = document.getElementById("claims-table-help-btn");
  var claimsTableHelpPopoverEl = document.getElementById("claims-table-help-popover");
  var dashSidebarBackBtnEl = document.getElementById("dash-sidebar-back-btn");
  var dashSidebarSearchInputEl = document.getElementById("dash-sidebar-search-input");
  var dashSidebarSearchEmptyEl = document.getElementById("dash-sidebar-search-empty");
  var sidebarSearchQuery = "";
  var sidebarSearchRequestSeq = 0;
  var sidebarSearchLoading = false;
  var sidebarSearchError = "";
  var sidebarSearchResults = [];

  /** Пагинация плиток KPI: не более 6 на экране (3 колонки × 2 ряда) */
  var KPI_TILES_PER_PAGE = 6;
  var kpiTilesPageIndex = 0;
  var DONUT_CHARTS_PER_PAGE = 6;
  var donutChartsPageIndex = 0;

  /* ---------- Навигация по месяцам ---------- */

  var MONTH_NAMES_RU = [
    "", "январь", "февраль", "март", "апрель", "май", "июнь",
    "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"
  ];
  var currentPeriodMonth = null;
  var currentPeriodYear = null;
  var availableMonths = [];
  var availableMonthsContextKey = "";

  /** Для навигации по месяцам: значение плана/факта считается заданным (как в api.js). */
  function navPlanFactValuePresent(v) {
    if (v === undefined || v === null) return false;
    if (typeof v === "number") return !isNaN(v);
    if (typeof v === "string") return String(v).trim() !== "";
    return true;
  }

  /** Точка линейного графика годится для переключателя, если в ней есть календарный месяц и хотя бы одно значение. */
  function navPointHasPeriodValue(pt) {
    if (!pt) return false;
    var key = monthYearKey(pt.year, pt.month);
    if (key < 0) return false;
    return navPlanFactValuePresent(pt.fact) || navPlanFactValuePresent(pt.plan);
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

  function mergeAvailableMonthSlots(baseSlots, nextSlots) {
    var merged = [];
    var seen = Object.create(null);
    function pushSlot(slot) {
      if (!slot || slot.key == null || seen[slot.key]) return;
      seen[slot.key] = true;
      merged.push({
        month: slot.month,
        year: slot.year,
        key: slot.key,
      });
    }
    (baseSlots || []).forEach(pushSlot);
    (nextSlots || []).forEach(pushSlot);
    merged.sort(function (a, b) {
      return a.key - b.key;
    });
    return merged;
  }

  function getMonthNavigatorContextKey() {
    var viewId = selectedViewId != null ? String(selectedViewId) : "";
    var dept = getDepartmentForCurrentKpiContext();
    var nick =
      viewContextUser && viewContextUser.nickname != null
        ? String(viewContextUser.nickname).trim()
        : "";
    return [viewId, dept, nick].join("|");
  }

  /**
   * Месяцы для стрелок навигатора: уникальные (год, месяц) из линейных графиков.
   * В новом JSON у месячной линии часто есть только `fact`, поэтому достаточно любого осмысленного значения в точке.
   */
  function setAvailableMonthsFromChartPoints(chartIndicators, options) {
    options = options || {};
    var nextMonths = [];
    if (!chartIndicators) return;
    var lines = chartIndicators.line || [];
    for (var li = 0; li < lines.length; li++) {
      var pts = lines[li].points;
      if (!pts) continue;
      for (var pi = 0; pi < pts.length; pi++) {
        var pt = pts[pi];
        if (!navPointHasPeriodValue(pt)) continue;
        var key = monthYearKey(pt.year, pt.month);
        if (key < 0) continue;
        var exists = false;
        for (var ei = 0; ei < nextMonths.length; ei++) {
          if (nextMonths[ei] && nextMonths[ei].key === key) {
            exists = true;
            break;
          }
        }
        if (!exists) {
          nextMonths.push({
            month: parseInt(String(pt.month), 10),
            year: parseInt(String(pt.year), 10),
            key: key,
          });
        }
      }
    }
    availableMonths = options.preserveExisting
      ? mergeAvailableMonthSlots(availableMonths, nextMonths)
      : nextMonths;
    availableMonthsContextKey =
      options.contextKey != null ? String(options.contextKey) : availableMonthsContextKey;
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

  (function initKpiTilesPager() {
    var prevBtn = document.getElementById("kpi-tiles-page-prev");
    var nextBtn = document.getElementById("kpi-tiles-page-next");
    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        if (kpiTilesPageIndex <= 0) return;
        closeKpiTileDrilldown();
        kpiTilesPageIndex--;
        updateKpiTilesPagerUI();
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        var n = lastKpiTiles ? lastKpiTiles.length : 0;
        var pages = Math.max(1, Math.ceil(n / KPI_TILES_PER_PAGE));
        if (kpiTilesPageIndex >= pages - 1) return;
        closeKpiTileDrilldown();
        kpiTilesPageIndex++;
        updateKpiTilesPagerUI();
      });
    }
  })();

  (function initDonutChartsPager() {
    var prevBtn = document.getElementById("donut-charts-page-prev");
    var nextBtn = document.getElementById("donut-charts-page-next");
    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        if (donutChartsPageIndex <= 0) return;
        donutChartsPageIndex--;
        renderDonutCharts();
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        var n = lastKpiTiles ? lastKpiTiles.length : 0;
        var pages = Math.max(1, Math.ceil(n / DONUT_CHARTS_PER_PAGE));
        if (donutChartsPageIndex >= pages - 1) return;
        donutChartsPageIndex++;
        renderDonutCharts();
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

  /** Контейнер плиток KPI: `?` на обороте открывает модалку; клик по карточке — flip, по дочернему отделу — переход. */
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
   * Ищет текущую KPI-плитку по `kpi_id` индикатора графика.
   * @param {object} indicator
   * @returns {object|null}
   */
  function findCurrentTileForIndicator(indicator) {
    var tiles = lastKpiTiles;
    if (!tiles || !indicator || indicator.id == null) return null;
    var id = String(indicator.id);
    for (var i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      if (!t || t.kpi_id == null) continue;
      if (String(t.kpi_id) === id) return t;
    }
    return null;
  }

  /**
   * Подпись `kpi_pct` для tooltip столбчатой диаграммы.
   * Приоритет: 1) у точки графика, 2) у текущей KPI-плитки.
   * @param {object} indicator
   * @param {number} pointIndex
   * @returns {string}
   */
  function getBarChartKpiPctLabel(indicator, pointIndex) {
    var pt =
      indicator &&
      indicator.points &&
      typeof pointIndex === "number" &&
      pointIndex >= 0 &&
      pointIndex < indicator.points.length
        ? indicator.points[pointIndex]
        : null;
    var pct =
      pt && typeof pt.kpi_pct === "number" && !isNaN(pt.kpi_pct)
        ? pt.kpi_pct
        : pt && typeof pt.kpi_pst === "number" && !isNaN(pt.kpi_pst)
          ? pt.kpi_pst
          : null;
    if (pct == null) {
      var tile = findCurrentTileForIndicator(indicator);
      if (tile) {
        var pres = MockData.getKpiTilePresentation(tile);
        pct =
          tile.kpi_pct != null && typeof tile.kpi_pct === "number" && !isNaN(tile.kpi_pct)
            ? tile.kpi_pct
            : tile.kpi_pst != null && typeof tile.kpi_pst === "number" && !isNaN(tile.kpi_pst)
              ? tile.kpi_pst
              : pres.percent;
      }
    }
    return pct == null ? "—" : MockData.formatKpiPercentLabel(pct) + "%";
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

  /* ---------- KPI-card drilldown: flip-card с детьми; пороги — в модалке по «?» ---------- */

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

  function hideKpiHelpPopover() {
    if (!kpiHelpPopoverEl) return;
    kpiHelpPopoverEl.hidden = true;
  }

  function updateSidebarBackButton() {
    if (!dashSidebarBackBtnEl) return;
    dashSidebarBackBtnEl.hidden = session.apiMode === "mock" || hierarchyStack.length <= 1;
  }

  function normalizeSidebarSearchText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function updateSidebarSearchEmptyState(hasVisibleTargets) {
    if (!dashSidebarSearchEmptyEl) return;
    var q = normalizeSidebarSearchText(sidebarSearchQuery);
    var shouldShow = q.length > 0;
    var message = "";
    if (!shouldShow) {
      dashSidebarSearchEmptyEl.hidden = true;
      dashSidebarSearchEmptyEl.textContent = "";
      return;
    }
    if (sidebarSearchLoading) {
      message = "Поиск...";
    } else if (sidebarSearchError) {
      message = sidebarSearchError;
    } else if (!hasVisibleTargets) {
      message = "Ничего не найдено";
    }
    dashSidebarSearchEmptyEl.textContent = message;
    dashSidebarSearchEmptyEl.hidden = !message;
  }

  function normalizeSidebarSearchResults(result) {
    if (!result) return [];
    if (Array.isArray(result)) return result.slice();
    if (Array.isArray(result.results)) return result.results.slice();
    if (Array.isArray(result.items)) return result.items.slice();
    if (Array.isArray(result.data)) return result.data.slice();
    return [];
  }

  function normalizeSidebarSearchPath(value) {
    if (Array.isArray(value)) {
      return value
        .map(function (part) {
          return part != null ? String(part).trim() : "";
        })
        .filter(Boolean);
    }
    if (value && typeof value === "object") {
      if (Array.isArray(value.path)) return normalizeSidebarSearchPath(value.path);
      if (Array.isArray(value.hierarchy)) return normalizeSidebarSearchPath(value.hierarchy);
      if (Array.isArray(value.breadcrumbs)) return normalizeSidebarSearchPath(value.breadcrumbs);
    }
    if (value == null) return [];
    var text = String(value).trim();
    if (!text) return [];
    if (text.indexOf("/") !== -1 || text.indexOf(">") !== -1 || text.indexOf("→") !== -1 || text.indexOf("|") !== -1) {
      return text
        .split(/\s*(?:\/|>|→|\|)\s*/)
        .map(function (part) {
          return part != null ? String(part).trim() : "";
        })
        .filter(Boolean);
    }
    return [text];
  }

  function buildSidebarSearchHierarchy(item) {
    if (!item) return [];
    var hierarchy =
      normalizeSidebarSearchPath(item.path || item.hierarchy || item.breadcrumbs || item.full_path || item.fullPath);
    if (!hierarchy.length && item.department != null && String(item.department).trim() !== "") {
      hierarchy = [String(item.department).trim()];
    }
    if (!hierarchy.length && item.viewDepartment != null && String(item.viewDepartment).trim() !== "") {
      hierarchy = [String(item.viewDepartment).trim()];
    }
    return hierarchy;
  }

  function clearSidebarSearchState() {
    sidebarSearchQuery = "";
    sidebarSearchResults = [];
    sidebarSearchLoading = false;
    sidebarSearchError = "";
    sidebarSearchRequestSeq++;
    if (dashSidebarSearchInputEl) dashSidebarSearchInputEl.value = "";
  }

  function activateSidebarSearchResult(item) {
    var hierarchy = buildSidebarSearchHierarchy(item);
    if (!hierarchy.length) return;
    var dept = hierarchy[hierarchy.length - 1];
    selectedViewId = item && item.id != null && String(item.id).trim() ? String(item.id).trim() : "search:" + encodeURIComponent(dept);
    viewContextUser = item && item.user ? item.user : sessionUser;
    hierarchyStack = hierarchy.slice();
    clearSidebarSearchState();
    renderViewTabs();
    refreshSubordinateTabsFromApi().then(function () {
      updateTopBarForView();
      loadKpiTilesAndChartsForView();
    });
  }

  function renderSidebarSearchResults(results) {
    var nav = document.getElementById("dashboard-view-tabs");
    if (!nav) return;
    var q = normalizeSidebarSearchText(sidebarSearchQuery);
    if (!q) {
      updateSidebarSearchEmptyState(true);
      return;
    }
    if (sidebarSearchLoading) {
      nav.innerHTML = "";
      nav.hidden = false;
      updateSidebarSearchEmptyState(false);
      return;
    }
    var list = Array.isArray(results) ? results.slice() : [];
    nav.innerHTML = "";
    if (!list.length) {
      nav.hidden = true;
      updateSidebarSearchEmptyState(false);
      return;
    }
    nav.hidden = false;
    var inner = document.createElement("div");
    inner.className = "dash-view-tabs-inner";
    var hasVisible = false;
    list.forEach(function (item) {
      if (!item) return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dash-view-tab";
      btn.setAttribute("role", "tab");
      btn.setAttribute("data-target-id", item.id);
      btn.setAttribute("aria-selected", "false");
      var span = document.createElement("span");
      span.className = "dash-view-tab-text";
      span.textContent =
        item.label != null && String(item.label).trim()
          ? DashUi.capitalizeHeaderTitle(String(item.label).trim())
          : item.department || item.viewDepartment || item.id;
      btn.appendChild(span);
      btn.addEventListener("click", function () {
        activateSidebarSearchResult(item);
      });
      inner.appendChild(btn);
      hasVisible = true;
    });
    nav.appendChild(inner);
    updateSidebarSearchEmptyState(hasVisible);
  }

  function filterSidebarViewTabs() {
    renderSidebarSearchResults(sidebarSearchResults);
  }

  function resetSidebarSearch() {
    clearSidebarSearchState();
    updateSidebarSearchEmptyState(true);
    renderViewTabs();
  }

  function onSidebarSearchInput(value) {
    sidebarSearchQuery = value != null ? String(value) : "";
    var q = normalizeSidebarSearchText(sidebarSearchQuery);
    if (!q) {
      sidebarSearchResults = [];
      sidebarSearchLoading = false;
      sidebarSearchError = "";
      sidebarSearchRequestSeq++;
      renderViewTabs();
      return;
    }
    sidebarSearchLoading = true;
    sidebarSearchError = "";
    renderSidebarSearchResults(sidebarSearchResults);
    var seq = ++sidebarSearchRequestSeq;
    if (session.apiMode === "mock") {
      sidebarSearchLoading = false;
      sidebarSearchResults = [];
      sidebarSearchError = "";
      renderSidebarSearchResults([]);
      return;
    }
    if (typeof Api === "undefined" || typeof Api.searchDepartments !== "function") {
      sidebarSearchLoading = false;
      sidebarSearchError = "Поиск недоступен";
      renderSidebarSearchResults([]);
      return;
    }
    Api.searchDepartments({ q: q, top_k: 5 }).then(function (result) {
      if (seq !== sidebarSearchRequestSeq) return;
      sidebarSearchLoading = false;
      if (!result || result.unauthorized) {
        sidebarSearchError = "Требуется повторный вход";
        sidebarSearchResults = [];
        renderSidebarSearchResults([]);
        return;
      }
      if (!result.ok) {
        sidebarSearchError = result.error || "Ошибка поиска";
        sidebarSearchResults = [];
        renderSidebarSearchResults([]);
        return;
      }
      sidebarSearchError = "";
      sidebarSearchResults = normalizeSidebarSearchResults(result.results);
      renderSidebarSearchResults(sidebarSearchResults);
    });
  }

  if (dashSidebarSearchInputEl) {
    dashSidebarSearchInputEl.addEventListener("input", function (e) {
      onSidebarSearchInput(e.target.value);
    });
  }

  function navigateToHierarchyLevel(levelIndex) {
    if (levelIndex < 0 || levelIndex >= hierarchyStack.length) return;
    hierarchyStack = hierarchyStack.slice(0, levelIndex + 1);
    if (levelIndex === 0) {
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
  }

  function hideClaimsTableHelpPopover() {
    if (!claimsTableHelpPopoverEl) return;
    claimsTableHelpPopoverEl.hidden = true;
    if (claimsTableHelpBtnEl) claimsTableHelpBtnEl.setAttribute("aria-expanded", "false");
  }

  function toggleClaimsTableHelpPopover() {
    if (!claimsTableHelpBtnEl || !claimsTableHelpPopoverEl) return;
    var shouldShow = claimsTableHelpPopoverEl.hidden;
    claimsTableHelpPopoverEl.hidden = !shouldShow;
    claimsTableHelpBtnEl.setAttribute("aria-expanded", shouldShow ? "true" : "false");
  }

  if (claimsTableHelpBtnEl && claimsTableHelpPopoverEl) {
    claimsTableHelpBtnEl.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleClaimsTableHelpPopover();
    });
    document.addEventListener("click", function (e) {
      if (claimsTableHelpPopoverEl.hidden) return;
      if (
        claimsTableHelpBtnEl.contains(e.target) ||
        claimsTableHelpPopoverEl.contains(e.target)
      ) {
        return;
      }
      hideClaimsTableHelpPopover();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") hideClaimsTableHelpPopover();
    });
  }

  if (dashSidebarBackBtnEl) {
    dashSidebarBackBtnEl.addEventListener("click", function () {
      if (hierarchyStack.length <= 1) return;
      navigateToHierarchyLevel(hierarchyStack.length - 2);
    });
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
    var period = tile && tile.period != null ? String(tile.period).trim() : "";
    var code = tile && (tile.badge || tile.kpi_id) ? String(tile.badge || tile.kpi_id).trim() : "";
    var hasPf = DashUi.kpiTileHasPlanAndFact(tile);
    var showHelp = shouldShowKpiTileHelp(tile);
    var showPercent = shouldShowKpiTilePercent(tile);
    if (shouldRenderKpiTileBackDepartmentsOnly(tile)) {
      return (
        '<div class="kpi-tile-back-section kpi-tile-back-section--only">' +
        '<div class="kpi-tile-back-section-title">Информация по отделам</div>' +
        buildKpiTileChildrenHtml(state) +
        "</div>"
      );
    }
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
      '<button type="button" class="kpi-tile-flip-action" aria-label="Вернуться к карточке">Назад</button>' +
      "</div></div>" +
      '<div class="kpi-tile-back-summary">' +
      (showPercent
        ? '<div class="kpi-tile-back-summary-item kpi-tile-back-summary-item--kpi">' +
          (showHelp ? buildKpiTileHelpButtonHtml() : "") +
          '<span class="kpi-tile-back-summary-label">KPI</span>' +
          '<strong class="kpi-tile-back-kpi-pct">' +
          DashUi.escapeHtml(percentLabel) +
          "</strong></div>"
        : "") +
      (hasPf && shouldRenderKpiTileBack(tile)
        ? '<div class="kpi-tile-back-summary-item"><span class="kpi-tile-back-summary-label">План / факт</span><strong>' +
          DashUi.escapeHtml(DashUi.formatKpiTilePlanFactValue(tile.plan)) +
          " / " +
          DashUi.escapeHtml(DashUi.formatKpiTilePlanFactValue(tile.fact)) +
          "</strong></div>"
        : "") +
      "</div>" +
      (hint ? '<p class="kpi-tile-back-hint">' + DashUi.escapeHtml(hint) + "</p>" : "") +
      '<div class="kpi-tile-back-section">' +
      '<div class="kpi-tile-back-section-title">Информация по отделам</div>' +
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
   * @param {object|null|undefined} [contextTile] — плитка, с оборота которой кликнули дочерний отдел (если несколько открыты)
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
    if (!shouldRenderKpiTileBack(lastKpiTiles[tileIndex])) return;
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
    if (!shouldShowKpiTileHelp(tile)) return;
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

  function getKpiTileException(tile) {
    var cfg = window.KPI_TILE_EXCEPTIONS || null;
    if (!cfg || !tile) return null;
    var key = tile.kpi_id != null && String(tile.kpi_id).trim()
      ? String(tile.kpi_id).trim()
      : tile.badge != null && String(tile.badge).trim()
        ? String(tile.badge).trim()
        : "";
    return key && cfg[key] ? cfg[key] : null;
  }

  function shouldShowKpiTileHelp(tile) {
    var rule = getKpiTileException(tile);
    return !(rule && rule.hideHelp);
  }

  function shouldShowKpiTilePercent(tile) {
    var rule = getKpiTileException(tile);
    return !(rule && rule.hideKpiPercent);
  }

  function shouldRenderKpiTileBack(tile) {
    var rule = getKpiTileException(tile);
    return !(rule && rule.disableBack);
  }

  function shouldRenderKpiTileBackDepartmentsOnly(tile) {
    var rule = getKpiTileException(tile);
    return !!(rule && rule.backDepartmentsOnly);
  }

  /** Кнопка «?» для модалки с формулой и цветовыми порогами KPI. */
  function buildKpiTileHelpButtonHtml() {
    return (
      '<button type="button" class="kpi-tile-help" aria-label="Справка: формула и цветовые пороги показателя" aria-haspopup="dialog" aria-controls="kpi-thresholds-dialog">' +
      '<span class="kpi-tile-help-icon" aria-hidden="true">?</span>' +
      "</button>"
    );
  }

  /** Верхняя строка плитки: бейдж kpi_id. */
  function buildKpiTileBadgeRowHtml(tile) {
    var helpHtml = shouldShowKpiTileHelp(tile) ? buildKpiTileHelpButtonHtml() : "";
    return (
      '<div class="kpi-tile-badge-row">' +
      '<span class="badge">' +
      DashUi.escapeHtml(tile.badge) +
      "</span>" +
      helpHtml +
      "</div>"
    );
  }

  function buildKpiTileGeneratedFlagHtml() {
    return (
      '<span class="kpi-tile-generated-flag" title="' +
      DashUi.escapeHtml(KPI_TILE_MSG_GENERATED_DATA) +
      '" role="img" aria-label="' +
      DashUi.escapeHtml(KPI_TILE_MSG_GENERATED_DATA) +
      '">!</span>'
    );
  }

  /** Заголовок плитки, период и опционально подпись периода план/факт. */
  function buildKpiTileBodyHtml(tile, hasPf, pfPeriod) {
    var generatedFlag = tile.has_data === false ? buildKpiTileGeneratedFlagHtml() : "";
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
      '<div class="kpi-tile-title-row">' +
      "<h3>" +
      DashUi.escapeHtml(tile.title) +
      "</h3>" +
      generatedFlag +
      "</div>" +
      '<p class="period">' +
      DashUi.escapeHtml(tile.period) +
      periodExtra +
      "</p></div>"
    );
  }

  /** Однострочный блок `план/факт`. */
  function buildKpiTilePlanFactStackHtml(planShown, factShown) {
    var pfStackClass = "kpi-tile-pf-stack";
    return (
      '<div class="' +
      pfStackClass +
      '">' +
      '<div class="kpi-tile-pf-inline">' +
      '<div class="kpi-tile-pf-inline-row">' +
      '<span class="kpi-tile-pf-pill">' +
      DashUi.escapeHtml(planShown) +
      '<span class="kpi-tile-pf-slash" aria-hidden="true">/</span>' +
      DashUi.escapeHtml(factShown) +
      '</span><span class="kpi-tile-pf-inline-label">План / факт</span></div></div></div>'
    );
  }

  function buildKpiTileFactOnlyHtml(factShown) {
    var pfStackClass = "kpi-tile-pf-stack";
    return (
      '<div class="' +
      pfStackClass +
      '">' +
      '<div class="kpi-tile-pf-inline">' +
      '<div class="kpi-tile-pf-inline-row">' +
      '<span class="kpi-tile-pf-pill">' +
      DashUi.escapeHtml(factShown) +
      '</span><span class="kpi-tile-pf-inline-label">Факт</span></div></div></div>'
    );
  }

  /** Нижняя зона лицевой стороны: только план/факт (kpi_pct на лице не показываем). */
  function buildKpiTileMetricsSectionHtml(tile, hasPf, planShown, factShown) {
    var rule = getKpiTileException(tile);
    if (rule && rule.factOnly) {
      return (
        '<div class="kpi-tile-metrics kpi-tile-metrics--pf-only" aria-label="Факт">' +
        buildKpiTileFactOnlyHtml(factShown) +
        "</div>"
      );
    }
    if (!hasPf) return "";
    var inner = buildKpiTilePlanFactStackHtml(planShown, factShown);
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

  function applyKpiTilesPageVisibility() {
    var container = document.getElementById("kpi-container");
    if (!container) return;
    var articles = container.querySelectorAll("article.kpi-tile");
    var n = articles.length;
    if (n <= KPI_TILES_PER_PAGE) {
      articles.forEach(function (art) {
        art.classList.remove("kpi-tile--page-hidden");
      });
      return;
    }
    var start = kpiTilesPageIndex * KPI_TILES_PER_PAGE;
    var end = start + KPI_TILES_PER_PAGE;
    articles.forEach(function (art, idx) {
      art.classList.toggle("kpi-tile--page-hidden", idx < start || idx >= end);
    });
  }

  function updateKpiTilesPagerUI() {
    var container = document.getElementById("kpi-container");
    var pager = document.getElementById("kpi-tiles-pager");
    var prevBtn = document.getElementById("kpi-tiles-page-prev");
    var nextBtn = document.getElementById("kpi-tiles-page-next");
    var label = document.getElementById("kpi-tiles-page-label");
    var nDom = container ? container.querySelectorAll("article.kpi-tile").length : 0;
    var n = nDom > 0 ? nDom : lastKpiTiles ? lastKpiTiles.length : 0;
    if (!pager) return;
    /* Переключатель только если плиток больше 6 (ровно 6 — без пейджера) */
    if (n <= KPI_TILES_PER_PAGE) {
      kpiTilesPageIndex = 0;
      applyKpiTilesPageVisibility();
      pager.setAttribute("hidden", "");
      pager.hidden = true;
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      if (label) label.textContent = "";
      return;
    }
    var pages = Math.ceil(n / KPI_TILES_PER_PAGE);
    kpiTilesPageIndex = Math.min(Math.max(0, kpiTilesPageIndex), pages - 1);
    applyKpiTilesPageVisibility();
    pager.removeAttribute("hidden");
    pager.hidden = false;
    if (label) label.textContent = kpiTilesPageIndex + 1 + " / " + pages;
    if (prevBtn) prevBtn.disabled = kpiTilesPageIndex <= 0;
    if (nextBtn) nextBtn.disabled = kpiTilesPageIndex >= pages - 1;
  }

  /**
   * Рендерит KPI-плитки единой адаптивной сеткой; оборот карточки строится отдельно при flip.
   * Более 6 плиток — постраничный показ (3×2) и навигатор `#kpi-tiles-pager`.
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
      var rule = getKpiTileException(tile);
      var frontAccentColor = rule && rule.frontAccentColor ? String(rule.frontAccentColor).trim() : "";
      el.className = "kpi-tile";
      el.style.setProperty("--tile-rag-color", pres.fillColor);
      el.style.setProperty("--tile-front-accent-color", frontAccentColor || pres.fillColor);
      el.style.setProperty(
        "--tile-top-border-color",
        frontAccentColor || (rule && rule.headerColor === "dashboard" ? "var(--navy)" : pres.fillColor)
      );
      el.setAttribute("tabindex", "0");
      el.setAttribute("aria-expanded", "false");
      if (!shouldRenderKpiTileBack(tile)) {
        el.setAttribute("data-no-flip", "1");
      }
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
    kpiTilesPageIndex = 0;
    donutChartsPageIndex = 0;
    updateKpiTilesPagerUI();
  }

  /* ---------- Таблицы дашборда ---------- */

  /** Пока таблицы показываются как пустой каркас по макету, без данных и DataTables. */
  function initTables() {
    [
      "#table-plan-fact",
      "#table-top-deviations",
      "#table-overdue-debt",
    ].forEach(function (selector) {
      if (typeof $ !== "undefined" && $.fn && $.fn.DataTable && $.fn.DataTable.isDataTable(selector)) {
        $(selector).DataTable().destroy();
      }
    });

    var topBody = document.querySelector("#table-top-deviations tbody");
    var debtBody = document.querySelector("#table-overdue-debt tbody");
    if (topBody) topBody.innerHTML = "";
    if (debtBody) debtBody.innerHTML = "";

    renderClaimsTableFromApi();
  }

  function tableTextOrDash(v) {
    if (v == null) return "—";
    var s = String(v).trim();
    return s ? s : "—";
  }

  function formatClaimsOrderSum(v) {
    if (v == null || v === "") return "—";
    var n = Number(v);
    if (isNaN(n)) return tableTextOrDash(v);
    return n.toLocaleString("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function getClaimsOrderSumSortValue(v) {
    if (v == null || v === "") return "";
    var n = Number(v);
    return isNaN(n) ? "" : String(n);
  }

  function updateClaimsTotalRow(dataTableApi) {
    if (!dataTableApi || typeof dataTableApi.column !== "function") return;
    var total = 0;
    dataTableApi
      .column(10, { search: "applied" })
      .nodes()
      .each(function (cell) {
        if (!cell || typeof cell.getAttribute !== "function") return;
        var rawValue = cell.getAttribute("data-order");
        var n = Number(rawValue);
        if (!isNaN(n)) total += n;
      });

    var footerCell = document.getElementById("claims-table-total-sum");
    if (footerCell) {
      footerCell.textContent = total.toLocaleString("ru-RU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
  }

  function renderClaimsTableFromApi() {
    var table = document.getElementById("table-top-deviations");
    var tbody = table ? table.querySelector("tbody") : null;
    if (!table || !tbody) return;
    tbody.innerHTML = "";

    var rows = Array.isArray(lastApiTableRows) ? lastApiTableRows : [];
    if (!rows.length) return;

    rows.forEach(function (item) {
      var raw = item && item.raw && typeof item.raw === "object" ? item.raw : null;
      if (!raw) return;
      var tr = document.createElement("tr");
      [
        tableTextOrDash(raw.code),
        tableTextOrDash(raw.name),
        tableTextOrDash(raw.partner),
        tableTextOrDash(raw.date_reg),
        tableTextOrDash(raw.date_plan),
        tableTextOrDash(raw.order_num),
        tableTextOrDash(raw.order_dept),
        tableTextOrDash(raw.nomenclature),
        tableTextOrDash(raw.description),
        tableTextOrDash(raw.status),
        formatClaimsOrderSum(raw.order_sum),
      ].forEach(function (value, cellIndex) {
        var td = document.createElement("td");
        td.textContent = value;
        if (cellIndex === 10) {
          td.setAttribute("data-order", getClaimsOrderSumSortValue(raw.order_sum));
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    initClaimsDataTable();
  }

  function escapeRegexForDataTable(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function initClaimsDataTable() {
    if (typeof $ === "undefined" || !$.fn || !$.fn.DataTable) return;
    var table = $("#table-top-deviations");
    if (!table.length) return;

    var wrapper = table.closest(".dashboard-table-wrap--claims");
    if (wrapper.length) {
      wrapper.find(".claims-column-filter-menu").remove();
    }
    if ($.fn.DataTable.isDataTable(table)) {
      table.DataTable().destroy();
    }

    var columnConfigs = [
      { index: 0, label: "Код", type: "filter" },
      { index: 1, label: "Наименование", type: "filter" },
      { index: 2, label: "Партнер/Клиент", type: "filter" },
      { index: 3, label: "Дата обращения", type: "sort" },
      { index: 4, label: "Дата окончания", type: "sort" },
      { index: 5, label: "Заказ клиента", type: "filter" },
      { index: 6, label: "Подразделение заказа", type: "filter" },
      { index: 7, label: "Номенклатура", type: "filter" },
      { index: 8, label: "Описание претензии", type: "none" },
      { index: 9, label: "Статус", type: "filter" },
      { index: 10, label: "Сумма документа заказа, руб.", type: "sort" },
    ];

    var dataTable = table.DataTable({
      order: [[10, "desc"]],
      paging: true,
      pageLength: 10,
      lengthMenu: [10, 25, 50],
      autoWidth: false,
      deferRender: true,
      language: {
        search: "Поиск:",
        lengthMenu: "Показать _MENU_ записей",
        info: "Показаны _START_–_END_ из _TOTAL_",
        infoEmpty: "Нет записей",
        infoFiltered: "(отфильтровано из _MAX_)",
        zeroRecords: "Ничего не найдено",
        emptyTable: "Нет данных для отображения",
        paginate: {
          first: "Первая",
          previous: "Назад",
          next: "Вперед",
          last: "Последняя",
        },
      },
      columnDefs: [
        { targets: "_all", orderable: false },
        { targets: [3, 4], orderable: true },
        { targets: [10], type: "num-fmt", orderable: true },
      ],
      dom: '<"claims-table-top"lf><"claims-table-scroll"rt><"claims-table-bottom"ip>',
      footerCallback: function () {
        updateClaimsTotalRow(this.api());
      },
    });

    updateClaimsTotalRow(dataTable);

    var activeFilters = {};
    var activeSortColumn = null;
    var activeSortDir = "";
    var menus = [];

    function collectColumnValues(columnIndex) {
      var seen = [];
      dataTable
        .column(columnIndex)
        .data()
        .each(function (value) {
          var text = value != null ? String(value).trim() : "";
          if (!text || seen.indexOf(text) !== -1) return;
          seen.push(text);
        });
      return seen.sort(function (a, b) {
        return a.localeCompare(b, "ru");
      });
    }

    function closeAllClaimsMenus() {
      menus.forEach(function (menu) {
        menu.hidden = true;
      });
    }

    function applyClaimsColumnState() {
      Object.keys(activeFilters).forEach(function (key) {
        var values = activeFilters[key];
        var columnIndex = Number(key);
        if (Array.isArray(values) && values.length) {
          var pattern = values
            .map(function (value) {
              return escapeRegexForDataTable(value);
            })
            .join("|");
          dataTable.column(columnIndex).search("^(" + pattern + ")$", true, false);
        } else {
          dataTable.column(columnIndex).search("", true, false);
        }
      });
      if (activeSortColumn != null && activeSortDir) {
        dataTable.order([[activeSortColumn, activeSortDir]]);
      } else {
        dataTable.order([]);
      }
      dataTable.draw();
    }

    function isClaimsColumnResetVisible(config) {
      if (config.type === "sort") {
        return activeSortColumn === config.index && !!activeSortDir;
      }
      return Array.isArray(activeFilters[config.index]) && activeFilters[config.index].length > 0;
    }

    table.find("thead th").each(function (idx) {
      var th = this;
      var config = null;
      for (var i = 0; i < columnConfigs.length; i++) {
        if (columnConfigs[i].index === idx) {
          config = columnConfigs[i];
          break;
        }
      }
      if (!config) return;
      if (config.type === "none") return;
      if (th.querySelector(".claims-column-filter-trigger") || th.querySelector(".claims-column-sort-btn")) return;

      th.classList.add("claims-column-head");
      var titleText = th.textContent;
      th.textContent = "";

      var titleSpan = document.createElement("span");
      titleSpan.className = "claims-column-head-text";
      titleSpan.textContent = titleText;

      if (config.type === "sort") {
        var svgArrowUp = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M6 2L2 7h8L6 2z" fill="currentColor"/></svg>';
        var svgArrowDown = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M6 10L2 5h8L6 10z" fill="currentColor"/></svg>';
        var svgArrowBoth = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M6 1L3 4.5h6L6 1z" fill="currentColor"/><path d="M6 11L3 7.5h6L6 11z" fill="currentColor"/></svg>';

        var sortBtn = document.createElement("button");
        sortBtn.type = "button";
        sortBtn.className = "claims-column-sort-btn";
        sortBtn.setAttribute("aria-label", "Сортировка " + config.label);
        sortBtn.innerHTML = svgArrowBoth;

        (function (colIndex, btn) {
          btn.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (activeSortColumn === colIndex && activeSortDir === "asc") {
              activeSortDir = "desc";
              btn.innerHTML = svgArrowDown;
              btn.style.color = "var(--accent-blue)";
            } else if (activeSortColumn === colIndex && activeSortDir === "desc") {
              activeSortColumn = null;
              activeSortDir = "";
              btn.innerHTML = svgArrowBoth;
              btn.style.color = "";
            } else {
              activeSortColumn = colIndex;
              activeSortDir = "asc";
              btn.innerHTML = svgArrowUp;
              btn.style.color = "var(--accent-blue)";
            }
            table.find(".claims-column-sort-btn").not(btn).each(function () {
              this.innerHTML = svgArrowBoth;
              this.style.color = "";
            });
            applyClaimsColumnState();
          });
        })(config.index, sortBtn);

        th.appendChild(titleSpan);
        th.appendChild(sortBtn);
        return;
      }

      var trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "claims-column-filter-trigger";
      trigger.setAttribute("aria-label", "Фильтр по колонке " + config.label);
      trigger.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
        '<path d="M2 3h12l-4.8 5.3v3.2l-2.4 1.5V8.3L2 3z" fill="currentColor"/></svg>';

      var resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.className = "claims-column-filter-reset";
      resetBtn.setAttribute("aria-label", "Сбросить фильтр по колонке " + config.label);
      resetBtn.textContent = "×";
      resetBtn.hidden = true;

      var menu = document.createElement("div");
      menu.className = "claims-column-filter-menu";
      menu.hidden = true;

      {
        var filterTitle = document.createElement("p");
        filterTitle.className = "claims-column-filter-title";
        filterTitle.textContent = config.label;
        menu.appendChild(filterTitle);

        var optionsWrap = document.createElement("div");
        optionsWrap.className = "claims-column-filter-options";
        collectColumnValues(config.index).forEach(function (value) {
          var optionLabel = document.createElement("label");
          optionLabel.className = "claims-column-filter-check";
          var checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.value = value;
          checkbox.addEventListener("change", function () {
            var selected = [];
            optionsWrap.querySelectorAll('input[type="checkbox"]:checked').forEach(function (input) {
              selected.push(input.value);
            });
            activeFilters[config.index] = selected;
            resetBtn.hidden = !isClaimsColumnResetVisible(config);
            applyClaimsColumnState();
          });
          var textSpan = document.createElement("span");
          textSpan.textContent = value;
          optionLabel.appendChild(checkbox);
          optionLabel.appendChild(textSpan);
          optionsWrap.appendChild(optionLabel);
        });
        menu.appendChild(optionsWrap);
      }

      resetBtn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        activeFilters[config.index] = [];
        menu.querySelectorAll('input[type="checkbox"]').forEach(function (input) {
          input.checked = false;
        });
        resetBtn.hidden = true;
        applyClaimsColumnState();
        closeAllClaimsMenus();
      });

      trigger.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        var shouldOpen = menu.hidden;
        closeAllClaimsMenus();
        menu.hidden = !shouldOpen;
      });

      th.appendChild(titleSpan);
      th.appendChild(resetBtn);
      th.appendChild(trigger);
      th.appendChild(menu);
      menus.push(menu);
    });

    document.addEventListener("click", function (event) {
      if (!table[0].contains(event.target)) closeAllClaimsMenus();
    });
  }

  function getVisibleDonutTiles(tiles) {
    if (!tiles || !tiles.length) return [];
    if (tiles.length <= DONUT_CHARTS_PER_PAGE) {
      donutChartsPageIndex = 0;
      return tiles.slice();
    }
    var pages = Math.ceil(tiles.length / DONUT_CHARTS_PER_PAGE);
    donutChartsPageIndex = Math.min(Math.max(0, donutChartsPageIndex), pages - 1);
    var start = donutChartsPageIndex * DONUT_CHARTS_PER_PAGE;
    return tiles.slice(start, start + DONUT_CHARTS_PER_PAGE);
  }

  function updateDonutChartsPagerUI(totalCount) {
    var pager = document.getElementById("donut-charts-pager");
    var prevBtn = document.getElementById("donut-charts-page-prev");
    var nextBtn = document.getElementById("donut-charts-page-next");
    var label = document.getElementById("donut-charts-page-label");
    var n = typeof totalCount === "number" ? totalCount : lastKpiTiles ? lastKpiTiles.length : 0;
    if (!pager) return;
    if (n <= DONUT_CHARTS_PER_PAGE) {
      donutChartsPageIndex = 0;
      pager.setAttribute("hidden", "");
      pager.hidden = true;
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      if (label) label.textContent = "";
      return;
    }
    var pages = Math.ceil(n / DONUT_CHARTS_PER_PAGE);
    donutChartsPageIndex = Math.min(Math.max(0, donutChartsPageIndex), pages - 1);
    pager.removeAttribute("hidden");
    pager.hidden = false;
    if (label) label.textContent = donutChartsPageIndex + 1 + " / " + pages;
    if (prevBtn) prevBtn.disabled = donutChartsPageIndex <= 0;
    if (nextBtn) nextBtn.disabled = donutChartsPageIndex >= pages - 1;
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

  var dashboardChartsResizeObserver = null;
  var dashboardChartsResizeFrame = null;

  function isDashboardChartContainer(renderTo) {
    if (!renderTo) return false;
    if (renderTo.id === "chart-line" || renderTo.id === "chart-bar") return true;
    return !!(renderTo.classList && renderTo.classList.contains("donut-chart-container"));
  }

  function resizeAllDashboardChartsNow() {
    if (typeof Highcharts === "undefined" || !Highcharts.charts) return;
    Highcharts.charts.forEach(function (chart) {
      if (!chart || typeof chart.setSize !== "function" || !isDashboardChartContainer(chart.renderTo)) {
        return;
      }
      var container = chart.renderTo;
      var width = container && container.clientWidth ? container.clientWidth : null;
      chart.setSize(width, null, false);
    });
  }

  function scheduleDashboardChartsResize() {
    if (dashboardChartsResizeFrame != null) {
      if (typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(dashboardChartsResizeFrame);
      } else {
        clearTimeout(dashboardChartsResizeFrame);
      }
    }
    if (typeof window.requestAnimationFrame === "function") {
      dashboardChartsResizeFrame = window.requestAnimationFrame(function () {
        dashboardChartsResizeFrame = null;
        resizeAllDashboardChartsNow();
      });
      return;
    }
    dashboardChartsResizeFrame = setTimeout(function () {
      dashboardChartsResizeFrame = null;
      resizeAllDashboardChartsNow();
    }, 0);
  }

  function attachDashboardChartsResizeObserver() {
    if (typeof window === "undefined") return;
    if (typeof window.ResizeObserver !== "function" || dashboardChartsResizeObserver) {
      window.addEventListener("resize", scheduleDashboardChartsResize, { passive: true });
      return;
    }
    dashboardChartsResizeObserver = new window.ResizeObserver(function () {
      scheduleDashboardChartsResize();
    });
    ["chart-line", "chart-bar", "donuts-grid"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) dashboardChartsResizeObserver.observe(el);
    });
    window.addEventListener("resize", scheduleDashboardChartsResize, { passive: true });
  }

  if (typeof window !== "undefined") {
    attachDashboardChartsResizeObserver();
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

  function lineSeriesHasNumericValues(data) {
    if (!Array.isArray(data) || !data.length) return false;
    for (var i = 0; i < data.length; i++) {
      if (data[i] != null && !isNaN(Number(data[i]))) return true;
    }
    return false;
  }

  /** Для линейного графика рисует «факт» и, если есть, «план» пунктиром в близком оттенке. */
  function buildLineChartSeriesFactOnly(indicator) {
    var series = indicator.series;
    if (!series || !series.length) return [];
    var factIdx = findFactSeriesIndexForRag(series);
    if (factIdx < 0 || factIdx >= series.length) factIdx = 0;
    var factSeries = series[factIdx];
    var factColor = factSeries.color || "#2563eb";
    var chartSeries = [
      {
        type: "line",
        name: factSeries.name,
        color: factColor,
        data: factSeries.data.slice(),
        marker: {
          enabled: true,
          radius: 4,
          symbol: "circle",
          lineWidth: 2,
          lineColor: "#ffffff",
          fillColor: factColor,
        },
      },
    ];

    var planIdx = findPlanSeriesIndexForRag(series);
    if (planIdx >= 0 && planIdx < series.length) {
      var planSeries = series[planIdx];
      if (lineSeriesHasNumericValues(planSeries.data)) {
        chartSeries.push({
          type: "line",
          name: planSeries.name,
          color: getChartPlanColor(factColor),
          data: planSeries.data.slice(),
          dashStyle: planSeries.dashStyle || "Dash",
          marker: {
            enabled: false,
          },
        });
      }
    }

    return chartSeries;
  }

  var ALL_CHARTS_COLOR_PALETTE = [
    "#2563eb",
    "#16a34a",
    "#f59e0b",
    "#8b5cf6",
    "#06b6d4",
    "#ef4444",
    "#84cc16",
    "#0f766e",
    "#f97316",
    "#6366f1",
  ];

  function getAllChartsPaletteColor(index) {
    return ALL_CHARTS_COLOR_PALETTE[index % ALL_CHARTS_COLOR_PALETTE.length];
  }

  function getChartColorVariant(baseColor, brightenBy) {
    if (typeof Highcharts !== "undefined" && Highcharts.color) {
      return Highcharts.color(baseColor).brighten(brightenBy).get();
    }
    return baseColor;
  }

  function getChartPlanColor(baseColor) {
    if (typeof Highcharts !== "undefined" && Highcharts.color) {
      return Highcharts.color(baseColor).brighten(0.08).setOpacity(0.45).get();
    }
    return getChartColorVariant(baseColor, 0.08);
  }

  function shortenLineLegendLabel(label, suffix) {
    var text = label == null ? "" : String(label).trim();
    if (text.length > 18) text = text.slice(0, 15).trim() + "...";
    return suffix ? text + " · " + suffix : text;
  }

  function pickIndicatorBarValue(values) {
    if (!values || !values.length) return null;
    for (var i = 0; i < values.length; i++) {
      if (values[i] != null && !isNaN(Number(values[i]))) return Number(values[i]);
    }
    return null;
  }

  function buildLineChartSeriesForAllIndicators(indicators) {
    if (!indicators || !indicators.length) return [];
    return indicators.reduce(function (acc, indicator, idx) {
      var series = buildLineChartSeriesFactOnly(indicator);
      if (!series.length) return acc;
      var accent = getAllChartsPaletteColor(idx);
      var label = indicator.optionLabel || indicator.title || series[0].name;

      acc.push({
        type: "line",
        name: label,
        legendLabel: shortenLineLegendLabel(label, "Ф"),
        color: accent,
        data: series[0].data.slice(),
        marker: {
          enabled: true,
          radius: 4,
          symbol: "circle",
          lineWidth: 2,
          lineColor: "#ffffff",
          fillColor: accent,
        },
      });

      if (series.length > 1) {
        acc.push({
          type: "line",
          name: label + " (план)",
          legendLabel: shortenLineLegendLabel(label, "П"),
          color: getChartPlanColor(accent),
          data: series[1].data.slice(),
          dashStyle: series[1].dashStyle || "Dash",
          marker: {
            enabled: false,
          },
        });
      }

      return acc;
    }, []);
  }

  function buildBarChartSeriesForAllIndicators(indicators) {
    if (!indicators || !indicators.length) return [];
    var planData = [];
    var factData = [];
    indicators.forEach(function (indicator) {
      planData.push(pickIndicatorBarValue(indicator.plan || []));
      factData.push(pickIndicatorBarValue(indicator.fact || []));
    });
    return [
      {
        name: "План",
        data: planData,
        color: "#c8d6ee",
      },
      {
        name: "Факт",
        data: factData,
        color: "#2b5ca6",
      },
    ];
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
      chart: { type: "line", backgroundColor: "transparent", height: 300, animation: false, reflow: false },
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
      legend: {
        align: "center",
        verticalAlign: "bottom",
        layout: "horizontal",
        alignColumns: false,
        itemDistance: 8,
        symbolWidth: 14,
        symbolPadding: 4,
        itemStyle: {
          fontSize: "10px",
          fontWeight: "400",
          textOverflow: "ellipsis",
        },
        labelFormatter: function () {
          return this.userOptions && this.userOptions.legendLabel
            ? this.userOptions.legendLabel
            : this.name;
        },
      },
      tooltip: { shared: true },
      plotOptions: {
        series: { animation: false },
        line: {
          marker: { enabled: true, radius: 4, symbol: "circle" },
          lineWidth: 2,
          cursor: "pointer",
          point: { events: { click: chartClickHandler } },
        },
      },
      series: buildLineChartSeriesFactOnly(indicator),
    });
  }

  function renderLineChartForAllIndicators(indicators) {
    var titleEl = document.getElementById("line-chart-title");
    if (titleEl) titleEl.textContent = "Тренд: все показатели";

    var elLine = document.getElementById("chart-line");
    if (!elLine || typeof Highcharts === "undefined") return;

    if (lineChartInstance) {
      lineChartInstance.destroy();
      lineChartInstance = null;
    }

    if (!indicators || !indicators.length) {
      elLine.innerHTML =
        '<p class="chart-load-error" style="margin:0;padding:20px;color:#64748b;font-size:14px;">Нет показателей для графика.</p>';
      return;
    }

    var baseIndicator = indicators[0];
    lineChartInstance = Highcharts.chart(elLine, {
      chart: { type: "line", backgroundColor: "transparent", height: 300, animation: false, reflow: false },
      title: { text: null },
      credits: { enabled: false },
      xAxis: {
        categories: baseIndicator.categories.slice(),
        title: { text: baseIndicator.xAxisTitle || "Период" },
        lineColor: "#cbd5e1",
      },
      yAxis: {
        title: { text: baseIndicator.yAxisTitle || "Значение" },
        gridLineColor: "#f1f5f9",
      },
      legend: {
        align: "center",
        verticalAlign: "bottom",
        layout: "horizontal",
        alignColumns: false,
        itemDistance: 8,
        symbolWidth: 14,
        symbolPadding: 4,
        itemStyle: {
          fontSize: "10px",
          fontWeight: "400",
          textOverflow: "ellipsis",
        },
        labelFormatter: function () {
          return this.userOptions && this.userOptions.legendLabel
            ? this.userOptions.legendLabel
            : this.name;
        },
      },
      tooltip: { shared: true },
      plotOptions: {
        series: { animation: false },
        line: {
          marker: { enabled: true, radius: 4, symbol: "circle" },
          lineWidth: 2,
        },
      },
      series: buildLineChartSeriesForAllIndicators(indicators),
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

    var allOpt = document.createElement("option");
    allOpt.value = CHART_SELECT_ALL_VALUE;
    allOpt.textContent = "Отобразить все";
    sel.appendChild(allOpt);

    lineChartIndicators.forEach(function (ind, idx) {
      var opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = ind.optionLabel || ind.title;
      sel.appendChild(opt);
    });

    sel.onchange = function () {
      if (sel.value === CHART_SELECT_ALL_VALUE) {
        renderLineChartForAllIndicators(lineChartIndicators);
        return;
      }
      var i = parseInt(sel.value, 10);
      if (!isNaN(i) && lineChartIndicators[i]) renderLineChartForIndicator(lineChartIndicators[i]);
    };

    sel.value = CHART_SELECT_ALL_VALUE;
    renderLineChartForAllIndicators(lineChartIndicators);
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
    var barTooltipFormatter = function () {
      var pts = this.points || [];
      var pointIndex = pts.length && pts[0] && pts[0].point ? pts[0].point.index : -1;
      var html = '<span style="font-size:10px">' + DashUi.escapeHtml(String(this.x)) + "</span><br/>";
      pts.forEach(function (p) {
        html +=
          '<span style="color:' + p.color + '">\u25cf</span> ' +
          DashUi.escapeHtml(p.series.name) +
          ": <b>" +
          DashUi.escapeHtml(DashUi.formatNumber(p.y)) +
          "</b><br/>";
      });
      html +=
        '<span style="color:#64748b">\u25cf</span> KPI: <b>' +
        DashUi.escapeHtml(getBarChartKpiPctLabel(indicator, pointIndex)) +
        "</b>";
      return html;
    };
    var barClickHandler = function (e) {
      var pointIndex = e.point ? e.point.index : -1;
      if (pointIndex < 0 || !barPoints.length) return;
      var pt = barPoints[pointIndex];
      if (pt && pt.quarter && pt.year) {
        navigateToQuarter(pt.quarter, pt.year);
      }
    };

    waterfallChartInstance = Highcharts.chart(elBar, {
      chart: { type: "column", backgroundColor: "transparent", height: 300, animation: false, reflow: false },
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
      tooltip: { shared: true, useHTML: true, formatter: barTooltipFormatter },
      plotOptions: {
        series: { animation: false },
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

  function renderBarChartForAllIndicators(indicators) {
    var titleEl = document.getElementById("bar-chart-title");
    if (titleEl) titleEl.textContent = "План / факт: все показатели";

    var elBar = document.getElementById("chart-bar");
    if (!elBar || typeof Highcharts === "undefined") return;

    if (waterfallChartInstance) {
      waterfallChartInstance.destroy();
      waterfallChartInstance = null;
    }

    if (!indicators || !indicators.length) {
      elBar.innerHTML =
        '<p class="chart-load-error" style="margin:0;padding:20px;color:#64748b;font-size:14px;">Нет показателей для графика.</p>';
      return;
    }

    var categories = indicators.map(function (indicator) {
      return indicator.optionLabel || indicator.title || "KPI";
    });

    waterfallChartInstance = Highcharts.chart(elBar, {
      chart: { type: "column", backgroundColor: "transparent", height: 300, animation: false, reflow: false },
      title: { text: null },
      credits: { enabled: false },
      xAxis: {
        categories: categories,
        title: { text: "Показатели" },
        lineColor: "#cbd5e1",
      },
      yAxis: {
        title: { text: "План / факт" },
        gridLineColor: "#f1f5f9",
      },
      legend: { align: "center", verticalAlign: "bottom" },
      tooltip: {
        shared: true,
        useHTML: true,
        formatter: function () {
          var html = '<span style="font-size:10px">' + DashUi.escapeHtml(String(this.x)) + "</span><br/>";
          (this.points || []).forEach(function (p) {
            html +=
              '<span style="color:' + p.color + '">\u25cf</span> ' +
              DashUi.escapeHtml(p.series.name) +
              ": <b>" +
              DashUi.escapeHtml(DashUi.formatNumber(p.y)) +
              "</b><br/>";
          });
          return html;
        },
      },
      plotOptions: {
        series: { animation: false },
        column: {
          grouping: true,
          borderRadius: 3,
          borderWidth: 0,
          groupPadding: 0.12,
          pointPadding: 0.04,
        },
      },
      series: buildBarChartSeriesForAllIndicators(indicators),
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

    var allOpt = document.createElement("option");
    allOpt.value = CHART_SELECT_ALL_VALUE;
    allOpt.textContent = "Отобразить все";
    sel.appendChild(allOpt);

    waterfallChartIndicators.forEach(function (ind, idx) {
      var opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = ind.optionLabel || ind.title;
      sel.appendChild(opt);
    });

    sel.onchange = function () {
      if (sel.value === CHART_SELECT_ALL_VALUE) {
        renderBarChartForAllIndicators(waterfallChartIndicators);
        return;
      }
      var i = parseInt(sel.value, 10);
      if (!isNaN(i) && waterfallChartIndicators[i]) renderBarChartForIndicator(waterfallChartIndicators[i]);
    };

    sel.value = CHART_SELECT_ALL_VALUE;
    renderBarChartForAllIndicators(waterfallChartIndicators);
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
      updateDonutChartsPagerUI(0);
      grid.innerHTML =
        '<p style="margin:0;padding:20px;color:#64748b;font-size:14px;">Нет данных для диаграмм.</p>';
      return;
    }

    var visibleTiles = getVisibleDonutTiles(tiles);
    updateDonutChartsPagerUI(tiles.length);

    visibleTiles.forEach(function (tile, idx) {
      var pres = MockData.getKpiTilePresentation(tile);
      var pct = pres.percent;
      var fill = pres.fillColor;
      var track = "#e2e8f0";

      var cell = document.createElement("div");
      cell.className = "donut-cell";
      var chartDiv = document.createElement("div");
      chartDiv.className = "donut-chart-container";
      chartDiv.id = "donut-chart-" + (donutChartsPageIndex * DONUT_CHARTS_PER_PAGE + idx);
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
      var containerWidth = chartDiv.clientWidth || cell.clientWidth || 120;
      var chartSize = Math.max(96, Math.min(140, containerWidth));

      var chart = Highcharts.chart(chartDiv, {
        chart: {
          type: "pie",
          backgroundColor: "transparent",
          height: chartSize,
          margin: [0, 0, 0, 0],
          animation: false,
        },
        title: {
          text: pctLabel,
          align: "center",
          verticalAlign: "middle",
          y: 2,
          style: {
            fontSize: chartSize <= 108 ? "11px" : "13px",
            fontWeight: "700",
            color: fill,
          },
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
        animation: false,
      },
      plotOptions: {
        series: {
          animation: false,
        },
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

    setTimeout(scheduleDashboardChartsResize, 100);
  }

  function cancelDeferredChartsAndTablesBoot() {
    deferredChartsAndTablesBootToken++;
  }

  /** Шапка и плитки показываются сразу, а тяжёлые графики/таблицы догружаются позже. */
  function bootChartsAndTablesDeferred() {
    var token = ++deferredChartsAndTablesBootToken;
    var run = function () {
      if (token !== deferredChartsAndTablesBootToken) return;
      requestAnimationFrame(function () {
        if (token !== deferredChartsAndTablesBootToken) return;
        requestAnimationFrame(function () {
          if (token !== deferredChartsAndTablesBootToken) return;
          initCharts();
          initTables();
        });
      });
    };
    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 120 });
      return;
    }
    setTimeout(run, 0);
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
    updateSidebarBackButton();
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
          navigateToHierarchyLevel(idx);
        });
      })(i);
      el.appendChild(btn);
    });
    filterSidebarViewTabs();
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
      resetSidebarSearch();
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
      updateSidebarSearchEmptyState(false);
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
    filterSidebarViewTabs();
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

    var monthContextKey = getMonthNavigatorContextKey();
    var preserveMonthSlots =
      currentPeriodMonth != null &&
      currentPeriodYear != null &&
      availableMonthsContextKey === monthContextKey;
    setAvailableMonthsFromChartPoints(lastApiChartIndicators, {
      preserveExisting: preserveMonthSlots,
      contextKey: monthContextKey,
    });

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
    updateTopBarForView();
    hideLoading();
    bootChartsAndTablesDeferred();
  }

  /**
   * Главная загрузка данных экрана: «свой» дашборд (`fetchKpis`) или подразделение (`fetchKpiAll`).
   * При ошибке или mock — fallback на `MockData`.
   */
  function loadKpiTilesAndChartsForView() {
    closeKpiTileDrilldown();
    cancelDeferredChartsAndTablesBoot();
    showLoading();
    var isSelf = selectedViewId === "self";
    var role = viewContextUser.role;
    var elHint = document.getElementById("dash-user-hint");
    var fallback = function () {
      lastApiChartIndicators = null;
      lastApiTableRows = null;
      lastKpiResponseDepartment = null;
      availableMonths = [];
      availableMonthsContextKey = "";
      currentPeriodMonth = null;
      currentPeriodYear = null;
      updateMonthNavigatorUI();
      renderKpiTiles(MockData.getKpiTilesForRole(role));
      updateTopBarForView();
      hideLoading();
      bootChartsAndTablesDeferred();
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

  viewTargets = [{ id: "self", label: "Мой дашборд", user: sessionUser }];
  selectedViewId = "self";
  viewContextUser = sessionUser;
  renderViewTabs();
  updateTopBarForView();
  if (DashDebug && typeof DashDebug.scheduleRenderDebugJsonLogPanel === "function") {
    DashDebug.scheduleRenderDebugJsonLogPanel();
  } else {
    DashDebug.renderDebugJsonLogPanel();
  }
  loadKpiTilesAndChartsForView();
  loadViewTargets().then(function (targets) {
    viewTargets = targets && targets.length ? targets : [{ id: "self", label: "Мой дашборд", user: sessionUser }];
    renderViewTabs();
    updateTopBarForView();
  });
})();
