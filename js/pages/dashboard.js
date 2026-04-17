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
  /** Временное состояние chart-блока до полного выноса в DashboardCharts. */
  var lineChartInstance = null;
  var lineChartIndicators = [];
  var CHART_SELECT_ALL_VALUE = "__all__";
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

  /** Индексы перевёрнутых KPI-карточек (можно держать открытыми несколько) */
  var flippedTileIndices = new Set();
  /** После перехода из drilldown — подсветить соответствующую плитку на новом виде */
  var pendingKpiTileFocus = null;
  /** Hover/focus popover для кнопки `?` */
  var kpiHelpPopoverEl = document.getElementById("kpi-help-popover");
  var claimsTableHelpBtnEl = document.getElementById("claims-table-help-btn");
  var claimsTableHelpPopoverEl = document.getElementById("claims-table-help-popover");
  var claimsTableTitleTextEl = document.getElementById("claims-table-title-text");
  var claimsTableHelpWrapEl = document.getElementById("claims-table-help-wrap");
  var overdueDebtTableTitleEl = document.getElementById("overdue-debt-table-title");
  var debugJsonToggleBtnEl = document.getElementById("debug-kpi-json-toggle");
  var debugJsonSectionEl = document.getElementById("debug-kpi-json-section");
  var DONUT_CHARTS_PER_PAGE = 6;
  var donutChartsPageIndex = 0;

  /* ---------- Навигация по месяцам ---------- */

  function periodKeyInAvailableMonths(y, m, slots) {
    if (typeof DashboardMonthNav === "undefined" || !DashboardMonthNav) return false;
    if (typeof DashboardMonthNav.periodKeyInAvailableMonths === "function") {
      return DashboardMonthNav.periodKeyInAvailableMonths(y, m, slots);
    }
    return false;
  }

  function getMonthNavigatorContextKey() {
    if (typeof DashboardMonthNav === "undefined" || !DashboardMonthNav) return "";
    if (typeof DashboardMonthNav.getMonthNavigatorContextKey === "function") {
      return DashboardMonthNav.getMonthNavigatorContextKey();
    }
    return "";
  }

  /**
   * Месяцы для стрелок навигатора: уникальные (год, месяц) из линейных графиков.
   * В новом JSON у месячной линии часто есть только `fact`, поэтому достаточно любого осмысленного значения в точке.
   */
  function setAvailableMonthsFromChartPoints(chartIndicators, options) {
    if (typeof DashboardMonthNav === "undefined" || !DashboardMonthNav) return;
    if (typeof DashboardMonthNav.setAvailableMonthsFromChartPoints === "function") {
      DashboardMonthNav.setAvailableMonthsFromChartPoints(chartIndicators, options);
    }
  }

  function updateMonthNavigatorUI() {
    if (typeof DashboardMonthNav === "undefined" || !DashboardMonthNav) return;
    if (typeof DashboardMonthNav.updateMonthNavigatorUI === "function") {
      DashboardMonthNav.updateMonthNavigatorUI();
    }
  }

  function navigateToMonth(month, year) {
    if (typeof DashboardMonthNav === "undefined" || !DashboardMonthNav) return;
    if (typeof DashboardMonthNav.navigateToMonth === "function") {
      DashboardMonthNav.navigateToMonth(month, year);
    }
  }

  function navigateToQuarter(quarter, year) {
    if (typeof DashboardMonthNav === "undefined" || !DashboardMonthNav) return;
    if (typeof DashboardMonthNav.navigateToQuarter === "function") {
      DashboardMonthNav.navigateToQuarter(quarter, year);
    }
  }

  function setDebugJsonSectionExpanded(expanded) {
    if (!debugJsonToggleBtnEl || !debugJsonSectionEl) return;
    debugJsonSectionEl.hidden = !expanded;
    debugJsonToggleBtnEl.setAttribute("aria-expanded", expanded ? "true" : "false");
    debugJsonToggleBtnEl.textContent = expanded ? "Скрыть блок для разработчика" : "Для разработчика";
  }

  (function initDebugJsonToggle() {
    if (!debugJsonToggleBtnEl || !debugJsonSectionEl) return;
    setDebugJsonSectionExpanded(false);
    debugJsonToggleBtnEl.addEventListener("click", function () {
      setDebugJsonSectionExpanded(debugJsonSectionEl.hidden);
    });
  })();

  (function initKpiTilesModule() {
    if (typeof DashboardKpiTiles === "undefined" || !DashboardKpiTiles) return;
    if (typeof DashboardKpiTiles.init === "function") {
      DashboardKpiTiles.init({
        tiles: lastKpiTiles,
        flippedTileIndices: flippedTileIndices,
        getTileDetailsState: getKpiTileDetailsState,
        onBeforePageChange: closeKpiTileDrilldown,
      });
    }
  })();

  (function initKpiDrilldownModule() {
    if (typeof DashboardKpiDrilldown === "undefined" || !DashboardKpiDrilldown) return;
    if (typeof DashboardKpiDrilldown.bindLegacyPanel === "function") {
      DashboardKpiDrilldown.bindLegacyPanel({
        getTiles: function () {
          return lastKpiTiles;
        },
        getFlippedTileIndices: function () {
          return flippedTileIndices;
        },
        getDepartmentForCurrentKpiContext: getDepartmentForCurrentKpiContext,
        hideKpiHelpPopover: hideKpiHelpPopover,
        syncKpiTileFlipState: syncKpiTileFlipState,
        renderKpiTileBackFace: renderKpiTileBackFace,
        shouldRenderKpiTileBack: shouldRenderKpiTileBack,
        setPendingFocus: function (value) {
          pendingKpiTileFocus = value;
        },
        goToDepartmentDashboard: function (deptName) {
          hierarchyStack = hierarchyStack.concat([deptName]);
          selectedViewId = "dept:" + encodeURIComponent(deptName);
          viewContextUser = sessionUser;
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
        },
        loadDrilldownTilesForDept: loadDrilldownTilesForDept,
        mapWithConcurrencyLimit: mapWithConcurrencyLimit,
        onUnauthorized: function () {
          Auth.logout();
          window.location.href = "login.html";
        },
        getSessionApiMode: function () {
          return session.apiMode;
        },
        getSessionUserDepartment: function () {
          return sessionUser.department != null ? String(sessionUser.department).trim() : "";
        },
        findMatchingTileAmongChildren: findMatchingTileAmongChildren,
      });
    }
  })();

  (function initHierarchyNavModule() {
    if (typeof DashboardHierarchyNav === "undefined" || !DashboardHierarchyNav) return;
    if (typeof DashboardHierarchyNav.init === "function") {
      DashboardHierarchyNav.init({
        getViewTargets: function () {
          return viewTargets;
        },
        setViewTargets: function (value) {
          viewTargets = value;
        },
        getSelectedViewId: function () {
          return selectedViewId;
        },
        setSelectedViewId: function (value) {
          selectedViewId = value;
        },
        getHierarchyStack: function () {
          return hierarchyStack;
        },
        setHierarchyStack: function (value) {
          hierarchyStack = value;
        },
        getViewContextUser: function () {
          return viewContextUser;
        },
        setViewContextUser: function (value) {
          viewContextUser = value;
        },
        getSessionUser: function () {
          return sessionUser;
        },
        getSessionApiMode: function () {
          return session.apiMode;
        },
        getLastKpiResponseDepartment: function () {
          return lastKpiResponseDepartment;
        },
        fetchImmediateSubordinates: function (department) {
          if (typeof Api === "undefined" || typeof Api.fetchImmediateSubordinates !== "function") {
            return Promise.resolve({ ok: false, immediate_children: [] });
          }
          return Api.fetchImmediateSubordinates({ department: department });
        },
        searchDepartments: function (query) {
          if (typeof Api === "undefined" || typeof Api.searchDepartments !== "function") {
            return Promise.resolve({ ok: false, results: [], error: "Поиск недоступен" });
          }
          return Api.searchDepartments({ q: query, top_k: 5 });
        },
        getMockViewableDashboardTargets: function () {
          return MockData.getViewableDashboardTargets(sessionUser);
        },
        onViewChanged: function () {
          loadKpiTilesAndChartsForView();
        },
        onUnauthorized: function () {
          Auth.logout();
          window.location.href = "login.html";
        },
      });
    }
  })();

  (function initDataLoaderModule() {
    if (typeof DashboardDataLoader === "undefined" || !DashboardDataLoader) return;
    if (typeof DashboardDataLoader.init === "function") {
      DashboardDataLoader.init({
        getSelectedViewId: function () {
          return selectedViewId;
        },
        getViewContextUser: function () {
          return viewContextUser;
        },
        getDepartmentForCurrentKpiContext: getDepartmentForCurrentKpiContext,
        getPeriodState: function () {
          if (typeof DashboardMonthNav === "undefined" || !DashboardMonthNav) {
            return {
              currentPeriodMonth: null,
              currentPeriodYear: null,
              availableMonths: [],
              availableMonthsContextKey: "",
            };
          }
          if (typeof DashboardMonthNav.getPeriodState === "function") {
            return DashboardMonthNav.getPeriodState();
          }
          return {
            currentPeriodMonth: null,
            currentPeriodYear: null,
            availableMonths: [],
            availableMonthsContextKey: "",
          };
        },
        setPeriodState: function (nextState) {
          if (typeof DashboardMonthNav === "undefined" || !DashboardMonthNav) return;
          if (typeof DashboardMonthNav.setPeriodState === "function") {
            DashboardMonthNav.setPeriodState(nextState);
          }
        },
        getMonthNavigatorContextKey: getMonthNavigatorContextKey,
        setAvailableMonthsFromChartPoints: setAvailableMonthsFromChartPoints,
        periodKeyInAvailableMonths: periodKeyInAvailableMonths,
        updateMonthNavigatorUI: updateMonthNavigatorUI,
        closeKpiTileDrilldown: closeKpiTileDrilldown,
        renderKpiTiles: renderKpiTiles,
        updateTopBarForView: updateTopBarForView,
        rememberDrilldownKpiTiles: rememberDrilldownKpiTiles,
        initCharts: initCharts,
        initTables: initTables,
        onUnauthorized: function () {
          Auth.logout();
          window.location.href = "login.html";
        },
        pushDashboardDebugNote: pushDashboardDebugNote,
        fetchKpis: function (opts) {
          return Api.fetchKpis(opts);
        },
        fetchKpiAll: function (opts) {
          return Api.fetchKpiAll(opts);
        },
        getSessionApiMode: function () {
          return session.apiMode;
        },
        getMockKpiTilesForRole: function (role) {
          return MockData.getKpiTilesForRole(role);
        },
        setLastApiChartIndicators: function (value) {
          lastApiChartIndicators = value;
        },
        setLastApiTableRows: function (value) {
          lastApiTableRows = value;
        },
        setLastKpiResponseDepartment: function (value) {
          lastKpiResponseDepartment = value;
        },
      });
    }
  })();

  (function initMonthNavModule() {
    if (typeof DashboardMonthNav === "undefined" || !DashboardMonthNav) return;
    if (typeof DashboardMonthNav.init === "function") {
      DashboardMonthNav.init({
        getSelectedViewId: function () {
          return selectedViewId;
        },
        getDepartmentForCurrentKpiContext: getDepartmentForCurrentKpiContext,
        getViewContextUser: function () {
          return viewContextUser;
        },
        onPeriodChange: function () {
          loadKpiTilesAndChartsForView();
        },
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
    if (typeof DashboardHierarchyNav === "undefined" || !DashboardHierarchyNav) return null;
    if (typeof DashboardHierarchyNav.getCurrentViewTarget === "function") {
      return DashboardHierarchyNav.getCurrentViewTarget();
    }
    return null;
  }

  /**
   * Подразделение для `?department=` в KPI: последний сегмент крошек или `department` из сессии.
   * @returns {string}
   */
  function getDepartmentForCurrentKpiContext() {
    if (typeof DashboardHierarchyNav === "undefined" || !DashboardHierarchyNav) return "";
    if (typeof DashboardHierarchyNav.getDepartmentForCurrentKpiContext === "function") {
      return DashboardHierarchyNav.getDepartmentForCurrentKpiContext();
    }
    return "";
  }

  /** Заголовок страницы и подсказка пользователя в зависимости от выбранной вкладки / крошек. */
  function updateTopBarForView() {
    if (typeof DashboardHierarchyNav === "undefined" || !DashboardHierarchyNav) return;
    if (typeof DashboardHierarchyNav.updateTopBarForView === "function") {
      DashboardHierarchyNav.updateTopBarForView();
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

  /* ---------- KPI: нормализация названий и сопоставление плиток (drilldown) ---------- */

  /** Нормализация заголовка KPI для сравнения (регистр, кавычки, пробелы). */
  function normalizeKpiTitleForMatch(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[«»""]/g, "")
      .trim();
  }

  function titlesExactlyMatchForKpi(a, b) {
    var na = normalizeKpiTitleForMatch(a);
    var nb = normalizeKpiTitleForMatch(b);
    if (!na || !nb) return false;
    return na === nb;
  }

  /** Совпадение двух названий KPI после нормализации регистра и пробелов. */
  function titlesMatchForKpi(a, b) {
    var na = normalizeKpiTitleForMatch(a);
    var nb = normalizeKpiTitleForMatch(b);
    if (!na || !nb) return false;
    return na === nb;
  }

  /**
   * Совпадает ли плитка с целью подсветки после навигации (kpi_id или нормализованный заголовок).
   * @param {object} tile
   * @param {{ kpi_id?: string, title?: string }} focus
   */
  function tileMatchesFocusTarget(tile, focus) {
    if (!tile || !focus) return false;
    if (focus.kpi_id && tile.kpi_id && String(focus.kpi_id) === String(tile.kpi_id)) return true;
    return titlesMatchForKpi(tile.title, focus.title);
  }

  /**
   * Ищет плитку дочернего отдела, соответствующую выбранной (по kpi_id или нормализованному заголовку).
   * @param {object[]|null|undefined} childTiles
   * @param {object} clickedTile
   */
  function findMatchingTileAmongChildren(childTiles, clickedTile) {
    if (!childTiles || !clickedTile) return null;
    for (var i = 0; i < childTiles.length; i++) {
      var t = childTiles[i];
      if (!t) continue;
      if (clickedTile.kpi_id && t.kpi_id && String(clickedTile.kpi_id) === String(t.kpi_id)) return t;
      if (titlesMatchForKpi(t.title, clickedTile.title)) return t;
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

  /* ---------- KPI-card drilldown: flip-card с детьми; пороги — в модалке по «?» ---------- */

  function getKpiTileDetailsState(tileIndex) {
    if (typeof DashboardKpiDrilldown === "undefined" || !DashboardKpiDrilldown) {
      return {
        loading: false,
        loaded: false,
        rows: [],
        hint: "",
      };
    }
    if (typeof DashboardKpiDrilldown.getKpiTileDetailsState === "function") {
      return DashboardKpiDrilldown.getKpiTileDetailsState(tileIndex);
    }
    return {
      loading: false,
      loaded: false,
      rows: [],
      hint: "",
    };
  }

  function hideKpiHelpPopover() {
    if (!kpiHelpPopoverEl) return;
    kpiHelpPopoverEl.hidden = true;
  }

  function updateSidebarBackButton() {
    if (typeof DashboardHierarchyNav === "undefined" || !DashboardHierarchyNav) return;
    if (typeof DashboardHierarchyNav.updateSidebarBackButton === "function") {
      DashboardHierarchyNav.updateSidebarBackButton();
    }
  }

  function filterSidebarViewTabs() {
    if (typeof DashboardHierarchyNav === "undefined" || !DashboardHierarchyNav) return;
    if (typeof DashboardHierarchyNav.filterSidebarViewTabs === "function") {
      DashboardHierarchyNav.filterSidebarViewTabs();
    }
  }

  function resetSidebarSearch() {
    if (typeof DashboardHierarchyNav === "undefined" || !DashboardHierarchyNav) return;
    if (typeof DashboardHierarchyNav.resetSidebarSearch === "function") {
      DashboardHierarchyNav.resetSidebarSearch();
    }
  }

  function onSidebarSearchInput(value) {
    if (typeof DashboardHierarchyNav === "undefined" || !DashboardHierarchyNav) return;
    if (typeof DashboardHierarchyNav.onSidebarSearchInput === "function") {
      DashboardHierarchyNav.onSidebarSearchInput(value);
    }
  }

  function navigateToHierarchyLevel(levelIndex) {
    if (typeof DashboardHierarchyNav === "undefined" || !DashboardHierarchyNav) return;
    if (typeof DashboardHierarchyNav.navigateToHierarchyLevel === "function") {
      DashboardHierarchyNav.navigateToHierarchyLevel(levelIndex);
    }
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

  function buildKpiTileChildrenHtml(state) {
    if (typeof DashboardKpiTiles === "undefined" || !DashboardKpiTiles) {
      return '<div class="kpi-tile-back-message">Нет данных.</div>';
    }
    if (typeof DashboardKpiTiles.buildKpiTileChildrenHtml === "function") {
      return DashboardKpiTiles.buildKpiTileChildrenHtml(state);
    }
    return '<div class="kpi-tile-back-message">Нет данных.</div>';
  }

  function buildKpiTileBackFaceHtml(tile, tileIndex) {
    if (typeof DashboardKpiTiles === "undefined" || !DashboardKpiTiles) return "";
    if (typeof DashboardKpiTiles.buildKpiTileBackFaceHtml === "function") {
      return DashboardKpiTiles.buildKpiTileBackFaceHtml(tile, tileIndex);
    }
    return "";
  }

  function renderKpiTileBackFace(articleEl, tileIndex) {
    if (typeof DashboardKpiTiles === "undefined" || !DashboardKpiTiles) return;
    if (typeof DashboardKpiTiles.renderBackFace === "function") {
      DashboardKpiTiles.renderBackFace({
        tiles: lastKpiTiles,
        articleEl: articleEl,
        tileIndex: tileIndex,
        getTileDetailsState: getKpiTileDetailsState,
      });
    }
  }

  function syncKpiTileFlipState() {
    if (typeof DashboardKpiTiles === "undefined" || !DashboardKpiTiles) return;
    if (typeof DashboardKpiTiles.syncFlipState === "function") {
      DashboardKpiTiles.syncFlipState({
        tiles: lastKpiTiles,
        flippedTileIndices: flippedTileIndices,
        getTileDetailsState: getKpiTileDetailsState,
      });
    }
  }

  /** Скрывает drilldown на карточке и legacy-панель, если она ещё есть в DOM. */
  function closeKpiTileDrilldown() {
    if (typeof DashboardKpiDrilldown === "undefined" || !DashboardKpiDrilldown) return;
    if (typeof DashboardKpiDrilldown.close === "function") {
      DashboardKpiDrilldown.close({
        getFlippedTileIndices: function () {
          return flippedTileIndices;
        },
        hideKpiHelpPopover: hideKpiHelpPopover,
        syncKpiTileFlipState: syncKpiTileFlipState,
      });
    }
  }

  function positionKpiDrilldownPanel() {}

  /**
   * Переход на дашборд выбранного дочернего отдела: крошки, вкладки, повторная загрузка KPI.
   * @param {string} deptName
   * @param {object|null|undefined} [contextTile] — плитка, с оборота которой кликнули дочерний отдел (если несколько открыты)
   */
  function navigateDashboardToDepartmentFromDrill(deptName, contextTile, focusTarget) {
    if (typeof DashboardKpiDrilldown === "undefined" || !DashboardKpiDrilldown) return;
    if (typeof DashboardKpiDrilldown.navigateToDepartmentFromDrill === "function") {
      DashboardKpiDrilldown.navigateToDepartmentFromDrill(deptName, contextTile, focusTarget, {
        getTiles: function () {
          return lastKpiTiles;
        },
        getFlippedTileIndices: function () {
          return flippedTileIndices;
        },
        getDepartmentForCurrentKpiContext: getDepartmentForCurrentKpiContext,
        hideKpiHelpPopover: hideKpiHelpPopover,
        syncKpiTileFlipState: syncKpiTileFlipState,
        renderKpiTileBackFace: renderKpiTileBackFace,
        shouldRenderKpiTileBack: shouldRenderKpiTileBack,
        setPendingFocus: function (value) {
          pendingKpiTileFocus = value;
        },
        goToDepartmentDashboard: function (deptNameValue) {
          hierarchyStack = hierarchyStack.concat([deptNameValue]);
          selectedViewId = "dept:" + encodeURIComponent(deptNameValue);
          viewContextUser = sessionUser;
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
        },
      });
    }
  }

  function loadKpiTileDrilldownData(tileIndex) {
    if (typeof DashboardKpiDrilldown === "undefined" || !DashboardKpiDrilldown) return;
    if (typeof DashboardKpiDrilldown.loadKpiTileDrilldownData === "function") {
      DashboardKpiDrilldown.loadKpiTileDrilldownData(tileIndex, {
        getTiles: function () {
          return lastKpiTiles;
        },
        getFlippedTileIndices: function () {
          return flippedTileIndices;
        },
        getDepartmentForCurrentKpiContext: getDepartmentForCurrentKpiContext,
        hideKpiHelpPopover: hideKpiHelpPopover,
        syncKpiTileFlipState: syncKpiTileFlipState,
        renderKpiTileBackFace: renderKpiTileBackFace,
        shouldRenderKpiTileBack: shouldRenderKpiTileBack,
        loadDrilldownTilesForDept: loadDrilldownTilesForDept,
        mapWithConcurrencyLimit: mapWithConcurrencyLimit,
        onUnauthorized: function () {
          Auth.logout();
          window.location.href = "login.html";
        },
        getSessionApiMode: function () {
          return session.apiMode;
        },
        getSessionUserDepartment: function () {
          return sessionUser.department != null ? String(sessionUser.department).trim() : "";
        },
        findMatchingTileAmongChildren: findMatchingTileAmongChildren,
      });
    }
  }

  /**
   * Переворачивает KPI-карточку и загружает список дочерних отделов на обратную сторону.
   * @param {number} tileIndex — индекс в `lastKpiTiles` / `data-kpi-tile-index`
   */
  function openKpiTileDrilldown(tileIndex) {
    if (typeof DashboardKpiDrilldown === "undefined" || !DashboardKpiDrilldown) return;
    if (typeof DashboardKpiDrilldown.open === "function") {
      DashboardKpiDrilldown.open(tileIndex, {
        getTiles: function () {
          return lastKpiTiles;
        },
        getFlippedTileIndices: function () {
          return flippedTileIndices;
        },
        getDepartmentForCurrentKpiContext: getDepartmentForCurrentKpiContext,
        hideKpiHelpPopover: hideKpiHelpPopover,
        syncKpiTileFlipState: syncKpiTileFlipState,
        renderKpiTileBackFace: renderKpiTileBackFace,
        shouldRenderKpiTileBack: shouldRenderKpiTileBack,
        loadDrilldownTilesForDept: loadDrilldownTilesForDept,
        mapWithConcurrencyLimit: mapWithConcurrencyLimit,
        onUnauthorized: function () {
          Auth.logout();
          window.location.href = "login.html";
        },
        getSessionApiMode: function () {
          return session.apiMode;
        },
        getSessionUserDepartment: function () {
          return sessionUser.department != null ? String(sessionUser.department).trim() : "";
        },
        findMatchingTileAmongChildren: findMatchingTileAmongChildren,
      });
    }
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

  function getKpiTileException(tile) {
    if (typeof DashboardKpiTiles === "undefined" || !DashboardKpiTiles) return null;
    if (typeof DashboardKpiTiles.getKpiTileException === "function") {
      return DashboardKpiTiles.getKpiTileException(tile);
    }
    return null;
  }

  function shouldShowKpiTileHelp(tile) {
    if (typeof DashboardKpiTiles === "undefined" || !DashboardKpiTiles) return true;
    if (typeof DashboardKpiTiles.shouldShowKpiTileHelp === "function") {
      return DashboardKpiTiles.shouldShowKpiTileHelp(tile);
    }
    return true;
  }

  function shouldRenderKpiTileBack(tile) {
    if (typeof DashboardKpiTiles === "undefined" || !DashboardKpiTiles) return true;
    if (typeof DashboardKpiTiles.shouldRenderKpiTileBack === "function") {
      return DashboardKpiTiles.shouldRenderKpiTileBack(tile);
    }
    return true;
  }

  function shouldRenderKpiTileBackDepartmentsOnly(tile) {
    if (typeof DashboardKpiTiles === "undefined" || !DashboardKpiTiles) return false;
    if (typeof DashboardKpiTiles.shouldRenderKpiTileBackDepartmentsOnly === "function") {
      return DashboardKpiTiles.shouldRenderKpiTileBackDepartmentsOnly(tile);
    }
    return false;
  }

  function updateKpiTilesPagerUI() {
    if (typeof DashboardKpiTiles === "undefined" || !DashboardKpiTiles) return;
    if (typeof DashboardKpiTiles.updatePagerUI === "function") {
      DashboardKpiTiles.updatePagerUI({
        tiles: lastKpiTiles,
      });
    }
  }

  /**
   * Рендерит KPI-плитки единой адаптивной сеткой; оборот карточки строится отдельно при flip.
   * Более 6 плиток — постраничный показ (3×2) и навигатор `#kpi-tiles-pager`.
   * @param {object[]} tiles
   */
  function renderKpiTiles(tiles) {
    lastKpiTiles = tiles && tiles.length ? tiles : null;
    flippedTileIndices.clear();
    if (typeof DashboardKpiDrilldown !== "undefined" && DashboardKpiDrilldown) {
      if (typeof DashboardKpiDrilldown.resetState === "function") {
        DashboardKpiDrilldown.resetState();
      }
    }
    donutChartsPageIndex = 0;
    if (typeof DashboardKpiTiles === "undefined" || !DashboardKpiTiles) return;
    if (typeof DashboardKpiTiles.render === "function") {
      DashboardKpiTiles.render({
        tiles: lastKpiTiles,
        flippedTileIndices: flippedTileIndices,
        pendingFocus: pendingKpiTileFocus,
        matchFocusTarget: tileMatchesFocusTarget,
        clearPendingFocus: function () {
          pendingKpiTileFocus = null;
        },
      });
    }
  }

  /* ---------- Таблицы дашборда ---------- */

  function normalizeDashboardRole(value) {
    return value == null ? "" : String(value).trim().toLocaleLowerCase("ru-RU");
  }

  function isBoardChairUser(user) {
    if (!user || typeof user !== "object") return false;
    var role = normalizeDashboardRole(user.role);
    var department = normalizeDashboardRole(user.department);
    return role === "председатель совета директоров" || department === "председатель совета директоров";
  }

  function isCommercialDirectorUser(user) {
    if (!user || typeof user !== "object") return false;
    var role = normalizeDashboardRole(user.role);
    var department = normalizeDashboardRole(user.department);
    return role === "коммерческий директор" || department === "коммерческий директор" || department === "коммерция";
  }

  function shouldUseBoardChairExecutiveTables() {
    return isBoardChairUser(sessionUser) && selectedViewId === "self";
  }

  function shouldUseCommercialDirectorOverdueDebtEnhancements() {
    return isCommercialDirectorUser(sessionUser) && !shouldUseBoardChairExecutiveTables();
  }

  function updateDashboardTableTitlesForRole() {
    var isBoardChairOwnDashboard = shouldUseBoardChairExecutiveTables();

    if (claimsTableTitleTextEl) {
      claimsTableTitleTextEl.textContent = isBoardChairOwnDashboard ? "ТОП-10 отклонений" : "Претензии";
    }

    if (overdueDebtTableTitleEl) {
      overdueDebtTableTitleEl.textContent = isBoardChairOwnDashboard
        ? "ТОП-10 решений / эскалаций"
        : "Расшифровка просроченной дебиторской задолженности";
    }

    if (claimsTableHelpWrapEl) {
      claimsTableHelpWrapEl.hidden = isBoardChairOwnDashboard;
    }
    if (isBoardChairOwnDashboard) {
      hideClaimsTableHelpPopover();
    }
  }

  function initTables() {
    updateDashboardTableTitlesForRole();
    if (typeof DashboardClaimsTable === "undefined" || !DashboardClaimsTable) return;
    if (typeof DashboardClaimsTable.init === "function") {
      DashboardClaimsTable.init({
        rows: lastApiTableRows,
        executiveMode: shouldUseBoardChairExecutiveTables(),
        enhanceOverdueDebtTable: shouldUseCommercialDirectorOverdueDebtEnhancements(),
      });
    }
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
      var pairKey = "indicator-" + String(idx);

      acc.push({
        type: "line",
        name: label,
        legendLabel: shortenLineLegendLabel(label, "Ф"),
        indicatorLabel: label,
        pairKey: pairKey,
        valueRole: "fact",
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
          indicatorLabel: label,
          pairKey: pairKey,
          valueRole: "plan",
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

  function findLineSeriesByRole(chart, pairKey, role) {
    if (!chart || !pairKey || !role || !chart.series) return null;
    for (var i = 0; i < chart.series.length; i++) {
      var series = chart.series[i];
      var opts = (series && series.userOptions) || {};
      if (opts.pairKey === pairKey && opts.valueRole === role) return series;
    }
    return null;
  }

  function getSeriesPointValue(series, pointIndex) {
    if (!series || !series.points || pointIndex < 0 || pointIndex >= series.points.length) return null;
    var point = series.points[pointIndex];
    if (!point || point.y == null || isNaN(Number(point.y))) return null;
    return Number(point.y);
  }

  function buildAllIndicatorsLineTooltip() {
    var point = this.point;
    var series = this.series;
    var chart = series && series.chart;
    var opts = (series && series.userOptions) || {};
    var pointIndex = point ? point.index : -1;
    var pairKey = opts.pairKey;
    var factSeries = opts.valueRole === "fact" ? series : findLineSeriesByRole(chart, pairKey, "fact");
    var planSeries = opts.valueRole === "plan" ? series : findLineSeriesByRole(chart, pairKey, "plan");
    var factValue = getSeriesPointValue(factSeries, pointIndex);
    var planValue = getSeriesPointValue(planSeries, pointIndex);
    var indicatorLabel = opts.indicatorLabel || series.name || "Показатель";
    var html = '<span style="font-size:10px">' + DashUi.escapeHtml(String(this.x)) + "</span><br/>";

    html +=
      '<span style="color:#64748b">KPI:</span> <b>' +
      DashUi.escapeHtml(indicatorLabel) +
      "</b><br/>";

    if (planValue != null) {
      html +=
        '<span style="color:' + planSeries.color + '">\u25cf</span> План: <b>' +
        DashUi.escapeHtml(DashUi.formatNumber(planValue)) +
        "</b><br/>";
    }

    if (factValue != null) {
      html +=
        '<span style="color:' + factSeries.color + '">\u25cf</span> Факт: <b>' +
        DashUi.escapeHtml(DashUi.formatNumber(factValue)) +
        "</b><br/>";
    }

    if (planValue == null && factValue == null && point && point.y != null) {
      html +=
        '<span style="color:' + point.color + '">\u25cf</span> ' +
        DashUi.escapeHtml(opts.valueRole === "plan" ? "План" : "Факт") +
        ": <b>" +
        DashUi.escapeHtml(DashUi.formatNumber(point.y)) +
        "</b><br/>";
    }

    return html;
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
      tooltip: {
        shared: false,
        useHTML: true,
        formatter: buildAllIndicatorsLineTooltip,
      },
      plotOptions: {
        series: {
          animation: false,
          findNearestPointBy: "xy",
          stickyTracking: false,
        },
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

  function showDashboardChartsModuleError() {
    var msg =
      '<p class="chart-load-error" style="margin:0;padding:20px;color:#64748b;font-size:14px;">Графики недоступны: не загрузился модуль DashboardCharts.</p>';
    ["chart-line", "chart-bar", "donuts-grid"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = msg;
    });
  }

  function destroyAllDashboardCharts() {
    if (typeof DashboardCharts === "undefined" || !DashboardCharts) return;
    if (typeof DashboardCharts.destroyAllDashboardCharts === "function") {
      DashboardCharts.destroyAllDashboardCharts();
    }
  }

  function renderDonutCharts() {
    if (typeof DashboardCharts === "undefined" || !DashboardCharts) return;
    if (typeof DashboardCharts.renderDonutCharts === "function") {
      DashboardCharts.renderDonutCharts({
        currentTiles: lastKpiTiles,
        getVisibleDonutTiles: getVisibleDonutTiles,
        updateDonutChartsPagerUI: updateDonutChartsPagerUI,
      });
    }
  }

  function initCharts() {
    if (typeof DashboardCharts === "undefined" || !DashboardCharts) {
      showDashboardChartsModuleError();
      return;
    }
    if (typeof DashboardCharts.initCharts !== "function") {
      showDashboardChartsModuleError();
      return;
    }
    DashboardCharts.initCharts({
      role: viewContextUser.role,
      apiChartIndicators: lastApiChartIndicators,
      currentTiles: lastKpiTiles,
      chartSelectAllValue: CHART_SELECT_ALL_VALUE,
      getVisibleDonutTiles: getVisibleDonutTiles,
      updateDonutChartsPagerUI: updateDonutChartsPagerUI,
      onNavigateToMonth: navigateToMonth,
      onNavigateToQuarter: navigateToQuarter,
    });
  }

  function cancelDeferredChartsAndTablesBoot() {
    if (typeof DashboardDataLoader === "undefined" || !DashboardDataLoader) return;
    if (typeof DashboardDataLoader.cancelDeferredChartsAndTablesBoot === "function") {
      DashboardDataLoader.cancelDeferredChartsAndTablesBoot();
    }
  }

  /** Шапка и плитки показываются сразу, а тяжёлые графики/таблицы догружаются позже. */
  function bootChartsAndTablesDeferred() {
    if (typeof DashboardDataLoader === "undefined" || !DashboardDataLoader) return;
    if (typeof DashboardDataLoader.bootChartsAndTablesDeferred === "function") {
      DashboardDataLoader.bootChartsAndTablesDeferred();
    }
  }

  function renderHierarchyBreadcrumb() {
    if (typeof DashboardHierarchyNav === "undefined" || !DashboardHierarchyNav) return;
    if (typeof DashboardHierarchyNav.renderHierarchyBreadcrumb === "function") {
      DashboardHierarchyNav.renderHierarchyBreadcrumb();
    }
  }

  /** Перезагружает `viewTargets` по `Api.fetchImmediateSubordinates` для текущего родителя в стеке. */
  function refreshSubordinateTabsFromApi() {
    if (typeof DashboardHierarchyNav === "undefined" || !DashboardHierarchyNav) {
      return Promise.resolve();
    }
    if (typeof DashboardHierarchyNav.refreshSubordinateTabsFromApi === "function") {
      return DashboardHierarchyNav.refreshSubordinateTabsFromApi();
    }
    return Promise.resolve();
  }

  function loadViewTargets() {
    if (typeof DashboardHierarchyNav === "undefined" || !DashboardHierarchyNav) {
      return Promise.resolve([{ id: "self", label: "Мой дашборд", user: sessionUser }]);
    }
    if (typeof DashboardHierarchyNav.loadViewTargets === "function") {
      return DashboardHierarchyNav.loadViewTargets();
    }
    return Promise.resolve([{ id: "self", label: "Мой дашборд", user: sessionUser }]);
  }

  /** Вкладки `viewTargets` + переключение вида и перезагрузка KPI. */
  function renderViewTabs() {
    if (typeof DashboardHierarchyNav === "undefined" || !DashboardHierarchyNav) return;
    if (typeof DashboardHierarchyNav.renderViewTabs === "function") {
      DashboardHierarchyNav.renderViewTabs();
    }
  }

  /** Показ спиннера, скрытие основного контента. */
  function showLoading() {
    if (typeof DashboardDataLoader === "undefined" || !DashboardDataLoader) return;
    if (typeof DashboardDataLoader.showLoading === "function") {
      DashboardDataLoader.showLoading();
    }
  }

  /** Скрытие спиннера, показ контента. */
  function hideLoading() {
    if (typeof DashboardDataLoader === "undefined" || !DashboardDataLoader) return;
    if (typeof DashboardDataLoader.hideLoading === "function") {
      DashboardDataLoader.hideLoading();
    }
  }

  /**
   * Общий разбор успешного/ошибочного ответа KPI: плитки, кэш drilldown, графики, шапка.
   * @param {object} result — как от `Api.fetchKpis` / `fetchKpiAll`
   * @param {string} [_source] — зарезервировано для логирования источника вызова
   */
  function applyApiResult(result, _source) {
    if (typeof DashboardDataLoader === "undefined" || !DashboardDataLoader) return;
    if (typeof DashboardDataLoader.applyApiResult === "function") {
      DashboardDataLoader.applyApiResult(result, _source);
    }
  }

  /**
   * Главная загрузка данных экрана: «свой» дашборд (`fetchKpis`) или подразделение (`fetchKpiAll`).
   * При ошибке или mock — fallback на `MockData`.
   */
  function loadKpiTilesAndChartsForView() {
    if (typeof DashboardDataLoader === "undefined" || !DashboardDataLoader) return;
    if (typeof DashboardDataLoader.loadKpiTilesAndChartsForView === "function") {
      DashboardDataLoader.loadKpiTilesAndChartsForView();
    }
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
