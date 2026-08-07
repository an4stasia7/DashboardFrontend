(function (global) {
  var deferredChartsAndTablesBootToken = 0;
  var latestContext = {};

  function mergeContext(nextContext) {
    latestContext = Object.assign({}, latestContext || {}, nextContext || {});
    return latestContext;
  }

  function getContext() {
    return latestContext || {};
  }

  function getSelectedViewId() {
    var fn = getContext().getSelectedViewId;
    return typeof fn === "function" ? fn() : "self";
  }

  function getViewContextUser() {
    var fn = getContext().getViewContextUser;
    return typeof fn === "function" ? fn() : {};
  }

  function normalizeRole(value) {
    return value == null ? "" : String(value).trim().toLocaleLowerCase("ru-RU");
  }

  function isChairmanViewContext() {
    var user = getViewContextUser();
    if (!user || typeof user !== "object") return false;
    var role = normalizeRole(user.role);
    var dept = normalizeRole(user.department);
    return (
      role === "председатель совета директоров" ||
      dept === "председатель совета директоров"
    );
  }

  function shouldUseChairmanAggregatedTiles() {
    var fn = getContext().shouldUseChairmanAggregatedTiles;
    return typeof fn === "function" ? !!fn() : false;
  }

  function shouldApplyPeriodAggregationTiles() {
    var fn = getContext().shouldApplyPeriodAggregationTiles;
    if (typeof fn === "function") return !!fn();
    return shouldUseChairmanAggregatedTiles() || isChairmanViewContext();
  }

  function getActiveChairmanCatalogTarget() {
    var fn = getContext().getActiveChairmanCatalogTarget;
    return typeof fn === "function" ? fn() : null;
  }

  function isViewingChairmanCatalogDashboard() {
    var sid = getSelectedViewId() != null ? String(getSelectedViewId()) : "";
    return sid.indexOf("chairman:") === 0;
  }

  function getChairmanDashboardCatalogId() {
    var fn = getContext().getChairmanDashboardCatalogId;
    return typeof fn === "function" ? fn() : "";
  }

  function getDepartmentForCurrentKpiContext() {
    var fn = getContext().getDepartmentForCurrentKpiContext;
    return typeof fn === "function" ? fn() : "";
  }

  function getPeriodState() {
    var fn = getContext().getPeriodState;
    return typeof fn === "function"
      ? fn()
      : {
          currentPeriodMonth: null,
          currentPeriodYear: null,
          availableMonths: [],
          availableMonthsContextKey: "",
        };
  }

  function setPeriodState(nextState) {
    var fn = getContext().setPeriodState;
    if (typeof fn === "function") fn(nextState);
  }

  function getMonthNavigatorContextKey() {
    var fn = getContext().getMonthNavigatorContextKey;
    return typeof fn === "function" ? fn() : "";
  }

  function setAvailableMonthsFromChartPoints(chartIndicators, options) {
    var fn = getContext().setAvailableMonthsFromChartPoints;
    if (typeof fn === "function") fn(chartIndicators, options);
  }

  function periodKeyInAvailableMonths(year, month, slots) {
    var fn = getContext().periodKeyInAvailableMonths;
    return typeof fn === "function" ? !!fn(year, month, slots) : false;
  }

  function updateMonthNavigatorUI() {
    var fn = getContext().updateMonthNavigatorUI;
    if (typeof fn === "function") fn();
  }

  function closeKpiTileDrilldown() {
    var fn = getContext().closeKpiTileDrilldown;
    if (typeof fn === "function") fn();
  }

  function renderKpiTiles(tiles, options) {
    var fn = getContext().renderKpiTiles;
    if (typeof fn === "function") fn(tiles, options);
  }

  function updateTopBarForView() {
    var fn = getContext().updateTopBarForView;
    if (typeof fn === "function") fn();
  }

  function rememberDrilldownKpiTiles(dept, tiles) {
    var fn = getContext().rememberDrilldownKpiTiles;
    if (typeof fn === "function") fn(dept, tiles);
  }

  function initCharts() {
    var fn = getContext().initCharts;
    if (typeof fn === "function") fn();
  }

  function initTables() {
    var fn = getContext().initTables;
    if (typeof fn === "function") fn();
  }

  function onUnauthorized() {
    var fn = getContext().onUnauthorized;
    if (typeof fn === "function") fn();
  }

  function pushDashboardDebugNote(source, message) {
    var fn = getContext().pushDashboardDebugNote;
    if (typeof fn === "function") fn(source, message);
  }

  function fetchKpis(options) {
    var fn = getContext().fetchKpis;
    return typeof fn === "function" ? fn(options) : Promise.reject(new Error("fetchKpis unavailable"));
  }

  function fetchKpiAll(options) {
    var fn = getContext().fetchKpiAll;
    return typeof fn === "function" ? fn(options) : Promise.reject(new Error("fetchKpiAll unavailable"));
  }

  function getSessionApiMode() {
    var fn = getContext().getSessionApiMode;
    return typeof fn === "function" ? fn() : "mock";
  }

  function getMockKpiTilesForRole(role) {
    var fn = getContext().getMockKpiTilesForRole;
    return typeof fn === "function" ? fn(role) : [];
  }

  function setLastApiChartIndicators(value) {
    var fn = getContext().setLastApiChartIndicators;
    if (typeof fn === "function") fn(value);
  }

  function setLastApiTableRows(value) {
    var fn = getContext().setLastApiTableRows;
    if (typeof fn === "function") fn(value);
  }

  function setLastRawKpiResponse(value) {
    var fn = getContext().setLastRawKpiResponse;
    if (typeof fn === "function") fn(value);
  }

  function setLastKpiResponseDepartment(value) {
    var fn = getContext().setLastKpiResponseDepartment;
    if (typeof fn === "function") fn(value);
  }

  function getChairmanAggregationMode() {
    var fn = getContext().getChairmanAggregationMode;
    return typeof fn === "function" ? fn() : "current";
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

  function numberOrOriginal(value) {
    if (value == null || value === "") return value;
    var n = Number(value);
    return isNaN(n) ? value : n;
  }

  function applyTdM5PeriodAggregateForCurrentSelection(tiles) {
    if (!Array.isArray(tiles) || !tiles.length) return tiles;
    var periodState = getPeriodState();
    if (!periodState) return tiles;
    var mode = String(periodState.aggregationMode || "current");
    if (mode !== "quarter" && mode !== "ytd") return tiles;
    var quarters = normalizeSelectedQuarterNumbers(periodState.selectedQuarters);
    var key = quarters.join(",");
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
      var aggregate = null;
      if (mode === "quarter" && key) {
        aggregate =
          tile.period_aggregates &&
          tile.period_aggregates.quarter_combinations &&
          tile.period_aggregates.quarter_combinations[key];
      } else if (mode === "ytd") {
        aggregate = tile.period_aggregates && tile.period_aggregates.year_to_date;
      }
      if (!aggregate || typeof aggregate !== "object") return tile;
      changed = true;
      var nextTile = Object.assign({}, tile);
      if (aggregate.plan !== undefined) nextTile.plan = aggregate.plan;
      if (aggregate.fact !== undefined) nextTile.fact = aggregate.fact;
      if (aggregate.kpi_pct !== undefined) {
        nextTile.kpi_pct = numberOrOriginal(aggregate.kpi_pct);
        nextTile.percent = numberOrOriginal(aggregate.kpi_pct);
      }
      if (typeof aggregate.has_data === "boolean") nextTile.has_data = aggregate.has_data;
      if (aggregate.label != null && String(aggregate.label).trim()) {
        nextTile.plan_fact_period_label = String(aggregate.label);
      }
      return nextTile;
    });
    return changed ? nextTiles : tiles;
  }

  function showLoading() {
    var loader = document.getElementById("dash-loading");
    var content = document.getElementById("dash-content");
    if (loader) loader.hidden = false;
    if (content) content.hidden = true;
  }

  function hideLoading() {
    var loader = document.getElementById("dash-loading");
    var content = document.getElementById("dash-content");
    if (loader) loader.hidden = true;
    if (content) content.hidden = false;
  }

  function kpiLocalCacheKey() {
    var ps = getPeriodState();
    var dept = getDepartmentForCurrentKpiContext() || "";
    var user = getViewContextUser() || {};
    if (!dept && user.department != null) dept = String(user.department);
    return [
      "dashboard:last-kpi-result:v2",
      getSelectedViewId() || "self",
      String(dept || "").trim().toLocaleLowerCase("ru-RU"),
      ps.currentPeriodYear != null ? String(ps.currentPeriodYear) : "",
      ps.currentPeriodMonth != null ? String(ps.currentPeriodMonth) : "",
    ].join("|");
  }

  function saveLastKpiResult(result) {
    if (!result || !result.ok || !result.data || !Array.isArray(result.tiles) || !result.tiles.length) return;
    try {
      localStorage.setItem(kpiLocalCacheKey(), JSON.stringify({
        savedAt: new Date().toISOString(),
        result: {
          ok: true,
          data: result.data,
          raw: result.raw || result.data,
          tiles: result.tiles,
          chartIndicators: result.chartIndicators || [],
          tableRows: result.tableRows || [],
        },
      }));
    } catch (e) {
      /* ignore */
    }
  }

  function loadLastKpiResult() {
    try {
      var raw = localStorage.getItem(kpiLocalCacheKey());
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      var result = parsed && parsed.result;
      if (!result || !result.ok || !Array.isArray(result.tiles) || !result.tiles.length) return null;
      result.fromLocalKpiCache = true;
      return result;
    } catch (e) {
      return null;
    }
  }

  function cancelDeferredChartsAndTablesBoot() {
    deferredChartsAndTablesBootToken++;
  }

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

  function reprocessApiResultAtPeriod(result, year, month) {
    if (
      !result ||
      (year == null && month == null) ||
      typeof Api === "undefined" ||
      !Api ||
      typeof Api.processKpiResponseBodyAtPeriod !== "function"
    ) {
      return result;
    }
    var selectedMonth = month != null ? Number(month) : null;
    var selectedYear = year != null ? Number(year) : null;
    if (
      selectedMonth == null ||
      selectedYear == null ||
      isNaN(selectedMonth) ||
      isNaN(selectedYear) ||
      selectedMonth < 1 ||
      selectedMonth > 12
    ) {
      return result;
    }
    var rawForPeriod = result.raw || (result.data && typeof result.data === "object" ? result.data : null);
    if (!rawForPeriod) return result;
    var reprocessed = Api.processKpiResponseBodyAtPeriod(rawForPeriod, selectedYear, selectedMonth);
    if (!reprocessed || !Array.isArray(reprocessed.tiles) || !reprocessed.tiles.length) return result;
    result.tiles = reprocessed.tiles;
    result.chartIndicators = reprocessed.chartIndicators || result.chartIndicators || null;
    result.tableRows = reprocessed.tableRows || result.tableRows || null;
    if (reprocessed.unwrappedData) {
      result.data = reprocessed.unwrappedData;
    }
    return result;
  }

  function applyApiResult(result, _source, options) {
    mergeContext(options);
    if (!options || !options.preserveViewState) {
      closeKpiTileDrilldown();
    }
    var elHint = document.getElementById("dash-user-hint");
    if (elHint) elHint.removeAttribute("title");
    if (result.unauthorized) {
      onUnauthorized();
      return;
    }
    if (result.ok && result.data) {
      var dep = result.data.department;
      setLastKpiResponseDepartment(dep != null && String(dep).trim() ? String(dep).trim() : null);
      if (!result.fromLocalKpiCache) {
        saveLastKpiResult(result);
      }
    }
    setLastRawKpiResponse(result && result.data ? result.data : result && result.raw ? result.raw : null);
    setLastApiChartIndicators(result.chartIndicators || null);
    setLastApiTableRows(result.tableRows || null);

    var periodState = getPeriodState();
    var monthContextKey = getMonthNavigatorContextKey();
    var preserveMonthSlots =
      periodState.currentPeriodMonth != null &&
      periodState.currentPeriodYear != null &&
      periodState.availableMonthsContextKey === monthContextKey;

    setAvailableMonthsFromChartPoints(result.chartIndicators || null, {
      preserveExisting: preserveMonthSlots,
      contextKey: monthContextKey,
      fallbackTiles: Array.isArray(result.tiles) ? result.tiles : [],
    });

    periodState = getPeriodState();
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
      periodKeyInAvailableMonths(respYear, respMonth, periodState.availableMonths);

    var curInSlots =
      periodState.currentPeriodMonth != null &&
      periodState.currentPeriodYear != null &&
      periodKeyInAvailableMonths(
        periodState.currentPeriodYear,
        periodState.currentPeriodMonth,
        periodState.availableMonths
      );

    if (
      (!options || !options.preserveViewState) &&
      periodState.availableMonths.length
    ) {
      var latestSlot = periodState.availableMonths[periodState.availableMonths.length - 1];
      setPeriodState({
        currentPeriodMonth: latestSlot.month,
        currentPeriodYear: latestSlot.year,
      });
    } else if (curInSlots) {
      /* оставляем выбор пользователя после смены месяца стрелками */
    } else if (respInSlots) {
      setPeriodState({
        currentPeriodMonth: respMonth,
        currentPeriodYear: respYear,
      });
    } else if (periodState.availableMonths.length) {
      var lastSlot = periodState.availableMonths[periodState.availableMonths.length - 1];
      setPeriodState({
        currentPeriodMonth: lastSlot.month,
        currentPeriodYear: lastSlot.year,
      });
    } else if (respMonth != null && respYear != null) {
      setPeriodState({
        currentPeriodMonth: respMonth,
        currentPeriodYear: respYear,
      });
    } else {
      setPeriodState({
        currentPeriodMonth: null,
        currentPeriodYear: null,
      });
    }

    updateMonthNavigatorUI();

    periodState = getPeriodState();
    if (result.ok && (result.raw || result.data)) {
      reprocessApiResultAtPeriod(
        result,
        periodState.currentPeriodYear,
        periodState.currentPeriodMonth
      );
      setLastApiChartIndicators(result.chartIndicators || null);
      setLastApiTableRows(result.tableRows || null);
    }

    var role = getViewContextUser().role;
    var renderOptions = {
      preservePage: !!(options && options.preserveViewState),
    };
    if (result.ok && result.tiles && result.tiles.length > 0) {
      var tilesToRender = result.tiles;
      if (
        shouldApplyPeriodAggregationTiles() &&
        typeof getContext().getChairmanAggregatedTilesFromRaw === "function"
      ) {
        var aggregated = getContext().getChairmanAggregatedTilesFromRaw(result.data || result.raw || null);
        if (aggregated && aggregated.length) {
          tilesToRender = aggregated;
        }
      }
      if (typeof getContext().getCommercialFotTurnoverAggregatedTilesFromRaw === "function") {
        var commercialAggregated = getContext().getCommercialFotTurnoverAggregatedTilesFromRaw(
          result.data || result.raw || null,
          tilesToRender
        );
        if (commercialAggregated && commercialAggregated.length) {
          tilesToRender = commercialAggregated;
        }
      }
      tilesToRender = applyTdM5PeriodAggregateForCurrentSelection(tilesToRender);
      var cacheKey =
        result.data &&
        result.data.department != null &&
        String(result.data.department).trim()
          ? String(result.data.department).trim()
          : getDepartmentForCurrentKpiContext();
      var augment = getContext().maybeAugmentCommercialDeptTilesWithPriorMonthFetch;
      if (typeof augment === "function") {
        augment(result, tilesToRender, function (finalTiles) {
          var t = finalTiles && finalTiles.length ? finalTiles : tilesToRender;
          t = applyTdM5PeriodAggregateForCurrentSelection(t);
          if (cacheKey) rememberDrilldownKpiTiles(cacheKey, t.slice());
          renderKpiTiles(t, renderOptions);
          updateTopBarForView();
          hideLoading();
          bootChartsAndTablesDeferred();
        });
        return;
      }
      if (cacheKey) rememberDrilldownKpiTiles(cacheKey, tilesToRender.slice());
      renderKpiTiles(tilesToRender, renderOptions);
    } else {
      renderKpiTiles(getMockKpiTilesForRole(role), renderOptions);
    }
    updateTopBarForView();
    hideLoading();
    bootChartsAndTablesDeferred();
  }

  function loadKpiTilesAndChartsForView(options) {
    mergeContext(options);
    if (!options || !options.preserveViewState) {
      closeKpiTileDrilldown();
    }
    cancelDeferredChartsAndTablesBoot();
    var staleResult = options && options.preserveViewState ? loadLastKpiResult() : null;
    if (staleResult) {
      var stalePeriod = getPeriodState();
      var staleCovers =
        typeof Api !== "undefined" &&
        Api &&
        typeof Api.kpiResponseCoversYearMonth === "function" &&
        stalePeriod.currentPeriodYear != null &&
        stalePeriod.currentPeriodMonth != null
          ? Api.kpiResponseCoversYearMonth(
              staleResult.raw || staleResult.data,
              stalePeriod.currentPeriodYear,
              stalePeriod.currentPeriodMonth
            )
          : true;
      if (staleCovers) {
        applyApiResult(staleResult, "local-cache", options);
      } else {
        showLoading();
      }
    } else {
      showLoading();
    }

    var selectedViewId = getSelectedViewId();
    var viewContextUser = getViewContextUser();
    var isSelf = selectedViewId === "self";
    var role = viewContextUser.role;
    var elHint = document.getElementById("dash-user-hint");

    var fallback = function () {
      setLastApiChartIndicators(null);
      setLastApiTableRows(null);
      setLastKpiResponseDepartment(null);
      setPeriodState({
        availableMonths: [],
        availableMonthsContextKey: "",
        currentPeriodMonth: null,
        currentPeriodYear: null,
      });
      updateMonthNavigatorUI();
      renderKpiTiles(getMockKpiTilesForRole(role));
      updateTopBarForView();
      hideLoading();
      bootChartsAndTablesDeferred();
    };

    var periodState = getPeriodState();
    var periodOpts = {};
    if (options && options.preserveViewState) {
      if (periodState.currentPeriodMonth != null) periodOpts.month = periodState.currentPeriodMonth;
      if (periodState.currentPeriodYear != null) periodOpts.year = periodState.currentPeriodYear;
    }

    if (!isSelf) {
      if (getSessionApiMode() === "mock") {
        pushDashboardDebugNote("UI (mock)", "Подчинённый вид — запросы KPI не выполняются");
        fallback();
        return;
      }
      if (isViewingChairmanCatalogDashboard()) {
        var catalogTarget = getActiveChairmanCatalogTarget();
        var catalogId =
          catalogTarget && catalogTarget.catalogId != null ? String(catalogTarget.catalogId).trim() : "";
        if (catalogId && catalogId !== "my_dashboard") {
          var catalogOpts = { for: catalogId };
          // Виртуальный блок: ?department= = подразделение ПСД из сессии, не label «Коммерческий блок».
          var viewUser = getViewContextUser() || {};
          var catalogDept =
            viewUser.department != null && String(viewUser.department).trim()
              ? String(viewUser.department).trim()
              : catalogTarget.viewDepartment != null && String(catalogTarget.viewDepartment).trim()
                ? String(catalogTarget.viewDepartment).trim()
                : catalogTarget.department != null && String(catalogTarget.department).trim()
                  ? String(catalogTarget.department).trim()
                  : "";
          if (catalogDept) catalogOpts.department = catalogDept;
          if (periodOpts.month != null) catalogOpts.month = periodOpts.month;
          if (periodOpts.year != null) catalogOpts.year = periodOpts.year;
          fetchKpis(catalogOpts)
            .then(function (result) {
              applyApiResult(result);
            })
            .catch(function () {
              fallback();
            });
          return;
        }
      }
      var subDept = getDepartmentForCurrentKpiContext();
      if (subDept) {
        var allOpts = { department: subDept };
        if (periodOpts.month != null) allOpts.month = periodOpts.month;
        if (periodOpts.year != null) allOpts.year = periodOpts.year;
        fetchKpiAll(allOpts)
          .then(function (result) {
            if (result.unauthorized) {
              applyApiResult(result, undefined, options);
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
            applyApiResult(result, undefined, options);
          })
          .catch(function () {
            fallback();
          });
        return;
      }
      fallback();
      return;
    }

    if (getSessionApiMode() === "mock") {
      pushDashboardDebugNote("UI (mock)", "mock или Api недоступен — KPI не запрашивались");
      fallback();
      return;
    }

    var selfDept = getDepartmentForCurrentKpiContext();
    var fetchSelf = selfDept
      ? function () {
          var opts = { department: selfDept };
          if (periodOpts.month != null) opts.month = periodOpts.month;
          if (periodOpts.year != null) opts.year = periodOpts.year;
          return fetchKpis(opts);
        }
      : function () {
          return fetchKpis(periodOpts);
        };

    fetchSelf()
      .then(function (result) {
        applyApiResult(result, undefined, options);
      })
      .catch(function () {
        fallback();
      });
  }

  function init(options) {
    mergeContext(options);
  }

  global.DashboardDataLoader = {
    applyApiResult: applyApiResult,
    bootChartsAndTablesDeferred: bootChartsAndTablesDeferred,
    cancelDeferredChartsAndTablesBoot: cancelDeferredChartsAndTablesBoot,
    hideLoading: hideLoading,
    init: init,
    loadKpiTilesAndChartsForView: loadKpiTilesAndChartsForView,
    showLoading: showLoading,
  };
})(typeof window !== "undefined" ? window : globalThis);
