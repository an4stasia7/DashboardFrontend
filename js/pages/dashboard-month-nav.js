(function (global) {
  var MONTH_NAMES_RU = [
    "", "январь", "февраль", "март", "апрель", "май", "июнь",
    "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
  ];

  var currentPeriodMonth = null;
  var currentPeriodYear = null;
  var availableMonths = [];
  var availableMonthsContextKey = "";
  var availableMonthsByContext = Object.create(null);
  var latestContext = {};
  var bound = false;

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

  function getDepartmentForCurrentKpiContext() {
    var fn = getContext().getDepartmentForCurrentKpiContext;
    return typeof fn === "function" ? fn() : "";
  }

  function getViewContextUser() {
    var fn = getContext().getViewContextUser;
    return typeof fn === "function" ? fn() : null;
  }

  function onPeriodChange(month, year) {
    var fn = getContext().onPeriodChange;
    if (typeof fn === "function") fn(month, year);
  }

  function navPlanFactValuePresent(v) {
    if (v === undefined || v === null) return false;
    if (typeof v === "number") return !isNaN(v);
    if (typeof v === "string") return String(v).trim() !== "";
    return true;
  }

  function monthYearKey(year, month) {
    var y = parseInt(String(year), 10);
    var m = parseInt(String(month), 10);
    if (isNaN(y) || isNaN(m) || m < 1 || m > 12) return -1;
    return y * 100 + m;
  }

  function navPointHasPeriodValue(pt) {
    if (!pt) return false;
    var key = monthYearKey(pt.year, pt.month);
    if (key < 0) return false;
    return navPlanFactValuePresent(pt.fact) || navPlanFactValuePresent(pt.plan);
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
    var viewId = getSelectedViewId() != null ? String(getSelectedViewId()) : "";
    var dept = getDepartmentForCurrentKpiContext();
    var viewContextUser = getViewContextUser();
    var nick =
      viewContextUser && viewContextUser.nickname != null
        ? String(viewContextUser.nickname).trim()
        : "";
    return [viewId, dept, nick].join("|");
  }

  function setAvailableMonthsFromChartPoints(chartIndicators, options) {
    options = options || {};
    var nextContextKey =
      options.contextKey != null ? String(options.contextKey) : availableMonthsContextKey;
    var nextMonths = [];
    if (chartIndicators) {
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
    }
    var cachedMonths =
      nextContextKey && Array.isArray(availableMonthsByContext[nextContextKey])
        ? availableMonthsByContext[nextContextKey]
        : [];
    var baseMonths = options.preserveExisting
      ? mergeAvailableMonthSlots(cachedMonths, availableMonths)
      : cachedMonths;
    availableMonths = mergeAvailableMonthSlots(baseMonths, nextMonths);
    availableMonthsContextKey = nextContextKey;
    if (nextContextKey) {
      availableMonthsByContext[nextContextKey] = mergeAvailableMonthSlots([], availableMonths);
    }
  }

  function getCurrentMonthIndex() {
    if (currentPeriodMonth == null || currentPeriodYear == null) return -1;
    var key = currentPeriodYear * 100 + currentPeriodMonth;
    for (var i = 0; i < availableMonths.length; i++) {
      if (availableMonths[i].key === key) return i;
    }
    return -1;
  }

  function isIncompleteCurrentMonth(month, year) {
    var m = parseInt(String(month), 10);
    var y = parseInt(String(year), 10);
    if (isNaN(m) || isNaN(y) || m < 1 || m > 12) return false;
    var now = new Date();
    var nowMonth = now.getMonth() + 1;
    var nowYear = now.getFullYear();
    if (m !== nowMonth || y !== nowYear) return false;
    var lastDayOfMonth = new Date(y, m, 0).getDate();
    return now.getDate() < lastDayOfMonth;
  }

  function updateMonthNavigatorUI() {
    var nav = document.getElementById("month-navigator");
    var label = document.getElementById("month-nav-label");
    var prevBtn = document.getElementById("month-nav-prev");
    var nextBtn = document.getElementById("month-nav-next");
    var warning = document.getElementById("month-nav-warning");
    if (!nav) return;

    if (currentPeriodMonth == null || currentPeriodYear == null) {
      nav.hidden = true;
      if (warning) warning.hidden = true;
      return;
    }

    nav.hidden = false;
    var monthName = MONTH_NAMES_RU[currentPeriodMonth] || String(currentPeriodMonth);
    if (label) label.textContent = monthName + " " + currentPeriodYear;
    if (warning) {
      warning.hidden = !isIncompleteCurrentMonth(currentPeriodMonth, currentPeriodYear);
    }

    var idx = getCurrentMonthIndex();
    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) nextBtn.disabled = idx < 0 || idx >= availableMonths.length - 1;
  }

  function navigateToMonth(month, year) {
    currentPeriodMonth = month;
    currentPeriodYear = year;
    updateMonthNavigatorUI();
    onPeriodChange(month, year);
  }

  function navigateToQuarter(quarter, year) {
    var lastMonth = quarter * 3;
    navigateToMonth(lastMonth, year);
  }

  function getPeriodState() {
    return {
      currentPeriodMonth: currentPeriodMonth,
      currentPeriodYear: currentPeriodYear,
      availableMonths: availableMonths,
      availableMonthsContextKey: availableMonthsContextKey,
    };
  }

  function setPeriodState(nextState) {
    if (!nextState || typeof nextState !== "object") return;
    if (Object.prototype.hasOwnProperty.call(nextState, "currentPeriodMonth")) {
      currentPeriodMonth = nextState.currentPeriodMonth;
    }
    if (Object.prototype.hasOwnProperty.call(nextState, "currentPeriodYear")) {
      currentPeriodYear = nextState.currentPeriodYear;
    }
    if (Object.prototype.hasOwnProperty.call(nextState, "availableMonths")) {
      availableMonths = Array.isArray(nextState.availableMonths) ? nextState.availableMonths : [];
    }
    if (Object.prototype.hasOwnProperty.call(nextState, "availableMonthsContextKey")) {
      availableMonthsContextKey =
        nextState.availableMonthsContextKey != null ? String(nextState.availableMonthsContextKey) : "";
    }
    if (availableMonthsContextKey) {
      availableMonthsByContext[availableMonthsContextKey] = mergeAvailableMonthSlots([], availableMonths);
    }
  }

  function bind() {
    if (bound) return;
    bound = true;
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
  }

  function init(options) {
    mergeContext(options);
    bind();
  }

  global.DashboardMonthNav = {
    getMonthNavigatorContextKey: getMonthNavigatorContextKey,
    getPeriodState: getPeriodState,
    init: init,
    navigateToMonth: navigateToMonth,
    navigateToQuarter: navigateToQuarter,
    periodKeyInAvailableMonths: periodKeyInAvailableMonths,
    setAvailableMonthsFromChartPoints: setAvailableMonthsFromChartPoints,
    setPeriodState: setPeriodState,
    updateMonthNavigatorUI: updateMonthNavigatorUI,
  };
})(typeof window !== "undefined" ? window : globalThis);
