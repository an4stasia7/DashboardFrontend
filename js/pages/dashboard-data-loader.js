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

  function renderKpiTiles(tiles) {
    var fn = getContext().renderKpiTiles;
    if (typeof fn === "function") fn(tiles);
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

  function applyApiResult(result, _source, options) {
    mergeContext(options);
    closeKpiTileDrilldown();
    var elHint = document.getElementById("dash-user-hint");
    if (elHint) elHint.removeAttribute("title");
    if (result.unauthorized) {
      onUnauthorized();
      return;
    }
    if (result.ok && result.data) {
      var dep = result.data.department;
      setLastKpiResponseDepartment(dep != null && String(dep).trim() ? String(dep).trim() : null);
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

    if (curInSlots) {
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

    var role = getViewContextUser().role;
    if (result.ok && result.tiles && result.tiles.length > 0) {
      var tilesToRender = result.tiles;
      if (
        isChairmanViewContext() &&
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
          if (cacheKey) rememberDrilldownKpiTiles(cacheKey, t.slice());
          renderKpiTiles(t);
          updateTopBarForView();
          hideLoading();
          bootChartsAndTablesDeferred();
        });
        return;
      }
      if (cacheKey) rememberDrilldownKpiTiles(cacheKey, tilesToRender.slice());
      renderKpiTiles(tilesToRender);
    } else {
      renderKpiTiles(getMockKpiTilesForRole(role));
    }
    updateTopBarForView();
    hideLoading();
    bootChartsAndTablesDeferred();
  }

  function loadKpiTilesAndChartsForView(options) {
    mergeContext(options);
    closeKpiTileDrilldown();
    cancelDeferredChartsAndTablesBoot();
    showLoading();

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
    if (periodState.currentPeriodMonth != null) periodOpts.month = periodState.currentPeriodMonth;
    if (periodState.currentPeriodYear != null) periodOpts.year = periodState.currentPeriodYear;

    if (!isSelf) {
      if (getSessionApiMode() === "mock") {
        pushDashboardDebugNote("UI (mock)", "Подчинённый вид — запросы KPI не выполняются");
        fallback();
        return;
      }
      var subDept = getDepartmentForCurrentKpiContext();
      if (subDept) {
        var allOpts = { department: subDept };
        if (periodOpts.month != null) allOpts.month = periodOpts.month;
        if (periodOpts.year != null) allOpts.year = periodOpts.year;
        fetchKpiAll(allOpts)
          .then(function (result) {
            if (result.unauthorized) {
              applyApiResult(result);
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
            applyApiResult(result);
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
        applyApiResult(result);
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
