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
  var dashboardTargets = [];
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

  function getAggregationModule() {
    return typeof DashboardAggregation === "object" && DashboardAggregation ? DashboardAggregation : null;
  }

  function callOverviewModule(methodName, args, fallbackValue) {
    var overviewModule = typeof DashboardOverview !== "undefined" && DashboardOverview ? DashboardOverview : null;
    if (!overviewModule) return fallbackValue;
    var method = overviewModule[methodName];
    if (typeof method !== "function") return fallbackValue;
    return method.apply(overviewModule, Array.isArray(args) ? args : []);
  }

  function attachActivePeriodToRequestOptions(opts) {
    var nextOpts = Object.assign({}, opts || {});
    if (nextOpts.month != null && nextOpts.year != null) {
      return nextOpts;
    }
    if (typeof DashboardMonthNav === "undefined" || !DashboardMonthNav || typeof DashboardMonthNav.getPeriodState !== "function") {
      return nextOpts;
    }
    var ps = DashboardMonthNav.getPeriodState();
    var month = ps && ps.currentPeriodMonth != null ? Number(ps.currentPeriodMonth) : null;
    var year = ps && ps.currentPeriodYear != null ? Number(ps.currentPeriodYear) : null;
    if ((month == null || isNaN(month) || year == null || isNaN(year)) && ps && Array.isArray(ps.availableMonths) && ps.availableMonths.length) {
      var lastSlot = ps.availableMonths[ps.availableMonths.length - 1];
      month = lastSlot && lastSlot.month != null ? Number(lastSlot.month) : month;
      year = lastSlot && lastSlot.year != null ? Number(lastSlot.year) : year;
    }
    if (nextOpts.month == null && month != null && !isNaN(month)) {
      nextOpts.month = month;
    }
    if (nextOpts.year == null && year != null && !isNaN(year)) {
      nextOpts.year = year;
    }
    return nextOpts;
  }

  function isOverviewVisible() {
    return !!callOverviewModule("isVisible", [], false);
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

  function setAvailableMonthsFromKpiResult(result, options) {
    if (typeof DashboardMonthNav === "undefined" || !DashboardMonthNav) {
      setAvailableMonthsFromChartPoints(result && result.chartIndicators ? result.chartIndicators : null, options);
      return;
    }
    if (typeof DashboardMonthNav.setAvailableMonthsFromKpiResult === "function") {
      DashboardMonthNav.setAvailableMonthsFromKpiResult(result, options);
      return;
    }
    setAvailableMonthsFromChartPoints(result && result.chartIndicators ? result.chartIndicators : null, options);
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

  function rememberMonthNavigatorPeriodState() {
    callMonthNav("rememberPeriodStateForContext", [getMonthNavigatorContextKey()]);
  }

  function restoreMonthNavigatorPeriodState() {
    callMonthNav("restorePeriodStateForContext", [getMonthNavigatorContextKey()]);
    callMonthNav("updateMonthNavigatorUI");
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
    rememberMonthNavigatorPeriodState();
    hierarchyStack = hierarchyStack.concat([deptName]);
    selectedViewId = "dept:" + encodeURIComponent(deptName);
    viewContextUser = sessionUser;
    restoreMonthNavigatorPeriodState();
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
      fetchImmediateSubordinates: function (department) {
        if (typeof Api === "undefined" || typeof Api.fetchImmediateSubordinates !== "function") {
          return Promise.resolve({ ok: false, immediate_children: [] });
        }
        var opts =
          typeof DashboardRequestBuilder !== "undefined" &&
          DashboardRequestBuilder &&
          typeof DashboardRequestBuilder.buildImmediateSubordinatesRequestOptions === "function"
            ? DashboardRequestBuilder.buildImmediateSubordinatesRequestOptions(department)
            : { department: department };
        var catalogFor = getDashboardCatalogId();
        if (catalogFor && isRootHierarchy() && isVirtualCatalog(catalogFor)) {
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
        return Api.fetchImmediateSubordinates(opts);
      },
      onUnauthorized: handleUnauthorized,
      getDashboardCatalogId: getDashboardCatalogId,
      getActiveCatalogId: getDashboardCatalogId,
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
        getDashboardTargets: function () {
          return dashboardTargets;
        },
        setDashboardTargets: function (value) {
          dashboardTargets = value;
        },
        rememberMonthNavigatorPeriodState: rememberMonthNavigatorPeriodState,
        restoreMonthNavigatorPeriodState: restoreMonthNavigatorPeriodState,
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
          var opts =
            typeof DashboardRequestBuilder !== "undefined" &&
            DashboardRequestBuilder &&
            typeof DashboardRequestBuilder.buildImmediateSubordinatesRequestOptions === "function"
              ? DashboardRequestBuilder.buildImmediateSubordinatesRequestOptions(department)
              : { department: department };
          var catalogFor = getDashboardCatalogId();
          if (catalogFor && isRootHierarchy() && isVirtualCatalog(catalogFor)) {
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
          return Api.fetchImmediateSubordinates(opts);
        },
        fetchDashboardCatalog: function () {
          if (typeof Api === "undefined" || typeof Api.fetchDashboardCatalog !== "function") {
            return Promise.resolve({ ok: false, items: [], error: "Каталог ПСД недоступен" });
          }
          return Api.fetchDashboardCatalog();
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
        getDashboardCatalogId: getDashboardCatalogId,
        getDepartmentForCurrentKpiContext: getDepartmentForCurrentKpiContext,
        rememberMonthNavigatorPeriodState: rememberMonthNavigatorPeriodState,
        restoreMonthNavigatorPeriodState: restoreMonthNavigatorPeriodState,
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
        setAvailableMonthsFromKpiResult: setAvailableMonthsFromKpiResult,
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
          var nextOpts =
            typeof DashboardRequestBuilder !== "undefined" &&
            DashboardRequestBuilder &&
            typeof DashboardRequestBuilder.buildKpiRequestOptions === "function"
              ? DashboardRequestBuilder.buildKpiRequestOptions(opts)
              : attachActivePeriodToRequestOptions(opts);
          return Api.fetchKpis(nextOpts);
        },
        fetchKpiAll: function (opts) {
          var nextOpts =
            typeof DashboardRequestBuilder !== "undefined" &&
            DashboardRequestBuilder &&
            typeof DashboardRequestBuilder.buildKpiAllRequestOptions === "function"
              ? DashboardRequestBuilder.buildKpiAllRequestOptions(opts)
              : attachActivePeriodToRequestOptions(opts);
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
        getActiveCatalogId: getDashboardCatalogId,
        maybeAugmentTilesWithPriorMonthFetch: maybeAugmentTilesWithPriorMonthFetch,
      });
    }
  })();

  (function initOverviewModule() {
    var overviewModule = typeof DashboardOverview !== "undefined" && DashboardOverview ? DashboardOverview : null;
    if (!overviewModule || typeof overviewModule.init !== "function") return;
    overviewModule.init({
      getDashboardTargets: function () {
        return dashboardTargets || [];
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
        var opts = { for: catalogId != null && String(catalogId).trim() !== "" ? String(catalogId).trim() : "" };
        if (
          typeof DashboardRequestBuilder !== "undefined" &&
          DashboardRequestBuilder &&
          typeof DashboardRequestBuilder.buildKpiRequestOptions === "function"
        ) {
          opts = DashboardRequestBuilder.buildKpiRequestOptions(opts);
        } else if (
          typeof DashboardMonthNav !== "undefined" &&
          DashboardMonthNav &&
          typeof DashboardMonthNav.getPeriodState === "function"
        ) {
          var ps = DashboardMonthNav.getPeriodState();
          if (ps && ps.currentPeriodMonth != null) opts.month = Number(ps.currentPeriodMonth);
          if (ps && ps.currentPeriodYear != null) opts.year = Number(ps.currentPeriodYear);
        }
        return Api.fetchKpis(opts);
      },
      onExpand: function (target) {
        if (!target) return;
        rememberMonthNavigatorPeriodState();
        selectedViewId = target.id || "self";
        viewContextUser = target.user || sessionUser;
        var selfDeptRaw =
          sessionUser && sessionUser.department != null ? String(sessionUser.department).trim() : "";
        hierarchyStack = selfDeptRaw ? [selfDeptRaw] : [];
        if (
          typeof DashboardHierarchyNav !== "undefined" &&
          DashboardHierarchyNav &&
          typeof DashboardHierarchyNav.rememberCatalogId === "function"
        ) {
          DashboardHierarchyNav.rememberCatalogId(target.catalogId);
        }
        if (session.apiMode === "mock") {
          restoreMonthNavigatorPeriodState();
          renderViewTabs();
          updateTopBarForView();
          loadKpiTilesAndChartsForView();
          return;
        }
        restoreMonthNavigatorPeriodState();
        refreshSubordinateTabsFromApi().then(function () {
          renderViewTabs();
          updateTopBarForView();
          loadKpiTilesAndChartsForView();
        });
      },
      onBackToOverview: function () {
        rememberMonthNavigatorPeriodState();
        selectedViewId = "self";
        viewContextUser = sessionUser;
        var selfDept =
          sessionUser && sessionUser.department != null ? String(sessionUser.department).trim() : "";
        hierarchyStack = selfDept ? [selfDept] : [];
        if (
          typeof DashboardHierarchyNav !== "undefined" &&
          DashboardHierarchyNav &&
          typeof DashboardHierarchyNav.clearRememberedCatalogId === "function"
        ) {
          DashboardHierarchyNav.clearRememberedCatalogId();
        }
        restoreMonthNavigatorPeriodState();
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
          if (isOverviewVisible()) {
            callOverviewModule("reload", []);
            return;
          }
          loadKpiTilesAndChartsForView();
        },
        onAggregationModeChange: function () {
          rerenderAggregatedTilesFromRaw();
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

  /** Ключ кэша drilldown: отдел + период + режим агрегации (иначе кэш отдаёт старые плитки). */
  function getDrilldownTilesCacheSignature() {
    if (typeof DashboardMonthNav === "undefined" || !DashboardMonthNav || typeof DashboardMonthNav.getPeriodState !== "function") {
      return "";
    }
    var ps = DashboardMonthNav.getPeriodState();
    if (!ps || typeof ps !== "object") return "";
    var year = ps.currentPeriodYear != null && !isNaN(Number(ps.currentPeriodYear)) ? Number(ps.currentPeriodYear) : null;
    var month = ps.currentPeriodMonth != null && !isNaN(Number(ps.currentPeriodMonth)) ? Number(ps.currentPeriodMonth) : null;
    var mode = ps.aggregationMode != null ? String(ps.aggregationMode).trim() : "";
    var quarters = Array.isArray(ps.selectedQuarters)
      ? ps.selectedQuarters
          .slice()
          .map(function (v) {
            return parseInt(String(v), 10);
          })
          .filter(function (q) {
            return !isNaN(q) && q >= 1 && q <= 4;
          })
          .sort(function (a, b) {
            return a - b;
          })
          .join(",")
      : "";
    return [year != null && month != null ? year + "-" + month : "no-period", mode || "current", quarters].join("|");
  }

  function drilldownTilesCacheKey(deptName) {
    var d = deptName != null ? String(deptName).trim() : "";
    if (!d) return "";
    var signature = getDrilldownTilesCacheSignature();
    return signature ? d + "\0" + signature : d;
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
    if (
      typeof DashboardRequestBuilder !== "undefined" &&
      DashboardRequestBuilder &&
      typeof DashboardRequestBuilder.buildKpiRequestOptions === "function"
    ) {
      fetchOpts = DashboardRequestBuilder.buildKpiRequestOptions(fetchOpts);
    } else {
      if (typeof DashboardMonthNav !== "undefined" && DashboardMonthNav.getPeriodState) {
        var ps = DashboardMonthNav.getPeriodState();
        if (ps && ps.currentPeriodMonth != null && ps.currentPeriodYear != null) {
          fetchOpts.month = Number(ps.currentPeriodMonth);
          fetchOpts.year = Number(ps.currentPeriodYear);
        }
      }
      var catalogFor = getDashboardCatalogId();
      if (catalogFor) {
        fetchOpts.for = catalogFor;
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

  function getDashboardCatalogId() {
    var fromNavGeneric = callHierarchyNav("getActiveCatalogId", [], "");
    if (fromNavGeneric) return fromNavGeneric;
    var target = getCurrentViewTarget();
    if (!target || target.catalogKind !== "catalog" || target.catalogId == null) return "";
    return String(target.catalogId).trim();
  }

  function isRootHierarchy() {
    return Array.isArray(hierarchyStack) && hierarchyStack.length <= 1;
  }

  function isVirtualCatalog(catalogId) {
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

  function prevCalendarMonthYear(y, m) {
    var yi = Number(y);
    var mi = Number(m);
    if (isNaN(yi) || isNaN(mi) || mi < 1 || mi > 12) return null;
    if (mi === 1) return { year: yi - 1, month: 12 };
    return { year: yi, month: mi - 1 };
  }

  function findMonthlyDataPoint(monthlyData, y, m) {
    if (!Array.isArray(monthlyData)) return null;
    for (var i = 0; i < monthlyData.length; i++) {
      var p = monthlyData[i];
      if (p && Number(p.year) === Number(y) && Number(p.month) === Number(m)) return p;
    }
    return null;
  }

  function isSelectedPeriodCurrentCalendarMonth(selectedYear, selectedMonth) {
    var mod = getAggregationModule();
    if (mod && typeof mod.isSelectedPeriodCurrentCalendarMonth === "function") {
      return mod.isSelectedPeriodCurrentCalendarMonth(selectedYear, selectedMonth);
    }
    var now = new Date();
    return Number(selectedYear) === now.getFullYear() && Number(selectedMonth) === now.getMonth() + 1;
  }

  /** Показатели «ФОТ» и «Текучесть персонала» — по вхождению в название плитки. */
  function isFotOrPersonnelTurnoverKpiTitle(title) {
    var t = normalizeKpiTitleForMatch(title);
    if (!t) return false;
    if (t.indexOf("фот") !== -1) return true;
    if (t.indexOf("текучесть") !== -1) return true;
    return false;
  }

  function planFactPeriodLabelFromMonthlyPoint(point, year) {
    if (!point) return "";
    var y = Number(year);
    var mn = point.month_name != null ? String(point.month_name).trim() : "";
    if (mn) {
      var cap = mn.charAt(0).toUpperCase() + mn.slice(1);
      return (isNaN(y) ? "" : cap + " " + y);
    }
    var m = Number(point.month);
    if (!isNaN(m) && m >= 1 && m <= 12 && !isNaN(y)) return getMonthShortRu(m) + " " + y;
    return "";
  }

  function parseLooseNumber(value) {
    var mod = getAggregationModule();
    if (mod && typeof mod.parseNumberLoose === "function") {
      var parsed = mod.parseNumberLoose(value);
      return typeof parsed === "number" && !isNaN(parsed) ? parsed : null;
    }
    if (typeof value === "number" && !isNaN(value)) return value;
    if (value == null || value === "") return null;
    var fallback = parseFloat(String(value).replace(/[^\d.,\-]/g, "").replace(",", "."));
    return isNaN(fallback) ? null : fallback;
  }

  function getFotTurnoverPercentFromSource(source) {
    if (!source || typeof source !== "object") return null;
    var pct = parseLooseNumber(source.kpi_pct);
    if (pct == null) pct = parseLooseNumber(source.kpi_pst);
    if (pct == null) {
      var plan = parseLooseNumber(source.plan);
      var fact = parseLooseNumber(source.fact);
      if (plan != null && fact != null && Math.abs(plan) > 0.000001) {
        pct = (fact / plan) * 100;
      }
    }
    return pct;
  }

  function applyFotTurnoverPriorMonthValues(target, source, periodLabel) {
    if (!target || !source) return target;
    var next = Object.assign({}, target);
    if (source.plan !== undefined) next.plan = source.plan;
    if (source.fact !== undefined) next.fact = source.fact;
    if (typeof source.has_data === "boolean") next.has_data = source.has_data;
    var pct = getFotTurnoverPercentFromSource(source);
    if (pct != null) {
      next.kpi_pct = pct;
      next.kpi_pst = pct;
      next.percent = pct;
    }
    if (periodLabel) next.plan_fact_period_label = periodLabel;
    return next;
  }

  /**
   * Для выбранного текущего календарного месяца (ещё не закончившегося) на плитках с «ФОТ» / «текучестью» в названии
   * показываем план, факт и KPI за предыдущий месяц (из monthly_data).
   */
  function applyPriorMonthFactForFotTurnoverTiles(tiles) {
    if (!Array.isArray(tiles) || !tiles.length) return tiles;

    if (typeof DashboardMonthNav === "undefined" || !DashboardMonthNav || typeof DashboardMonthNav.getPeriodState !== "function") {
      return tiles;
    }
    var periodState = DashboardMonthNav.getPeriodState();
    var selY = periodState.currentPeriodYear;
    var selM = periodState.currentPeriodMonth;
    if (selY == null || selM == null) return tiles;
    if (!isSelectedPeriodCurrentCalendarMonth(selY, selM)) return tiles;

    var prevYm = prevCalendarMonthYear(selY, selM);
    if (!prevYm) return tiles;

    return tiles.map(function (tile) {
      if (!tile || !isFotOrPersonnelTurnoverKpiTitle(tile.title)) return tile;
      if (tile.__priorMonthMergedFromKpiAll) return tile;
      var monthly = tile.monthly_data;
      if (!Array.isArray(monthly) || !monthly.length) return tile;
      var prevPoint = findMonthlyDataPoint(monthly, prevYm.year, prevYm.month);
      if (!prevPoint) return tile;
      return applyFotTurnoverPriorMonthValues(
        tile,
        prevPoint,
        planFactPeriodLabelFromMonthlyPoint(prevPoint, prevYm.year)
      );
    });
  }

  /**
   * Рендерит KPI-плитки единой адаптивной сеткой; оборот карточки строится отдельно при flip.
   * Более 6 плиток — постраничный показ (3×2) и навигатор `#kpi-tiles-pager`.
   * @param {object[]} tiles
   */
  function renderKpiTiles(tiles) {
    tiles = applyPriorMonthFactForFotTurnoverTiles(tiles && tiles.length ? tiles : []);
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

  function getMonthShortRu(month) {
    var mod = getAggregationModule();
    if (mod && typeof mod.getMonthShortRu === "function") {
      return mod.getMonthShortRu(month);
    }
    var names = ["янв.", "фев.", "март", "апр.", "май", "июнь", "июль", "авг.", "сент.", "окт.", "нояб.", "дек."];
    var index = Number(month) - 1;
    return index >= 0 && index < names.length ? names[index] : "";
  }

  /** Первый сегмент крошек — коммерческий директор / коммерция (подчинённые отделы с помесячным KPI). */
  function isCommercialHierarchyRootForPriorMonthRule() {
    return Array.isArray(hierarchyStack) && hierarchyStack.length > 0 && isCommercialDepartmentContext(hierarchyStack[0]);
  }

  function mergeFotTurnoverTilesWithPriorKpiAllResponse(currentTiles, priorTiles, prevYear, prevMonth) {
    if (!Array.isArray(currentTiles) || !Array.isArray(priorTiles)) return currentTiles;
    var byId = {};
    var byTitle = {};
    for (var i = 0; i < priorTiles.length; i++) {
      var t = priorTiles[i];
      if (!t) continue;
      var kid = t.kpi_id != null ? String(t.kpi_id).trim() : "";
      if (kid) byId[kid] = t;
      var nk = normalizeKpiTitleForMatch(t.title);
      if (nk) byTitle[nk] = t;
    }
    var fallbackLabel = getMonthShortRu(prevMonth) + " " + prevYear;
    return currentTiles.map(function (tile) {
      if (!tile || !isFotOrPersonnelTurnoverKpiTitle(tile.title)) return tile;
      var id = tile.kpi_id != null ? String(tile.kpi_id).trim() : "";
      var src = id && byId[id] ? byId[id] : byTitle[normalizeKpiTitleForMatch(tile.title)];
      if (!src) return tile;
      var pl =
        src.plan_fact_period_label != null && String(src.plan_fact_period_label).trim()
          ? String(src.plan_fact_period_label).trim()
          : fallbackLabel;
      var next = applyFotTurnoverPriorMonthValues(tile, src, pl);
      next.__priorMonthMergedFromKpiAll = true;
      return next;
    });
  }

  /**
   * Для подразделений под коммерческим директором: факт ФОТ/текучести за прошлый месяц — второй запрос
   * GET /api/kpi/all/?department=…&month=N-1&year=… при просмотре незавершённого месяца N.
   * @param {function(object[])} done — передать итоговый массив плиток
   */
  function maybeAugmentTilesWithPriorMonthFetch(result, tilesToRender, done) {
    if (!result || !result.ok || !Array.isArray(tilesToRender) || !tilesToRender.length) {
      done(tilesToRender);
      return;
    }
    if (!isCommercialHierarchyRootForPriorMonthRule()) {
      done(tilesToRender);
      return;
    }
    if (typeof DashboardMonthNav === "undefined" || !DashboardMonthNav || typeof DashboardMonthNav.getPeriodState !== "function") {
      done(tilesToRender);
      return;
    }
    var ps = DashboardMonthNav.getPeriodState();
    var selY = ps.currentPeriodYear;
    var selM = ps.currentPeriodMonth;
    if (selY == null || selM == null || !isSelectedPeriodCurrentCalendarMonth(selY, selM)) {
      done(tilesToRender);
      return;
    }
    var hasFot = false;
    for (var f = 0; f < tilesToRender.length; f++) {
      var tt = tilesToRender[f];
      if (tt && isFotOrPersonnelTurnoverKpiTitle(tt.title)) {
        hasFot = true;
        break;
      }
    }
    if (!hasFot) {
      done(tilesToRender);
      return;
    }
    var dept = getDepartmentForCurrentKpiContext();
    if (!dept || !String(dept).trim()) {
      done(tilesToRender);
      return;
    }
    var prevYm = prevCalendarMonthYear(selY, selM);
    if (!prevYm) {
      done(tilesToRender);
      return;
    }
    if (typeof Api === "undefined" || typeof Api.fetchKpiAll !== "function") {
      done(tilesToRender);
      return;
    }
    var opts = {
      department: String(dept).trim(),
      month: prevYm.month,
      year: prevYm.year,
    };
    if (
      typeof DashboardRequestBuilder !== "undefined" &&
      DashboardRequestBuilder &&
      typeof DashboardRequestBuilder.buildKpiAllRequestOptions === "function"
    ) {
      opts = DashboardRequestBuilder.buildKpiAllRequestOptions(opts);
    } else {
      var catalogFor = getDashboardCatalogId();
      if (catalogFor) {
        opts.for = catalogFor;
      }
    }
    Api.fetchKpiAll(opts)
      .then(function (prevResult) {
        if (!prevResult || !prevResult.ok || !Array.isArray(prevResult.tiles) || !prevResult.tiles.length) {
          done(tilesToRender);
          return;
        }
        done(mergeFotTurnoverTilesWithPriorKpiAllResponse(tilesToRender, prevResult.tiles, prevYm.year, prevYm.month));
      })
      .catch(function () {
        done(tilesToRender);
      });
  }

  function getAggregatedTilesFromRaw(rawBody) {
    var mod = getAggregationModule();
    if (!mod || typeof mod.getAggregatedTilesFromRaw !== "function") return null;
    var periodState =
      typeof DashboardMonthNav !== "undefined" &&
      DashboardMonthNav &&
      typeof DashboardMonthNav.getPeriodState === "function"
        ? DashboardMonthNav.getPeriodState()
        : null;
    return mod.getAggregatedTilesFromRaw(rawBody, {
      periodState: periodState,
    });
  }

  function rerenderAggregatedTilesFromRaw() {
    if (!lastRawKpiResponse) return false;
    var tiles = getAggregatedTilesFromRaw(lastRawKpiResponse);
    if (!tiles || !tiles.length) return false;
    renderKpiTiles(tiles);
    renderDonutCharts();
    return true;
  }

  function shouldUseBoardChairExecutiveTables() {
    return isBoardChairUser(sessionUser) && selectedViewId === "self";
  }

  function isBoardChairCommercialBlockContext() {
    if (!isBoardChairUser(sessionUser)) return false;
    var catalogFor = getDashboardCatalogId();
    return isVirtualCatalog(catalogFor) && String(catalogFor).trim() === "commerce";
  }

  function shouldUseClaimsAndLawsuitsSwitcher() {
    if (shouldUseCommercialDirectorOverdueDebtEnhancements()) return true;
    if (isBoardChairCommercialBlockContext()) return true;
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
    var showClaimsSwitcher = shouldUseClaimsAndLawsuitsSwitcher();

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
        executiveMode: false,
        enhanceOverdueDebtTable: shouldUseCommercialDirectorOverdueDebtEnhancements(),
        enableLawsuitsTable: shouldUseClaimsAndLawsuitsSwitcher(),
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
    /* Уход с корня иерархии: скрыть обзор ПСД, иначе isOverviewVisible остаётся true и данные не грузятся */
    callOverviewModule("leaveOverviewIfNotAtRoot", []);
    // Если мы на обзорном экране ПСД (карточки каталогов), полный дашборд НЕ должен появляться ниже.
    if (isOverviewVisible()) return;
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
      var shown = callOverviewModule("showIfNeeded", [], false);
      /* Если обзор ПСД не показан — догружаем обычный дашборд. После show() нельзя вызывать hideLoading(): он открывает #dash-content. */
      if (!shown && isBoardChairSession) {
        loadKpiTilesAndChartsForView();
      }
    });
  });
})();
