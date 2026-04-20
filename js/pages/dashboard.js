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
  /** Верхний каталог дашбордов для ПСД */
  var chairmanDashboardTargets = [];
  var selectedViewId = "self";
  /** Путь от подразделения пользователя вниз по дереву (для запроса детей и хлебных крошек) */
  var hierarchyStack = [];
  var CHART_SELECT_ALL_VALUE = "__all__";
  /** Плитки KPI последней отрисовки — для синхронизации круговых с 6 плитками */
  var lastKpiTiles = null;

  /** Индикаторы для графиков, полученные от API (null = данных нет, использовать MockData) */
  var lastApiChartIndicators = null;
  /** Строки таблицы из API */
  var lastApiTableRows = null;
  /** Последний raw-ответ KPI для локального пересчёта плиток ПСД */
  var lastRawKpiResponse = null;
  /** Подпись в шапке из поля department последнего успешного ответа KPI (json) */
  var lastKpiResponseDepartment = null;
  /** Режим агрегации плиток ПСД */
  var chairmanAggregationMode = "current";

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
  var claimsTableSwitcherEl = document.getElementById("claims-table-switcher");
  var activeClaimsTableView = "claims";
  var debugJsonToggleBtnEl = document.getElementById("debug-kpi-json-toggle");
  var debugJsonSectionEl = document.getElementById("debug-kpi-json-section");
  var DONUT_CHARTS_PER_PAGE = 6;
  var donutChartsPageIndex = 0;

  function handleUnauthorized() {
    Auth.logout();
    window.location.href = "login.html";
  }

  function callMonthNav(methodName, args, fallbackValue) {
    if (typeof DashboardMonthNav === "undefined" || !DashboardMonthNav) return fallbackValue;
    var method = DashboardMonthNav[methodName];
    if (typeof method !== "function") return fallbackValue;
    return method.apply(DashboardMonthNav, Array.isArray(args) ? args : []);
  }

  function callHierarchyNav(methodName, args, fallbackValue) {
    if (typeof DashboardHierarchyNav === "undefined" || !DashboardHierarchyNav) return fallbackValue;
    var method = DashboardHierarchyNav[methodName];
    if (typeof method !== "function") return fallbackValue;
    return method.apply(DashboardHierarchyNav, Array.isArray(args) ? args : []);
  }

  function callDataLoader(methodName, args, fallbackValue) {
    if (typeof DashboardDataLoader === "undefined" || !DashboardDataLoader) return fallbackValue;
    var method = DashboardDataLoader[methodName];
    if (typeof method !== "function") return fallbackValue;
    return method.apply(DashboardDataLoader, Array.isArray(args) ? args : []);
  }

  function callChairmanOverview(methodName, args, fallbackValue) {
    if (typeof DashboardChairmanOverview === "undefined" || !DashboardChairmanOverview) return fallbackValue;
    var method = DashboardChairmanOverview[methodName];
    if (typeof method !== "function") return fallbackValue;
    return method.apply(DashboardChairmanOverview, Array.isArray(args) ? args : []);
  }

  function isChairmanOverviewVisible() {
    return !!callChairmanOverview("isVisible", [], false);
  }

  /* ---------- Навигация по месяцам ---------- */

  function periodKeyInAvailableMonths(y, m, slots) {
    return callMonthNav("periodKeyInAvailableMonths", [y, m, slots], false);
  }

  function getMonthNavigatorContextKey() {
    return callMonthNav("getMonthNavigatorContextKey", [], "");
  }

  /**
   * Месяцы для стрелок навигатора: уникальные (год, месяц) из линейных графиков.
   * В новом JSON у месячной линии часто есть только `fact`, поэтому достаточно любого осмысленного значения в точке.
   */
  function setAvailableMonthsFromChartPoints(chartIndicators, options) {
    callMonthNav("setAvailableMonthsFromChartPoints", [chartIndicators, options]);
  }

  function updateMonthNavigatorUI() {
    callMonthNav("updateMonthNavigatorUI");
  }

  function navigateToMonth(month, year) {
    callMonthNav("navigateToMonth", [month, year]);
  }

  function navigateToQuarter(quarter, year) {
    callMonthNav("navigateToQuarter", [quarter, year]);
  }

  function setDebugJsonSectionExpanded(expanded) {
    if (!debugJsonToggleBtnEl || !debugJsonSectionEl) return;
    debugJsonSectionEl.hidden = !expanded;
    debugJsonToggleBtnEl.setAttribute("aria-expanded", expanded ? "true" : "false");
    debugJsonToggleBtnEl.textContent = expanded ? "Скрыть блок для разработчика" : "Для разработчика";
  }

  function getSessionUserDepartment() {
    return sessionUser.department != null ? String(sessionUser.department).trim() : "";
  }

  function goToDepartmentDashboard(deptName) {
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
  }

  function createKpiDrilldownBaseContext() {
    return {
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
    };
  }

  function createKpiDrilldownDataContext() {
    return Object.assign(createKpiDrilldownBaseContext(), {
      loadDrilldownTilesForDept: loadDrilldownTilesForDept,
      mapWithConcurrencyLimit: mapWithConcurrencyLimit,
      onUnauthorized: handleUnauthorized,
      getSessionApiMode: function () {
        return session.apiMode;
      },
      getSessionUserDepartment: getSessionUserDepartment,
      findMatchingTileAmongChildren: findMatchingTileAmongChildren,
    });
  }

  function createKpiDrilldownNavigationContext() {
    return Object.assign(createKpiDrilldownBaseContext(), {
      setPendingFocus: function (value) {
        pendingKpiTileFocus = value;
      },
      goToDepartmentDashboard: goToDepartmentDashboard,
    });
  }

  function createKpiDrilldownCloseContext() {
    return {
      getFlippedTileIndices: function () {
        return flippedTileIndices;
      },
      hideKpiHelpPopover: hideKpiHelpPopover,
      syncKpiTileFlipState: syncKpiTileFlipState,
    };
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
      DashboardKpiDrilldown.bindLegacyPanel(
        Object.assign(createKpiDrilldownDataContext(), createKpiDrilldownNavigationContext())
      );
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
        getChairmanDashboardTargets: function () {
          return chairmanDashboardTargets;
        },
        setChairmanDashboardTargets: function (value) {
          chairmanDashboardTargets = value;
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
          var opts = { department: department };
          var chairmanFor = getChairmanDashboardCatalogId();
          if (chairmanFor && isChairmanRootHierarchy()) {
            opts.for = chairmanFor;
            if (isChairmanRootHierarchy() && isVirtualChairmanCatalog(chairmanFor)) {
              var sessDept =
                sessionUser && sessionUser.department != null
                  ? String(sessionUser.department).trim()
                  : "";
              if (sessDept) {
                opts.department = sessDept;
              } else {
                delete opts.department;
              }
            }
          }
          return Api.fetchImmediateSubordinates(opts);
        },
        fetchChairmanDashboardCatalog: function () {
          if (typeof Api === "undefined" || typeof Api.fetchChairmanDashboardCatalog !== "function") {
            return Promise.resolve({ ok: false, items: [], error: "Каталог ПСД недоступен" });
          }
          return Api.fetchChairmanDashboardCatalog();
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
        onUnauthorized: handleUnauthorized,
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
        getChairmanDashboardCatalogId: getChairmanDashboardCatalogId,
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
        onUnauthorized: handleUnauthorized,
        pushDashboardDebugNote: pushDashboardDebugNote,
        fetchKpis: function (opts) {
          var nextOpts = Object.assign({}, opts || {});
          var chairmanFor = getChairmanDashboardCatalogId();
          if (chairmanFor && isChairmanRootHierarchy()) {
            nextOpts.for = chairmanFor;
          }
          return Api.fetchKpis(nextOpts);
        },
        fetchKpiAll: function (opts) {
          var nextOpts = Object.assign({}, opts || {});
          var chairmanFor = getChairmanDashboardCatalogId();
          if (chairmanFor && isChairmanRootHierarchy()) {
            nextOpts.for = chairmanFor;
          }
          return Api.fetchKpiAll(nextOpts);
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
        setLastRawKpiResponse: function (value) {
          lastRawKpiResponse = value;
        },
        setLastKpiResponseDepartment: function (value) {
          lastKpiResponseDepartment = value;
        },
        getChairmanAggregationMode: function () {
          return chairmanAggregationMode;
        },
        getChairmanAggregatedTilesFromRaw: getChairmanAggregatedTilesFromRaw,
      });
    }
  })();

  (function initChairmanOverviewModule() {
    if (typeof DashboardChairmanOverview === "undefined" || !DashboardChairmanOverview) return;
    if (typeof DashboardChairmanOverview.init !== "function") return;
    DashboardChairmanOverview.init({
      getChairmanTargets: function () {
        return chairmanDashboardTargets || [];
      },
      getSessionUser: function () {
        return sessionUser;
      },
      getHierarchyStack: function () {
        return hierarchyStack;
      },
      getPeriodState: function () {
        if (typeof DashboardMonthNav === "undefined" || !DashboardMonthNav) return null;
        if (typeof DashboardMonthNav.getPeriodState !== "function") return null;
        return DashboardMonthNav.getPeriodState();
      },
      fetchOverviewTiles: function (catalogId) {
        if (typeof Api === "undefined" || typeof Api.fetchKpis !== "function") {
          return Promise.resolve({ ok: false, tiles: [] });
        }
        var opts = {};
        if (catalogId != null && String(catalogId).trim() !== "") {
          opts.for = String(catalogId).trim();
        }
        if (typeof DashboardMonthNav !== "undefined" && DashboardMonthNav && typeof DashboardMonthNav.getPeriodState === "function") {
          var ps = DashboardMonthNav.getPeriodState();
          if (ps && ps.currentPeriodMonth != null) opts.month = Number(ps.currentPeriodMonth);
          if (ps && ps.currentPeriodYear != null) opts.year = Number(ps.currentPeriodYear);
        }
        return Api.fetchKpis(opts);
      },
      onExpand: function (target) {
        if (!target) return;
        selectedViewId = target.id || "self";
        viewContextUser = target.user || sessionUser;
        var selfDeptRaw =
          sessionUser && sessionUser.department != null ? String(sessionUser.department).trim() : "";
        hierarchyStack = selfDeptRaw ? [selfDeptRaw] : [];
        if (
          typeof DashboardHierarchyNav !== "undefined" &&
          DashboardHierarchyNav &&
          typeof DashboardHierarchyNav.rememberChairmanCatalogId === "function"
        ) {
          DashboardHierarchyNav.rememberChairmanCatalogId(target.catalogId);
        }
        if (session.apiMode === "mock") {
          renderViewTabs();
          updateTopBarForView();
          loadKpiTilesAndChartsForView();
          return;
        }
        refreshSubordinateTabsFromApi().then(function () {
          renderViewTabs();
          updateTopBarForView();
          loadKpiTilesAndChartsForView();
        });
      },
      onBackToOverview: function () {
        selectedViewId = "self";
        viewContextUser = sessionUser;
        var selfDept =
          sessionUser && sessionUser.department != null ? String(sessionUser.department).trim() : "";
        hierarchyStack = selfDept ? [selfDept] : [];
        if (
          typeof DashboardHierarchyNav !== "undefined" &&
          DashboardHierarchyNav &&
          typeof DashboardHierarchyNav.clearRememberedChairmanCatalogId === "function"
        ) {
          DashboardHierarchyNav.clearRememberedChairmanCatalogId();
        }
        renderViewTabs();
        updateTopBarForView();
      },
    });
  })();

  (function initMonthNavModule() {
    if (typeof DashboardMonthNav === "undefined" || !DashboardMonthNav) return;
    if (typeof DashboardMonthNav.init === "function") {
      DashboardMonthNav.init({
        getSelectedViewId: function () {
          return selectedViewId;
        },
        getSessionUser: function () {
          return sessionUser;
        },
        getDepartmentForCurrentKpiContext: getDepartmentForCurrentKpiContext,
        getViewContextUser: function () {
          return viewContextUser;
        },
        onPeriodChange: function () {
          if (isChairmanOverviewVisible()) {
            callChairmanOverview("reload", []);
            return;
          }
          loadKpiTilesAndChartsForView();
        },
        onAggregationModeChange: function (mode) {
          chairmanAggregationMode = mode || "current";
          rerenderChairmanTilesFromRaw();
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

  /** Ключ кэша drilldown: отдел + выбранный в навигаторе месяц (иначе данные «теряют» апрель и т.п.). */
  function drilldownTilesCacheKey(deptName) {
    var d = deptName != null ? String(deptName).trim() : "";
    if (!d) return "";
    if (typeof DashboardMonthNav !== "undefined" && DashboardMonthNav.getPeriodState) {
      var ps = DashboardMonthNav.getPeriodState();
      if (
        ps &&
        ps.currentPeriodMonth != null &&
        ps.currentPeriodYear != null &&
        !isNaN(Number(ps.currentPeriodMonth)) &&
        !isNaN(Number(ps.currentPeriodYear))
      ) {
        return d + "\0" + ps.currentPeriodYear + "-" + ps.currentPeriodMonth;
      }
    }
    return d;
  }

  /** Сохраняет плитки отдела в LRU-кэш для повторного открытия drilldown. */
  function rememberDrilldownKpiTiles(dept, tiles) {
    var d = dept != null ? String(dept).trim() : "";
    if (!d || !tiles || !tiles.length) return;
    drilldownKpiTilesCache[drilldownTilesCacheKey(d)] = tiles;
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
    var cacheKey = drilldownTilesCacheKey(cn);
    var cached = drilldownKpiTilesCache[cacheKey];
    if (cached && cached.length) {
      return Promise.resolve({ name: cn, tiles: cached });
    }
    if (typeof Api === "undefined" || typeof Api.fetchKpis !== "function") {
      return Promise.resolve({ name: cn, tiles: [] });
    }
    var fetchOpts = { department: cn };
    if (typeof DashboardMonthNav !== "undefined" && DashboardMonthNav.getPeriodState) {
      var ps = DashboardMonthNav.getPeriodState();
      if (ps && ps.currentPeriodMonth != null && ps.currentPeriodYear != null) {
        fetchOpts.month = Number(ps.currentPeriodMonth);
        fetchOpts.year = Number(ps.currentPeriodYear);
      }
    }
    return Api.fetchKpis(fetchOpts)
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
    return callHierarchyNav("getCurrentViewTarget", [], null);
  }

  function getChairmanDashboardCatalogId() {
    var fromNav = callHierarchyNav("getActiveChairmanCatalogId", [], "");
    if (fromNav) return fromNav;
    var target = getCurrentViewTarget();
    if (!target || target.catalogKind !== "chairman" || target.catalogId == null) return "";
    return String(target.catalogId).trim();
  }

  function isChairmanRootHierarchy() {
    return Array.isArray(hierarchyStack) && hierarchyStack.length <= 1;
  }

  function isVirtualChairmanCatalog(catalogId) {
    var id = catalogId != null ? String(catalogId).trim() : "";
    return !!id && id !== "my_dashboard";
  }

  /**
   * Подразделение для `?department=` в KPI: последний сегмент крошек или `department` из сессии.
   * @returns {string}
   */
  function getDepartmentForCurrentKpiContext() {
    return callHierarchyNav("getDepartmentForCurrentKpiContext", [], "");
  }

  /** Заголовок страницы и подсказка пользователя в зависимости от выбранной вкладки / крошек. */
  function updateTopBarForView() {
    callHierarchyNav("updateTopBarForView");
  }

  document.getElementById("btn-logout").addEventListener("click", handleUnauthorized);

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
    callHierarchyNav("updateSidebarBackButton");
  }

  function filterSidebarViewTabs() {
    callHierarchyNav("filterSidebarViewTabs");
  }

  function resetSidebarSearch() {
    callHierarchyNav("resetSidebarSearch");
  }

  function onSidebarSearchInput(value) {
    callHierarchyNav("onSidebarSearchInput", [value]);
  }

  function navigateToHierarchyLevel(levelIndex) {
    callHierarchyNav("navigateToHierarchyLevel", [levelIndex]);
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

  if (claimsTableSwitcherEl) {
    claimsTableSwitcherEl.addEventListener("click", function (e) {
      var target = e.target && e.target.closest ? e.target.closest(".claims-table-switcher-btn") : null;
      if (!target || !claimsTableSwitcherEl.contains(target)) return;
      var view = target.getAttribute("data-claims-view") || "claims";
      if (view === activeClaimsTableView) return;
      applyClaimsTableView(view);
    });
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
      DashboardKpiDrilldown.close(createKpiDrilldownCloseContext());
    }
  }

  /**
   * Переход на дашборд выбранного дочернего отдела: крошки, вкладки, повторная загрузка KPI.
   * @param {string} deptName
   * @param {object|null|undefined} [contextTile] — плитка, с оборота которой кликнули дочерний отдел (если несколько открыты)
   */
  function navigateDashboardToDepartmentFromDrill(deptName, contextTile, focusTarget) {
    if (typeof DashboardKpiDrilldown === "undefined" || !DashboardKpiDrilldown) return;
    if (typeof DashboardKpiDrilldown.navigateToDepartmentFromDrill === "function") {
      DashboardKpiDrilldown.navigateToDepartmentFromDrill(
        deptName,
        contextTile,
        focusTarget,
        createKpiDrilldownNavigationContext()
      );
    }
  }

  function loadKpiTileDrilldownData(tileIndex) {
    if (typeof DashboardKpiDrilldown === "undefined" || !DashboardKpiDrilldown) return;
    if (typeof DashboardKpiDrilldown.loadKpiTileDrilldownData === "function") {
      DashboardKpiDrilldown.loadKpiTileDrilldownData(tileIndex, createKpiDrilldownDataContext());
    }
  }

  /**
   * Переворачивает KPI-карточку и загружает список дочерних отделов на обратную сторону.
   * @param {number} tileIndex — индекс в `lastKpiTiles` / `data-kpi-tile-index`
   */
  function openKpiTileDrilldown(tileIndex) {
    if (typeof DashboardKpiDrilldown === "undefined" || !DashboardKpiDrilldown) return;
    if (typeof DashboardKpiDrilldown.open === "function") {
      DashboardKpiDrilldown.open(tileIndex, createKpiDrilldownDataContext());
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

  function isCommercialDepartmentContext(value) {
    var normalized = normalizeDashboardRole(value);
    return normalized === "коммерческий директор" || normalized === "коммерция";
  }

  function chairmanAggregationModeLabel(mode) {
    if (mode === "quarter") return "За квартал";
    if (mode === "ytd") return "С начала года";
    return "На текущий момент";
  }

  function parseNumberLoose(value) {
    if (typeof value === "number" && !isNaN(value)) return value;
    if (value == null || value === "") return null;
    var normalized = parseFloat(String(value).replace(/[^\d.,\-]/g, "").replace(",", "."));
    return isNaN(normalized) ? null : normalized;
  }

  function getMonthShortRu(month) {
    var names = ["янв.", "фев.", "март", "апр.", "май", "июнь", "июль", "авг.", "сент.", "окт.", "нояб.", "дек."];
    var index = Number(month) - 1;
    return index >= 0 && index < names.length ? names[index] : "";
  }

  function buildChairmanAggregationPeriodLabel(mode, year, month, points, selectedQuarters) {
    var y = Number(year);
    var m = Number(month);
    if (isNaN(y) || isNaN(m) || m < 1 || m > 12) return "";
    if (mode === "quarter") {
      var qs = Array.isArray(selectedQuarters) ? selectedQuarters.slice() : [];
      qs = qs
        .map(function (v) { return parseInt(String(v), 10); })
        .filter(function (q) { return !isNaN(q) && q >= 1 && q <= 4; })
        .sort(function (a, b) { return a - b; });
      if (!qs.length) {
        qs = [Math.ceil(m / 3)];
      }
      var roman = ["I", "II", "III", "IV"];
      var label = qs.map(function (q) { return (roman[q - 1] || String(q)) + " кв."; }).join(", ");
      var minQ = qs[0];
      var maxQ = qs[qs.length - 1];
      var startMonth = (minQ - 1) * 3 + 1;
      var endMonth = maxQ * 3;
      return "Накопительно за " + label + " " + y + " (" + getMonthShortRu(startMonth) + "–" + getMonthShortRu(endMonth) + ")";
    }
    if (mode === "ytd") {
      return "Накопительно с начала " + y + " г. (янв.–" + getMonthShortRu(m) + ")";
    }
    if (Array.isArray(points)) {
      for (var i = 0; i < points.length; i++) {
        var point = points[i];
        if (!point) continue;
        if (Number(point.year) === y && Number(point.month) === m) {
          var monthName = point.month_name != null ? String(point.month_name).trim() : "";
          if (monthName) {
            return monthName.charAt(0).toUpperCase() + monthName.slice(1) + " " + y;
          }
        }
      }
    }
    return getMonthShortRu(m) + " " + y;
  }

  function computeChairmanAggregatedPoint(item, year, month, mode, selectedQuarters) {
    if (!item || typeof item !== "object") return null;
    var points = Array.isArray(item.monthly_data) ? item.monthly_data.slice() : [];
    if (!points.length) return null;
    var y = Number(year);
    var m = Number(month);
    if (isNaN(y) || isNaN(m) || m < 1 || m > 12) return null;

    var filtered = points
      .filter(function (point) {
        return point && Number(point.year) === y && Number(point.month) >= 1 && Number(point.month) <= 12;
      })
      .sort(function (a, b) {
        return Number(a.month) - Number(b.month);
      });
    if (!filtered.length) return null;

    if (mode !== "quarter" && mode !== "ytd") {
      for (var ci = 0; ci < filtered.length; ci++) {
        if (Number(filtered[ci].month) === m) return filtered[ci];
      }
      return null;
    }

    var bucket = [];
    if (mode === "quarter") {
      var qs = Array.isArray(selectedQuarters) ? selectedQuarters.slice() : [];
      qs = qs
        .map(function (v) { return parseInt(String(v), 10); })
        .filter(function (q) { return !isNaN(q) && q >= 1 && q <= 4; })
        .sort(function (a, b) { return a - b; });
      if (!qs.length) qs = [Math.ceil(m / 3)];
      var ranges = qs.map(function (q) {
        return { start: (q - 1) * 3 + 1, end: q * 3 };
      });
      bucket = filtered.filter(function (point) {
        var pointMonth = Number(point.month);
        for (var i = 0; i < ranges.length; i++) {
          if (pointMonth >= ranges[i].start && pointMonth <= ranges[i].end) return true;
        }
        return false;
      });
    } else {
      var startMonth = 1;
      bucket = filtered.filter(function (point) {
        var pointMonth = Number(point.month);
        return pointMonth >= startMonth && pointMonth <= m;
      });
    }
    if (!bucket.length) return null;

    var plan = 0;
    var fact = 0;
    var kpiPct = null;
    var hasPlan = false;
    var hasFact = false;
    var lastPct = null;
    var hasData = false;

    bucket.forEach(function (point) {
      var planValue = parseNumberLoose(point.plan);
      var factValue = parseNumberLoose(point.fact);
      var pctValue = parseNumberLoose(point.kpi_pct);
      if (planValue != null) {
        plan += planValue;
        hasPlan = true;
      }
      if (factValue != null) {
        fact += factValue;
        hasFact = true;
      }
      if (pctValue != null) lastPct = pctValue;
      if (point.has_data === true) hasData = true;
    });

    if (hasPlan && Math.abs(plan) > 0.000001 && hasFact) {
      kpiPct = (fact / plan) * 100;
    } else if (lastPct != null) {
      kpiPct = lastPct;
    }

    return {
      year: y,
      month: m,
      month_name: null,
      plan: hasPlan ? plan : null,
      fact: hasFact ? fact : null,
      kpi_pct: kpiPct,
      has_data: hasData || hasPlan || hasFact,
    };
  }

  function normalizeKpiTileFromRawItem(rawItem, point, mode) {
    if (!rawItem || typeof rawItem !== "object") return null;
    var title = rawItem.name != null ? String(rawItem.name) : "";
    if (!title && rawItem.kpi_id != null) title = String(rawItem.kpi_id);
    if (!title) return null;
    var thresholds = rawItem.thresholds && typeof rawItem.thresholds === "object" ? rawItem.thresholds : {};
    var pointPct = point && typeof point.kpi_pct === "number" && !isNaN(point.kpi_pct) ? point.kpi_pct : null;
    var itemPct =
      typeof rawItem.kpi_pst === "number" && !isNaN(rawItem.kpi_pst)
        ? rawItem.kpi_pst
        : typeof rawItem.kpi_pct === "number" && !isNaN(rawItem.kpi_pct)
          ? rawItem.kpi_pct
          : null;
    var periodState = typeof DashboardMonthNav !== "undefined" && DashboardMonthNav && typeof DashboardMonthNav.getPeriodState === "function"
      ? DashboardMonthNav.getPeriodState()
      : { currentPeriodMonth: null, currentPeriodYear: null };
    var label =
      point && periodState.currentPeriodYear != null && periodState.currentPeriodMonth != null
        ? buildChairmanAggregationPeriodLabel(
            mode,
            periodState.currentPeriodYear,
            periodState.currentPeriodMonth,
            rawItem.monthly_data,
            periodState.selectedQuarters
          )
        : rawItem.plan_fact_period_label != null
          ? String(rawItem.plan_fact_period_label)
          : null;

    function thStr(obj, key, flatKey) {
      if (obj[key] != null) return String(obj[key]);
      if (flatKey != null && rawItem[flatKey] != null) return String(rawItem[flatKey]);
      return null;
    }

    function firstStringValue(keys) {
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (rawItem[key] == null) continue;
        var value = String(rawItem[key]).trim();
        if (value) return value;
      }
      return "";
    }

    return {
      kpi_id: rawItem.kpi_id != null ? String(rawItem.kpi_id) : "",
      title: title,
      badge: rawItem.kpi_id != null ? String(rawItem.kpi_id) : "KPI",
      period:
        rawItem.period != null && String(rawItem.period).trim()
          ? String(rawItem.period)
          : chairmanAggregationModeLabel(mode),
      units: firstStringValue(["units", "unit", "uom", "measure_unit", "measurement_unit"]),
      frequency: firstStringValue(["frequency", "periodicity", "update_frequency", "frequency_label"]),
      cache_updated_at: firstStringValue(["cache_updated_at"]),
      formula: rawItem.formula != null ? String(rawItem.formula) : null,
      plan_fact_period_label: label,
      percent: pointPct != null ? pointPct : itemPct,
      kpi_pst: typeof rawItem.kpi_pst === "number" && !isNaN(rawItem.kpi_pst) ? rawItem.kpi_pst : null,
      kpi_pct: pointPct != null ? pointPct : itemPct,
      plan: point ? point.plan : rawItem.plan,
      fact: point ? point.fact : rawItem.fact,
      has_data:
        point && typeof point.has_data === "boolean"
          ? point.has_data
          : typeof rawItem.has_data === "boolean"
            ? rawItem.has_data
            : undefined,
      hint:
        rawItem.description != null
          ? String(rawItem.description)
          : rawItem.hint != null
            ? String(rawItem.hint)
            : rawItem.comment != null
              ? String(rawItem.comment)
              : "",
      rag: rawItem.color != null ? String(rawItem.color).toLowerCase().trim() : null,
      green_threshold: thStr(thresholds, "green", "green_threshold"),
      yellow_threshold: thStr(thresholds, "yellow", "yellow_threshold"),
      red_threshold: thStr(thresholds, "red", "red_threshold"),
      blue_threshold: thStr(thresholds, "blue", "blue_threshold"),
    };
  }

  function getChairmanAggregatedTilesFromRaw(rawBody) {
    if (!rawBody || typeof rawBody !== "object") return null;
    var periodState =
      typeof DashboardMonthNav !== "undefined" && DashboardMonthNav && typeof DashboardMonthNav.getPeriodState === "function"
        ? DashboardMonthNav.getPeriodState()
        : null;
    var year = periodState && periodState.currentPeriodYear != null ? periodState.currentPeriodYear : null;
    var month = periodState && periodState.currentPeriodMonth != null ? periodState.currentPeriodMonth : null;
    var selectedQuarters = periodState && Array.isArray(periodState.selectedQuarters) ? periodState.selectedQuarters : [];
    if (year == null || month == null) return null;

    var tilesBlock = rawBody["Плитки"];
    var items = tilesBlock && Array.isArray(tilesBlock.items) ? tilesBlock.items : [];
    if (!items.length) return null;

    var mode = chairmanAggregationMode || "current";
    return items
      .map(function (item) {
        var point = computeChairmanAggregatedPoint(item, year, month, mode, selectedQuarters);
        return normalizeKpiTileFromRawItem(item, point, mode);
      })
      .filter(Boolean);
  }

  function rerenderChairmanTilesFromRaw() {
    if (!lastRawKpiResponse) return false;
    var tiles = getChairmanAggregatedTilesFromRaw(lastRawKpiResponse);
    if (!tiles || !tiles.length) return false;
    renderKpiTiles(tiles);
    renderDonutCharts();
    return true;
  }

  function shouldUseBoardChairExecutiveTables() {
    return isBoardChairUser(sessionUser) && selectedViewId === "self";
  }

  function shouldUseCommercialDirectorOverdueDebtEnhancements() {
    var currentDepartment = getDepartmentForCurrentKpiContext();
    return (
      (isCommercialDirectorUser(viewContextUser) ||
        isCommercialDepartmentContext(currentDepartment) ||
        isCommercialDepartmentContext(lastKpiResponseDepartment)) &&
      !shouldUseBoardChairExecutiveTables()
    );
  }

  function updateDashboardTableTitlesForRole() {
    var isBoardChairOwnDashboard = shouldUseBoardChairExecutiveTables();
    var showClaimsSwitcher = shouldUseCommercialDirectorOverdueDebtEnhancements();

    if (claimsTableTitleTextEl) {
      claimsTableTitleTextEl.textContent = isBoardChairOwnDashboard ? "ТОП-10 отклонений" : "Претензии";
      claimsTableTitleTextEl.hidden = showClaimsSwitcher;
    }

    if (overdueDebtTableTitleEl) {
      overdueDebtTableTitleEl.textContent = isBoardChairOwnDashboard
        ? "ТОП-10 решений / эскалаций"
        : "Расшифровка просроченной дебиторской задолженности";
    }

    if (claimsTableHelpWrapEl) {
      claimsTableHelpWrapEl.hidden = isBoardChairOwnDashboard || activeClaimsTableView === "lawsuits";
    }
    if (isBoardChairOwnDashboard) {
      hideClaimsTableHelpPopover();
    }

    updateClaimsTableSwitcherUi(showClaimsSwitcher);
  }

  function updateClaimsTableSwitcherUi(visible) {
    var switcher = document.getElementById("claims-table-switcher");
    if (!switcher) return;
    switcher.hidden = !visible;
    if (!visible) {
      activeClaimsTableView = "claims";
    }
    applyClaimsTableView(activeClaimsTableView);
  }

  function applyClaimsTableView(view) {
    var nextView = view === "lawsuits" ? "lawsuits" : "claims";
    activeClaimsTableView = nextView;

    var wrappers = document.querySelectorAll('[data-claims-view]');
    wrappers.forEach(function (node) {
      if (!node || typeof node.getAttribute !== "function") return;
      if (node.tagName === "NAV" || node.tagName === "BUTTON") return;
      var match = node.getAttribute("data-claims-view") === nextView;
      node.hidden = !match;
    });

    var buttons = document.querySelectorAll(".claims-table-switcher-btn");
    buttons.forEach(function (btn) {
      var match = btn.getAttribute("data-claims-view") === nextView;
      btn.setAttribute("aria-selected", match ? "true" : "false");
      btn.classList.toggle("is-active", match);
    });

    if (claimsTableTitleTextEl) {
      var switcherVisible = !document.getElementById("claims-table-switcher")
        ? false
        : !document.getElementById("claims-table-switcher").hidden;
      claimsTableTitleTextEl.hidden = switcherVisible;
    }

    if (claimsTableHelpWrapEl) {
      claimsTableHelpWrapEl.hidden = shouldUseBoardChairExecutiveTables() || nextView === "lawsuits";
    }
    if (nextView === "lawsuits") {
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
        enableLawsuitsTable: shouldUseCommercialDirectorOverdueDebtEnhancements(),
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
    callDataLoader("cancelDeferredChartsAndTablesBoot");
  }

  /** Шапка и плитки показываются сразу, а тяжёлые графики/таблицы догружаются позже. */
  function bootChartsAndTablesDeferred() {
    callDataLoader("bootChartsAndTablesDeferred");
  }

  function renderHierarchyBreadcrumb() {
    callHierarchyNav("renderHierarchyBreadcrumb");
  }

  /** Перезагружает `viewTargets` по `Api.fetchImmediateSubordinates` для текущего родителя в стеке. */
  function refreshSubordinateTabsFromApi() {
    return callHierarchyNav("refreshSubordinateTabsFromApi", [], Promise.resolve());
  }

  function loadViewTargets() {
    return callHierarchyNav(
      "loadViewTargets",
      [],
      Promise.resolve([{ id: "self", label: "Мой дашборд", user: sessionUser }])
    );
  }

  /** Вкладки `viewTargets` + переключение вида и перезагрузка KPI. */
  function renderViewTabs() {
    callHierarchyNav("renderViewTabs");
  }

  /** Показ спиннера, скрытие основного контента. */
  function showLoading() {
    callDataLoader("showLoading");
  }

  /** Скрытие спиннера, показ контента. */
  function hideLoading() {
    callDataLoader("hideLoading");
  }

  /**
   * Общий разбор успешного/ошибочного ответа KPI: плитки, кэш drilldown, графики, шапка.
   * @param {object} result — как от `Api.fetchKpis` / `fetchKpiAll`
   * @param {string} [_source] — зарезервировано для логирования источника вызова
   */
  function applyApiResult(result, _source) {
    callDataLoader("applyApiResult", [result, _source]);
  }

  /**
   * Главная загрузка данных экрана: «свой» дашборд (`fetchKpis`) или подразделение (`fetchKpiAll`).
   * При ошибке или mock — fallback на `MockData`.
   */
  function loadKpiTilesAndChartsForView() {
    /* Уход с корня иерархии: скрыть обзор ПСД, иначе isChairmanOverviewVisible остаётся true и данные не грузятся */
    callChairmanOverview("leaveOverviewIfNotAtRoot", []);
    // Если мы на обзорном экране ПСД (карточки каталогов), полный дашборд НЕ должен появляться ниже.
    if (isChairmanOverviewVisible()) return;
    callDataLoader("loadKpiTilesAndChartsForView");
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

  var isBoardChairSession = isBoardChairUser(sessionUser);
  /* ПСД: до решения об обзоре не грузим полный дашборд (иначе hideLoading откроет #dash-content). */
  if (isBoardChairSession) {
    showLoading();
  } else {
    loadKpiTilesAndChartsForView();
  }

  loadViewTargets().then(function (targets) {
    viewTargets = targets && targets.length ? targets : [{ id: "self", label: "Мой дашборд", user: sessionUser }];
    refreshSubordinateTabsFromApi().then(function () {
      renderViewTabs();
      updateTopBarForView();
      var shown = callChairmanOverview("showIfNeeded", [], false);
      /* Если обзор ПСД не показан — догружаем обычный дашборд. После show() нельзя вызывать hideLoading(): он открывает #dash-content. */
      if (!shown && isBoardChairSession) {
        loadKpiTilesAndChartsForView();
      }
    });
  });
})();
