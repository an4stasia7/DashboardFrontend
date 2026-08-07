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
  const adminPanelLink = document.getElementById("admin-panel-link");
  if (adminPanelLink && sessionUser && sessionUser.role === "User1") {
    adminPanelLink.hidden = false;
  }

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
  var kpiTileCacheRefreshState = Object.create(null);
  var kpiTileCacheRefreshPollTimers = Object.create(null);
  var kpiTileCooldownTickTimer = null;

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
  /** Фактическое число элементов в блоке «Показатели KPI» / «КС развитие»
   *  (для корректной пагинации — не завязываясь на lastKpiTiles). */
  var lastDonutsTotalCount = 0;
  var productionDeputySelectedShop = "pc1";
  var lastProductionDeputyRawTiles = null;
  var lastProductionDeputyRawChartIndicators = null;

  function handleUnauthorized() {
    persistCurrentKpiTileOrder();
    Auth.logout();
    window.location.href = "login.html";
  }

  function getKpiTileOrderScopeKey() {
    if (typeof DashboardKpiTileOrder === "undefined" || !DashboardKpiTileOrder) return "";
    return DashboardKpiTileOrder.buildScopeKey({
      nickname: sessionUser && sessionUser.nickname,
      viewId: selectedViewId,
      department: getDepartmentForCurrentKpiContext(),
    });
  }

  function applyKpiTileOrderPreference(tiles) {
    if (!tiles || !tiles.length || typeof DashboardKpiTileOrder === "undefined" || !DashboardKpiTileOrder) {
      return tiles;
    }
    var scopeKey = getKpiTileOrderScopeKey();
    if (!scopeKey) return tiles;
    return DashboardKpiTileOrder.applySavedOrder(tiles, scopeKey);
  }

  function persistCurrentKpiTileOrder() {
    if (!lastKpiTiles || !lastKpiTiles.length || typeof DashboardKpiTileOrder === "undefined" || !DashboardKpiTileOrder) {
      return;
    }
    var scopeKey = getKpiTileOrderScopeKey();
    if (!scopeKey) return;
    DashboardKpiTileOrder.saveOrder(scopeKey, DashboardKpiTileOrder.extractOrderIds(lastKpiTiles));
  }

  function renderKpiTilesAsIs(tiles) {
    lastKpiTiles = tiles && tiles.length ? tiles.slice() : null;
    flippedTileIndices.clear();
    if (typeof DashboardKpiDrilldown !== "undefined" && DashboardKpiDrilldown) {
      if (typeof DashboardKpiDrilldown.resetState === "function") {
        DashboardKpiDrilldown.resetState();
      }
    }
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

  function handleKpiTilesReordered(fromIndex, toIndex, options) {
    if (!lastKpiTiles || fromIndex === toIndex || typeof DashboardKpiTileOrder === "undefined" || !DashboardKpiTileOrder) {
      return;
    }
    options = options || {};
    var nextTiles = options.swap
      ? DashboardKpiTileOrder.swapArray(lastKpiTiles, fromIndex, toIndex)
      : DashboardKpiTileOrder.reorderArray(lastKpiTiles, fromIndex, toIndex);
    lastKpiTiles = nextTiles;
    persistCurrentKpiTileOrder();
    renderKpiTilesAsIs(nextTiles);
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

  function attachActivePeriodToRequestOptions(opts) {
    var nextOpts = Object.assign({}, opts || {});
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
    if (ps && ps.aggregationMode && nextOpts.aggregation_mode == null) {
      nextOpts.aggregation_mode = String(ps.aggregationMode);
    }
    if (ps && Array.isArray(ps.selectedQuarters) && nextOpts.selected_quarters == null) {
      nextOpts.selected_quarters = ps.selectedQuarters.join(",");
    }
    return nextOpts;
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
        getTileCacheRefreshState: getKpiTileCacheRefreshState,
        onBeforePageChange: closeKpiTileDrilldown,
        onTilesReordered: handleKpiTilesReordered,
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
        fetchKpiStructure: function (options) {
          if (typeof Api === "undefined" || typeof Api.fetchKpiStructure !== "function") {
            return Promise.resolve({ ok: false, structure: {}, error: "Структура недоступна" });
          }
          return Api.fetchKpiStructure(options || {});
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
          return Api.fetchKpis(
            attachActivePeriodToRequestOptions(
              attachChairmanCatalogForIfNeeded(opts)
            )
          );
        },
        fetchKpiAll: function (opts) {
          return Api.fetchKpiAll(attachActivePeriodToRequestOptions(opts || {}));
        },
        getActiveChairmanCatalogTarget: getActiveChairmanCatalogTarget,
        shouldUseChairmanAggregatedTiles: shouldUseChairmanAggregatedTiles,
        getSessionApiMode: function () {
          return session.apiMode;
        },
        getMockKpiTilesForRole: function (role) {
          return MockData.getKpiTilesForRole(role);
        },
        setLastApiChartIndicators: function (value) {
          if (isProductionDeputyDashboardContext() && value) {
            lastProductionDeputyRawChartIndicators = value;
            lastApiChartIndicators = filterProductionDeputyChartIndicatorsByShop(value);
          } else {
            lastProductionDeputyRawChartIndicators = null;
            lastApiChartIndicators = value;
          }
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
        getCommercialFotTurnoverAggregatedTilesFromRaw: getCommercialFotTurnoverAggregatedTilesFromRaw,
        maybeAugmentCommercialDeptTilesWithPriorMonthFetch: maybeAugmentCommercialDeptTilesWithPriorMonthFetch,
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
      getSelectedViewId: function () {
        return selectedViewId;
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
        return Api.fetchKpis(attachActivePeriodToRequestOptions(opts));
      },
      onExpand: function (target) {
        if (!target) return;
        selectedViewId = target.id || "self";
        viewContextUser = target.user || sessionUser;
        var isVirtualCatalog =
          target.catalogKind === "chairman" &&
          target.catalogId != null &&
          String(target.catalogId).trim() !== "" &&
          String(target.catalogId).trim() !== "my_dashboard";
        var viewDeptRaw = "";
        if (isVirtualCatalog) {
          // Не подставлять label («Коммерческий блок») в hierarchy — API даст 403.
          viewDeptRaw =
            sessionUser && sessionUser.department != null ? String(sessionUser.department).trim() : "";
        } else {
          viewDeptRaw =
            target.viewDepartment != null && String(target.viewDepartment).trim()
              ? String(target.viewDepartment).trim()
              : target.department != null && String(target.department).trim()
                ? String(target.department).trim()
                : "";
        }
        if (viewDeptRaw) {
          hierarchyStack = [viewDeptRaw];
        } else {
          var selfDeptRaw =
            sessionUser && sessionUser.department != null ? String(sessionUser.department).trim() : "";
          hierarchyStack = selfDeptRaw ? [selfDeptRaw] : [];
        }
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
        loadKpiTilesAndChartsForView();
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
          if (typeof DashboardKpiTiles !== "undefined" && DashboardKpiTiles && typeof DashboardKpiTiles.resetPager === "function") {
            DashboardKpiTiles.resetPager();
          }
          donutChartsPageIndex = 0;
          if (isChairmanOverviewVisible()) {
            callChairmanOverview("reload", []);
            return;
          }
          callChairmanOverview("reloadCommercialSummary", []);
          // ПСД: при смене месяца всегда ходим на бэк. Иначе monthly_data из ответа
          // за август подменяет июль устаревшими/пересчитанными строками (выручка, ДЗ/КЗ, портфель).
          if (isBoardChairUser(viewContextUser)) {
            loadKpiTilesAndChartsForView({ preserveViewState: true });
            return;
          }
          var supPeriodNeedsServerData = shouldUseHrdLateVacanciesTable();
          if (!supPeriodNeedsServerData && applyCurrentPeriodFromLastRawResponse()) {
            return;
          }
          if (
            isCommercialDirectorUser(viewContextUser) ||
            isCommercialHierarchyRootForPriorMonthRule() ||
            isTechnicalDirectorUser(viewContextUser) ||
            isGsppUser(viewContextUser) ||
            isSupUser(viewContextUser) ||
            isSupDepartmentContext(getDepartmentForCurrentKpiContext()) ||
            isDevserviceUser(viewContextUser) ||
            isOperationalDirectorUser(viewContextUser) ||
            isProductionDeputyUser(viewContextUser) ||
            isLogisticsDashboardContext() ||
            shouldUseServheadClientsTable() ||
            isChiefConstructorDashboardContext() ||
            isChiefMetrologDashboardContext() ||
            isChiefAccountantDashboardContext()
          ) {
            loadKpiTilesAndChartsForView({ preserveViewState: true });
            return;
          }
          loadKpiTilesAndChartsForView({ preserveViewState: true });
        },
        onAggregationModeChange: function (mode) {
          if (typeof DashboardKpiTiles !== "undefined" && DashboardKpiTiles && typeof DashboardKpiTiles.resetPager === "function") {
            DashboardKpiTiles.resetPager();
          }
          donutChartsPageIndex = 0;
          chairmanAggregationMode = mode || "current";
          callChairmanOverview("reloadCommercialSummary", []);
          if (shouldUseHrdLateVacanciesTable()) {
            loadKpiTilesAndChartsForView({ preserveViewState: true });
            return;
          }
          if (rerenderChairmanTilesFromRaw()) return;
          if (applyCurrentPeriodFromLastRawResponse()) return;
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
        var n = lastDonutsTotalCount || (lastKpiTiles ? lastKpiTiles.length : 0);
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
    if (target && target.catalogKind === "chairman" && target.catalogId != null) {
      return String(target.catalogId).trim();
    }
    /* Fallback: id вида chairman:commerce → commerce (если каталог ещё не сматчился) */
    var viewId = selectedViewId != null ? String(selectedViewId) : "";
    if (viewId.indexOf("chairman:") === 0) {
      try {
        return decodeURIComponent(viewId.slice("chairman:".length)).trim();
      } catch (e) {
        return viewId.slice("chairman:".length).trim();
      }
    }
    return "";
  }

  function isChairmanRootHierarchy() {
    return Array.isArray(hierarchyStack) && hierarchyStack.length <= 1;
  }

  function getActiveChairmanCatalogTarget() {
    return callHierarchyNav("getActiveChairmanCatalogTarget", [], null);
  }

  function isViewingChairmanCatalogDashboard() {
    var sid = selectedViewId != null ? String(selectedViewId) : "";
    return sid.indexOf("chairman:") === 0;
  }

  function shouldUseChairmanAggregatedTiles() {
    return isBoardChairUser(sessionUser) && selectedViewId === "self";
  }

  function attachChairmanCatalogForIfNeeded(opts) {
    var nextOpts = attachActivePeriodToRequestOptions(opts || {});
    if (!isBoardChairUser(sessionUser) || !isChairmanRootHierarchy()) return nextOpts;
    var chairmanFor = getChairmanDashboardCatalogId();
    if (!chairmanFor || chairmanFor === "my_dashboard") return nextOpts;
    if (selectedViewId === "self" || isViewingChairmanCatalogDashboard()) {
      nextOpts.for = chairmanFor;
    }
    return nextOpts;
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

  function getKpiTileRefreshPeriod() {
    var ps =
      typeof DashboardMonthNav !== "undefined" &&
      DashboardMonthNav &&
      typeof DashboardMonthNav.getPeriodState === "function"
        ? DashboardMonthNav.getPeriodState()
        : null;
    return {
      month: ps && ps.currentPeriodMonth != null ? Number(ps.currentPeriodMonth) : null,
      year: ps && ps.currentPeriodYear != null ? Number(ps.currentPeriodYear) : null,
    };
  }

  function getKpiTileRefreshKpiId(tile) {
    if (!tile) return "";
    return tile.kpi_id != null && String(tile.kpi_id).trim()
      ? String(tile.kpi_id).trim()
      : tile.badge != null
        ? String(tile.badge).trim()
        : "";
  }

  function buildKpiTileCacheRefreshOptions(tile) {
    var period = getKpiTileRefreshPeriod();
    var opts = {
      department: getDepartmentForCurrentKpiContext() || (sessionUser && sessionUser.department) || "",
      kpi_id: getKpiTileRefreshKpiId(tile),
    };
    if (period.month != null && !isNaN(period.month)) opts.month = period.month;
    if (period.year != null && !isNaN(period.year)) opts.year = period.year;
    return opts;
  }

  function kpiTileCacheRefreshKeyFromOptions(opts) {
    return [
      opts && opts.department != null ? String(opts.department).trim().toLocaleLowerCase("ru-RU") : "",
      opts && opts.kpi_id != null ? String(opts.kpi_id).trim().toUpperCase() : "",
      opts && opts.year != null ? String(opts.year) : "",
      opts && opts.month != null ? String(opts.month) : "",
    ].join("|");
  }

  function getKpiTileCacheRefreshState(tile) {
    return kpiTileCacheRefreshState[kpiTileCacheRefreshKeyFromOptions(buildKpiTileCacheRefreshOptions(tile))] || null;
  }

  function getCacheRefreshStateForKpiId(kpiId) {
    if (kpiId == null || String(kpiId).trim() === "") return null;
    return kpiTileCacheRefreshState[
      kpiTileCacheRefreshKeyFromOptions(buildKpiTileCacheRefreshOptions({ kpi_id: String(kpiId).trim() }))
    ] || null;
  }

  function rerenderKpiTilesForCacheRefreshState() {
    if (lastProductionDeputyRawTiles && lastProductionDeputyRawTiles.length) {
      renderKpiTiles(lastProductionDeputyRawTiles, { preservePage: true });
    } else if (lastKpiTiles && lastKpiTiles.length) {
      renderKpiTiles(lastKpiTiles, { preservePage: true });
    }
  }

  function setKpiTileCacheRefreshState(key, nextState) {
    kpiTileCacheRefreshState[key] = Object.assign({}, kpiTileCacheRefreshState[key] || {}, nextState || {});
    rerenderKpiTilesForCacheRefreshState();
    initTables();
    ensureKpiTileCooldownTick();
  }

  function hasActiveKpiTileCooldown() {
    var keys = Object.keys(kpiTileCacheRefreshState || {});
    for (var i = 0; i < keys.length; i++) {
      var state = kpiTileCacheRefreshState[keys[i]] || {};
      if (state.status !== "running" && state.status !== "failed" && state.next_allowed_at) {
        var ts = Date.parse(String(state.next_allowed_at));
        if (isFinite(ts) && !isNaN(ts) && ts > Date.now()) return true;
      }
    }
    return false;
  }

  function refreshKpiTileCooldownLabels() {
    rerenderKpiTilesForCacheRefreshState();
    initTables();
    if (!hasActiveKpiTileCooldown() && kpiTileCooldownTickTimer) {
      clearInterval(kpiTileCooldownTickTimer);
      kpiTileCooldownTickTimer = null;
    }
  }

  function ensureKpiTileCooldownTick() {
    if (!hasActiveKpiTileCooldown()) return;
    if (kpiTileCooldownTickTimer) return;
    kpiTileCooldownTickTimer = setInterval(refreshKpiTileCooldownLabels, 60000);
  }

  function scheduleKpiTileCooldownReset(key, state) {
    if (!state || !state.next_allowed_at || state.status === "running" || state.status === "failed") return;
    var ts = Date.parse(String(state.next_allowed_at));
    if (!isFinite(ts) || isNaN(ts)) return;
    if (ts <= Date.now()) return;
    var delay = Math.max(1000, ts - Date.now());
    if (kpiTileCacheRefreshPollTimers[key]) {
      clearTimeout(kpiTileCacheRefreshPollTimers[key]);
    }
    kpiTileCacheRefreshPollTimers[key] = setTimeout(function () {
      delete kpiTileCacheRefreshPollTimers[key];
      setKpiTileCacheRefreshState(key, { status: "idle" });
    }, delay);
  }

  function pollKpiTileCacheRefreshStatus(key, opts) {
    if (kpiTileCacheRefreshPollTimers[key]) {
      clearTimeout(kpiTileCacheRefreshPollTimers[key]);
      delete kpiTileCacheRefreshPollTimers[key];
    }
    if (!Api || typeof Api.fetchKpiTileCacheRefreshStatus !== "function") return;
    kpiTileCacheRefreshPollTimers[key] = setTimeout(function () {
      Api.fetchKpiTileCacheRefreshStatus(opts).then(function (res) {
        if (!res || !res.ok) {
          setKpiTileCacheRefreshState(key, { status: "failed", error: res && res.error ? res.error : "Ошибка проверки статуса" });
          return;
        }
        var prev = kpiTileCacheRefreshState[key] || {};
        setKpiTileCacheRefreshState(key, res);
        scheduleKpiTileCooldownReset(key, res);
        if (res.status === "running") {
          pollKpiTileCacheRefreshStatus(key, opts);
          return;
        }
        if (res.status === "succeeded" || prev.status === "running") {
          if (Api && typeof Api.clearKpiGetMemoryCache === "function") {
            Api.clearKpiGetMemoryCache();
          }
          callDataLoader("loadKpiTilesAndChartsForView", [{ preserveViewState: true }]);
        }
      }).catch(function () {
        setKpiTileCacheRefreshState(key, { status: "failed", error: "Ошибка проверки статуса" });
      });
    }, 10000);
  }

  function handleKpiTileCacheRefresh(tile) {
    if (!tile || !Api || typeof Api.refreshKpiTileCache !== "function") return;
    var opts = buildKpiTileCacheRefreshOptions(tile);
    if (!opts.department || !opts.kpi_id) return;
    var key = kpiTileCacheRefreshKeyFromOptions(opts);
    setKpiTileCacheRefreshState(key, { status: "running" });
    Api.refreshKpiTileCache(opts).then(function (res) {
      if (!res || !res.ok) {
        setKpiTileCacheRefreshState(key, { status: "failed", error: res && res.error ? res.error : "Ошибка запуска пересчёта" });
        return;
      }
      setKpiTileCacheRefreshState(key, res);
      scheduleKpiTileCooldownReset(key, res);
      if (res.status === "running") {
        pollKpiTileCacheRefreshStatus(key, opts);
      }
    }).catch(function () {
      setKpiTileCacheRefreshState(key, { status: "failed", error: "Ошибка запуска пересчёта" });
    });
  }

  function watchAutoRefreshingKpiTiles(tiles) {
    if (!Array.isArray(tiles) || !tiles.length) return;
    tiles.forEach(function (tile) {
      if (!tile || tile.cache_refresh_status !== "running") return;
      var opts = buildKpiTileCacheRefreshOptions(tile);
      if (!opts.department || !opts.kpi_id) return;
      var key = kpiTileCacheRefreshKeyFromOptions(opts);
      if (kpiTileCacheRefreshPollTimers[key]) return;
      pollKpiTileCacheRefreshStatus(key, opts);
    });
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
      var refreshBtn = e.target.closest(".kpi-tile-cache-refresh");
      if (refreshBtn && kpiContainerEl.contains(refreshBtn)) {
        e.preventDefault();
        e.stopPropagation();
        if (refreshBtn.disabled) return;
        var artRefresh = refreshBtn.closest("article.kpi-tile");
        var ixRefresh = artRefresh && artRefresh.getAttribute("data-kpi-tile-index");
        if (ixRefresh == null || !lastKpiTiles || lastKpiTiles[+ixRefresh] == null) return;
        handleKpiTileCacheRefresh(lastKpiTiles[+ixRefresh]);
        return;
      }
      var childBtn = e.target.closest(".kpi-tile-child-link");
      if (childBtn && kpiContainerEl.contains(childBtn)) {
        e.preventDefault();
        e.stopPropagation();
        var childDept = childBtn.getAttribute("data-department");
        if (childDept) {
          var focusKpiId = childBtn.getAttribute("data-focus-kpi-id") || "";
          var focusTitle = childBtn.getAttribute("data-focus-title") || "";
          var explicitFocus =
            focusKpiId || focusTitle
              ? { kpi_id: focusKpiId, title: focusTitle }
              : null;
          var artFromChild = childBtn.closest("article.kpi-tile");
          var ixChild = artFromChild && artFromChild.getAttribute("data-kpi-tile-index");
          var tileFromChild =
            ixChild != null && lastKpiTiles ? lastKpiTiles[+ixChild] : null;
          navigateDashboardToDepartmentFromDrill(childDept, tileFromChild, explicitFocus);
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
      if (e.target.closest("button, a, input, select, textarea, .kpi-tile-drag-handle")) return;
      hideKpiHelpPopover();
      var ix = art.getAttribute("data-kpi-tile-index");
      if (ix == null || !lastKpiTiles || lastKpiTiles[+ix] == null) return;
      openKpiTileDrilldown(+ix);
    });
    kpiContainerEl.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var art = e.target.closest("article.kpi-tile");
      if (!art || !kpiContainerEl.contains(art)) return;
      if (e.target.closest(".kpi-tile-child-link, .kpi-tile-help, .kpi-tile-flip-action, .kpi-tile-drag-handle, .kpi-tile-cache-refresh")) return;
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

  document.addEventListener("click", function (e) {
    var tableRefreshBtn = e.target && e.target.closest
      ? e.target.closest(".table-cache-refresh-button")
      : null;
    if (!tableRefreshBtn) return;
    e.preventDefault();
    e.stopPropagation();
    if (tableRefreshBtn.disabled) return;
    var kpiId = tableRefreshBtn.getAttribute("data-kpi-id") || "";
    if (!kpiId) return;
    handleKpiTileCacheRefresh({ kpi_id: kpiId });
  });

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

  function getPsdIncludeUnder1mCheckboxes() {
    return {
      primary: document.getElementById("psd-table-include-under-1m"),
      overdue: document.getElementById("psd-table-include-under-1m-overdue"),
    };
  }

  function syncPsdIncludeUnder1mFrom(source) {
    var checked = !!(source && source.checked);
    var p = getPsdIncludeUnder1mCheckboxes();
    if (p.primary) p.primary.checked = checked;
    if (p.overdue) p.overdue.checked = checked;
  }

  function bindPsdIncludeUnder1mCheckbox(el) {
    if (!el || el.__dashboardPsdFilterBound) return;
    el.__dashboardPsdFilterBound = true;
    el.addEventListener("change", function () {
      syncPsdIncludeUnder1mFrom(el);
      initTables();
    });
  }

  bindPsdIncludeUnder1mCheckbox(document.getElementById("psd-table-include-under-1m"));
  bindPsdIncludeUnder1mCheckbox(document.getElementById("psd-table-include-under-1m-overdue"));

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
      var hintHtml = typeof DashUi.buildKpiTileHintHtml === "function" ? DashUi.buildKpiTileHintHtml(tile) : "";
      if (hintHtml) {
        hintEl.innerHTML = hintHtml;
        hintEl.hidden = false;
      } else {
        hintEl.innerHTML = "";
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

  function updateKpiTilesPagerUI(resetPage) {
    if (typeof DashboardKpiTiles === "undefined" || !DashboardKpiTiles) return;
    if (typeof DashboardKpiTiles.updatePagerUI === "function") {
      DashboardKpiTiles.updatePagerUI({
        tiles: lastKpiTiles,
        resetPage: !!resetPage,
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

  function isGsppFotKpiId(kpiId) {
    var id = kpiId != null ? String(kpiId).trim().toUpperCase() : "";
    return (
      id === "GSP-M3" ||
      id === "GSPP-M3" ||
      id === "ГСП-M3" ||
      id === "ГCП-M3" ||
      id === "ГСПП-M3" ||
      id === "ГCПП-M3"
    );
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

  /**
   * Для выбранного текущего календарного месяца (ещё не закончившегося) на плитках с «ФОТ» / «текучестью» в названии
   * показываем план/факт за предыдущий месяц (из monthly_data).
   * Исключения по kpi_id: OD-M3.2, TD-M6, GSP-M3, PD-M3.F* (KD-M8, LOG-M3.F — на бэкенде).
   */
  function applyPriorMonthFactForFotTurnoverTiles(tiles) {
    if (!Array.isArray(tiles) || !tiles.length) return tiles;

    if (typeof DashboardMonthNav === "undefined" || !DashboardMonthNav || typeof DashboardMonthNav.getPeriodState !== "function") {
      return tiles;
    }
    var periodState = DashboardMonthNav.getPeriodState();
    var aggregationMode = periodState && periodState.aggregationMode != null ? String(periodState.aggregationMode).trim() : "current";
    if (aggregationMode === "quarter" || aggregationMode === "ytd" || aggregationMode === "month") return tiles;
    var selY = periodState.currentPeriodYear;
    var selM = periodState.currentPeriodMonth;
    if (selY == null || selM == null) return tiles;
    if (!isSelectedPeriodCurrentCalendarMonth(selY, selM)) return tiles;

    var prevYm = prevCalendarMonthYear(selY, selM);
    if (!prevYm) return tiles;

    return tiles.map(function (tile) {
      if (!tile || !isFotOrPersonnelTurnoverKpiTitle(tile.title)) return tile;
      var kpiId = tile.kpi_id != null ? String(tile.kpi_id).trim() : "";
      if (kpiId === "PD-M3.F1" || kpiId === "PD-M3.F2") return tile;
      if (kpiId === "OD-M3.2" || kpiId === "TD-M6") return tile;
      if (isGsppFotKpiId(kpiId)) return tile;
      if (tile.__priorMonthMergedFromKpiAll) return tile;
      var monthly = tile.monthly_data;
      if (!Array.isArray(monthly) || !monthly.length) return tile;
      var prevPoint = findMonthlyDataPoint(monthly, prevYm.year, prevYm.month);
      if (!prevPoint) return tile;

      var next = Object.assign({}, tile);
      if (prevPoint.plan !== undefined) next.plan = prevPoint.plan;
      if (prevPoint.fact !== undefined) next.fact = prevPoint.fact;
      if (typeof prevPoint.has_data === "boolean") next.has_data = prevPoint.has_data;
      if (typeof prevPoint.kpi_pct === "number" && !isNaN(prevPoint.kpi_pct)) {
        next.kpi_pct = prevPoint.kpi_pct;
        next.kpi_pst = prevPoint.kpi_pct;
        next.percent = prevPoint.kpi_pct;
      }
      if (isTurnoverKpiItem(next)) {
        var turnoverPct = parseNumberLoose(prevPoint.kpi_pct);
        if (turnoverPct == null) {
          var prevPlan = parseNumberLoose(prevPoint.plan);
          var prevFact = parseNumberLoose(prevPoint.fact);
          if (prevPlan != null && Math.abs(prevPlan) > 0.000001 && prevFact != null) {
            turnoverPct = (prevFact / prevPlan) * 100;
            next.kpi_pct = turnoverPct;
            next.kpi_pst = turnoverPct;
            next.percent = turnoverPct;
          }
        }
        var turnoverRag = turnoverLimitRagFromPct(turnoverPct);
        if (turnoverRag) {
          next.rag = turnoverRag;
          next.color = turnoverRag;
        }
      }
      var pl = planFactPeriodLabelFromMonthlyPoint(prevPoint, prevYm.year);
      if (pl) next.plan_fact_period_label = pl;
      return next;
    });
  }

  var PRODUCTION_DEPUTY_SHOP_TILE_IDS = {
    pc1: {
      "PD-M1.1.M": "Выполнение производственного плана: месяц",
      "PD-M1.1.W": "Выполнение производственного плана: неделя",
      "PD-M1.1.T": "Выполнение производственного плана: итого",
      "PD-M3.B1": "Бюджет",
      "PD-M3.F1": "ФОТ",
      "PD-Q2.1": "Текучесть персонала",
    },
    pc2: {
      "PD-M1.2.M": "Выполнение производственного плана: месяц",
      "PD-M1.2.W": "Выполнение производственного плана: неделя",
      "PD-M1.2.T": "Выполнение производственного плана: итого",
      "PD-M3.B2": "Бюджет",
      "PD-M3.F2": "ФОТ",
      "PD-Q2.2": "Текучесть персонала",
    },
  };

  function normalizeProductionShopKey(value) {
    return value === "pc2" ? "pc2" : "pc1";
  }

  function productionShopLabel(shop) {
    return normalizeProductionShopKey(shop) === "pc2" ? "Алмаз" : "Турбулентность-Дон";
  }

  function isProductionDeputyDashboardContext() {
    var currentDepartment = getDepartmentForCurrentKpiContext();
    if (currentDepartment && isProductionDeputyUser({ department: currentDepartment })) return true;
    if (lastKpiResponseDepartment && isProductionDeputyUser({ department: lastKpiResponseDepartment })) return true;
    if (selectedViewId === "self" && isProductionDeputyUser(viewContextUser)) return true;
    return false;
  }

  function isProductionDirectorDashboardContext() {
    var currentDepartment = normalizeDashboardRole(getDepartmentForCurrentKpiContext());
    var responseDepartment = normalizeDashboardRole(lastKpiResponseDepartment);
    var role = normalizeDashboardRole(viewContextUser && viewContextUser.role);
    var department = normalizeDashboardRole(viewContextUser && viewContextUser.department);
    return (
      currentDepartment === "заместитель директора по производству" ||
      responseDepartment === "заместитель директора по производству" ||
      (selectedViewId === "self" &&
        (role === "заместитель директора по производству" || department === "заместитель директора по производству"))
    );
  }

  function isChiefConstructorDashboardContext() {
    var currentDepartment = normalizeDashboardRole(getDepartmentForCurrentKpiContext());
    var responseDepartment = normalizeDashboardRole(lastKpiResponseDepartment);
    var role = normalizeDashboardRole(viewContextUser && viewContextUser.role);
    var department = normalizeDashboardRole(viewContextUser && viewContextUser.department);
    return (
      currentDepartment === "главный конструктор" ||
      responseDepartment === "главный конструктор" ||
      (selectedViewId === "self" && (role === "главный конструктор" || department === "главный конструктор"))
    );
  }

  function isChiefMetrologDashboardContext() {
    var currentDepartment = normalizeDashboardRole(getDepartmentForCurrentKpiContext());
    var responseDepartment = normalizeDashboardRole(lastKpiResponseDepartment);
    var role = normalizeDashboardRole(viewContextUser && viewContextUser.role);
    var department = normalizeDashboardRole(viewContextUser && viewContextUser.department);
    return (
      currentDepartment === "главный метролог" ||
      responseDepartment === "главный метролог" ||
      (selectedViewId === "self" && (role === "главный метролог" || department === "главный метролог"))
    );
  }

  function isChiefAccountantRoleName(value) {
    var normalized = normalizeDashboardRole(value);
    return (
      normalized === "главный бухгалтер" ||
      normalized === "главный бухгалтер нпо" ||
      normalized === "главный бухгалтер алмаз"
    );
  }

  function isChiefAccountantDashboardContext() {
    var currentDepartment = getDepartmentForCurrentKpiContext();
    var responseDepartment = lastKpiResponseDepartment;
    var role = viewContextUser && viewContextUser.role;
    var department = viewContextUser && viewContextUser.department;
    return (
      isChiefAccountantRoleName(currentDepartment) ||
      isChiefAccountantRoleName(responseDepartment) ||
      (selectedViewId === "self" && (isChiefAccountantRoleName(role) || isChiefAccountantRoleName(department)))
    );
  }

  function isLogisticsDashboardContext() {
    var currentDepartment = normalizeDashboardRole(getDepartmentForCurrentKpiContext());
    var responseDepartment = normalizeDashboardRole(lastKpiResponseDepartment);
    var role = normalizeDashboardRole(viewContextUser && viewContextUser.role);
    var department = normalizeDashboardRole(viewContextUser && viewContextUser.department);
    return (
      currentDepartment === "начальник службы логистики" ||
      responseDepartment === "начальник службы логистики" ||
      (selectedViewId === "self" &&
        (role === "начальник службы логистики" || department === "начальник службы логистики"))
    );
  }

  function isServheadDepartmentContext(value) {
    var normalized = normalizeDashboardRole(value);
    if (!normalized) return false;
    return (
      normalized === "servhead" ||
      normalized === "сервисная служба" ||
      normalized === "начальник службы сервиса" ||
      normalized === "начальник сервиса" ||
      normalized === "начальник сервисной службы" ||
      (normalized.indexOf("сервис") !== -1 && normalized.indexOf("служб") !== -1)
    );
  }

  function isServheadUser(user) {
    if (!user || typeof user !== "object") return false;
    var role = normalizeDashboardRole(user.role);
    var department = normalizeDashboardRole(user.department);
    return isServheadDepartmentContext(role) || isServheadDepartmentContext(department);
  }

  function isServheadDashboardContext() {
    var currentDepartment = normalizeDashboardRole(getDepartmentForCurrentKpiContext());
    var responseDepartment = normalizeDashboardRole(lastKpiResponseDepartment);
    return (
      isServheadUser(sessionUser) ||
      isServheadUser(viewContextUser) ||
      isServheadDepartmentContext(currentDepartment) ||
      isServheadDepartmentContext(responseDepartment)
    );
  }

  function isItAutomationHeadDepartmentContext(value) {
    var normalized = normalizeDashboardRole(value);
    if (!normalized) return false;
    return (
      normalized === "начальник отдела автоматизации ит" ||
      normalized === "autoit" ||
      (normalized.indexOf("начальник") !== -1 &&
        normalized.indexOf("автоматизац") !== -1 &&
        normalized.indexOf("ит") !== -1)
    );
  }

  function isItAutomationHeadDashboardContext() {
    var currentDepartment = normalizeDashboardRole(getDepartmentForCurrentKpiContext());
    var responseDepartment = normalizeDashboardRole(lastKpiResponseDepartment);
    var role = normalizeDashboardRole(viewContextUser && viewContextUser.role);
    var department = normalizeDashboardRole(viewContextUser && viewContextUser.department);
    return (
      isItAutomationHeadDepartmentContext(currentDepartment) ||
      isItAutomationHeadDepartmentContext(responseDepartment) ||
      (selectedViewId === "self" &&
        (isItAutomationHeadDepartmentContext(role) ||
          isItAutomationHeadDepartmentContext(department) ||
          isItAutomationHeadDepartmentContext(sessionUser && sessionUser.department) ||
          isItAutomationHeadDepartmentContext(sessionUser && sessionUser.role)))
    );
  }

  function hasRdDashboardTiles(tiles) {
    if (!Array.isArray(tiles)) return false;
    for (var i = 0; i < tiles.length; i++) {
      var id = tiles[i] && tiles[i].kpi_id != null ? String(tiles[i].kpi_id).trim().toUpperCase() : "";
      if (id.indexOf("RD-M") === 0 || id.indexOf("RD-Q") === 0) return true;
    }
    return false;
  }

  /** Претензии и просроченная ДЗ — не для дашборда начальника отдела автоматизации ИТ (протоколы остаются). */
  function shouldHideDefaultCommercialTables() {
    if (isItAutomationHeadDashboardContext()) return true;
    if (selectedViewId === "self" && hasRdDashboardTiles(lastKpiTiles)) {
      return (
        isItAutomationHeadDepartmentContext(sessionUser && sessionUser.department) ||
        isItAutomationHeadDepartmentContext(viewContextUser && viewContextUser.department)
      );
    }
    return false;
  }

  function hasServheadDashboardTiles(tiles) {
    if (!Array.isArray(tiles)) return false;
    for (var i = 0; i < tiles.length; i++) {
      var id = tiles[i] && tiles[i].kpi_id != null ? String(tiles[i].kpi_id).trim().toUpperCase() : "";
      if (id.indexOf("SH-M") === 0) return true;
    }
    return false;
  }

  function hasServheadClientsTableRows(rows) {
    if (!Array.isArray(rows)) return false;
    for (var i = 0; i < rows.length; i++) {
      var key = rows[i] && rows[i].tableKey != null ? String(rows[i].tableKey).trim().toUpperCase() : "";
      if (key === "SH-T2") continue;
      if (key === "SH-T1" || key.indexOf("SH-T") === 0) return true;
    }
    return false;
  }

  function hasServheadSurveysTableRows(rows) {
    if (!Array.isArray(rows)) return false;
    for (var i = 0; i < rows.length; i++) {
      var key = rows[i] && rows[i].tableKey != null ? String(rows[i].tableKey).trim().toUpperCase() : "";
      if (key === "SH-T2") return true;
    }
    return false;
  }

  function hasServheadSurveysTable() {
    if (hasServheadSurveysTableRows(lastApiTableRows)) return true;
    return (
      typeof Api !== "undefined" &&
      Api &&
      typeof Api.hasServheadSurveysTableInBody === "function" &&
      Api.hasServheadSurveysTableInBody(lastRawKpiResponse)
    );
  }

  function shouldUseServheadClientsTable() {
    if (isServheadDashboardContext()) return true;
    if (hasServheadDashboardTiles(lastKpiTiles)) return true;
    if (hasServheadClientsTableRows(lastApiTableRows)) return true;
    if (hasServheadSurveysTable()) return true;
    return (
      typeof Api !== "undefined" &&
      Api &&
      typeof Api.hasServheadDashboardInBody === "function" &&
      Api.hasServheadDashboardInBody(lastRawKpiResponse)
    );
  }

  function getProductionDeputyShopTileShop(kpiId) {
    var id = kpiId != null ? String(kpiId).trim() : "";
    if (!id) return "";
    if (Object.prototype.hasOwnProperty.call(PRODUCTION_DEPUTY_SHOP_TILE_IDS.pc1, id)) return "pc1";
    if (Object.prototype.hasOwnProperty.call(PRODUCTION_DEPUTY_SHOP_TILE_IDS.pc2, id)) return "pc2";
    return "";
  }

  function hasProductionDeputyShopTiles(tiles) {
    if (!Array.isArray(tiles)) return false;
    for (var i = 0; i < tiles.length; i++) {
      if (tiles[i] && getProductionDeputyShopTileShop(tiles[i].kpi_id)) return true;
    }
    return false;
  }

  function hasChiefAccountantTiles(tiles) {
    if (!Array.isArray(tiles)) return false;
    for (var i = 0; i < tiles.length; i++) {
      var id = tiles[i] && tiles[i].kpi_id != null ? String(tiles[i].kpi_id).trim().toUpperCase() : "";
      if (id.indexOf("GB-") === 0) return true;
    }
    return false;
  }

  function stripProductionShopSuffix(title) {
    return String(title || "")
      .replace(/\s*\(ПЦ\s*[12]\)\s*/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeProductionDeputyShopTile(tile, shop) {
    if (!tile) return tile;
    var id = tile.kpi_id != null ? String(tile.kpi_id).trim() : "";
    var next = Object.assign({}, tile);
    var baseTitle = PRODUCTION_DEPUTY_SHOP_TILE_IDS[shop] && PRODUCTION_DEPUTY_SHOP_TILE_IDS[shop][id];
    if (!baseTitle) {
      baseTitle = stripProductionShopSuffix(next.title || next.name);
    }
    if (baseTitle) {
      next.title = baseTitle;
      next.name = baseTitle;
    }
    next.production_shop = shop;
    next.production_shop_label = productionShopLabel(shop);
    return next;
  }

  function filterProductionDeputyTilesByShop(tiles) {
    if (!Array.isArray(tiles) || !tiles.length) return tiles || [];
    if (!isProductionDeputyDashboardContext() && !hasProductionDeputyShopTiles(tiles)) {
      return tiles;
    }
    var selectedShop = normalizeProductionShopKey(productionDeputySelectedShop);
    return tiles
      .filter(function (tile) {
        if (!tile) return false;
        var tileShop = getProductionDeputyShopTileShop(tile.kpi_id);
        return !tileShop || tileShop === selectedShop;
      })
      .map(function (tile) {
        var tileShop = getProductionDeputyShopTileShop(tile && tile.kpi_id);
        return tileShop ? normalizeProductionDeputyShopTile(tile, selectedShop) : tile;
      });
  }

  function isProductionDeputyChartIndicatorForShop(indicator) {
    var id = indicator && indicator.id != null ? String(indicator.id).trim().toUpperCase() : "";
    if (id === "PD-C1-PC1" || id === "PD-C1-PC2" || id === "PD-C2-PC1" || id === "PD-C2-PC2") return true;
    var kpiId = indicator && indicator.kpi_id != null ? String(indicator.kpi_id).trim().toUpperCase() : "";
    return kpiId === "PD-C1-PC1" || kpiId === "PD-C1-PC2" || kpiId === "PD-C2-PC1" || kpiId === "PD-C2-PC2";
  }

  function chartIndicatorShop(indicator) {
    var id = indicator && indicator.id != null ? String(indicator.id).trim().toUpperCase() : "";
    var kpiId = indicator && indicator.kpi_id != null ? String(indicator.kpi_id).trim().toUpperCase() : "";
    var value = id || kpiId;
    if (value.indexOf("PC2") !== -1 || value.indexOf("ПЦ2") !== -1) return "pc2";
    if (value.indexOf("PC1") !== -1 || value.indexOf("ПЦ1") !== -1) return "pc1";
    var label = String((indicator && (indicator.optionLabel || indicator.option_label || indicator.name)) || "");
      if (/алмаз/i.test(label)) return "pc2";
      if (/турбулентност/i.test(label)) return "pc1";
    if (/ПЦ\s*2/i.test(label)) return "pc2";
    if (/ПЦ\s*1/i.test(label)) return "pc1";
    return "";
  }

  function filterProductionDeputyChartIndicatorsByShop(indicators) {
    if (!indicators || typeof indicators !== "object") return indicators;
    if (!isProductionDeputyDashboardContext()) return indicators;
    var selectedShop = normalizeProductionShopKey(productionDeputySelectedShop);
    var next = Object.assign({}, indicators);
    if (Array.isArray(indicators.line)) {
      next.line = indicators.line
        .filter(function (indicator) {
          if (!isProductionDeputyChartIndicatorForShop(indicator)) return true;
          return chartIndicatorShop(indicator) === selectedShop;
        })
        .map(function (indicator) {
          if (!isProductionDeputyChartIndicatorForShop(indicator)) return indicator;
          var cloned = Object.assign({}, indicator);
          cloned.optionLabel = productionShopLabel(selectedShop);
          cloned.disableAllOption = true;
          return cloned;
        });
    }
    if (Array.isArray(indicators.bar)) {
      next.bar = indicators.bar
        .filter(function (indicator) {
          if (!isProductionDeputyChartIndicatorForShop(indicator)) return true;
          return chartIndicatorShop(indicator) === selectedShop;
        })
        .map(function (indicator) {
          if (!isProductionDeputyChartIndicatorForShop(indicator)) return indicator;
          var cloned = Object.assign({}, indicator);
          cloned.optionLabel = productionShopLabel(selectedShop);
          cloned.title = productionShopLabel(selectedShop);
          cloned.disableAllOption = true;
          return cloned;
        });
    }
    return next;
  }

  function ensureProductionShopSwitch() {
    var block = document.querySelector(".dash-kpi-tiles-block");
    var kpiContainer = document.getElementById("kpi-container");
    if (!block || !kpiContainer) return null;
    var existing = document.getElementById("production-shop-switch");
    if (existing) return existing;

    var wrap = document.createElement("div");
    wrap.className = "production-shop-switch";
    wrap.id = "production-shop-switch";
    wrap.hidden = true;
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Выбор производственного цеха");
    wrap.innerHTML =
      '<span class="production-shop-switch__label">Производство</span>' +
      '<div class="production-shop-switch__buttons">' +
      '<button type="button" class="production-shop-switch__btn" data-production-shop="pc1">Турбулентность-Дон</button>' +
      '<button type="button" class="production-shop-switch__btn" data-production-shop="pc2">Алмаз</button>' +
      "</div>";
    block.insertBefore(wrap, kpiContainer);
    wrap.addEventListener("click", function (event) {
      var btn = event.target && event.target.closest ? event.target.closest("[data-production-shop]") : null;
      if (!btn) return;
      var shop = normalizeProductionShopKey(btn.getAttribute("data-production-shop"));
      if (shop === productionDeputySelectedShop) return;
      productionDeputySelectedShop = shop;
      applyProductionDeputyShopSelection();
    });
    return wrap;
  }

  function updateProductionShopSwitchVisibility(show, mode) {
    var switchEl = ensureProductionShopSwitch();
    if (!switchEl) return;
    switchEl.hidden = !show;
    var isChiefAccountantMode = mode === "chief-accountant";
    var labelEl = switchEl.querySelector(".production-shop-switch__label");
    if (labelEl) labelEl.textContent = isChiefAccountantMode ? "Раздел" : "Производство";
    switchEl.setAttribute(
      "aria-label",
      isChiefAccountantMode ? "Выбор раздела главного бухгалтера" : "Выбор производственного цеха"
    );
    var buttons = switchEl.querySelectorAll("[data-production-shop]");
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var shop = normalizeProductionShopKey(btn.getAttribute("data-production-shop"));
      var active = shop === normalizeProductionShopKey(productionDeputySelectedShop);
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  function applyProductionDeputyShopSelection() {
    updateProductionShopSwitchVisibility(true);
    if (lastProductionDeputyRawChartIndicators) {
      lastApiChartIndicators = filterProductionDeputyChartIndicatorsByShop(lastProductionDeputyRawChartIndicators);
    }
    if (lastProductionDeputyRawTiles) {
      renderKpiTiles(lastProductionDeputyRawTiles);
    }
    if (typeof initCharts === "function") {
      initCharts();
    }
    initTables();
  }

  function getCurrentSelectedQuartersForTiles() {
    if (typeof DashboardMonthNav === "undefined" || !DashboardMonthNav || typeof DashboardMonthNav.getPeriodState !== "function") {
      return [];
    }
    var ps = DashboardMonthNav.getPeriodState();
    return ps && Array.isArray(ps.selectedQuarters) ? ps.selectedQuarters : [];
  }

  function shouldUseTdM5PeriodAggregatesForTiles() {
    if (typeof DashboardMonthNav === "undefined" || !DashboardMonthNav || typeof DashboardMonthNav.getPeriodState !== "function") {
      return false;
    }
    var ps = DashboardMonthNav.getPeriodState();
    var mode = ps ? String(ps.aggregationMode || "current") : "current";
    return mode === "quarter" || mode === "ytd";
  }

  function applyTdM5PeriodAggregateForCurrentSelection(tiles) {
    if (!Array.isArray(tiles) || !tiles.length || !shouldUseTdM5PeriodAggregatesForTiles()) {
      return tiles;
    }
    var periodState = DashboardMonthNav.getPeriodState();
    var mode = periodState ? String(periodState.aggregationMode || "current") : "current";
    var selectedQuarters = getCurrentSelectedQuartersForTiles();
    var changed = false;
    var nextTiles = tiles.map(function (tile) {
      if (
        !tile ||
        String(tile.kpi_id || "").trim() !== "TD-M5" ||
        !tile.frontend_aggregation ||
        !tile.frontend_aggregation.use_period_aggregates_for_buttons
      ) {
        return tile;
      }
      var aggregate =
        mode === "ytd"
          ? tile.period_aggregates && tile.period_aggregates.year_to_date
          : getTdM5Aggregate(tile, selectedQuarters);
      var point = buildPointFromPeriodAggregate(aggregate);
      if (!point) return tile;
      changed = true;
      var nextTile = Object.assign({}, tile, {
        plan: point.plan,
        fact: point.fact,
        percent: point.kpi_pct,
        kpi_pct: point.kpi_pct,
        has_data: point.has_data,
      });
      if (point.label != null && String(point.label).trim()) {
        nextTile.plan_fact_period_label = String(point.label);
      }
      return nextTile;
    });
    return changed ? nextTiles : tiles;
  }

  /**
   * Рендерит KPI-плитки единой адаптивной сеткой; оборот карточки строится отдельно при flip.
   * Более 6 плиток — постраничный показ (3×2) и навигатор `#kpi-tiles-pager`.
   * @param {object[]} tiles
   */
  function renderKpiTiles(tiles, options) {
    options = options || {};
    var sourceTiles = tiles && tiles.length ? tiles : [];
    var showProductionShopSwitch =
      isProductionDeputyDashboardContext() && hasProductionDeputyShopTiles(sourceTiles);
    var showChiefAccountantSwitch =
      !showProductionShopSwitch && isChiefAccountantDashboardContext() && hasChiefAccountantTiles(sourceTiles);
    if (showProductionShopSwitch) {
      lastProductionDeputyRawTiles = sourceTiles.slice();
      sourceTiles = filterProductionDeputyTilesByShop(sourceTiles);
    } else if (showChiefAccountantSwitch) {
      lastProductionDeputyRawTiles = sourceTiles.slice();
    } else {
      lastProductionDeputyRawTiles = null;
    }
    updateProductionShopSwitchVisibility(
      showProductionShopSwitch || showChiefAccountantSwitch,
      showChiefAccountantSwitch ? "chief-accountant" : "production"
    );
    sourceTiles = applyTdM5PeriodAggregateForCurrentSelection(sourceTiles);
    tiles = applyPriorMonthFactForFotTurnoverTiles(sourceTiles);
    tiles = normalizeCommercialHigherIsBetterPlanFactTiles(tiles);
    tiles = applyKpiTileOrderPreference(tiles);
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
        preservePage: !!options.preservePage,
        getTileCacheRefreshState: getKpiTileCacheRefreshState,
        matchFocusTarget: tileMatchesFocusTarget,
        clearPendingFocus: function () {
          pendingKpiTileFocus = null;
        },
      });
      watchAutoRefreshingKpiTiles(lastKpiTiles);
    }
  }

  /* ---------- Таблицы дашборда ---------- */

  function normalizeDashboardRole(value) {
    return value == null
      ? ""
      : String(value)
          .trim()
          .toLocaleLowerCase("ru-RU")
          .replace(/\s+/g, " ")
          .replace(/\s*-\s*/g, "-");
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

  function isTechnicalDirectorUser(user) {
    if (!user || typeof user !== "object") return false;
    var role = normalizeDashboardRole(user.role);
    var department = normalizeDashboardRole(user.department);
    return (
      role === "технический директор" ||
      role === "техдир" ||
      role === "тд" ||
      role === "технический дир" ||
      department === "технический директор" ||
      department === "техдир" ||
      department === "тд" ||
      department === "технический дир"
    );
  }

  /** Таблицы отклонений по вехам (ключ API `GSPP-T-Q4-DEVIATIONS`), тот же UI, что у ТД. */
  function isGsppUser(user) {
    if (!user || typeof user !== "object") return false;
    var role = normalizeDashboardRole(user.role);
    var department = normalizeDashboardRole(user.department);
    return role === "gspp" || role === "гспп" || department === "gspp" || department === "гспп";
  }

  function isSupUser(user) {
    if (!user || typeof user !== "object") return false;
    var role = normalizeDashboardRole(user.role);
    var department = normalizeDashboardRole(user.department);
    return (
      role === "sup" ||
      role === "служба управления персоналом" ||
      department === "sup" ||
      department === "служба управления персоналом"
    );
  }

  function isQualityDirectorUser(user) {
    if (!user || typeof user !== "object") return false;
    var role = normalizeDashboardRole(user.role);
    var department = normalizeDashboardRole(user.department);
    return (
      role === "qualdir" ||
      role === "qd" ||
      role === "директор по качеству" ||
      role === "дирекция по качеству" ||
      department === "qualdir" ||
      department === "qd" ||
      department === "директор по качеству" ||
      department === "дирекция по качеству"
    );
  }

  function isQualityDirectorDepartmentContext(value) {
    var normalized = normalizeDashboardRole(value);
    return (
      normalized === "qualdir" ||
      normalized === "qd" ||
      normalized === "директор по качеству" ||
      normalized === "дирекция по качеству"
    );
  }

  function shouldUseQualdirDefectTables() {
    if (shouldUseTechnicalDeviationTables()) return false;
    var currentDepartment = getDepartmentForCurrentKpiContext();
    if (
      isQualityDirectorUser(sessionUser) ||
      isQualityDirectorUser(viewContextUser) ||
      isQualityDirectorDepartmentContext(currentDepartment) ||
      isQualityDirectorDepartmentContext(lastKpiResponseDepartment)
    ) {
      return true;
    }
    return (
      typeof Api !== "undefined" &&
      Api &&
      typeof Api.hasQualdirDefectTablesInBody === "function" &&
      Api.hasQualdirDefectTablesInBody(lastRawKpiResponse)
    );
  }

  function getApiTableTitleFromRows(rows, tableKey) {
    if (!Array.isArray(rows) || !tableKey) return "";
    var wanted = String(tableKey).trim().toUpperCase();
    for (var i = 0; i < rows.length; i++) {
      var item = rows[i];
      if (!item) continue;
      if (String(item.tableKey || "").trim().toUpperCase() !== wanted) continue;
      if (item.tableName != null && String(item.tableName).trim() !== "") {
        return String(item.tableName).trim();
      }
    }
    return "";
  }

  function getApiTableTitle(tableKey) {
    var fromRows = getApiTableTitleFromRows(lastApiTableRows, tableKey);
    if (fromRows) return fromRows;
    if (
      typeof Api !== "undefined" &&
      Api &&
      typeof Api.getTableTabMetaFromBody === "function" &&
      lastRawKpiResponse
    ) {
      var periodState =
        typeof DashboardMonthNav !== "undefined" &&
        DashboardMonthNav &&
        typeof DashboardMonthNav.getPeriodState === "function"
          ? DashboardMonthNav.getPeriodState()
          : null;
      var meta = Api.getTableTabMetaFromBody(
        lastRawKpiResponse,
        tableKey,
        periodState && periodState.currentPeriodYear != null ? Number(periodState.currentPeriodYear) : null,
        periodState && periodState.currentPeriodMonth != null ? Number(periodState.currentPeriodMonth) : null
      );
      if (meta && meta.name) return String(meta.name).trim();
    }
    return "";
  }

  function updateQualdirClaimsTableSwitcherButtons(useQualdirDefectTables) {
    if (!claimsTableSwitcherEl) return;
    var buttons = claimsTableSwitcherEl.querySelectorAll(".claims-table-switcher-btn");
    if (!buttons || !buttons.length) return;
    var processBtn = claimsTableSwitcherEl.querySelector('[data-claims-view="process"]');
    var showProcessTab = !!useQualdirDefectTables;
    if (processBtn) {
      if (showProcessTab) {
        processBtn.hidden = false;
        processBtn.removeAttribute("hidden");
      } else {
        processBtn.hidden = true;
        processBtn.setAttribute("hidden", "");
        if (activeClaimsTableView === "process") {
          applyClaimsTableView("claims");
        }
      }
    }
    if (buttons.length >= 2) {
      buttons[0].textContent = useQualdirDefectTables
        ? "Внешний брак"
        : buttons[0].getAttribute("data-default-label") || buttons[0].textContent;
      buttons[1].textContent = useQualdirDefectTables
        ? "Внутренний брак"
        : buttons[1].getAttribute("data-default-label") || buttons[1].textContent;
    }
  }

  function isSupDepartmentContext(value) {
    var normalized = normalizeDashboardRole(value);
    return normalized === "sup" || normalized === "служба управления персоналом";
  }

  /** Таблица проектов с отклонениями по вехам (ключ `DEVDIR-T-PROJECTS-DEVIATIONS`), UI как у ОД. */
  function isDevserviceUser(user) {
    if (!user || typeof user !== "object") return false;
    var role = normalizeDashboardRole(user.role);
    var department = normalizeDashboardRole(user.department);
    return (
      role === "devservice" ||
      department === "devservice" ||
      role === "директор по развитию" ||
      department === "директор по развитию"
    );
  }

  function shouldUseDevserviceProjectDeviationsTables() {
    return isDevserviceUser(sessionUser) && selectedViewId === "self";
  }

  function isOperationalDirectorUser(user) {
    if (!user || typeof user !== "object") return false;
    var role = normalizeDashboardRole(user.role);
    var department = normalizeDashboardRole(user.department);
    return role === "операционный директор" || department === "операционный директор";
  }

  function isProductionDeputyUser(user) {
    if (!user || typeof user !== "object") return false;
    var role = normalizeDashboardRole(user.role);
    var department = normalizeDashboardRole(user.department);
    return (
      role === "заместитель операционного директора-директор по производству" ||
      role === "заместитель директора по производству" ||
      department === "заместитель операционного директора-директор по производству" ||
      department === "заместитель директора по производству"
    );
  }

  function isCommercialDepartmentContext(value) {
    var normalized = normalizeDashboardRole(value);
    return normalized === "коммерческий директор" || normalized === "коммерция";
  }

  function isCommercialDirectorDashboardContext() {
    var currentDepartment = getDepartmentForCurrentKpiContext();
    return (
      isCommercialDirectorUser(viewContextUser) ||
      isCommercialDepartmentContext(currentDepartment) ||
      isCommercialDepartmentContext(lastKpiResponseDepartment) ||
      isCommercialHierarchyRootForPriorMonthRule()
    );
  }

  function isChiefMetrologRatioKpiId(kpiId) {
    var id = kpiId != null ? String(kpiId).trim().toUpperCase() : "";
    return id === "METD-Q2" || id === "METD-Q3" || id === "METD-Q4";
  }

  function chairmanAggregationModeLabel(mode) {
    if (mode === "month") return "За месяц";
    if (mode === "quarter") return "За квартал";
    if (mode === "ytd") return "С начала года";
    return "На текущий момент";
  }

  function applyFullMonthPlanToPoint(point) {
    if (!point || typeof point !== "object") return point;
    var fullPlan = parseNumberLoose(point.plan_full);
    if (fullPlan == null) fullPlan = parseNumberLoose(point.plan);
    var fact = parseNumberLoose(point.fact);
    if (fullPlan == null) return point;
    var next = Object.assign({}, point);
    next.plan = fullPlan;
    if (fact != null && Math.abs(fullPlan) > 0.000001) {
      next.kpi_pct = (fact / fullPlan) * 100;
    }
    return next;
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

  function isCommercialHierarchyRootForPriorMonthRule() {
    return false;
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
      if (id === "TD-M6") return tile;
      var src = id && byId[id] ? byId[id] : byTitle[normalizeKpiTitleForMatch(tile.title)];
      if (!src) return tile;
      var next = Object.assign({}, tile);
      if (src.plan !== undefined) next.plan = src.plan;
      if (src.fact !== undefined) next.fact = src.fact;
      if (typeof src.has_data === "boolean") next.has_data = src.has_data;
      if (typeof src.kpi_pct === "number" && !isNaN(src.kpi_pct)) {
        next.kpi_pct = src.kpi_pct;
        next.kpi_pst = src.kpi_pct;
        next.percent = src.kpi_pct;
      }
      if (isTurnoverKpiItem(next)) {
        var turnoverPct = parseNumberLoose(src.kpi_pct);
        if (turnoverPct == null) {
          var srcPlan = parseNumberLoose(src.plan);
          var srcFact = parseNumberLoose(src.fact);
          if (srcPlan != null && Math.abs(srcPlan) > 0.000001 && srcFact != null) {
            turnoverPct = (srcFact / srcPlan) * 100;
            next.kpi_pct = turnoverPct;
            next.kpi_pst = turnoverPct;
            next.percent = turnoverPct;
          }
        }
        var turnoverRag = turnoverLimitRagFromPct(turnoverPct);
        if (turnoverRag) {
          next.rag = turnoverRag;
          next.color = turnoverRag;
        }
      }
      var pl =
        src.plan_fact_period_label != null && String(src.plan_fact_period_label).trim()
          ? String(src.plan_fact_period_label).trim()
          : fallbackLabel;
      next.plan_fact_period_label = pl;
      next.__priorMonthMergedFromKpiAll = true;
      return next;
    });
  }

  function maybeAugmentCommercialDeptTilesWithPriorMonthFetch(result, tilesToRender, done) {
    done(tilesToRender);
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
    if (mode === "month") {
      if (Array.isArray(points)) {
        for (var mi = 0; mi < points.length; mi++) {
          var mp = points[mi];
          if (!mp) continue;
          if (Number(mp.year) === y && Number(mp.month) === m) {
            var mname = mp.month_name != null ? String(mp.month_name).trim() : "";
            if (mname) {
              return "За месяц: " + mname.charAt(0).toUpperCase() + mname.slice(1) + " " + y;
            }
          }
        }
      }
      return "За месяц: " + getMonthShortRu(m) + " " + y;
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

  function mergeNumericMapInto(target, source) {
    if (!target || !source || typeof source !== "object") return;
    Object.keys(source).forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) return;
      var value = parseNumberLoose(source[key]);
      if (value == null) return;
      if (!Object.prototype.hasOwnProperty.call(target, key)) {
        target[key] = 0;
      }
      target[key] += value;
    });
  }

  function normalizeSelectedQuarterNumbers(selectedQuarters) {
    var seen = {};
    var out = [];
    var qs = Array.isArray(selectedQuarters) ? selectedQuarters : [];
    qs.forEach(function (value) {
      var q = parseInt(String(value), 10);
      if (isNaN(q) || q < 1 || q > 4 || seen[q]) return;
      seen[q] = true;
      out.push(q);
    });
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  function getTdM5Aggregate(tile, selectedQuarters) {
    if (!tile || String(tile.kpi_id || "").trim() !== "TD-M5") return null;
    var quarters = normalizeSelectedQuarterNumbers(selectedQuarters);
    if (!quarters.length) return null;
    var key = quarters.join(",");
    var aggregate =
      tile.period_aggregates &&
      tile.period_aggregates.quarter_combinations &&
      tile.period_aggregates.quarter_combinations[key];
    return aggregate && typeof aggregate === "object" ? aggregate : null;
  }

  function buildPointFromPeriodAggregate(aggregate) {
    if (!aggregate || typeof aggregate !== "object") return null;
    var point = Object.assign({}, aggregate);
    var pctValue = parseNumberLoose(aggregate.kpi_pct);
    if (pctValue != null) point.kpi_pct = pctValue;
    if (typeof point.has_data !== "boolean") {
      point.has_data =
        aggregate.plan != null ||
        aggregate.fact != null ||
        aggregate.kpi_pct != null;
    }
    return point;
  }

  function isBudgetFotLimitKpiItem(item) {
    if (!item || typeof item !== "object") return false;
    var id = item.kpi_id != null ? String(item.kpi_id).trim().toUpperCase() : "";
    if (id === "KD-M8") return true;
    if (
      id === "LOG-M3.B" ||
      id === "LOG-M3.F" ||
      id === "OD-M3.1" ||
      id === "OD-M3.2" ||
      id === "METD-M3.B" ||
      id === "METD-M3.F"
    ) {
      return true;
    }
    if (id.indexOf("PD-M3.B") === 0 || id.indexOf("PD-M3.F") === 0) return true;
    if (/-M3-[12]$/.test(id) || /M3\.[12]$/.test(id)) {
      var title = normalizeKpiTitleForMatch(item.name || item.title || "");
      return title.indexOf("фот") !== -1 || title.indexOf("бюджет") !== -1;
    }
    return false;
  }

  function planFactLimitRag(plan, fact) {
    var planValue = parseNumberLoose(plan);
    var factValue = parseNumberLoose(fact);
    if (planValue == null || factValue == null) return null;
    if (factValue < planValue) return "green";
    if (Math.abs(factValue - planValue) < 0.000001) return "yellow";
    return "red";
  }

  function isCommercialHigherIsBetterPlanFactKpiItem(item) {
    if (!item || typeof item !== "object") return false;
    var id = item.kpi_id != null ? String(item.kpi_id).trim().toUpperCase() : "";
    return id === "KD-M1" || id === "KD-M2" || id === "KD-M3";
  }

  /** MRK-04 «Отношение отгрузок YoY»: чем выше %, тем лучше (≥100 зелёный). */
  function isMrk04YoyKpiItem(item) {
    if (!item || typeof item !== "object") return false;
    var id = item.kpi_id != null ? String(item.kpi_id).trim().toUpperCase() : "";
    return id === "MRK-04";
  }

  function higherBetterRagFromPct(pct) {
    var value = parseNumberLoose(pct);
    if (value == null) return null;
    if (value >= 100) return "green";
    if (value >= 90) return "yellow";
    return "red";
  }

  function higherBetterRagFromPlanFact(plan, fact) {
    var planValue = parseNumberLoose(plan);
    var factValue = parseNumberLoose(fact);
    if (planValue == null || factValue == null) return null;
    if (factValue > planValue) return "green";
    if (Math.abs(factValue - planValue) < 0.000001) {
      return planValue > 0 ? "green" : "yellow";
    }
    if (planValue <= 0) return "red";
    return higherBetterRagFromPct((factValue / planValue) * 100);
  }

  function normalizeCommercialHigherIsBetterPlanFactTiles(tiles) {
    if (!Array.isArray(tiles) || !tiles.length) return tiles;
    return tiles.map(function (tile) {
      if (!tile) return tile;
      if (isMrk04YoyKpiItem(tile)) {
        var nextMrk04 = Object.assign({}, tile);
        var mrk04Rag = higherBetterRagFromPct(
          tile.kpi_pct != null ? tile.kpi_pct : tile.percent
        );
        if (mrk04Rag) {
          nextMrk04.rag = mrk04Rag;
          nextMrk04.color = mrk04Rag;
        }
        return nextMrk04;
      }
      if (!isCommercialHigherIsBetterPlanFactKpiItem(tile)) return tile;
      var next = Object.assign({}, tile);
      var plan = parseNumberLoose(tile.plan);
      var fact = parseNumberLoose(tile.fact);
      var rag =
        higherBetterRagFromPlanFact(tile.plan, tile.fact) ||
        higherBetterRagFromPct(tile.kpi_pct != null ? tile.kpi_pct : tile.percent);
      if (rag) {
        next.rag = rag;
        next.color = rag;
      }
      if (plan != null || fact != null) {
        next.has_data = true;
      }
      return next;
    });
  }

  function isTurnoverKpiItem(item) {
    if (!item || typeof item !== "object") return false;
    var id = item.kpi_id != null ? String(item.kpi_id).trim().toUpperCase() : "";
    var title = normalizeKpiTitleForMatch(item.name || item.title || "");
    if (title.indexOf("текучесть") !== -1) return true;
    if (id === "LOG-Q2" || id === "OD-Q2" || id === "QD-Q2" || id === "RD-Q2" || id === "TD-Q2" || id === "ZKD-Q2") return true;
    if (id.indexOf("PD-Q2.") === 0) return true;
    return id.slice(-3) === "-Q5";
  }

  function turnoverLimitRagFromPct(pct) {
    var value = parseNumberLoose(pct);
    if (value == null) return null;
    if (value < 90) return "green";
    if (value <= 100) return "yellow";
    return "red";
  }

  function isPointInTimeDebtKpiItem(item) {
    if (!item || typeof item !== "object") return false;
    var id = item.kpi_id != null ? String(item.kpi_id).trim().toUpperCase() : "";
    return id === "KD-M4" || id === "KD-M5" || id === "FND-T7";
  }

  function lowerIsBetterRagFromPct(pct) {
    var value = parseNumberLoose(pct);
    if (value == null) return null;
    if (value < 100) return "green";
    if (value <= 110) return "yellow";
    return "red";
  }

  /** MRK-06 «Доля Газпром + БМИ»: ≤70 — зелёный, 70.1–75 — жёлтый, >75 — красный. */
  function mrk06ShareRagFromPct(pct) {
    var value = parseNumberLoose(pct);
    if (value == null) return null;
    if (value <= 70) return "green";
    if (value <= 75) return "yellow";
    return "red";
  }

  function isMrk06ShareKpiItem(item) {
    if (!item || typeof item !== "object") return false;
    var id = item.kpi_id != null ? String(item.kpi_id).trim().toUpperCase() : "";
    return id === "MRK-06";
  }

  function computeChairmanAggregatedPoint(item, year, month, mode, selectedQuarters) {
    if (!item || typeof item !== "object") return null;
    var points = Array.isArray(item.monthly_data) ? item.monthly_data.slice() : [];
    var y = Number(year);
    var m = Number(month);
    if (isNaN(y) || isNaN(m) || m < 1 || m > 12) return null;

    if (mode === "quarter" || mode === "ytd") {
      var aggregateQs = normalizeSelectedQuarterNumbers(selectedQuarters);
      if (!aggregateQs.length) aggregateQs = [Math.ceil(m / 3)];
      if (
        String(item.kpi_id || "").trim() === "TD-M5" &&
        item.frontend_aggregation &&
        item.frontend_aggregation.use_period_aggregates_for_buttons
      ) {
        var aggregate =
          mode === "ytd"
            ? item.period_aggregates && item.period_aggregates.year_to_date
            : getTdM5Aggregate(item, aggregateQs);
        var aggregatePoint = buildPointFromPeriodAggregate(aggregate);
        if (aggregatePoint) return aggregatePoint;
      }
    }

    if (!points.length) return null;

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
        if (Number(filtered[ci].month) === m) {
          var row = filtered[ci];
          if (isMrk04YoyKpiItem(item)) {
            row = Object.assign({}, row);
            var monthRag = higherBetterRagFromPct(row.kpi_pct);
            if (monthRag) row.color = monthRag;
          }
          return mode === "month" ? applyFullMonthPlanToPoint(row) : row;
        }
      }
      return null;
    }

    var bucket = [];
    if (mode === "quarter") {
      var qs = normalizeSelectedQuarterNumbers(selectedQuarters);
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

    if (isPointInTimeDebtKpiItem(item)) {
      var latestPoint = bucket
        .slice()
        .sort(function (a, b) { return Number(a.month) - Number(b.month); })
        .filter(function (point) {
          return point && point.has_data !== false && Number(point.month) <= m;
        })
        .pop();
      if (!latestPoint) return null;
      var snapshotPoint = Object.assign({}, latestPoint);
      var snapshotPct = parseNumberLoose(snapshotPoint.kpi_pct);
      snapshotPoint.color = lowerIsBetterRagFromPct(snapshotPct);
      snapshotPoint.snapshot_aggregation = true;
      return snapshotPoint;
    }

    var plan = 0;
    var fact = 0;
    var kpiPct = null;
    var hasPlan = false;
    var hasFact = false;
    var lastPct = null;
    var hasData = false;
    var hasExplicitHasDataFlag = false;
    var extraSums = {
      found: 0, won: 0, not_participating: 0,
      expected_plan: 0,
      dz_client: 0, kz_client: 0,
      dz_supplier: 0, kz_supplier: 0,
      dz_total: 0, kz_total: 0,
      portfolio_count: 0, deviation_count: 0, without_deviation_count: 0,
    };
    var extraHas = {
      found: false, won: false, not_participating: false,
      expected_plan: false,
      dz_client: false, kz_client: false,
      dz_supplier: false, kz_supplier: false,
      dz_total: false, kz_total: false,
      portfolio_count: false, deviation_count: false, without_deviation_count: false,
    };
    var planByDept = {};
    var factByDept = {};
    var articlesFromBucket = null;
    var weightedDisplay = false;
    var displayPlan = null;
    var displayUnit = null;

    bucket.forEach(function (point) {
      var planValue = parseNumberLoose(point.period_plan);
      var factValue = parseNumberLoose(point.period_fact);
      if (planValue == null) planValue = parseNumberLoose(point.plan);
      if (factValue == null) factValue = parseNumberLoose(point.fact);
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
      if (point.aggregation === "weighted_delta_amount_div_project_amount") {
        weightedDisplay = true;
        if (displayPlan == null) displayPlan = parseNumberLoose(point.display_plan);
        if (displayUnit == null && point.display_unit != null) displayUnit = String(point.display_unit);
      }
      if (typeof point.has_data === "boolean") {
        hasExplicitHasDataFlag = true;
        if (point.has_data === true) hasData = true;
      }
      Object.keys(extraSums).forEach(function (key) {
        var v = parseNumberLoose(point[key]);
        if (v != null) {
          extraSums[key] += v;
          extraHas[key] = true;
        }
      });
      mergeNumericMapInto(planByDept, point.plan_by_dept);
      mergeNumericMapInto(factByDept, point.fact_by_dept);
      if (Array.isArray(point.articles) && point.articles.length) {
        articlesFromBucket = point.articles;
      }
    });

    if (hasPlan && Math.abs(plan) > 0.000001 && hasFact) {
      // Взвешенное отклонение закупочной цены: KPI = (факт − план) / план × 100.
      kpiPct = weightedDisplay
        ? ((fact - plan) / Math.abs(plan)) * 100
        : (fact / plan) * 100;
    } else if (lastPct != null) {
      kpiPct = lastPct;
    }

    // FND-T3 «Соотношение ДЗ и КЗ»: пересчитываем проценты из
    // просуммированных ДЗ/КЗ (при агрегации quarter/ytd пользовательское
    // требование — складывать ДЗ с ДЗ, КЗ с КЗ и заново считать процент).
    var pctClient = null;
    if (extraHas.dz_client && extraHas.kz_client && Math.abs(extraSums.kz_client) > 0.000001) {
      pctClient = (extraSums.dz_client / extraSums.kz_client) * 100;
    }
    var pctSupplier = null;
    if (extraHas.dz_supplier && extraHas.kz_supplier && Math.abs(extraSums.kz_supplier) > 0.000001) {
      pctSupplier = (extraSums.dz_supplier / extraSums.kz_supplier) * 100;
    }
    var dzTotal = extraHas.dz_total ? extraSums.dz_total : null;
    var kzTotal = extraHas.kz_total ? extraSums.kz_total : null;
    if (dzTotal == null && (extraHas.dz_client || extraHas.dz_supplier)) {
      dzTotal = (extraHas.dz_client ? extraSums.dz_client : 0) + (extraHas.dz_supplier ? extraSums.dz_supplier : 0);
    }
    if (kzTotal == null && (extraHas.kz_client || extraHas.kz_supplier)) {
      kzTotal = (extraHas.kz_client ? extraSums.kz_client : 0) + (extraHas.kz_supplier ? extraSums.kz_supplier : 0);
    }
    var pctTotal = null;
    if (dzTotal != null && kzTotal != null && Math.abs(kzTotal) > 0.000001) {
      pctTotal = (dzTotal / kzTotal) * 100;
    }
    if (pctTotal != null) {
      kpiPct = pctTotal;
    }
    // FND-T6 «Портфель проектов»: KPI = без отклонений по вехам / все проекты × 100%.
    if (
      extraHas.portfolio_count &&
      Math.abs(extraSums.portfolio_count) > 0.000001
    ) {
      var withoutAgg = extraHas.without_deviation_count
        ? extraSums.without_deviation_count
        : (extraHas.deviation_count
          ? Math.max(extraSums.portfolio_count - extraSums.deviation_count, 0)
          : null);
      if (withoutAgg != null) {
        kpiPct = (withoutAgg / extraSums.portfolio_count) * 100;
      }
    }
    var limitRag = isBudgetFotLimitKpiItem(item) ? planFactLimitRag(plan, fact) : null;
    var turnoverRag = isTurnoverKpiItem(item) ? turnoverLimitRagFromPct(kpiPct) : null;
    var shareRag = isMrk06ShareKpiItem(item) ? mrk06ShareRagFromPct(kpiPct) : null;
    var commercialPlanFactRag = isCommercialHigherIsBetterPlanFactKpiItem(item)
      ? higherBetterRagFromPlanFact(hasPlan ? plan : null, hasFact ? fact : null) ||
        higherBetterRagFromPct(kpiPct)
      : null;
    var mrk04Rag = isMrk04YoyKpiItem(item) ? higherBetterRagFromPct(kpiPct) : null;

    return {
      year: y,
      month: m,
      month_name: null,
      plan: hasPlan ? plan : null,
      fact: hasFact ? fact : null,
      // Для LOG-M2 display_* больше не подменяют суммы на % — план/факт остаются в рублях.
      display_plan: null,
      display_fact: null,
      display_unit: null,
      aggregation: weightedDisplay ? "weighted_delta_amount_div_project_amount" : null,
      target_deviation_pct: weightedDisplay ? (displayPlan != null ? displayPlan : 5) : null,
      color:
        weightedDisplay && kpiPct != null
          ? (kpiPct < (displayPlan != null ? displayPlan : 5)
            ? "green"
            : (Math.abs(kpiPct - (displayPlan != null ? displayPlan : 5)) < 0.000001 ? "yellow" : "red"))
          : (mrk04Rag || shareRag || turnoverRag || limitRag || commercialPlanFactRag),
      expected_plan: extraHas.expected_plan ? extraSums.expected_plan : null,
      found: extraHas.found ? extraSums.found : null,
      won: extraHas.won ? extraSums.won : null,
      not_participating: extraHas.not_participating ? extraSums.not_participating : null,
      dz_client: extraHas.dz_client ? extraSums.dz_client : null,
      kz_client: extraHas.kz_client ? extraSums.kz_client : null,
      dz_supplier: extraHas.dz_supplier ? extraSums.dz_supplier : null,
      kz_supplier: extraHas.kz_supplier ? extraSums.kz_supplier : null,
      dz_total: dzTotal,
      kz_total: kzTotal,
      portfolio_count: extraHas.portfolio_count ? extraSums.portfolio_count : null,
      deviation_count: extraHas.deviation_count ? extraSums.deviation_count : null,
      without_deviation_count: extraHas.without_deviation_count ? extraSums.without_deviation_count : null,
      pct_client: pctClient,
      pct_supplier: pctSupplier,
      pct_total: pctTotal,
      plan_by_dept: Object.keys(planByDept).length ? planByDept : null,
      fact_by_dept: Object.keys(factByDept).length ? factByDept : null,
      articles: articlesFromBucket ? articlesFromBucket.slice() : null,
      kpi_pct: kpiPct,
      has_data: isCommercialHigherIsBetterPlanFactKpiItem(item)
        ? hasPlan || hasFact
        : hasExplicitHasDataFlag
          ? hasData
          : hasPlan || hasFact,
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
    var hintFields =
      typeof DashUi !== "undefined" &&
      DashUi &&
      typeof DashUi.normalizeKpiTileHintFields === "function"
        ? DashUi.normalizeKpiTileHintFields(rawItem)
        : {
            description:
              rawItem.description != null
                ? String(rawItem.description)
                : "",
            hint:
              rawItem.description != null
                ? String(rawItem.description)
                : rawItem.hint != null
                  ? String(rawItem.hint)
                  : rawItem.comment != null
                    ? String(rawItem.comment)
                    : "",
            source: firstStringValue(["source", "data_source", "kpi_source", "info_source", "hint_source"]),
            plan_description: firstStringValue([
              "plan_description",
              "description_plan",
              "hint_plan",
              "plan_hint",
            ]),
            fact_description: firstStringValue([
              "fact_description",
              "description_fact",
              "hint_fact",
              "fact_hint",
            ]),
          };
    function normalizeUnits(kpiId, value) {
      var kid = kpiId != null ? String(kpiId).trim().toUpperCase() : "";
      if (kid === "LOG-M2") return "руб.";
      if (kid === "OD-M1" || kid === "OD-M3.1" || kid === "OD-M3.2") return "руб.";
      if (kid === "KD-M11") return "чел.";
      if (/^QD-M\d+$/.test(kid)) {
        var unitText = value != null ? String(value).trim() : "";
        if (!unitText || unitText === "%") return "шт.";
        return unitText;
      }
      if (/^SH-M\d+$/.test(kid)) {
        var shUnit = value != null ? String(value).trim() : "";
        if (!shUnit || shUnit === "%") return "шт.";
        return shUnit;
      }
      if (kid === "METD-M1" || kid === "МЕТ-M1") return "шт.";
      return value;
    }

    // Когда пересчитываем плитку под режим агрегации (квартал / YTD),
    // сохранённый на бэкенде цвет соответствует только месячному проценту
    // и будет давать неверный RAG для агрегированного значения. В этих
    // режимах отдаём решение по цвету порогам (`green_threshold` и т.д.).
    var preserveBackendRag =
      mode !== "quarter" && mode !== "ytd" && mode !== "month";

    var outPlan =
      point && point.display_plan != null
        ? point.display_plan
        : point
          ? point.plan
          : rawItem.plan;
    var outFact =
      point && point.display_fact != null
        ? point.display_fact
        : point
          ? point.fact
          : rawItem.fact;
    var outUnit =
      point && point.display_unit != null
        ? point.display_unit
        : firstStringValue(["units", "unit", "uom", "measure_unit", "measurement_unit"]);
    var isLogM2Tile = String(rawItem.kpi_id || "").trim().toUpperCase() === "LOG-M2";
    if (isLogM2Tile) {
      outPlan = point && point.plan != null ? point.plan : rawItem.plan;
      outFact = point && point.fact != null ? point.fact : rawItem.fact;
      outUnit = "руб.";
      if (point && typeof point.kpi_pct === "number" && !isNaN(point.kpi_pct)) {
        pointPct = point.kpi_pct;
      } else {
        var planNumM2 = parseNumberLoose(outPlan);
        var factNumM2 = parseNumberLoose(outFact);
        if (planNumM2 != null && factNumM2 != null && Math.abs(planNumM2) > 0.000001) {
          pointPct = ((factNumM2 - planNumM2) / Math.abs(planNumM2)) * 100;
        }
      }
    }

    var normalizedTile = {
      kpi_id: rawItem.kpi_id != null ? String(rawItem.kpi_id) : "",
      title: title,
      badge: rawItem.kpi_id != null ? String(rawItem.kpi_id) : "KPI",
      period:
        rawItem.period != null && String(rawItem.period).trim()
          ? String(rawItem.period)
          : chairmanAggregationModeLabel(mode),
      units: normalizeUnits(
        rawItem.kpi_id,
        outUnit
      ),
      frequency: firstStringValue(["frequency", "periodicity", "update_frequency", "frequency_label"]),
      cache_updated_at: firstStringValue(["cache_updated_at"]),
      data_granularity: rawItem.data_granularity != null ? String(rawItem.data_granularity) : "",
      formula: rawItem.formula != null ? String(rawItem.formula) : null,
      plan_fact_period_label: label,
      percent: pointPct != null ? pointPct : itemPct,
      kpi_pst: typeof rawItem.kpi_pst === "number" && !isNaN(rawItem.kpi_pst) ? rawItem.kpi_pst : null,
      kpi_pct: pointPct != null ? pointPct : itemPct,
      kpi_pct_is_deviation: isLogM2Tile ? true : rawItem.kpi_pct_is_deviation === true,
      plan: outPlan,
      fact: outFact,
      expected_plan:
        point && point.expected_plan != null
          ? point.expected_plan
          : rawItem.expected_plan != null
            ? rawItem.expected_plan
            : null,
      found:
        point && point.found != null
          ? point.found
          : rawItem.found != null
            ? rawItem.found
            : null,
      won:
        point && point.won != null
          ? point.won
          : rawItem.won != null
            ? rawItem.won
            : null,
      not_participating:
        point && point.not_participating != null
          ? point.not_participating
          : rawItem.not_participating != null
            ? rawItem.not_participating
            : null,
      dz_client:
        point && point.dz_client != null
          ? point.dz_client
          : rawItem.dz_client != null
            ? rawItem.dz_client
            : null,
      kz_client:
        point && point.kz_client != null
          ? point.kz_client
          : rawItem.kz_client != null
            ? rawItem.kz_client
            : null,
      dz_supplier:
        point && point.dz_supplier != null
          ? point.dz_supplier
          : rawItem.dz_supplier != null
            ? rawItem.dz_supplier
            : null,
      kz_supplier:
        point && point.kz_supplier != null
          ? point.kz_supplier
          : rawItem.kz_supplier != null
            ? rawItem.kz_supplier
            : null,
      dz_total:
        point && point.dz_total != null
          ? point.dz_total
          : rawItem.dz_total != null
            ? rawItem.dz_total
            : null,
      kz_total:
        point && point.kz_total != null
          ? point.kz_total
          : rawItem.kz_total != null
            ? rawItem.kz_total
            : null,
      portfolio_count:
        point && point.portfolio_count != null
          ? point.portfolio_count
          : rawItem.portfolio_count != null
            ? rawItem.portfolio_count
            : null,
      deviation_count:
        point && point.deviation_count != null
          ? point.deviation_count
          : rawItem.deviation_count != null
            ? rawItem.deviation_count
            : null,
      rejected_items_count:
        point && point.rejected_items_count !== undefined
          ? point.rejected_items_count
          : rawItem.rejected_items_count !== undefined
            ? rawItem.rejected_items_count
            : null,
      without_deviation_count:
        point && point.without_deviation_count != null
          ? point.without_deviation_count
          : rawItem.without_deviation_count != null
            ? rawItem.without_deviation_count
            : null,
      plan_by_dept:
        point && point.plan_by_dept && typeof point.plan_by_dept === "object"
          ? point.plan_by_dept
          : rawItem.plan_by_dept && typeof rawItem.plan_by_dept === "object"
            ? rawItem.plan_by_dept
            : null,
      fact_by_dept:
        point && point.fact_by_dept && typeof point.fact_by_dept === "object"
          ? point.fact_by_dept
          : rawItem.fact_by_dept && typeof rawItem.fact_by_dept === "object"
            ? rawItem.fact_by_dept
            : null,
      pct_client:
        point && point.pct_client != null
          ? point.pct_client
          : rawItem.pct_client != null
            ? rawItem.pct_client
            : null,
      pct_supplier:
        point && point.pct_supplier != null
          ? point.pct_supplier
          : rawItem.pct_supplier != null
            ? rawItem.pct_supplier
            : null,
      pct_total:
        point && point.pct_total != null
          ? point.pct_total
          : rawItem.pct_total != null
            ? rawItem.pct_total
            : null,
      has_data:
        point && typeof point.has_data === "boolean"
          ? point.has_data
          : typeof rawItem.has_data === "boolean"
            ? rawItem.has_data
            : undefined,
      hint: hintFields.description,
      description: hintFields.description,
      source: hintFields.source,
      plan_description: hintFields.plan_description,
      fact_description: hintFields.fact_description,
      rag: point && point.color != null
        ? String(point.color).toLowerCase().trim()
        : preserveBackendRag && rawItem.color != null
          ? String(rawItem.color).toLowerCase().trim()
          : null,
      pct_lower_is_better: rawItem.pct_lower_is_better === true,
      green_threshold: thStr(thresholds, "green", "green_threshold"),
      yellow_threshold: thStr(thresholds, "yellow", "yellow_threshold"),
      red_threshold: thStr(thresholds, "red", "red_threshold"),
      blue_threshold: thStr(thresholds, "blue", "blue_threshold"),
      monthly_data: Array.isArray(rawItem.monthly_data) ? rawItem.monthly_data : [],
      quarterly_data: Array.isArray(rawItem.quarterly_data) ? rawItem.quarterly_data : [],
      project_deviation_rows:
        point && Array.isArray(point.project_deviation_rows)
          ? point.project_deviation_rows
          : Array.isArray(rawItem.project_deviation_rows)
            ? rawItem.project_deviation_rows
            : [],
      max_allowed_delay_workdays:
        point && point.max_allowed_delay_workdays != null
          ? point.max_allowed_delay_workdays
          : rawItem.max_allowed_delay_workdays != null
            ? rawItem.max_allowed_delay_workdays
            : null,
      plan_fact_rows:
        point && Array.isArray(point.plan_fact_rows)
          ? point.plan_fact_rows
          : Array.isArray(rawItem.plan_fact_rows)
            ? rawItem.plan_fact_rows
            : [],
      articles:
        point && Array.isArray(point.articles) && point.articles.length
          ? point.articles.slice()
          : Array.isArray(rawItem.articles)
            ? rawItem.articles.slice()
            : [],
      tender_departments:
        point && Array.isArray(point.tender_departments)
          ? point.tender_departments
          : Array.isArray(rawItem.tender_departments)
            ? rawItem.tender_departments
            : [],
      departments: (function () {
        var rawDepts =
          point && Array.isArray(point.departments)
            ? point.departments
            : Array.isArray(rawItem.departments) && rawItem.departments.length
              ? rawItem.departments
              : rawItem.last_full_month_row &&
                  typeof rawItem.last_full_month_row === "object" &&
                  Array.isArray(rawItem.last_full_month_row.departments)
                ? rawItem.last_full_month_row.departments
                : [];
        if (!Array.isArray(rawDepts)) return [];
        return rawDepts
          .filter(function (item) {
            return item && typeof item === "object";
          })
          .map(function (item) {
            var count = Number(item.count);
            return {
              name: item.name != null ? String(item.name).trim() : "",
              count: isFinite(count) && !isNaN(count) ? Math.round(count) : 0,
            };
          });
      })(),
      last_full_month_row:
        rawItem.last_full_month_row && typeof rawItem.last_full_month_row === "object"
          ? rawItem.last_full_month_row
          : null,
    };
    var qualdirCfg =
      typeof global !== "undefined" && global.KPI_TILE_EXCEPTIONS
        ? global.KPI_TILE_EXCEPTIONS
        : typeof window !== "undefined" && window.KPI_TILE_EXCEPTIONS
          ? window.KPI_TILE_EXCEPTIONS
          : null;
    var qualdirKey = normalizedTile.kpi_id != null ? String(normalizedTile.kpi_id).trim().toUpperCase() : "";
    var qualdirRule =
      qualdirCfg && qualdirKey && qualdirCfg[qualdirKey] && qualdirCfg[qualdirKey].qualdirControlOverview
        ? qualdirCfg[qualdirKey].qualdirControlOverview
        : null;
    if (qualdirRule && Array.isArray(qualdirRule.rows)) {
      var inWorkSource = point && typeof point === "object" ? point : rawItem;
      var lfm =
        rawItem.last_full_month_row && typeof rawItem.last_full_month_row === "object"
          ? rawItem.last_full_month_row
          : null;
      qualdirRule.rows.forEach(function (row) {
        if (!row || !row.field || row.field === "fact") return;
        if (row.lastFullMonthOnly) {
          if (Object.prototype.hasOwnProperty.call(inWorkSource, row.field)) {
            normalizedTile[row.field] = inWorkSource[row.field];
          } else if (
            lfm &&
            Object.prototype.hasOwnProperty.call(lfm, row.field) &&
            point &&
            Number(point.year) === Number(lfm.year) &&
            Number(point.month) === Number(lfm.month)
          ) {
            normalizedTile[row.field] = lfm[row.field];
          }
          return;
        }
        if (inWorkSource[row.field] !== undefined) {
          normalizedTile[row.field] = inWorkSource[row.field];
        }
      });
    }
    if (!normalizedTile.last_full_month_row && rawItem.last_full_month_row) {
      normalizedTile.last_full_month_row = rawItem.last_full_month_row;
    }
    return normalizedTile;
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

  function getCommercialFotTurnoverAggregatedTilesFromRaw(rawBody, baseTiles) {
    if (!rawBody || typeof rawBody !== "object" || !Array.isArray(baseTiles) || !baseTiles.length) return null;

    var periodState =
      typeof DashboardMonthNav !== "undefined" && DashboardMonthNav && typeof DashboardMonthNav.getPeriodState === "function"
        ? DashboardMonthNav.getPeriodState()
        : null;
    var mode = periodState && periodState.aggregationMode != null ? String(periodState.aggregationMode).trim() : "current";
    if (mode !== "quarter" && mode !== "ytd" && mode !== "month") return null;
    if (
      mode !== "month" &&
      !isCommercialDirectorDashboardContext() &&
      !isChiefMetrologDashboardContext()
    ) {
      return null;
    }

    var year = periodState && periodState.currentPeriodYear != null ? Number(periodState.currentPeriodYear) : null;
    var month = periodState && periodState.currentPeriodMonth != null ? Number(periodState.currentPeriodMonth) : null;
    var selectedQuarters = periodState && Array.isArray(periodState.selectedQuarters) ? periodState.selectedQuarters : [];
    if (year == null || month == null || isNaN(year) || isNaN(month)) return null;

    var itemsBlock = rawBody["Плитки"];
    var rawItems = itemsBlock && Array.isArray(itemsBlock.items) ? itemsBlock.items : [];
    if (!rawItems.length) return null;

    var byId = {};
    rawItems.forEach(function (item) {
      if (item && item.kpi_id != null) byId[String(item.kpi_id).trim()] = item;
    });

    var touched = false;
    var nextTiles = baseTiles.map(function (tile) {
      var id = tile && tile.kpi_id != null ? String(tile.kpi_id).trim() : "";
      if (mode === "month") {
        if (!byId[id] || !Array.isArray(byId[id].monthly_data) || !byId[id].monthly_data.length) return tile;
      } else if (isCommercialDirectorDashboardContext()) {
        if (id !== "KD-M1" && id !== "KD-M2" && id !== "KD-M3" && id !== "KD-M8" && id !== "KD-M11") return tile;
      } else if (!isChiefMetrologRatioKpiId(id)) {
        return tile;
      }
      var rawItem = byId[id];
      if (!rawItem) return tile;
      var point = computeChairmanAggregatedPoint(rawItem, year, month, mode, selectedQuarters);
      if (!point) return tile;
      var aggregated = normalizeKpiTileFromRawItem(rawItem, point, mode);
      if (!aggregated) return tile;
      touched = true;
      return aggregated;
    });

    return touched ? nextTiles : null;
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

  function isBoardChairCommercialBlockContext() {
    if (!isBoardChairUser(sessionUser)) return false;
    var chairmanFor = getChairmanDashboardCatalogId();
    return isVirtualChairmanCatalog(chairmanFor) && String(chairmanFor).trim() === "commerce";
  }

  function isBoardChairRevisionBlockContext() {
    if (!isBoardChairUser(sessionUser)) return false;
    var chairmanFor = getChairmanDashboardCatalogId();
    var id = chairmanFor != null ? String(chairmanFor).trim().toLowerCase() : "";
    return isVirtualChairmanCatalog(chairmanFor) && (id === "revision" || id.indexOf("revision") !== -1);
  }

  function shouldUseGsppTechnicalTables() {
    return isGsppUser(sessionUser) && selectedViewId === "self";
  }

  function shouldUseTechnicalDeviationTables() {
    return shouldUseTechnicalTables() || shouldUseGsppTechnicalTables();
  }

  function shouldUseHrdLateVacanciesTable() {
    var currentDepartment = getDepartmentForCurrentKpiContext();
    return (
      isSupUser(sessionUser) ||
      isSupUser(viewContextUser) ||
      isSupDepartmentContext(currentDepartment) ||
      isSupDepartmentContext(lastKpiResponseDepartment)
    );
  }

  function shouldUseClaimsAndLawsuitsSwitcher() {
    if (shouldUseQualdirDefectTables()) return true;
    if (isProductionDirectorDashboardContext()) return true;
    if (shouldUseTechnicalTables()) return true;
    if (shouldUseCommercialDirectorOverdueDebtEnhancements()) return true;
    if (isBoardChairCommercialBlockContext()) return true;
    return isBoardChairUser(sessionUser) && selectedViewId === "self";
  }

  function shouldUseTechnicalTables() {
    return isTechnicalDirectorUser(sessionUser) && selectedViewId === "self";
  }

  function shouldUseOpdirProjectTables() {
    var currentDepartment = getDepartmentForCurrentKpiContext();
    return (
      (selectedViewId === "self" && (isOperationalDirectorUser(sessionUser) || isOperationalDirectorUser(viewContextUser))) ||
      isOperationalDirectorUser({ department: currentDepartment }) ||
      isOperationalDirectorUser({ department: lastKpiResponseDepartment }) ||
      isProductionDeputyDashboardContext()
    );
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
    var useTechnicalTables = shouldUseTechnicalDeviationTables();
    var useOpdirProjectTables = shouldUseOpdirProjectTables();
    var useDevserviceProjectTables = shouldUseDevserviceProjectDeviationsTables();
    var useProjectMilestonesTables = useOpdirProjectTables || useDevserviceProjectTables;
    var useChiefConstructorTables = isChiefConstructorDashboardContext();
    var useChiefMetrologTables = isChiefMetrologDashboardContext();
    var useProductionDirectorProjectTables = isProductionDirectorDashboardContext();
    var useProductionDeputyProjectTables = isProductionDeputyDashboardContext();
    var useHrdLateVacanciesTable = shouldUseHrdLateVacanciesTable();
    var useServheadClientsTable = shouldUseServheadClientsTable();
    var useServheadSurveysTable = hasServheadSurveysTable();
    var useServheadClientsOnlyTable = hasServheadClientsTableRows(lastApiTableRows);
    var useQualdirDefectTables = shouldUseQualdirDefectTables();
    var hideDefaultCommercialTables = shouldHideDefaultCommercialTables();
    if (useTechnicalTables) {
      activeClaimsTableView = "claims";
    }
    if (useQualdirDefectTables) {
      activeClaimsTableView = "claims";
    }
    if (useProjectMilestonesTables) {
      activeClaimsTableView = "claims";
    }
    if (useHrdLateVacanciesTable) {
      activeClaimsTableView = "claims";
    }
    if (useServheadClientsTable) {
      activeClaimsTableView = "claims";
    }
    if (claimsTableTitleTextEl) {
      claimsTableTitleTextEl.textContent = useQualdirDefectTables
        ? getApiTableTitleFromRows(lastApiTableRows, "QD-T-M5") || "Внешний брак"
        : useOpdirProjectTables
        ? useProductionDeputyProjectTables
          ? "Претензии на стороне производства"
          : useProductionDirectorProjectTables
          ? "Проекты с отклонениями по вехам"
          : "Проекты с отклонениями по вехам"
        : useDevserviceProjectTables
          ? "Проекты с отклонениями по вехам"
          : useChiefMetrologTables
            ? "Просроченные этапы метрологической службы"
            : useChiefConstructorTables
              ? "Проекты КБ с отклонениями до 10 р.д."
              : shouldUseGsppTechnicalTables()
                ? "Отклонения по проекту развития номенклатуры"
                : useHrdLateVacanciesTable
                  ? "Вакансии, закрытые не в срок"
                  : useServheadClientsTable
                    ? useServheadClientsOnlyTable
                      ? getApiTableTitle("SH-T1") || "Ситуация по клиентам"
                      : getApiTableTitle("SH-T2") || "Анкеты удовлетворённости клиентов"
                    : useTechnicalTables
                    ? "Отклонения по вехам"
                    : isBoardChairOwnDashboard
                      ? "ТОП-10 отклонений"
                      : "Претензии";
      claimsTableTitleTextEl.hidden = showClaimsSwitcher;
    }

    if (overdueDebtTableTitleEl) {
      overdueDebtTableTitleEl.textContent = useServheadClientsTable && useServheadSurveysTable
        ? getApiTableTitle("SH-T2") || "Анкеты удовлетворённости клиентов"
        : useOpdirProjectTables
        ? useProductionDirectorProjectTables
          ? "Проекты улучшений / сокращения потерь"
          : "Проекты с отклонениями по вехам"
        : useTechnicalTables
          ? "Улучшение и развитие"
          : isLogisticsDashboardContext()
          ? "Дебиторская задолженность"
          : "Расшифровка просроченной дебиторской задолженности";
    }

    if (claimsTableHelpWrapEl) {
      claimsTableHelpWrapEl.hidden =
        useQualdirDefectTables ||
        useHrdLateVacanciesTable ||
        useServheadClientsTable ||
        useTechnicalTables ||
        useProjectMilestonesTables ||
        activeClaimsTableView === "lawsuits";
    }

    if (claimsTableTitleTextEl && claimsTableTitleTextEl.closest) {
      var claimsPanel = claimsTableTitleTextEl.closest(".table-panel");
      if (claimsPanel) {
        claimsPanel.hidden = hideDefaultCommercialTables;
      }
    }

    updateQualdirClaimsTableSwitcherButtons(useQualdirDefectTables);
    if (claimsTableSwitcherEl && !useQualdirDefectTables) {
      var switchButtons = claimsTableSwitcherEl.querySelectorAll(".claims-table-switcher-btn");
      if (switchButtons && switchButtons.length >= 2) {
        switchButtons[0].textContent = useOpdirProjectTables
          ? useProductionDirectorProjectTables
            ? "Отклонения"
            : "Проекты"
          : useTechnicalTables
            ? "Внешний заказ"
            : "Претензии";
        switchButtons[1].textContent = useOpdirProjectTables
          ? useProductionDirectorProjectTables
            ? "Проекты улучшений"
            : "Проекты"
          : useTechnicalTables
            ? "Улучшение и развитие"
            : "Суды";
      }
    }

    if (overdueDebtTableTitleEl && overdueDebtTableTitleEl.closest) {
      var overduePanel = overdueDebtTableTitleEl.closest(".table-panel");
      if (overduePanel) {
        /* ПСД «Мой дашборд»: FND-B2 не реализован — панель не показываем.
           У председателя СД / коммерческого блока таблицы просроченной ДЗ нет. */
        overduePanel.hidden =
          hideDefaultCommercialTables ||
          isBoardChairCommercialBlockContext() ||
          useQualdirDefectTables ||
          useHrdLateVacanciesTable ||
          (useServheadClientsTable && !useServheadSurveysTable) ||
          useTechnicalTables ||
          useProjectMilestonesTables ||
          useChiefConstructorTables ||
          useChiefMetrologTables ||
          isBoardChairOwnDashboard;
      }
    }

    updateClaimsTableSwitcherUi(showClaimsSwitcher);
    updatePsdTableAmountFilterBarVisibility();
    updateServheadSurveysPeriodFilterVisibility(
      useServheadSurveysTable,
      useServheadClientsOnlyTable
    );

    var tablesRow = document.querySelector(".tables-row");
    if (tablesRow) {
      tablesRow.hidden = hideDefaultCommercialTables;
    }
  }

  function updateServheadSurveysPeriodFilterVisibility(useServheadSurveysTable, useServheadClientsOnlyTable) {
    var wrapClaims = document.getElementById("servhead-surveys-period-filter-wrap");
    var wrapOverdue = document.getElementById("servhead-surveys-period-filter-wrap-overdue");
    var showClaims = !!useServheadSurveysTable && !useServheadClientsOnlyTable;
    var showOverdue = !!useServheadSurveysTable && !!useServheadClientsOnlyTable;

    if (wrapClaims) {
      if (showClaims) {
        wrapClaims.hidden = false;
        wrapClaims.removeAttribute("hidden");
        wrapClaims.setAttribute("aria-hidden", "false");
      } else {
        wrapClaims.hidden = true;
        wrapClaims.setAttribute("hidden", "");
        wrapClaims.setAttribute("aria-hidden", "true");
      }
    }

    if (wrapOverdue) {
      if (showOverdue) {
        wrapOverdue.hidden = false;
        wrapOverdue.removeAttribute("hidden");
        wrapOverdue.setAttribute("aria-hidden", "false");
      } else {
        wrapOverdue.hidden = true;
        wrapOverdue.setAttribute("hidden", "");
        wrapOverdue.setAttribute("aria-hidden", "true");
      }
    }
  }

  function updatePsdTableAmountFilterBarVisibility() {
    var wrapClaims = document.getElementById("psd-table-amount-filter-wrap");
    var wrapOverdue = document.getElementById("psd-table-amount-filter-wrap-overdue");
    var boxes = getPsdIncludeUnder1mCheckboxes();
    var wraps = [wrapClaims, wrapOverdue].filter(Boolean);
    if (!wraps.length) return;
    var show = isBoardChairUser(sessionUser) && typeof sessionUser === "object";
    for (var i = 0; i < wraps.length; i++) {
      var wrap = wraps[i];
      // Фильтр «< 1 млн» у таблицы просрочки не показываем — самой таблицы у ПСД нет.
      var showThis = show && wrap !== wrapOverdue;
      if (showThis) {
        wrap.hidden = false;
        wrap.removeAttribute("hidden");
        wrap.setAttribute("aria-hidden", "false");
      } else {
        wrap.hidden = true;
        wrap.setAttribute("hidden", "");
        wrap.setAttribute("aria-hidden", "true");
      }
    }
    if (!show) {
      if (boxes.primary) boxes.primary.checked = false;
      if (boxes.overdue) boxes.overdue.checked = false;
    }
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
    var nextView = view === "lawsuits" ? "lawsuits" : view === "process" ? "process" : "claims";
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
      if (shouldUseQualdirDefectTables()) {
        if (nextView === "lawsuits") {
          claimsTableTitleTextEl.textContent =
            getApiTableTitleFromRows(lastApiTableRows, "QD-T-M1") || "Внутренний брак";
        } else if (nextView === "process") {
          claimsTableTitleTextEl.textContent = "Процессные несоответствия";
        } else {
          claimsTableTitleTextEl.textContent =
            getApiTableTitleFromRows(lastApiTableRows, "QD-T-M5") || "Внешний брак";
        }
      }
    }

    if (claimsTableHelpWrapEl) {
      claimsTableHelpWrapEl.hidden =
        shouldUseQualdirDefectTables() ||
        shouldUseTechnicalDeviationTables() ||
        shouldUseOpdirProjectTables() ||
        shouldUseDevserviceProjectDeviationsTables() ||
        shouldUseHrdLateVacanciesTable() ||
        shouldUseServheadClientsTable() ||
        nextView === "lawsuits";
    }
    if (nextView === "lawsuits") {
      hideClaimsTableHelpPopover();
    }
  }

  function initTables() {
    updateDashboardTableTitlesForRole();
    if (typeof DashboardClaimsTable === "undefined" || !DashboardClaimsTable) return;
    if (typeof DashboardClaimsTable.init === "function") {
      var psdTableMinRub = null;
      if (isBoardChairUser(sessionUser) && typeof sessionUser === "object") {
        var p = getPsdIncludeUnder1mCheckboxes();
        var showAll =
          (p.primary && p.primary.checked) || (p.overdue && p.overdue.checked);
        if (!showAll) {
          psdTableMinRub = 1000000;
        }
      }
      var protocolTableYear = null;
      var protocolTableMonth = null;
      if (typeof DashboardMonthNav !== "undefined" && DashboardMonthNav && typeof DashboardMonthNav.getPeriodState === "function") {
        var tablePeriodState = DashboardMonthNav.getPeriodState();
        protocolTableYear =
          tablePeriodState && tablePeriodState.currentPeriodYear != null
            ? Number(tablePeriodState.currentPeriodYear)
            : null;
        protocolTableMonth =
          tablePeriodState && tablePeriodState.currentPeriodMonth != null
            ? Number(tablePeriodState.currentPeriodMonth)
            : null;
      }
      var hideDefaultCommercialTables = shouldHideDefaultCommercialTables();
      DashboardClaimsTable.init({
        rows: lastApiTableRows,
        hideDefaultCommercialTablesMode: hideDefaultCommercialTables,
        protocolOverdueTableInBody:
          typeof Api !== "undefined" &&
          Api &&
          typeof Api.hasProtocolOverdueTableInBody === "function" &&
          Api.hasProtocolOverdueTableInBody(lastRawKpiResponse, protocolTableYear, protocolTableMonth),
        executiveMode: false,
        enhanceOverdueDebtTable: shouldUseCommercialDirectorOverdueDebtEnhancements(),
        enableLawsuitsTable: shouldUseClaimsAndLawsuitsSwitcher(),
        filterRowsMinAmountRub: psdTableMinRub,
        technicalTablesMode: shouldUseTechnicalDeviationTables(),
        hrdLateVacanciesTableMode: shouldUseHrdLateVacanciesTable(),
        servheadClientsTableMode: shouldUseServheadClientsTable(),
        servheadSurveysTableInBody:
          typeof Api !== "undefined" &&
          Api &&
          typeof Api.hasServheadSurveysTableInBody === "function" &&
          Api.hasServheadSurveysTableInBody(lastRawKpiResponse),
        technicalExternalTableKey: shouldUseGsppTechnicalTables() ? "GSPP-T-Q4-DEVIATIONS" : undefined,
        technicalDevelopmentTableKey: shouldUseGsppTechnicalTables() ? "GSPP-T-Q4-DEVIATIONS" : undefined,
        technicalDeviationsSinglePanel: shouldUseGsppTechnicalTables(),
        opdirProjectTableMode: shouldUseOpdirProjectTables() || shouldUseDevserviceProjectDeviationsTables(),
        opdirProjectSecondTableDisabled: shouldUseDevserviceProjectDeviationsTables(),
        productionClaimsTableMode: isProductionDeputyDashboardContext(),
        productionClaimsShop: normalizeProductionShopKey(productionDeputySelectedShop),
        constructorProjectTableMode: isChiefConstructorDashboardContext(),
        metrologLateStagesTableMode: isChiefMetrologDashboardContext(),
        logisticsSupplierDebtTableMode: isLogisticsDashboardContext(),
        qualdirDefectTablesMode: shouldUseQualdirDefectTables(),
        qualdirExternalTableKey: "QD-T-M5",
        qualdirInternalTableKey: "QD-T-M1",
        qualdirProcessTableKey: "QD-T-M8",
        getCacheRefreshStateForKpi: getCacheRefreshStateForKpiId,
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
    lastDonutsTotalCount = n;
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

  /**
   * Собирает контекст для донат-сетки: всегда учитывает наличие блока
   * Графики["KS-RAZVITIE"] (если он есть, именно он подменяет KPI-донаты
   * в том же #donuts-grid) и режим агрегации.
   */
  function getDonutChartTiles(tiles) {
    if (!tiles || !tiles.length) return [];
    if (typeof MockData !== "undefined" && MockData && typeof MockData.buildKpiDonutTiles === "function") {
      return MockData.buildKpiDonutTiles(tiles);
    }
    return tiles.slice();
  }

  function buildDonutRenderContext() {
    var ksChart = null;
    var refMonth = null;
    var refYear = null;
    try {
      var charts = lastRawKpiResponse && lastRawKpiResponse["Графики"];
      if (charts && typeof charts === "object") {
        ksChart = charts["KS-RAZVITIE"] || null;
      }
      if (ksChart && ksChart.period) {
        refMonth = ksChart.period.month || null;
        refYear = ksChart.period.year || null;
      }
    } catch (e) {
      ksChart = null;
    }
    return {
      currentTiles: getDonutChartTiles(lastKpiTiles),
      getVisibleDonutTiles: getVisibleDonutTiles,
      updateDonutChartsPagerUI: updateDonutChartsPagerUI,
      ksRazvitieChart: ksChart,
      aggregationMode: chairmanAggregationMode || "current",
      refMonth: refMonth,
      refYear: refYear,
    };
  }

  function renderDonutCharts() {
    if (typeof DashboardCharts === "undefined" || !DashboardCharts) return;
    if (typeof DashboardCharts.renderDonutCharts !== "function") return;
    DashboardCharts.renderDonutCharts(buildDonutRenderContext());
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
    var donutCtx = buildDonutRenderContext();
    DashboardCharts.initCharts({
      role: viewContextUser.role,
      apiChartIndicators: lastApiChartIndicators,
      currentTiles: donutCtx.currentTiles,
      chartSelectAllValue: CHART_SELECT_ALL_VALUE,
      getVisibleDonutTiles: getVisibleDonutTiles,
      updateDonutChartsPagerUI: updateDonutChartsPagerUI,
      onNavigateToMonth: navigateToMonth,
      onNavigateToQuarter: navigateToQuarter,
      ksRazvitieChart: donutCtx.ksRazvitieChart,
      aggregationMode: donutCtx.aggregationMode,
      refMonth: donutCtx.refMonth,
      refYear: donutCtx.refYear,
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
  function applyApiResult(result, _source, options) {
    callDataLoader("applyApiResult", [result, _source, options]);
  }

  /**
   * Пытается перестроить экран из уже полученного raw JSON без нового запроса.
   * Возвращает false, если для текущего периода не хватает данных.
   */
  function applyCurrentPeriodFromLastRawResponse() {
    if (!lastRawKpiResponse || typeof Api === "undefined" || !Api) return false;
    if (typeof Api.processKpiResponseBodyAtPeriod !== "function") return false;
    if (typeof DashboardMonthNav === "undefined" || !DashboardMonthNav || typeof DashboardMonthNav.getPeriodState !== "function") {
      return false;
    }
    if (isProductionDeputyDashboardContext()) {
      // PD-M1.*.W/M/T зависят от выбранного документа ТД_ПроизводственныйПлан,
      // поэтому после агрегации нельзя восстанавливать их из старого monthly_data.
      return false;
    }
    var ps = DashboardMonthNav.getPeriodState();
    var month = ps && ps.currentPeriodMonth != null ? Number(ps.currentPeriodMonth) : null;
    var year = ps && ps.currentPeriodYear != null ? Number(ps.currentPeriodYear) : null;
    if (month == null || year == null || isNaN(month) || isNaN(year)) return false;

    var result = Api.processKpiResponseBodyAtPeriod(lastRawKpiResponse, year, month);
    if (!result || !Array.isArray(result.tiles)) return false;
    var aggregatedCommercial = getCommercialFotTurnoverAggregatedTilesFromRaw(
      result.unwrappedData || lastRawKpiResponse,
      result.tiles
    );
    if (aggregatedCommercial && aggregatedCommercial.length) {
      result.tiles = aggregatedCommercial;
    }
    result.ok = true;
    result.data = result.unwrappedData || lastRawKpiResponse;
    result.raw = lastRawKpiResponse;
    delete result.unwrappedData;
    callDataLoader("applyApiResult", [result, "client-period", { preserveViewState: true }]);
    return true;
  }

  /**
   * Главная загрузка данных экрана: «свой» дашборд (`fetchKpis`) или подразделение (`fetchKpiAll`).
   * При ошибке или mock — fallback на `MockData`.
   */
  function loadKpiTilesAndChartsForView(options) {
    /* Уход с корня иерархии: скрыть обзор ПСД, иначе isChairmanOverviewVisible остаётся true и данные не грузятся */
    callChairmanOverview("leaveOverviewIfNotAtRoot", []);
    // Если мы на обзорном экране ПСД (карточки каталогов), полный дашборд НЕ должен появляться ниже.
    if (isChairmanOverviewVisible()) return;
    callDataLoader("loadKpiTilesAndChartsForView", [options]);
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
